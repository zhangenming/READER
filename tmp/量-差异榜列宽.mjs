// 一次性量尺脚本：量差异榜各列的真实渲染宽度、括号文本宽、滚动条占位。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CDP端口 = 9421;
const 站点端口 = 15997;
const 地址 = `http://127.0.0.1:${站点端口}/`;
const 书名 = process.env.BOOK || '白鹿原.txt';

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: join(import.meta.dirname, '..'),
  stdio: 'ignore',
});
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-measure-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    地址,
  ],
  { cwd: join(import.meta.dirname, '..'), stdio: 'ignore' },
);
process.on('exit', () => {
  chrome.kill();
  服务.kill();
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function 连上() {
  for (let i = 0; i < 100; i++) {
    try {
      const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
      const 目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
      if (目标) return 目标;
    } catch {}
    await pause(200);
  }
  throw new Error('连不上 Chrome');
}
const 目标 = await 连上();
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

for (let i = 0; i < 200; i++) {
  const 好 = await 求值(
    `const c=document.querySelector('#载入状态'); return !c || c.hidden;`,
  );
  if (好) break;
  await pause(200);
}
await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
await pause(1500);
await 求值(
  `[...document.querySelectorAll('#内容选择列表 [data-file-name]')].find(b=>b.dataset.fileName===${JSON.stringify(书名)})?.click(); return 1;`,
);
for (let i = 0; i < 300; i++) {
  const 状态 = await 求值(
    `const {状态}=await import('./js/状态.js'); return 状态.文件名===${JSON.stringify(书名)} && 状态.文本.length>0;`,
  );
  if (状态) break;
  await pause(200);
}
await 求值(
  `const { 打开词频弹窗 } = await import('./js/词频弹窗.js'); 打开词频弹窗(); return 1;`,
);
// 榜单可能还挂着上一本书的结果：等说明文字连续两次采样不变再量
let 上次 = '';
let 稳 = 0;
for (let i = 0; i < 400; i++) {
  await pause(250);
  const 现 = await 求值(
    `return document.querySelector('#字频差异说明').textContent;`,
  );
  if (现 === 上次 && 现.includes('字入榜')) 稳++;
  else 稳 = 0;
  上次 = 现;
  if (稳 >= 2) break;
}

const 量 = await 求值(`
  const 模块 = document.querySelector('#字频差异模块');
  const 栏 = document.querySelector('.字频差异栏');
  const 滚动 = document.querySelector('#字频差异偏多滚动');
  const 表 = 滚动.querySelector('table');
  const 列宽 = [...表.querySelectorAll('thead th')].map((th) => Math.round(th.getBoundingClientRect().width));
  const 说明 = document.querySelector('#字频差异说明');
  const 克隆 = 说明.cloneNode(true);
  克隆.style.position = 'absolute';
  克隆.style.width = 'min-content';
  克隆.style.whiteSpace = 'normal';
  document.body.append(克隆);
  const 说明min = Math.round(克隆.getBoundingClientRect().width);
  克隆.remove();
  const 行高 = () =>
    document.querySelector('#字频差异偏多列表 tr').getBoundingClientRect().height;
  const 格 = document.querySelector('#字频差异偏多列表 tr td:nth-child(3)');
  const 算 = getComputedStyle(格);
  const 带括号 = 行高();
  const 样式 = document.createElement('style');
  样式.textContent = '.本书个数{display:none}';
  document.head.append(样式);
  const 无括号 = 行高();
  样式.remove();
  const 榜 = ['偏多','偏少','最小'].map((键) => {
    const 表体 = document.querySelector('#字频差异' + 键 + '列表');
    const 自然宽 = (格) => {
      const r = document.createRange();
      r.selectNodeContents(格);
      return r.getBoundingClientRect().width;
    };
    let 最宽 = { 宽: 0, 文本: '' };
    let 最高 = 0;
    for (const 行 of 表体.children) {
      const 格 = 行.children[2];
      最高 = Math.max(最高, 行.getBoundingClientRect().height);
      const 宽 = 自然宽(格);
      if (宽 > 最宽.宽) 最宽 = { 宽: Math.round(宽 * 10) / 10, 文本: 格.textContent };
    }
    const 格框 = 表体.children[0].children[2].getBoundingClientRect();
    const 个数框 = 表体.children[0].children[2].querySelector('.本书个数').getBoundingClientRect();
    return {
      键,
      最宽文本: 最宽,
      行高: 最高,
      格子宽: Math.round(格框.width),
      首行余量: Math.round((格框.right - 个数框.right) * 10) / 10,
    };
  });
  const 容器 = document.querySelector('#字频对照容器');
  return {
    书名: ${JSON.stringify(书名)},
    弹窗宽: Math.round(document.querySelector('#词频弹窗').getBoundingClientRect().width),
    视口: innerWidth,
    模块宽: Math.round(模块.getBoundingClientRect().width),
    栏宽: Math.round(栏.getBoundingClientRect().width),
    表宽: Math.round(表.getBoundingClientRect().width),
    列宽,
    滚动条宽: 滚动.offsetWidth - 滚动.clientWidth,
    说明宽: Math.round(说明.getBoundingClientRect().width),
    说明min,
    本书格: { 行高: 算.lineHeight, 字号: 算.fontSize, 内边距: 算.padding, 高: 算.height },
    行高带括号: 带括号,
    行高无括号: 无括号,
    主表容器宽: 容器.clientWidth,
    主表滚动宽: 容器.scrollWidth,
    榜,
  };
`);
console.log(JSON.stringify(量, null, 2));
const 图 = await 发送('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync('/tmp/差异榜量尺.png', Buffer.from(图.data, 'base64'));
process.exit(0);
