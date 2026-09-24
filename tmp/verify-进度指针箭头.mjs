// 校验：滚动进度指针（左缘读数 + 右侧轨道镜像指针）已改为正红箭头 + 2px 横线。
// 自启 server + headless Chrome，滚到 87% 处复现「8/7」竖排读数，
// 读伪元素计算样式，再按 8 倍放大分别截左缘与右轨。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const 项目根 = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
const CDP端口 = await 取空闲端口(9486);
const 站点端口 = await 取空闲端口(15986);
const 地址 = `http://127.0.0.1:${站点端口}/`;

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: 项目根,
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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-pointer-'))}`,
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

await 发送('Network.enable');
await 发送('Page.reload', { ignoreCache: true });
for (let i = 0; i < 600; i++) {
  const 就绪 = await 求值(`
    const { 状态 } = await import('./js/状态.js');
    return 状态.文件名 && 状态.行起点列表.length > 100;
  `);
  if (就绪) break;
  await pause(200);
}

const 样本 = await 求值(`
  const { 元素, 状态 } = await import('./js/状态.js');
  const { 更新滚动块位置, 更新滚动块文本 } = await import('./js/滚动条.js');
  元素.滚动容器.scrollTop = 元素.滚动容器.scrollHeight * 0.87;
  (await import('./js/虚拟渲染.js')).渲染可见行(true);
  const 块 = 更新滚动块位置();
  if (块) 更新滚动块文本(块);
  await new Promise((r) => setTimeout(r, 200));

  const 读 = (选择器) => {
    const el = document.querySelector(选择器);
    const r = el.getBoundingClientRect();
    const 前 = getComputedStyle(el, '::before');
    const 后 = getComputedStyle(el, '::after');
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      横线: { height: 前.height, background: 前.backgroundColor },
      箭头: {
        borderTop: 后.borderTopWidth,
        borderLeft: 后.borderLeftWidth,
        borderRight: 后.borderRightWidth,
        color: 后.borderTopColor,
        transform: 后.transform,
      },
    };
  };
  return {
    书名: 状态.文件名,
    读数: 元素.滚动百分比.textContent,
    数字色: getComputedStyle(元素.滚动进度).color,
    左: 读('#滚动进度'),
    右: 读('#进度指针'),
  };
`);
console.log(JSON.stringify(样本, null, 2));

const 放大 = 8;
async function 截图(name, x, y, w, h) {
  const 图 = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x, y, width: w, height: h, scale: 放大 },
  });
  writeFileSync(resolve(项目根, `tmp/${name}.png`), Buffer.from(图.data, 'base64'));
  console.log(`截图: tmp/${name}.png`);
}
await 截图('进度指针-左缘', 样本.左.rect.x - 4, 样本.左.rect.y - 6, 26, 样本.左.rect.h + 12);
await 截图(
  '进度指针-右轨',
  样本.右.rect.x - 24,
  样本.右.rect.y - 10,
  30,
  20,
);
收尾();
