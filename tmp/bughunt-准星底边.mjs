// 复现「当前命中准星外框缺底边」：载入阿里传，滚到「谢尔盖·布林」一行，
// 添加关键词并置为当前命中，dump 行/字/::before 几何并截图。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const 目标文本 = process.env.BOOK || '阿里传.txt';
const 锚点 = process.env.ANCHOR || '谢尔盖·布林';

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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-crosshair-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
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
    const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
    目标 = 列表.find((t) => t.type === 'page');
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

await 发送('Page.enable');
await 发送('Page.navigate', { url: 地址 });
await pause(1500);
for (let i = 0; i < 600; i++) {
  const 就绪 = await 求值(`
    return !!document.querySelector('#内容选择按钮') &&
      (document.querySelector('#载入状态')?.hidden ?? true);
  `);
  if (就绪) break;
  await pause(300);
}
console.log(
  '页面状态',
  JSON.stringify(
    await 求值(`
      return { url: location.href, title: document.title,
        ready: document.readyState,
        按钮: !!document.querySelector('#内容选择按钮'),
        载入: !!document.querySelector('#载入状态'),
        bodyChildren: document.body ? document.body.children.length : -1,
        html: document.documentElement ? document.documentElement.outerHTML.slice(0,200) : '' };
    `),
    null,
    1,
  ),
);
await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
for (let i = 0; i < 150; i++) {
  const 有 = await 求值(`
    return [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
      .some((b) => b.dataset.fileName === ${JSON.stringify(目标文本)});
  `);
  if (有) break;
  await pause(200);
}
await 求值(`
  [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
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

// 夜读配色：纸面黑、正文白，准星白框才可辨
await 求值(`
  const r = document.documentElement;
  r.style.setProperty('--背景色', '#000000');
  r.style.setProperty('--纸面色', '#000000');
  r.style.setProperty('--正文字色', '#ffffff');
  return 1;
`);

const 句 = '眼看着会议陷入僵局';
const 行号 = await 求值(`
  const { 状态 } = await import('./js/状态.js');
  const off = 状态.文本.indexOf(${JSON.stringify(句)});
  if (off < 0) return -1;
  let idx = 0;
  for (let i = 0; i < 状态.行起点列表.length; i++) {
    if (状态.行起点列表[i] <= off) idx = i; else break;
  }
  return idx;
`);
if (行号 < 0) throw new Error('锚点文本不存在');

// 虚拟渲染下 scrollTop 与行号不严格线性，用已渲染行的 dataset 反馈迭代收敛
let 已到位 = false;
for (let i = 0; i < 40 && !已到位; i++) {
  const 结果 = await 求值(`
    const { 状态, 元素 } = await import('./js/状态.js');
    const 行列表 = [...document.querySelectorAll('.正文行')];
    if (行列表.some((l) => l.textContent.includes(${JSON.stringify(句)})))
      return { 到位: true, 行: 行列表.length };
    const 首 = 行列表[0];
    if (!首) return { 到位: false, 行: 0 };
    const 首起点 = Number(首.dataset.start);
    let 当前idx = 0;
    for (let k = 0; k < 状态.行起点列表.length; k++) {
      if (状态.行起点列表[k] === 首起点) { 当前idx = k; break; }
      if (状态.行起点列表[k] > 首起点) { 当前idx = k - 1; break; }
      当前idx = k;
    }
    const 行高 = 首.getBoundingClientRect().height || 30;
    const 修正 = (${行号} - 当前idx) * 行高;
    元素.滚动容器.scrollTop = Math.max(0, 元素.滚动容器.scrollTop + 修正);
    return { 到位: false, 当前idx, 修正: Math.round(修正), scrollTop: 元素.滚动容器.scrollTop };
  `);
  已到位 = !!结果.到位;
  if (!已到位) console.log('滚动收敛', JSON.stringify(结果));
  await pause(250);
}
if (!已到位) throw new Error('目标行始终未渲染');

await 求值(`
  const { 状态 } = await import('./js/状态.js');
  const { 添加关键词标记 } = await import('./js/关键词.js');
  const 句off = 状态.文本.indexOf(${JSON.stringify(句)});
  const off = 状态.文本.indexOf(${JSON.stringify(锚点)}, 句off);
  添加关键词标记(${JSON.stringify(锚点)}, off);
  return 1;
`);
await pause(800);

const 度量 = await 求值(`
  const 行列表 = [...document.querySelectorAll('.正文行')];
  const 目标行 = 行列表.find((l) => l.textContent.includes(${JSON.stringify(锚点)}));
  if (!目标行) return { 错: '目标行未渲染', 行: 行列表.map(l=>l.textContent.slice(0,20)) };
  const rb = 目标行.getBoundingClientRect();
  const 行样式 = getComputedStyle(目标行);
  const 字数据 = [...目标行.querySelectorAll(':scope > .字')].map((z) => {
    const b = z.getBoundingClientRect();
    const ps = getComputedStyle(z, '::before');
    const s = getComputedStyle(z);
    return {
      t: z.textContent,
      cls: z.className.replace(/\\b字\\b ?/, ''),
      x: Math.round(b.x * 100) / 100,
      y: Math.round(b.y * 100) / 100,
      w: Math.round(b.width * 100) / 100,
      h: Math.round(b.height * 100) / 100,
      top: ps.top, bottom: ps.bottom, left: ps.left, right: ps.right,
      ph: ps.height,
      bgImage: ps.backgroundImage.slice(0, 40),
      pos: s.position, ov: s.overflow, disp: s.display,
      zIndex: s.zIndex, isolate: s.isolation,
    };
  });
  const 下一行 = 目标行.nextElementSibling;
  const 下一样式 = 下一行 ? getComputedStyle(下一行) : null;
  return {
    行: { y: rb.y, h: rb.height, overflow: 行样式.overflow, contain: 行样式.contain,
      z: 行样式.zIndex, cls: 目标行.className, pos: 行样式.position },
    下一行: 下一行 && { y: 下一行.getBoundingClientRect().y, overflow: 下一样式.overflow,
      contain: 下一样式.contain, z: 下一样式.zIndex, bg: 下一样式.backgroundColor,
      cls: 下一行.className },
    字号: getComputedStyle(目标行).fontSize,
    行高: getComputedStyle(目标行).lineHeight,
    字数据,
  };
`);
if (度量.错) throw new Error(JSON.stringify(度量));
console.log(JSON.stringify(度量, null, 1));

// 修复后复验：不改动任何样式，直接截图并量准星外框的四条边
const 块 = await 求值(`
  const 行 = [...document.querySelectorAll('.正文行')].find((l) =>
    l.textContent.includes(${JSON.stringify(锚点)}));
  if (!行) return null;
  const 命中字 = [...行.querySelectorAll(':scope > .字.当前命中')];
  if (!命中字.length) return null;
  const a = 命中字[0].getBoundingClientRect();
  const b = 命中字.at(-1).getBoundingClientRect();
  return { x: a.x, y: a.y, w: b.right - a.left, h: a.height,
    本行z: getComputedStyle(行).zIndex,
    下一行z: getComputedStyle(行.nextElementSibling).zIndex,
    下一行cls: 行.nextElementSibling?.className };
`);
if (!块) throw new Error('目标行未渲染');
console.log('命中块', JSON.stringify(块));

const { data } = await 发送('Page.captureScreenshot', { format: 'png' });
const 路径 = resolve(import.meta.dirname, '准星-修复后.png');
writeFileSync(路径, Buffer.from(data, 'base64'));
console.log('已写', 路径);
收尾();
