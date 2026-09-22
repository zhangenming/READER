// 看一眼左侧轨道当前的真实样子：载入一本书，滚到指定位置，截整页 + 裁出左边缘 260px。
// 跑法：node tmp/看-轨道.mjs  [BOOK=谁动了我的奶酪.txt] [AT=0.26]
import { execSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const 目标文本 = process.env.BOOK || '谁动了我的奶酪.txt';
const 位置 = Number(process.env.AT || 0.26);
const 关键词 = process.env.KW || '蒙古';
const 额外关键词 = process.env.KW2 || '';
const 额外样式 = process.env.CSS || '';

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
const CDP端口 = await 取空闲端口(9455);
const 站点端口 = await 取空闲端口(15955);
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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-rail-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
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

for (let i = 0; i < 600; i++) {
  const 就绪 = await 求值(`
    return !!document.querySelector('#内容选择按钮') &&
      (document.querySelector('#载入状态')?.hidden ?? true);
  `);
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
if (额外样式) {
  await 求值(`
    const 样式 = document.createElement('style');
    样式.textContent = ${JSON.stringify(额外样式)};
    document.head.append(样式);
    const { 更新关键词指示器 } = await import('./js/指示器.js');
    更新关键词指示器();
    return 1;
  `);
  await pause(400);
}
if (关键词) {
  await 求值(`
    const { 添加关键词标记 } = await import('./js/关键词.js');
    const { 状态 } = await import('./js/状态.js');
    添加关键词标记(${JSON.stringify(关键词)}, 状态.文本.indexOf(${JSON.stringify(关键词)}));
    return 1;
  `);
}
if (额外关键词) {
  await 求值(`
    const { 添加关键词标记 } = await import('./js/关键词.js');
    const { 状态 } = await import('./js/状态.js');
    添加关键词标记(${JSON.stringify(额外关键词)}, 状态.文本.indexOf(${JSON.stringify(额外关键词)}));
    return 1;
  `);
}
await 求值(`
  const { 元素 } = await import('./js/状态.js');
  元素.滚动容器.scrollTop = 元素.滚动容器.scrollHeight * ${位置};
  return 1;
`);
await pause(600);
const 度量 = await 求值(`
  const { 状态 } = await import('./js/状态.js');
  const q = (s) => document.querySelector(s);
  const 盒 = (s) => { const e = q(s); if (!e) return null; const b = e.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
      hidden: e.hidden, display: getComputedStyle(e).display }; };
  return { 章节数: 状态.章节列表.length, 关键词数: 状态.关键词列表.length,
    指示器宽度: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--指示器宽度'), 10),
    视口: [innerWidth, innerHeight], 轨道: 盒('#自定义滚动条'), 章节刻度: 盒('#章节刻度'),
    关键词指示器: 盒('#关键词指示器'), 悬停: 盒('#悬停关键词指示器'), 滚动块: 盒('#滚动块'),
    滚动进度: 盒('#滚动进度'), 百分比文本: q('#滚动百分比')?.textContent,
    竖排: getComputedStyle(q('#滚动百分比')).writingMode,
    阅读区域: 盒('.阅读区域'), 时间信息: 盒('.时间信息') };
`);
console.log(JSON.stringify(度量, null, 1));

// —— 交互与边界：轨道贴在页面左缘；百分比盒子整列落在轨道内、不压指示列；正文不越界 ——
const assert = await import('node:assert/strict');
const 轨道右 = 度量.轨道.x + 度量.轨道.w;
const 指示列左 = 轨道右 - 度量.指示器宽度;
assert.equal(度量.轨道.x, 0, '轨道应贴在页面左缘');
assert.equal(度量.滚动进度.x, 0, '百分比应贴屏幕左缘');
assert.equal(度量.滚动进度.w, 度量.轨道.w - 度量.指示器宽度, '百分比列 = 轨道宽 - 指示列宽');
assert.ok(
  度量.滚动进度.x + 度量.滚动进度.w <= 指示列左,
  `百分比不许压在指示列上：${JSON.stringify(度量)}`,
);
assert.ok(
  度量.章节刻度.w <= 度量.指示器宽度 && 度量.关键词指示器.w <= 度量.指示器宽度,
  '章节刻度与关键词指示器应各占指示列宽',
);
if (!度量.章节刻度.hidden) {
  assert.equal(度量.章节刻度.x + 度量.章节刻度.w, 轨道右, '指示列应贴着正文一侧');
}
const 拖动前 = await 求值(`return (await import('./js/状态.js')).元素.滚动容器.scrollTop;`);
await 求值(`
  const e = document.querySelector('#滚动进度');
  const b = e.getBoundingClientRect();
  const 点 = (t, y) => e.dispatchEvent(new PointerEvent(t, {
    pointerId: 7, clientX: b.x + b.width / 2, clientY: y, bubbles: true, isPrimary: true }));
  点('pointerdown', b.y + b.height / 2);
  点('pointermove', innerHeight * 0.8);
  点('pointerup', innerHeight * 0.8);
  return 1;
`);
await pause(300);
const 拖动后 = await 求值(`return (await import('./js/状态.js')).元素.滚动容器.scrollTop;`);
assert.ok(
  Math.abs(拖动后 - 拖动前) > 100,
  `拖动百分比应当滚动正文：${拖动前} → ${拖动后}`,
);
const 悬停 = await 求值(`
  const { 状态, 元素 } = await import('./js/状态.js');
  状态.悬停关键词id = 状态.关键词列表.find((k) => k.id !== 状态.当前关键词id)?.id
    ?? null;
  (await import('./js/指示器.js')).更新关键词指示器();
  const b = 元素.悬停关键词指示器.getBoundingClientRect();
  return { hidden: 元素.悬停关键词指示器.hidden, x: Math.round(b.x), w: Math.round(b.width) };
`);
console.log('悬停列:', JSON.stringify(悬停), '轨道 x:', 度量.轨道.x);
if (!悬停.hidden) {
  assert.ok(悬停.x >= 轨道右, '悬停列应排在轨道右侧、不压轨道');
  assert.equal(悬停.w, 度量.指示器宽度, '悬停列应与指示列同宽');
}
const 正文左缘 = await 求值(`
  const 行 = [...document.querySelectorAll('.正文行')].pop();
  return Math.round(行.getBoundingClientRect().left);
`);
assert.ok(
  正文左缘 >= 轨道右 - 1,
  `正文不该伸进轨道：正文左缘 ${正文左缘} vs 轨道右缘 ${轨道右}`,
);
console.log('交互与边界检查通过');
const { data: 放大 } = await 发送('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 0, y: 0, width: 度量.轨道.w + 24, height: 度量.视口[1], scale: 4 },
});
writeFileSync(resolve(import.meta.dirname, '轨道-放大.png'), Buffer.from(放大, 'base64'));
const { data: 悬停图 } = await 发送('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 0, y: 0, width: 度量.轨道.w + 54, height: 度量.视口[1], scale: 4 },
});
writeFileSync(resolve(import.meta.dirname, '轨道-悬停.png'), Buffer.from(悬停图, 'base64'));
const { data } = await 发送('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 0, y: 0, width: 260, height: 度量.视口[1], scale: 1 },
});
writeFileSync(resolve(import.meta.dirname, '轨道-左缘.png'), Buffer.from(data, 'base64'));
const { data: 全 } = await 发送('Page.captureScreenshot', { format: 'png' });
writeFileSync(resolve(import.meta.dirname, '轨道-整页.png'), Buffer.from(全, 'base64'));
console.log('已写 tmp/轨道-左缘.png 与 tmp/轨道-整页.png');
收尾();
