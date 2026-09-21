// 一次性验证脚本：去掉「悬停滚动按钮 → 开启自动滚动」后的行为回归。
// 自启 server.mjs + headless Chrome，用真实鼠标事件（CDP Input）验证：
//   1) 悬停按钮不再启动自动滚动；2) 点击按钮（切换全屏）也不启动；
//   3) Ctrl+D 仍能启动；4) 启动后移动鼠标即停止。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const 站点端口 = Number(process.env.SITE_PORT || 15977);
const CDP端口 = Number(process.env.VERIFY_CDP_PORT || 9477);
const 地址 = `http://127.0.0.1:${站点端口}/`;
const 项目根 = new URL('..', import.meta.url).pathname;

const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

const 服务 = spawn('node', ['server.mjs', String(站点端口)], {
  cwd: 项目根,
  stdio: 'ignore',
});
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-hover-verify-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    地址,
  ],
  { stdio: 'ignore' },
);
const 收尾 = () => {
  chrome.kill();
  服务.kill();
};
process.on('exit', 收尾);

async function 等待目标() {
  for (let i = 0; i < 150; i++) {
    try {
      const 列表 = await (
        await fetch(`http://127.0.0.1:${CDP端口}/json`)
      ).json();
      const 目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
      if (目标) return 目标;
    } catch {}
    await pause(200);
  }
  throw new Error('未找到 headless Chrome 页面');
}

