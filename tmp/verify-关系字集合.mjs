// 校验：关系字判定走 js/常量.js 的 关系字集合，渲染出来的 关系字特殊 类与它逐字一致
// （导出名/类名断链会让整页模块加载失败或这里当场报不符），并回归「定」不吃该样式。
// 自启 server + headless Chrome：全书取 6 屏逐字比对类与集合，再滚到样本字读回 class 与计算样式。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
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
const CDP端口 = await 取空闲端口(9493);
const 站点端口 = await 取空闲端口(15993);
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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-ding-'))}`,
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

const 报告 = await 求值(`
  const { 元素, 状态 } = await import('./js/状态.js');
  const 渲染 = await import('./js/虚拟渲染.js');
  const { 关系字集合 } = await import('./js/常量.js');
  const 定位 = (字) => {
    const 偏移 = 状态.文本.indexOf(字);
    if (偏移 < 0) return null;
    let 行 = 0;
    while (行 + 1 < 状态.行起点列表.length && 状态.行起点列表[行 + 1] <= 偏移) 行++;
    return { 偏移, 行 };
  };
  const 滚到行 = async (行) => {
    元素.滚动容器.scrollTop = 行 * 状态.行高;
    渲染.渲染可见行(true);
    await new Promise((r) => setTimeout(r, 150));
  };
  const 取样 = async (字) => {
    const 位置 = 定位(字);
    if (!位置) return { 字, 缺失: true };
    await 滚到行(位置.行);
    const z = document.querySelector('.字[data-start="' + 位置.偏移 + '"]');
    if (!z) return { 字, 缺失: true };
    const 计算 = getComputedStyle(z);
    return {
      字,
      类: z.className,
      有标记子层: !!z.querySelector('.关系字标记'),
      字重: 计算.fontWeight,
      字色: 计算.color,
    };
  };
  // 不变式：每个可见单字的 关系字特殊 类，必须与 js/常量.js 的 关系字集合 判定一致。
  // 不复制字面量，所以字表怎么改都不会让本脚本失真；断链（导出名改了、类没跟着改）当场暴露。
  const 类集合不符 = [];
  let 扫描字数 = 0;
  const 全书行数 = 状态.行起点列表.length;
  for (let 屏 = 0; 屏 < 6; 屏++) {
    await 滚到行(Math.floor((全书行数 / 6) * 屏));
    for (const z of document.querySelectorAll('.字')) {
      const 字 = z.textContent;
      if ([...字].length !== 1) continue;
      扫描字数++;
      const 应在 = 关系字集合.has(字);
      const 现有 = z.classList.contains('关系字特殊');
      if (应在 !== 现有 && 类集合不符.length < 20)
        类集合不符.push(字 + (应在 ? '应带' : '不应带'));
    }
  }
  return {
    书名: 状态.文件名,
    集合大小: 关系字集合.size,
    扫描字数,
    类集合不符,
    定: await 取样('定'),
    将: await 取样('将'),
    再: await 取样('再'),
    屏幕内定残留: [...document.querySelectorAll('.字.关系字特殊')]
      .filter((z) => z.textContent === '定').length,
  };
`);
console.log(JSON.stringify(报告, null, 2));

const 失败 = [];
if (!报告.书名) 失败.push('正文没载入（模块图断了？）');
if (报告.类集合不符.length)
  失败.push(`类与集合不一致: ${报告.类集合不符.join('、')}`);
if (报告.扫描字数 < 200) 失败.push(`只扫到 ${报告.扫描字数} 个字，样本太少`);
if (报告.定?.缺失) 失败.push('正文里找不到「定」样本');
else if (报告.定.类.includes('关系字特殊')) 失败.push('「定」仍带关系字特殊类');
if (报告.将?.缺失) 失败.push('正文里找不到「将」样本');
else if (!报告.将.类.includes('关系字特殊'))
  失败.push('「将」的关系字特殊类被误删');
if (报告.再?.缺失) 失败.push('正文里找不到「再」样本');
else if (!报告.再.类.includes('关系字特殊'))
  失败.push('「再」的关系字特殊类被误删');

if (失败.length) 收尾(new Error(失败.join('；')));
console.log(
  `OK: 模块图正常，${报告.扫描字数} 个可见字的 关系字特殊 类与 关系字集合（${报告.集合大小} 字）判定完全一致`,
);
收尾();
