// 一次性验证脚本：自动滚动进行中，光标必须彻底隐藏（含正文关键词）。
// 背景：.字.命中 的 cursor:pointer 特异性 (0,2,0) 高于 body.自动滚动中 * 的 (0,1,1)，
// 滚动时正文从静止指针下掠过 → 关键词进入 :hover → 光标重新露出。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const 站点端口 = Number(process.env.SITE_PORT || 16123);
const CDP端口 = Number(process.env.VERIFY_CDP_PORT || 9623);
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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-cursor-verify-'))}`,
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
    const 定时器 = setTimeout(() => {
      if (待回复.delete(下标)) reject(new Error(`${方法} 超时`));
    }, 15000);
    待回复.set(下标, {
      resolve: (v) => {
        clearTimeout(定时器);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(定时器);
        reject(e);
      },
    });
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
async function 按键(key, code, keyCode, 修饰 = 0) {
  const 基 = {
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers: 修饰,
  };
  await 发送('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...基 });
  await 发送('Input.dispatchKeyEvent', { type: 'keyUp', ...基 });
  await pause(180);
}
async function 移动鼠标(x, y) {
  await 发送('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    buttons: 0,
  });
  await pause(180);
}

for (let i = 0; i < 200; i++) {
  const 行数 = await 求值(`return document.querySelectorAll('.正文行').length;`);
  if (行数 > 20) break;
  await pause(200);
}
const 诊断 = await 求值(`
  return {
    正文行数: document.querySelectorAll('.正文行').length,
    命中数: document.querySelectorAll('.字.命中').length,
    滚动中: document.body.classList.contains('自动滚动中'),
  };
`);
console.log('诊断:', 诊断);
assert.ok(诊断.正文行数 > 20, `正文应已载入：${JSON.stringify(诊断)}`);

// 光标探针：真实命中字（没有就造一个同 class 的，样式是全局的）+ 各类交互控件。
const 读取光标 = () =>
  求值(`
    const 容器 = document.querySelector('#滚动容器');
    let 命中 = document.querySelector('.字.命中');
    if (!命中) {
      const 行 = document.querySelector('.正文行');
      命中 = document.createElement('span');
      命中.className = '字 命中';
      命中.textContent = '测';
      行.appendChild(命中);
    }
    const 面板开关 = document.querySelector('.关键词面板开关');
    const 滚动条 = document.querySelector('.自定义滚动条');
    const 取 = (元素) => 元素 ? getComputedStyle(元素).cursor : '缺失';
    return {
      自动滚动中: document.body.classList.contains('自动滚动中'),
      正文: 取(document.querySelector('.正文行')),
      关键词命中: 取(命中),
      面板开关: 取(面板开关),
      滚动条: 取(滚动条),
      命中特异性: 命中.className,
    };
  `);

// ① 静态加 class（不依赖滚动）就该全部 none
await 求值(`document.body.classList.add('自动滚动中'); return 1;`);
const 滚动中样态 = await 读取光标();
console.log('自动滚动中:', 滚动中样态);
assert.equal(滚动中样态.自动滚动中, true);
for (const [名称, 值] of Object.entries(滚动中样态)) {
  if (名称 === '自动滚动中' || 名称 === '命中特异性') continue;
  assert.equal(值, 'none', `自动滚动中「${名称}」的光标应为 none，实际 ${值}`);
}
// :hover 态下的关键词（滚动时文字掠过静止指针正是这一态）
await 发送('DOM.enable');
const 命中节点 = await 求值(`
  const 命中 = document.querySelector('.字.命中');
  window.__探针 = 命中; return 命中.textContent;
`);
console.log('探针命中字:', 命中节点);

// ② 真实链路：Ctrl+D 启动自动滚动 → 滚动位移 → 关键词仍为 none
await 求值(`document.body.classList.remove('自动滚动中'); return 1;`);
const 起始 = await 求值(`return document.querySelector('#滚动容器').scrollTop;`);
await 按键('d', 'KeyD', 68, 2);
assert.equal(
  await 求值(`return document.body.classList.contains('自动滚动中');`),
  true,
  'Ctrl+D 应启动自动滚动并加上 自动滚动中',
);
for (let i = 0; i < 25; i++) {
  const 现在 = await 求值(`return document.querySelector('#滚动容器').scrollTop;`);
  if (现在 > 起始) break;
  await pause(120);
}
const 滚动样态 = await 读取光标();
console.log('真实滚动中:', 滚动样态);
assert.ok(
  (await 求值(`return document.querySelector('#滚动容器').scrollTop;`)) > 起始,
  '自动滚动应真的位移',
);
assert.equal(滚动样态.关键词命中, 'none', '滚动中关键词光标不应复现');

// ③ 鼠标一动 → 停止滚动 → 关键词光标恢复 pointer
const 视口 = await 求值(`return {w: window.innerWidth, h: window.innerHeight};`);
await 移动鼠标(Math.round(视口.w / 2), Math.round(视口.h / 2));
const 停止样态 = await 读取光标();
console.log('停止后:', 停止样态);
assert.equal(停止样态.自动滚动中, false, '鼠标移动应停止自动滚动');
assert.equal(停止样态.关键词命中, 'pointer', '停止后关键词应恢复 pointer');
assert.notEqual(停止样态.面板开关, 'none', '停止后控件光标应恢复');

console.log('\nOK：自动滚动中全文（含关键词）光标统一隐藏；鼠标移动停止后恢复');
ws.close();
收尾();
process.exit(0);
