// 量窄视口下关键词面板排序栏的排布：「批量」入口会不会被挤出面板或被裁字。
// 用法：node tmp/跑-浏览器回归-外部站点.mjs tmp/量-批量入口窄视口.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const port = process.env.CDP_PORT;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(
  (t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:15921/'),
);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) =>
  ws.addEventListener('open', resolve, { once: true }),
);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(code) {
  const result = await send('Runtime.evaluate', {
    expression: `(async () => { ${code} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.exception?.description ||
        JSON.stringify(result.exceptionDetails),
    );
  return result.result.value;
}
const pause = (毫秒) => new Promise((resolve) => setTimeout(resolve, 毫秒));

await send('Page.enable');
await send('Runtime.enable');

const 结果 = [];
for (const 宽度 of [1280, 700, 480, 375]) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 宽度,
    height: 760,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const 读数 = await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    const { 添加关键词标记, 查找关键词命中 } = await import('./js/关键词.js');
    const { 渲染关键词面板 } = await import('./js/面板.js');
    if (!状态.关键词列表.length) {
      const 词 = (状态.文本.match(/[\\u4e00-\\u9fff]{2}/g) ?? [])[0];
      添加关键词标记(词, 状态.文本.indexOf(词));
    }
    状态.关键词面板展开 = true;
    状态.关键词面板签名 = '';
    渲染关键词面板();
    const 栏 = document.querySelector('.关键词排序栏');
    const 钮 = document.querySelector('.关键词批量钮');
    const 面板 = document.querySelector('#关键词列表容器');
    const r栏 = 栏.getBoundingClientRect();
    const r钮 = 钮.getBoundingClientRect();
    const r面 = 面板.getBoundingClientRect();
    return {
      面板宽: Math.round(r面.width),
      栏内容宽: 栏.scrollWidth,
      栏可视宽: Math.round(r栏.width),
      批量左: Math.round(r钮.left),
      批量右: Math.round(r钮.right),
      面板右: Math.round(r面.right),
      被裁: 钮.scrollWidth > 钮.clientWidth,
      与拼音钮同行: (() => { const 拼音 = [...栏.querySelectorAll('.关键词排序钮')].at(-2).getBoundingClientRect(); return Math.abs(拼音.top - r钮.top) < 1 && Math.abs(拼音.bottom - r钮.bottom) < 1; })(),
    };
  `);
  结果.push({ 视口: 宽度, ...读数 });
  await pause(150);
}
await send('Emulation.clearDeviceMetricsOverride');

const 报告 = 结果
  .map(
    (行) =>
      `${行.视口}px → 面板 ${行.面板宽} 栏内容 ${行.栏内容宽}/${行.栏可视宽} ` +
      `批量 ${行.批量左}..${行.批量右} (面板右 ${行.面板右}) ` +
      `被裁=${行.被裁} 与拼音钮同行=${行.与拼音钮同行}`,
  )
  .join('\n');
console.log(报告);
await writeFile(
  fileURLToPath(new URL('../tmp/批量入口-窄视口.txt', import.meta.url)),
  报告 + '\n',
);
ws.close();
