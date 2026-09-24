// 校验：滚动「时长账」改为按起止时间戳入账后，与轴上的「时段账」同源。
// 三条旧口径丢时间的路径逐个测：掉帧不吞（同一时间戳）、按键滚动入账、切走再回来两段都重开。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

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
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(地址, { signal: AbortSignal.timeout(1000) })).ok) break;
  } catch {}
  await pause(100);
}
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-duration-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
    地址,
  ],
  { stdio: 'ignore' },
);
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
if (!(await 求值(`return !!document.querySelector('#内容选择按钮');`)))
  throw new Error('阅读器没有启动（页面停在空白/载入态）');
// 内容列表是虚拟滚动的，目标书不一定在初始窗口里；点第一本可用的正文书即可，
// 本测只验时长账与时段账同源，和是哪本书无关。
await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
let 载入书名 = '';
for (let i = 0; i < 150 && !载入书名; i++) {
  载入书名 = await 求值(`
    const 按钮 = [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
      .find((b) => !b.dataset.fileName.startsWith('.'));
    if (!按钮) return '';
    按钮.click();
    return 按钮.dataset.fileName;
  `);
  await pause(200);
}
assert.ok(载入书名, '内容选择列表没有出现可点的书');
console.log('载入 →', 载入书名);
for (let i = 0; i < 600; i++) {
  const 好 = await 求值(`
    const { 状态 } = await import('./js/状态.js');
    return 状态.文件名 === ${JSON.stringify(载入书名)} && 状态.行起点列表.length > 100;
  `);
  if (好) break;
  await pause(200);
}

// 一次测量的读数：本书今日时长账（含未入账缓冲）与轴上今日时段账
const 读数 = () => 求值(`
  const { 状态, 统计 } = await import('./js/状态.js');
  const { 获取当日时段 } = await import('./js/滚动时段.js');
  const 今日 = 统计.今日滚动日期;
  const 段 = 获取当日时段(今日);
  return {
    今日,
    时长毫秒: (统计.今日书籍滚动毫秒.get(状态.文件名) ?? 0) + 统计.未入账滚动毫秒,
    时段秒: 段.reduce((总, [起, 止]) => 总 + 止 - 起, 0),
    段数: 段.length,
  };
`);
const 起测 = async () => {
  await 求值(`
    const { 统计 } = await import('./js/状态.js');
    统计.今日书籍滚动毫秒.clear();
    统计.今日滚动毫秒 = 0;
    统计.未入账滚动毫秒 = 0;
    (await import('./js/滚动时段.js')).载入滚动时段统计({});
    return 1;
  `);
  // 上一段测到了文末，不回到顶部下一次「开始滚动」会直接拒绝启动
  await 求值(`
    const { 元素 } = await import('./js/状态.js');
    元素.滚动容器.scrollTop = 0;
    return 1;
  `);
  await pause(400);
};

// —— 1. 自动滚动一段：时长与时段应同源于同一对起止时刻 ——
await 起测();
await 求值(`(await import('./js/自动滚动.js')).开始自动滚动(); return 1;`);
await pause(4000);
await 求值(`(await import('./js/自动滚动.js')).停止自动滚动('verify'); return 1;`);
const 自动 = await 读数();
console.log('自动滚动 4 秒 →', 自动);
assert.ok(自动.时长毫秒 > 3000, `自动滚动时长应接近 4 秒，实测 ${自动.时长毫秒}ms`);
assert.ok(
  Math.abs(自动.时长毫秒 / 1000 - 自动.时段秒) <= 1.5,
  `时长 ${自动.时长毫秒}ms 与轴上时段 ${自动.时段秒}s 应同源，差值超容差`,
);

// —— 2. 按住方向键：旧口径一分钟都不记，现在必须入账 ——
await 起测();
await 求值(`(await import('./js/自动滚动.js')).开始按键滚动('ArrowDown', 1); return 1;`);
await pause(3000);
await 求值(`(await import('./js/自动滚动.js')).停止按键滚动('verify'); return 1;`);
const 按键 = await 读数();
console.log('按键滚动 3 秒 →', 按键);
assert.ok(按键.时长毫秒 > 2000, `按键滚动应入时长账，实测 ${按键.时长毫秒}ms`);
assert.ok(
  Math.abs(按键.时长毫秒 / 1000 - 按键.时段秒) <= 1.5,
  `按键滚动 ${按键.时长毫秒}ms 与轴上时段 ${按键.时段秒}s 应同源`,
);

