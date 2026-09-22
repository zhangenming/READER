// 看页面顶部/底部那两条 1px 白边：量几何 + 截边缘条 + 用 PIL 逐列扫像素，确认整宽连续且只有 1px。
// 跑法：node tmp/看-顶部白边.mjs  [BOOK=谁动了我的奶酪.txt] [SIZE=1440,1000]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const 目标文本 = process.env.BOOK || '谁动了我的奶酪.txt';

async function 取空闲端口(首选) {
  const 试 = async (端口) => {
    const 探测 = createServer();
    try {
      await new Promise((完成, 失败) => {
        探测.once('error', 失败);
        探测.listen(端口, '127.0.0.1', 完成);
      });
      return 探测.address().port;
    } catch {
      return 0;
    } finally {
      await new Promise((完成) => 探测.close(完成));
    }
  };
  return (await 试(首选)) || 试(0);
}
const CDP端口 = await 取空闲端口(9466);
const 站点端口 = await 取空闲端口(15966);
const 地址 = `http://127.0.0.1:${站点端口}/`;

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: resolve(import.meta.dirname, '..'),
  stdio: 'ignore',
});
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(地址, { signal: AbortSignal.timeout(1000) })).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-topline-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=1',
    `--window-size=${process.env.SIZE || '1440,1000'}`,
    地址,
  ],
  { stdio: 'ignore' },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function 收尾(错误) {
  if (错误) console.error(错误);
  chrome.kill();
  服务.kill();
  process.exit(错误 ? 1 : 0);
}
process.on('unhandledRejection', 收尾);
process.on('uncaughtException', 收尾);

let 目标 = null;
for (let i = 0; i < 300 && !目标; i++) {
  try {
    const 列表 = await (
      await fetch(`http://127.0.0.1:${CDP端口}/json`)
    ).json();
    目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
  } catch {}
  await pause(200);
}
if (!目标) throw new Error('未找到 headless Chrome 页面');

const ws = new WebSocket(目标.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let 消息号 = 0;
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
  return new Promise((解决, 拒绝) => {
    const 下标 = ++消息号;
    待回复.set(下标, { resolve: 解决, reject: 拒绝 });
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

// 全新 profile 没有上次阅读记录，载入状态不会自动隐藏，只等按钮挂上就行
for (let i = 0; i < 300; i++) {
  const 就绪 = await 求值(`return !!document.querySelector('#内容选择按钮');`);
  if (就绪) break;
  await pause(200);
}
await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
for (let i = 0; i < 150; i++) {
  const 有 = await 求值(`
    return [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
      .some((b) => b.dataset.fileName === ${JSON.stringify(目标文本)});
  `);
  if (有) break;
  await pause(200);
}
await 求值(`
  [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
    .find((b) => b.dataset.fileName === ${JSON.stringify(目标文本)}).click();
  return 1;
`);
for (let i = 0; i < 600; i++) {
  const 好 = await 求值(`
    const { 状态 } = await import('./js/状态.js');
    return 状态.文件名 === ${JSON.stringify(目标文本)} && 状态.行起点列表.length > 100;
  `);
  if (好) break;
  await pause(200);
}
await 求值(`
  const { 元素 } = await import('./js/状态.js');
  元素.滚动容器.scrollTop = 元素.滚动容器.scrollHeight * 0.26;
  return 1;
`);
await pause(600);

const 度量 = await 求值(`
  const q = (s) => document.querySelector(s);
  const 盒 = (s) => { const e = q(s); const b = e.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const 体 = getComputedStyle(document.body);
  return {
    视口: [innerWidth, innerHeight],
    上边框宽: 体.borderTopWidth, 上边框色: 体.borderTopColor, 上边框样式: 体.borderTopStyle,
    下边框宽: 体.borderBottomWidth, 下边框色: 体.borderBottomColor, 下边框样式: 体.borderBottomStyle,
    body: 盒('body'), 阅读区域: 盒('.阅读区域'), 轨道: 盒('#自定义滚动条'), 章节轨道: 盒('#章节轨道'),
  };
`);
console.log(JSON.stringify(度量, null, 1));
const 白 = 'rgb(255, 255, 255)';
for (const [边, 宽, 色, 式] of [
  ['上', 度量.上边框宽, 度量.上边框色, 度量.上边框样式],
  ['下', 度量.下边框宽, 度量.下边框色, 度量.下边框样式],
]) {
  assert.equal(宽, '1px', `body ${边}边框应为 1px`);
  assert.equal(式, 'solid', `body ${边}边框应为实线`);
  assert.equal(色, 白, `body ${边}边框应为纯白`);
}
assert.equal(度量.body.y, 0, 'body 仍从视口顶端起');
assert.equal(度量.阅读区域.y, 1, '阅读区内容应被上边压下 1px');
assert.equal(度量.阅读区域.h, 度量.视口[1] - 2, '阅读区上下各让出 1px');
assert.equal(度量.body.h, 度量.视口[1], 'body 仍占满整屏（border-box，不产生滚动）');
assert.equal(度量.轨道.h, 度量.视口[1], '右侧轨道仍满高');
assert.equal(度量.章节轨道.h, 度量.视口[1], '左侧轨道仍满高');

const 截 = async (名字, x, y, 宽度, 高度, scale = 1) => {
  const { data } = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x, y, width: 宽度, height: 高度, scale },
    captureBeyondViewport: false,
  });
  const 路径 = resolve(import.meta.dirname, 名字);
  writeFileSync(路径, Buffer.from(data, 'base64'));
  return 路径;
};
const 顶部条 = await 截('顶部白边-条.png', 0, 0, 度量.视口[0], 8, 8);
const 底部条 = await 截(
  '底部白边-条.png',
  0,
  度量.视口[1] - 8,
  度量.视口[0],
  8,
  8,
);
const 整页 = await 截(
  '顶部白边-整页.png',
  0,
  0,
  度量.视口[0],
  度量.视口[1],
);
console.log('已写 tmp/顶部白边-条.png、底部白边-条.png、顶部白边-整页.png');
console.log(
  `python3 tmp/扫-顶部白边.py ${顶部条} ${整页} ${底部条}`,
);
收尾();
