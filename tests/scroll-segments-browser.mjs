import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// 滚动时间段浏览器回归：真实自动滚动 → 时间段记账 → 落盘 → 重载读回 → 统计弹窗渲染。
// 与 statistics-browser.mjs 同约定：复用已打开的阅读器标签，不启动/关闭浏览器。
const port = process.env.CDP_PORT;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(
  (t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:15921/'),
);
assert.ok(target, 'reader tab');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
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
    throw new Error(result.exceptionDetails.exception?.description);
  return result.result.value;
}
const 等待 = (毫秒) => new Promise((resolve) => setTimeout(resolve, 毫秒));
async function 等待正文载入() {
  for (let n = 0; n < 300; n += 1) {
    await 等待(100);
    if (await evaluate('return document.querySelector("#载入状态")?.hidden === true')) return;
    if (n === 299) throw new Error('reader loaded 超时');
  }
}

const 历史 = {
  '2026-09-17': [[39_804, 39_904, 0], [50_400, 51_000, 1]],
  '2026-09-18': [[3_600, 4_200, 0]],
};

function 格式化时刻(当日秒) {
  const 补零 = (值) => String(值).padStart(2, '0');
  return `${补零(Math.floor(当日秒 / 3600))}:${补零(Math.floor(当日秒 / 60) % 60)}:${补零(当日秒 % 60)}`;
}

