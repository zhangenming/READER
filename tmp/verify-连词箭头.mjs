// 校验：内置连词首字与次字之间的红色装饰已变成「细杆 + 右端箭头」。
// 自启 server + headless Chrome，滚到一枚连词首字，按 8 倍放大截图，
// 再用 PIL 逐列量红像素的竖向跨度（杆窄、箭头宽，且右端收尖）。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
const CDP端口 = await 取空闲端口(9481);
const 站点端口 = await 取空闲端口(15981);
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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-arrow-'))}`,
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
    const { 状态 } = await import('./js/状态.js');
    return 状态.文件名 && 状态.行起点列表.length > 100;
  `);
  if (就绪) break;
  await pause(200);
}

// 逐屏下滚，直到可见区里出现一枚未命中的连词首字
const 样本 = await (async () => {
  for (let 步 = 0; 步 < 60; 步++) {
    const 找到 = await 求值(`
      const { 元素, 状态 } = await import('./js/状态.js');
      const 行高 = document.querySelector('.正文行')?.getBoundingClientRect().height || 30;
      元素.滚动容器.scrollTop = ${步} * 行高 * 12;
      (await import('./js/虚拟渲染.js')).渲染可见行(true);
      await new Promise((r) => setTimeout(r, 120));
      const 候选 = [...document.querySelectorAll('.字.关系词首字:not(.命中)')].filter(
        (z) => {
          const r = z.getBoundingClientRect();
          return r.top > 40 && r.bottom < innerHeight - 40 && z.nextElementSibling;
        },
      );
      if (!候选.length) return null;
      const z = 候选[0];
      const r = z.getBoundingClientRect();
      const 计算 = getComputedStyle(z, '::after');
      return {
        书名: 状态.文件名,
        首字: z.textContent,
        次字: z.nextElementSibling.textContent,
        类别: z.className,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        条: {
          width: 计算.width,
          height: 计算.height,
          clipPath: 计算.clipPath,
          background: 计算.backgroundColor,
        },
      };
    `);
    if (找到) return 找到;
  }
  return null;
})();
if (!样本) throw new Error('可见区里找不到连词首字样本');
console.log(
  '样本:',
  样本.书名,
  `${样本.首字}${样本.次字}`,
  JSON.stringify(样本.条),
);

const 放大 = Number(process.env.ARROW_SCALE) || 8;
const 截图 = await 发送('Page.captureScreenshot', {
  format: 'png',
  clip: {
    x: 样本.rect.x - 6 * (放大 === 1 ? 12 : 1),
    y: 样本.rect.y - 样本.rect.h * (放大 === 1 ? 3 : 0.6),
    width: 样本.rect.w * (放大 === 1 ? 24 : 2) + 12,
    height: 样本.rect.h * (放大 === 1 ? 7 : 2.2),
    scale: 放大,
  },
});
writeFileSync(
  resolve(
    import.meta.dirname,
    放大 === 1 ? '连词箭头-1x.png' : '连词箭头-放大.png',
  ),
  Buffer.from(截图.data, 'base64'),
);
console.log(`截图: tmp/${放大 === 1 ? '连词箭头-1x' : '连词箭头-放大'}.png`);
收尾();