const 目标 = await 等待目标();
const ws = new WebSocket(目标.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let 序号 = 0;
const 待回复 = new Map();
ws.addEventListener('message', (事件) => {
  const 消息 = JSON.parse(事件.data);
  if (!消息.id) return;
  const 请求 = 待回复.get(消息.id);
  待回复.delete(消息.id);
  if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
  else 请求.resolve(消息.result);
});
function 发送(方法, 参数 = {}) {
  return new Promise((resolve, reject) => {
    const 下标 = ++序号;
    待回复.set(下标, { resolve, reject });
    ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
  });
}
async function 求值(代码) {
  const 结果 = await 发送('Runtime.evaluate', {
    expression: `(async () => { ${代码} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (结果.exceptionDetails)
    throw new Error(
      结果.exceptionDetails.exception?.description ||
        JSON.stringify(结果.exceptionDetails),
    );
  return 结果.result.value;
}
// eval 上下文没有 base URL，动态 import 不可用；改用 DOM 上的 aria-pressed
// 作为「自动滚动进行中」的观测点（只有 更新自动滚动按钮 会写它）。
const 滚动中 = () =>
  求值(`return document.querySelector('#自动滚动按钮').getAttribute('aria-pressed') === 'true';`);
const 滚动位置 = () =>
  求值(`return document.querySelector('#滚动容器').scrollTop;`);

async function 移动鼠标(x, y) {
  await 发送('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    buttons: 0,
  });
  await pause(180);
}
async function 按键(key, code, keyCode, 修饰 = 0) {
  const 基 = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers: 修饰 };
  await 发送('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...基 });
  await 发送('Input.dispatchKeyEvent', { type: 'keyUp', ...基 });
  await pause(180);
}

for (let i = 0; i < 200; i++) {
  const 行数 = await 求值(`return document.querySelectorAll('.正文行').length;`);
  if (行数 > 20) break;
  await pause(200);
}
const 诊断 = await 求值(`
  return {
    载入状态隐藏: document.querySelector('#载入状态')?.hidden,
    正文行数: document.querySelectorAll('.正文行').length,
    正文字数: document.querySelector('#滚动容器')?.innerText.length ?? -1,
    滚动高度: document.querySelector('#滚动容器')?.scrollHeight ?? -1,
    标题: document.querySelector('#当前文本名称')?.textContent ?? '',
  };
`);
console.log('诊断:', 诊断);
assert.ok(诊断.正文行数 > 20, `正文应已载入：${JSON.stringify(诊断)}`);

const 视口 = await 求值(`return {w: window.innerWidth, h: window.innerHeight};`);
const 按钮矩形 = await 求值(`
  const r = document.querySelector('#自动滚动按钮').getBoundingClientRect();
  return {x: r.x, y: r.y, w: r.width, h: r.height};
`);
console.log('视口:', 视口, '按钮:', 按钮矩形);
assert.ok(按钮矩形.w > 0 && 按钮矩形.h > 0, '按钮应有尺寸');
const 中心 = { x: Math.round(按钮矩形.x + 按钮矩形.w / 2), y: Math.round(按钮矩形.y + 按钮矩形.h / 2) };

// 先把控件热区唤出（隐藏时 pointer-events:none，命中不到按钮）
await 移动鼠标(视口.w - 20, 视口.h - 20);
assert.ok(
  await 求值(`return document.body.classList.contains('右下控件显示');`),
  '移入右下热区后控件应显示',
);

// ① 悬停按钮：不应启动自动滚动
await 移动鼠标(中心.x, 中心.y);
assert.equal(
  await 求值(`return document.querySelector('#自动滚动按钮').matches(':hover');`),
  true,
  '鼠标应已悬停在按钮上',
);
assert.equal(await 滚动中(), false, '悬停按钮不应启动自动滚动');
await pause(600);
assert.equal(await 滚动中(), false, '悬停按钮持续 600ms 仍不应启动自动滚动');
assert.equal(
  await 求值(`return document.querySelector('#自动滚动按钮').getAttribute('aria-pressed');`),
  'false',
  'aria-pressed 应保持 false',
);

// ② 点击按钮（切换全屏）：focus 不应顺带启动自动滚动
await 发送('Input.dispatchMouseEvent', { type: 'mousePressed', x: 中心.x, y: 中心.y, button: 'left', clickCount: 1, buttons: 1 });
await 发送('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 中心.x, y: 中心.y, button: 'left', clickCount: 1, buttons: 0 });
await pause(500);
assert.equal(await 滚动中(), false, '点击滚动按钮不应启动自动滚动');
await 求值(`if (document.fullscreenElement) await document.exitFullscreen(); return 1;`);
await pause(300);

// ③ Ctrl+D 仍能启动
const 起始位置 = await 滚动位置();
await 按键('d', 'KeyD', 68, 2);
assert.equal(await 滚动中(), true, 'Ctrl+D 应启动自动滚动');
for (let i = 0; i < 20 && (await 滚动位置()) === 起始位置; i++) await pause(120);
const 滚动后位置 = await 滚动位置();
assert.ok(滚动后位置 > 起始位置, `自动滚动应真的位移：${起始位置} → ${滚动后位置}`);

// ④ 移动鼠标即停止（把控制权交回鼠标）
await 移动鼠标(中心.x - 200, 中心.y - 120);
assert.equal(await 滚动中(), false, '鼠标移动应停止自动滚动');
const 停止时位置 = await 滚动位置();
await pause(700);
assert.equal(await 滚动位置(), 停止时位置, '停止后不应继续位移');

// ⑤ Ctrl+D 再按一次 = 停止（键盘开关仍在）
await 按键('d', 'KeyD', 68, 2);
assert.equal(await 滚动中(), true, 'Ctrl+D 应再次启动');
await 按键('d', 'KeyD', 68, 2);
assert.equal(await 滚动中(), false, 'Ctrl+D 应切换为停止');

// ⑥ 键盘 Tab 聚焦仍应启动自动滚动（:focus-visible 入口）。
// 程序化 focus() 在 headless 下不算键盘交互，必须用真实 Tab 按键走焦点遍历。
async function 按Tab() {
  await 发送('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  await 发送('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  await pause(120);
}
await 求值(`document.activeElement?.blur(); return 1;`);
let 聚焦到按钮 = false;
for (let i = 0; i < 25 && !聚焦到按钮; i++) {
  await 按Tab();
  聚焦到按钮 = await 求值(
    `return document.activeElement === document.querySelector('#自动滚动按钮');`,
  );
}
const 聚焦信息 = await 求值(`
  const 钮 = document.querySelector('#自动滚动按钮');
  return {已聚焦: document.activeElement === 钮, 焦点可见: 钮.matches(':focus-visible')};
`);
console.log('Tab 聚焦入口:', 聚焦信息, '→ 自动滚动中:', await 滚动中());
assert.ok(聚焦到按钮, 'Tab 应能聚焦到滚动按钮');
assert.equal(
  await 滚动中(),
  true,
  '键盘 Tab 聚焦（:focus-visible）应启动自动滚动',
);
await 求值(`document.querySelector('#自动滚动按钮').blur(); return 1;`);
await pause(200);
assert.equal(await 滚动中(), false, '按钮失去焦点后应停止自动滚动');

console.log('\nOK：悬停/点击不再启动自动滚动；Ctrl+D 启动与停止、鼠标移动停止均正常');
ws.close();
收尾();
process.exit(0);
