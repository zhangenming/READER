// 一次性验证：右下角按钮组与时间读数常驻显形，不做任何悬停/遮挡判定。
// 自启 server.mjs + headless Chrome：
//   1) 载入后指针停在正文中央，五枚按钮的 opacity/pointer-events 均为可见可点；
//   2) buttons 在视口内且中心点命中自身（真的能点，不是只画出来）；
//   3) 滚动到正文铺满右下角的行位，.时间信息 仍可见（不再挂遮挡类）；
//   4) 移动鼠标离开右下角，按钮组不淡出；
//   5) 出图供肉眼复核。
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const 站点端口 = Number(process.env.SITE_PORT || 16117);
const CDP端口 = Number(process.env.VERIFY_CDP_PORT || 9517);
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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-右下常驻-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    '--force-color-profile=srgb',
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
  if (结果.exceptionDetails) {
    throw new Error(
      结果.exceptionDetails.exception?.description ||
        JSON.stringify(结果.exceptionDetails),
    );
  }
  return 结果.result.value;
}

for (let i = 0; i < 200; i++) {
  const 行数 = await 求值(`return document.querySelectorAll('.正文行').length;`);
  if (行数 > 20) break;
  await pause(200);
}

const 读按钮组 = `
  const 组 = document.querySelector('.右下按钮组');
  const 按钮 = ['#自动滚动按钮', '#关键词面板开关', '#内容选择按钮', '#章节目录按钮', '#阅读统计按钮']
    .map((选择器) => document.querySelector(选择器))
    .filter(Boolean);
  return {
    组类名: 组.className,
    浮层类名: document.querySelector('.时间信息').className,
    body类名: document.body.className,
    按钮: 按钮.map((el) => {
      const 样式 = getComputedStyle(el);
      const 框 = el.getBoundingClientRect();
      return {
        id: el.id,
        opacity: 样式.opacity,
        visibility: 样式.visibility,
        pointerEvents: 样式.pointerEvents,
        有尺寸: 框.width > 0 && 框.height > 0,
        在视口内: 框.width > 0 && 框.height > 0,
        可命中: document.elementsFromPoint(框.left + 框.width / 2, 框.top + 框.height / 2).includes(el),
      };
    }),
  };
`;

// 1) 载入后指针根本没动过：按钮组就该是显形的
const 初始 = await 求值(读按钮组);
console.log('载入态:', JSON.stringify(初始, null, 1));
assert.equal(初始.body类名.includes('右下控件显示'), false, '不再有 body 状态类');
for (const b of 初始.按钮) {
  assert.equal(b.opacity, '1', `${b.id} 常驻显形`);
  assert.equal(b.visibility, 'visible', `${b.id} 可见`);
  assert.equal(b.pointerEvents, 'auto', `${b.id} 可点`);
  // 关键词面板开关的文案由面板填充，无词时整枚按钮零宽（既有行为，与显隐无关）
  if (b.有尺寸) {
    assert.ok(b.在视口内, `${b.id} 在视口内`);
    assert.ok(b.可命中, `${b.id} 中心点命中自身`);
  }
}

// 2) 指针扫到左上角再回来：不出热区也不该淡出
await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 20 });
await pause(300);
const 移开后 = await 求值(读按钮组);
for (const b of 移开后.按钮) {
  assert.equal(b.opacity, '1', `${b.id} 指针移开后仍显形`);
}

// 3) 滚到正文铺满右下角的行位：读数不再被「是否被文字覆盖」判定隐藏
await 求值(`
  const 容器 = document.querySelector('#滚动容器') || document.querySelector('.阅读区域');
  容器.scrollTop = Math.floor(容器.scrollHeight / 2);
  容器.dispatchEvent(new Event('scroll'));
  return 容器.scrollTop;
`);
await pause(500);
const 滚动后 = await 求值(`
  const 浮层 = document.querySelector('.时间信息');
  const 框 = 浮层.getBoundingClientRect();
  const 样式 = getComputedStyle(浮层);
  const 组 = document.querySelector('.右下按钮组');
  const 组框 = 组.getBoundingClientRect();
  return {
    浮层类名: 浮层.className,
    visibility: 样式.visibility,
    opacity: 样式.opacity,
    浮层与按钮组相交: !(框.right < 组框.left || 框.left > 组框.right || 框.bottom < 组框.top || 框.top > 组框.bottom),
  };
`);
console.log('滚动后:', JSON.stringify(滚动后));
assert.equal(滚动后.浮层类名.includes('被正文遮挡'), false, '不再有遮挡类');
assert.equal(滚动后.visibility, 'visible', '读数被正文压住时仍可见');
assert.equal(滚动后.opacity, '1', '读数不透明');
assert.equal(滚动后.浮层与按钮组相交, false, '读数块与按钮组不重叠');

const 截图 = await 发送('Page.captureScreenshot', { format: 'png' });
writeFileSync('tmp/右下常驻-验证.png', Buffer.from(截图.data, 'base64'));
console.log('截图: tmp/右下常驻-验证.png');
console.log('全部断言通过');