try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.reload', { ignoreCache: true });
  await 等待正文载入();
  // 从空表开始，保证「一次滚动只记一段」的断言可重复执行
  await evaluate(`
    const m = await import('./js/滚动时段.js');
    const { 保存持久化状态 } = await import('./js/持久化.js');
    m.载入滚动时段统计({});
    保存持久化状态();
    return m.每日滚动时段.size;
  `);

  // 1) 滚一段真实时间：起止时刻精确到秒，落盘后可读
  const 起始 = await evaluate(`
    const 滚 = await import('./js/自动滚动.js');
    滚.开始自动滚动();
    const 刻 = new Date();
    return {
      进行中: 滚.自动滚动进行中(),
      当日秒: 刻.getHours() * 3600 + 刻.getMinutes() * 60 + 刻.getSeconds(),
    };
  `);
  assert.ok(起始.进行中, '自动滚动已启动');
  await 等待(6000);
  const 记录 = await evaluate(`
    const 滚 = await import('./js/自动滚动.js');
    const m = await import('./js/滚动时段.js');
    const { 保存持久化状态, } = await import('./js/持久化.js');
    滚.停止自动滚动('回归测试');
    保存持久化状态();
    const 今天 = new Date().toLocaleDateString('sv');
    return {
      今日: m.获取当日时段(今天),
      落盘: JSON.parse(localStorage.getItem('原文阅读器:阅读状态:v2')).自动滚动统计.每日时段?.[今天],
    };
  `);
  assert.equal(记录.今日.length, 1, '一次滚动只记一段');
  const [起, 止, 种类] = 记录.今日[0];
  assert.equal(种类, 0, '自动滚动种类');
  assert.ok(止 - 起 >= 5 && 止 - 起 <= 12, `段长应约 6 秒，实际 ${止 - 起} 秒`);
  assert.ok(Math.abs(起 - 起始.当日秒) <= 2, `起点即按下滚动的时刻（${起} / ${起始.当日秒}）`);
  assert.deepEqual(记录.落盘, 记录.今日.map((段) => [...段]), '时间段已随持久化落盘');

  // 2) 注入两天历史数据，走「内存 → 落盘 → 重载读回」验证读取路径与共用轴外扩
  await evaluate(`
    const m = await import('./js/滚动时段.js');
    const { 保存持久化状态 } = await import('./js/持久化.js');
    const 现存 = Object.fromEntries(m.每日滚动时段);
    m.载入滚动时段统计({ 自动滚动统计: { 每日时段: Object.assign(现存, ${JSON.stringify(历史)}) } });
    保存持久化状态();
    return true;
  `);
  await send('Page.reload', { ignoreCache: true });
  await 等待正文载入();
  const 读回 = await evaluate(`
    const m = await import('./js/滚动时段.js');
    return { 日期: [...m.每日滚动时段.keys()].sort(), 今日: m.获取当日时段(new Date().toLocaleDateString('sv')) };
  `);
  for (const 日期 of Object.keys(历史)) {
    assert.ok(读回.日期.includes(日期), `重载后读回 ${日期}`);
  }
  assert.ok(读回.今日.length >= 1, '今天的真实记录也在');

  // 3) 统计弹窗：一天一行、所有行共用一条轴、两类色块、刻度与首尾时刻
  await evaluate(`document.querySelector('#阅读统计按钮').click()`);
  assert.ok(await evaluate('return document.querySelector("#阅读统计弹窗").open'));
  const 渲染 = await evaluate(`
    const { 计算时段窗口, 格式化时段时刻 } = await import('./js/阅读统计.js');
    const m = await import('./js/滚动时段.js');
    const 表 = document.querySelector('.统计时段表');
    const 窗口 = 计算时段窗口(Object.fromEntries(m.每日滚动时段));
    const 轨道们 = [...表.querySelectorAll('.统计时段轨道')];
    const 行们 = [...表.querySelectorAll('tbody tr')];
    const 最早行 = 行们.find(
      (行) => 行.querySelector('.统计时段日期')?.title === '2026-09-18',
    ) || 行们[行们.length - 1];
    const 最早轨道 = 最早行.querySelector('.统计时段轨道');
    return {
      窗口,
      行数: 轨道们.length,
      日期列: [...表.querySelectorAll('.统计时段日期')].map((节点) => 节点.textContent),
      日期标题: [...表.querySelectorAll('.统计时段日期')].map((节点) => 节点.title),
      自动块: 表.querySelectorAll('.统计时段块-自动').length,
      按键块: 表.querySelectorAll('.统计时段块-按键').length,
      刻度标签: [...表.querySelectorAll('.统计时段刻度标签')].map((节点) => 节点.textContent),
      首尾: [...表.querySelectorAll('.统计时段端点')].map((节点) => 节点.textContent),
      汇总: [...表.querySelectorAll('.统计时段汇总')].map((节点) => 节点.textContent),
      轨道宽: [...new Set(轨道们.map((行) => Math.round(行.getBoundingClientRect().width)))],
      段几何: [...最早轨道.querySelectorAll('.统计时段块')].map((块) => {
        const 轨 = 最早轨道.getBoundingClientRect();
        const 段 = 块.getBoundingClientRect();
        return {
          左: +(((段.left - 轨.left) / 轨.width) * 100).toFixed(1),
          右: +(((段.right - 轨.left) / 轨.width) * 100).toFixed(1),
          标题: 块.title,
        };
      }),
    };
  `);
  assert.equal(渲染.行数, 读回.日期.length, '一天一行');
  assert.equal(渲染.日期列[0], '今天', '今天在最上');
  assert.deepEqual(渲染.日期标题, [...读回.日期].sort().reverse(), '按日期倒序，标题为完整日期');
  assert.ok(渲染.自动块 >= 3, `自动滚动色块数 ${渲染.自动块}`);
  assert.equal(渲染.按键块, 1, '按键滚动色块单独一种');
  assert.equal(渲染.轨道宽.length, 1, '所有行共用同一条轴（轨道等宽）');
  assert.deepEqual(渲染.首尾, [
    格式化时刻(渲染.窗口.起秒).slice(0, 5),
    格式化时刻(渲染.窗口.止秒).slice(0, 5),
  ], '轴首尾标到分');
  // 共用轴 = 全部数据的最早起点 ~ 最晚终点：1:00 起，止于注入的 14:10 与今天这段的较晚者
  const 今日最晚 = Math.max(...读回.今日.map((段) => 段[1]));
  assert.deepEqual([渲染.窗口.起秒, 渲染.窗口.止秒], [3_600, Math.max(51_000, 今日最晚)]);
  assert.ok(渲染.刻度标签.length >= 1 && 渲染.刻度标签.length <= 6, `整点刻度 ${渲染.刻度标签}`);
  assert.match(
    渲染.段几何[0].标题,
    /^\d\d:\d\d:\d\d → \d\d:\d\d:\d\d · .+ · (自动滚动|按键滚动)$/,
  );
  assert.equal(渲染.段几何[0].左, 0, '轴起点即最早一段的起点');
  assert.match(
    渲染.汇总[0],
    /^\d+ 段 · (\d+ 小时 \d+ 分|\d+ 分 \d+ 秒|\d+ 秒)$/,
  );
  assert.equal(渲染.汇总[1], '1 段 · 10 分 0 秒', '注入的 1:00–1:10 一段');

  // 4) 窄屏不横向溢出
  for (const 宽度 of [885, 375]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 宽度,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.equal(
      await evaluate(`
        const d = document.querySelector('#阅读统计弹窗');
        const r = d.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && d.scrollWidth <= d.clientWidth;
      `),
      true,
      `${宽度}px 无横向溢出`,
    );
    assert.equal(
      await evaluate(`
        const 标签们 = [...document.querySelectorAll('.统计时段刻度标签')];
        return 标签们.filter((节点) => getComputedStyle(节点).display !== 'none').length;
      `),
      宽度 === 375 ? 0 : 渲染.刻度标签.length,
      `${宽度}px 刻度标签密度`,
    );
    if (process.env.SCREENSHOT_DIR) {
      await evaluate(
        'document.querySelector(".统计时段").scrollIntoView({ block: "end" }); return true;',
      );
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(
        `${process.env.SCREENSHOT_DIR}/reader-scroll-segments-${宽度}.png`,
        Buffer.from(data, 'base64'),
      );
    }
  }
  console.log(
    'PASS scroll segments: second-precision recording, persistence round-trip, one row per day on a shared axis',
  );
} finally {
  // 清掉注入的历史数据，只保留今天的真实记录
  await evaluate(`
    const m = await import('./js/滚动时段.js');
    const { 保存持久化状态 } = await import('./js/持久化.js');
    const 今天 = new Date().toLocaleDateString('sv');
    const 原 = JSON.parse(localStorage.getItem('原文阅读器:阅读状态:v2') || '{}');
    const 今日 = 原.自动滚动统计?.每日时段?.[今天];
    m.载入滚动时段统计({ 自动滚动统计: { 每日时段: 今日 ? { [今天]: 今日 } : {} } });
    保存持久化状态();
    return true;
  `);
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Page.reload', { ignoreCache: true });
  ws.close();
}