// —— 3. 滚动中切走再回来：两条账一起封口、一起重开，隐藏期间都不虚增 ——
await 起测();
await 求值(`(await import('./js/自动滚动.js')).开始自动滚动(); return 1;`);
await pause(2000);
const 切走前 = await 读数();
await 求值(`
  Object.defineProperty(document, 'visibilityState', {
    configurable: true, get: () => 'hidden',
  });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
  return 1;
`);
await pause(2500);
const 隐藏中 = await 读数();
await 求值(`
  Object.defineProperty(document, 'visibilityState', {
    configurable: true, get: () => 'visible',
  });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  document.dispatchEvent(new Event('visibilitychange'));
  return 1;
`);
await pause(2000);
await 求值(`(await import('./js/自动滚动.js')).停止自动滚动('verify'); return 1;`);
const 回来后 = await 读数();
console.log('切走/回来 →', { 切走前, 隐藏中, 回来后 });
assert.ok(
  隐藏中.时长毫秒 - 切走前.时长毫秒 < 300,
  `隐藏期间时长账不该虚增，实测多了 ${隐藏中.时长毫秒 - 切走前.时长毫秒}ms`,
);
// 隐藏那一刻两条账一起封口：轴上落第一段，时长账停在封口时刻
assert.ok(隐藏中.段数 === 1, `隐藏前应先封一段，实测 ${隐藏中.段数} 段`);
assert.ok(隐藏中.时段秒 >= 2 && 隐藏中.时段秒 <= 3, `第一段应约 2 秒，实测 ${隐藏中.时段秒}s`);
// 回来后再滚：时长继续走，轴上也接着长——两本账一起重开，缺一即漂移
assert.ok(
  回来后.时长毫秒 - 隐藏中.时长毫秒 > 1000,
  `回来后时长要继续走，实测只涨 ${回来后.时长毫秒 - 隐藏中.时长毫秒}ms`,
);
assert.ok(
  回来后.时段秒 > 隐藏中.时段秒,
  `回来后轴上时段要接着长，实测 ${隐藏中.时段秒}s → ${回来后.时段秒}s`,
);
// 间隙只有 2.5 秒，落在 60 秒合并门槛内 → 轴上并成一段，把隐藏那段空闲也算进总秒数。
// 这就是下表比上表大的那部分差额，界面上写进了「滚动」列头的悬停。
const 缝隙 = 回来后.时段秒 - 回来后.时长毫秒 / 1000;
assert.ok(
  缝隙 >= 0 && 缝隙 <= 60,
  `合并缝隙应落在 60 秒门槛内，实测 ${缝隙.toFixed(1)}s`,
);
console.log('60 秒合并吃掉的空闲 →', `${缝隙.toFixed(1)}s（隐藏 2.5 秒 + 封口取整）`);

// —— 4. 弹窗列名与口径悬停 ——
const 表头 = await 求值(`
  (await import('./js/持久化.js')).保存持久化状态();
  const { 状态, 统计 } = await import('./js/状态.js');
  const { 创建阅读统计内容 } = await import('./js/阅读统计.js');
  const 容器 = document.createElement('div');
  容器.append(创建阅读统计内容({
    每日前台: { [状态.文件名]: [[统计.今日滚动日期, 60000]] },
    书籍: [[状态.文件名, { 总滚动毫秒: 60000, 总前台毫秒: 60000 }]],
    文件名: 状态.文件名, 进度: 1,
    每日: { [状态.文件名]: [[统计.今日滚动日期, 60000]] },
    每日时段: {}, 每日激活时段: {}, 今天: 统计.今日滚动日期,
  }));
  return [...容器.querySelectorAll('th')].map((th) => [
    th.textContent, th.title || '',
  ]);
`);
const 每日表头 = 表头.filter(([名]) => ['滚动', '前台停留', '日期'].includes(名));
console.log('表头 →', 每日表头);
assert.ok(
  !表头.some(([名]) => 名 === '自动滚动'),
  '统计弹窗不应再出现「自动滚动」列名',
);
assert.ok(
  每日表头.filter(([名]) => 名 === '滚动').every(([, 提示]) => 提示.length > 4),
  '「滚动」列头要带口径悬停',
);

收尾();
