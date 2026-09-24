// 校验：被「我说，」切开的同一段对话，前后两个引文片段共用同一底色。
// 载入阿里传，滚到「让我想不到的是」一段，逐行 dump 引文字符的底色类与 ::before 实际色值。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const 目标文本 = '阿里传.txt';
const 锚点 = '当天晚上，正当我收拾行李时';

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
const CDP端口 = await 取空闲端口(9471);
const 站点端口 = await 取空闲端口(15971);
const 地址 = `http://127.0.0.1:${站点端口}/`;

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: resolve(import.meta.dirname, '..'),
  stdio: 'pipe',
});
服务.stdout.resume();
服务.stderr.resume();
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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-spk-nojump-'))}`,
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

await 发送('Network.enable');
await 发送('Page.reload', { ignoreCache: true });
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

const 行号 = await 求值(`
  const { 状态 } = await import('./js/状态.js');
  const off = 状态.文本.indexOf(${JSON.stringify(锚点)});
  if (off < 0) return -1;
  let idx = 0;
  for (let i = 0; i < 状态.行起点列表.length; i++) {
    if (状态.行起点列表[i] <= off) idx = i; else break;
  }
  return idx;
`);
if (行号 < 0) throw new Error('锚点文本不存在');
await 求值(`
  const { 元素 } = await import('./js/状态.js');
  const probe = document.querySelector('.正文行');
  const 行高 = probe ? probe.getBoundingClientRect().height : 30;
  元素.滚动容器.scrollTop = (${行号} - 6) * 行高;
  return 1;
`);
await pause(800);

const 报告 = await 求值(`
  const { 状态 } = await import('./js/状态.js');
  const 行列表 = [...document.querySelectorAll('.正文行')];
  const 数据 = 行列表.map((行) => {
    const 色 = new Set();
    const 实际 = new Set();
    for (const z of 行.querySelectorAll(':scope > .字.引文内容')) {
      色.add(z.classList.contains('引文底色一') ? '一' :
              z.classList.contains('引文底色二') ? '二' : '无');
      实际.add(getComputedStyle(z, '::before').backgroundColor);
    }
    return { 文本: 行.textContent.trim().slice(0, 26), 底色: [...色], 色值: [...实际] };
  });
  return {
    奇偶表长度: 状态.引文底色奇偶列表.length,
    边界长度: 状态.引文边界列表.length,
    数据,
  };
`);
console.log(
  '引文片段数:',
  报告.边界长度 / 2,
  '奇偶表长度:',
  报告.奇偶表长度,
  报告.边界长度 / 2 === 报告.奇偶表长度 ? 'OK' : 'MISMATCH',
);
for (const 行 of 报告.数据) {
  if (!行.文本) continue;
  console.log(
    行.底色.length ? 行.底色.join('+').padEnd(6) : '      ',
    (行.色值.join('|') || '').padEnd(24),
    行.文本,
  );
}
const 截图 = await 发送('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
const 输出 = resolve(import.meta.dirname, '引文不越段-阿里传.png');
writeFileSync(输出, Buffer.from(截图.data, 'base64'));
console.log('截图:', 输出);
收尾();
