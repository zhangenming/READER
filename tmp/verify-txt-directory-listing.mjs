// 一次性验证脚本：headless Chrome 打开阅读器，点击「阅读内容」按钮，
// 检查内容选择弹窗是否成功读到 txt 目录列表。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CDP端口 = Number(process.env.VERIFY_CDP_PORT || 9411);
const 站点端口 = Number(process.env.SITE_PORT || 15999);
const 地址 = `http://127.0.0.1:${站点端口}/`;

const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-verify-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    地址,
  ],
  { stdio: 'ignore' },
);

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function 等待目标() {
  for (let i = 0; i < 100; i++) {
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

for (let i = 0; i < 150; i++) {
  if (await 求值(`return !document.querySelector('#载入状态') || document.querySelector('#载入状态').hidden;`))
    break;
  await pause(200);
}

await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
await pause(2500);

const 结果 = await 求值(`
  const 弹窗 = document.querySelector('#内容选择弹窗');
  const 列表 = document.querySelector('#内容选择列表');
  return {
    打开: 弹窗.open,
    条目: [...列表.querySelectorAll('[data-file-name]')].map((b) => b.dataset.fileName),
    提示: [...列表.querySelectorAll('.内容选择提示')].map((p) => p.textContent),
  };
`);

console.log(JSON.stringify(结果, null, 2));
assert.equal(结果.打开, true, '弹窗应已打开');
assert.equal(结果.提示.length, 0, `不应出现错误提示：${结果.提示.join(',')}`);
assert.ok(结果.条目.length >= 10, `目录条目过少：${结果.条目.length}`);
assert.ok(
  结果.条目.some((n) => n === '白鹿原.txt'),
  '应包含 白鹿原.txt',
);
assert.ok(
  结果.条目.every((n) => n.endsWith('.txt') && !n.includes('/')),
  '条目应为纯文件名',
);

// 点击条目应当真的把对应文本载入进来。
await 求值(`
  [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
    .find((b) => b.dataset.fileName === '白鹿原.txt').click();
  return 1;
`);
let 载入完成 = false;
let 载入诊断 = null;
for (let i = 0; i < 100; i++) {
  await pause(200);
  载入诊断 = await 求值(`
    const { 状态 } = await import('./js/状态.js');
    return {
      文件名: 状态.文件名,
      文本字数: 状态.文本.length,
      渲染段落数: document.querySelectorAll('#滚动容器 p').length,
      弹窗仍打开: document.querySelector('#内容选择弹窗').open,
    };
  `);
  载入完成 =
    载入诊断.文件名 === '白鹿原.txt' && 载入诊断.文本字数 > 100_000;
  if (载入完成) break;
}
assert.ok(载入完成, `点击条目后应载入正文：${JSON.stringify(载入诊断)}`);

console.log(
  `\nOK：读到 ${结果.条目.length} 个文本，点击条目载入 ${载入诊断.文本字数} 字`,
);

ws.close();
chrome.kill();
process.exit(0);
