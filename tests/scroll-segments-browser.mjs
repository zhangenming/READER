// 时段账浏览器回归：真实自动滚动 → 按书记段 → 落盘 → 重载读回 → 弹窗渲染。
// 滚动段与可见段都由同一个入口开关（js/自动滚动.js 的 开启/关闭滚动会话、
// js/前台停留.js 的 更新前台停留计时），所以这里量的起止就是三笔账的唯一来源。
// 跑法：node tmp/跑-浏览器回归.mjs tests/scroll-segments-browser.mjs
import assert from 'node:assert/strict';

const 站点 = 'http://127.0.0.1:15921';
const 目标列表 = await (
  await fetch(`http://127.0.0.1:${process.env.CDP_PORT}/json`)
).json();
const 目标 = 目标列表.find((t) => t.type === 'page' && t.url.startsWith(站点));
assert.ok(目标, 'reader tab');
const ws = new WebSocket(目标.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let 序号 = 0;
const 待回复 = new Map();
ws.addEventListener('message', (事件) => {
  const 消息 = JSON.parse(事件.data);
  const 请求 = 待回复.get(消息.id);
  if (!请求) return;
  待回复.delete(消息.id);
  消息.error
    ? 请求.reject(new Error(JSON.stringify(消息.error)))
    : 请求.resolve(消息.result);
});
const 发送 = (方法, 参数 = {}) =>
  new Promise((解决, 拒绝) => {
    const 下标 = ++序号;
    const 计时器 = setTimeout(() => {
      待回复.delete(下标);
      拒绝(new Error(`CDP 超时: ${方法}`));
    }, 30_000);
    待回复.set(下标, {
      resolve: (v) => (clearTimeout(计时器), 解决(v)),
      reject: (e) => (clearTimeout(计时器), 拒绝(e)),
    });
    ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
  });
async function evaluate(代码) {
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
const wait = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));
// 本地当日秒：Date.now() 取模会把时区差算进去，这里显式按本地日历秒还原
const 当日秒 = `(() => { const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); })()`;

await 发送('Page.enable');

// 从空表开始，保证「一次滚动只记一段」的断言可重复执行；
// 清空会把开机那段进行中的可见会话一起抹掉，所以立刻用真实入口重新开一段。
await evaluate(`
  const m = await import('./js/滚动时段.js');
  const a = await import('./js/可见时段.js');
  const f = await import('./js/前台停留.js');
  // 账本清空也要把 前台停留 自己那层会话一起抹掉，否则 更新前台停留计时  sees
  // 「还是同一本书」就不重开会话，时段账上就一段都没有（不是产品行为，是测试起手式）。
  m.载入滚动时段统计({});
  a.载入可见时段统计({});
  f.载入前台停留统计({});
  f.更新前台停留计时();
  return m.每日滚动时段.size + a.每日可见时段.size;`);

// —— 1) 滚一段真实时间：起止精确到秒、只记一段、按书 ——
const 起点 = await evaluate(`
  const { 状态 } = await import('./js/状态.js');
  const { 开始自动滚动 } = await import('./js/自动滚动.js');
  开始自动滚动();
  return { 当日秒: ${当日秒}, 书名: 状态.文件名 };`);
await wait(6000);
const 记录 = await evaluate(`
  const { 停止自动滚动 } = await import('./js/自动滚动.js');
  停止自动滚动('回归收尾');
  const m = await import('./js/滚动时段.js');
  const a = await import('./js/可见时段.js');
  const { 状态, 本地日期串 } = await import('./js/状态.js');
  const { 保存持久化状态 } = await import('./js/持久化.js');
  const { 持久化键 } = await import('./js/常量.js');
  保存持久化状态();
  const 今天 = 本地日期串(new Date());
  const 落盘 = JSON.parse(localStorage.getItem(持久化键));
  return {
    书名: 状态.文件名,
    今日: m.获取当日按书滚动时段(今天, 状态.文件名),
    落盘: 落盘.自动滚动统计.每日时段?.[今天]?.[状态.文件名],
    今日可见: a.获取当日按书可见时段(今天, 状态.文件名),
    可见快照: a.可见时段统计快照(Date.now()).每日时段?.[今天]?.[状态.文件名] ?? [],
    落盘可见: 落盘.前台停留统计.每日可见时段?.[今天]?.[状态.文件名],
    当日秒: ${当日秒},
  };`);
assert.equal(记录.今日.length, 1, '一次滚动只记一段');
assert.deepEqual(记录.今日[0].map(() => 0), [0, 0], '一段只有起止两列，不记触发方式');
const [起, 止] = 记录.今日[0];
assert.ok(止 - 起 >= 5 && 止 - 起 <= 12, `段长应约 6 秒，实际 ${止 - 起} 秒`);
assert.ok(Math.abs(起 - 起点.当日秒) <= 2, `起点即按下滚动的时刻（${起} / ${起点.当日秒}）`);
assert.ok(Math.abs(止 - 记录.当日秒) <= 2, `止点即松开的时刻（${止} / ${记录.当日秒}）`);
assert.deepEqual(记录.落盘, 记录.今日.map((段) => [...段]), '滚动段已按书随持久化落盘');
assert.ok(记录.可见快照.length >= 1, '这段滚动同时有可见段垫着（还没封口，走快照）');
// 可见会话此刻还没封口（页面一直开着），账本 Map 里自然没有它；
// 落盘走的是带进行中段的快照，所以拿快照与落盘对比，只允许尾差 2 秒（两次取时刻不同）。
assert.equal(记录.今日可见.length, 0, '未封口的可见段不进账本 Map');
assert.equal(记录.落盘可见.length, 记录.可见快照.length, '可见段落在 前台停留统计.每日可见时段 下');
assert.ok(
  记录.落盘可见.every((段, idx) => Math.abs(段[0] - 记录.可见快照[idx][0]) <= 2 &&
    Math.abs(段[1] - 记录.可见快照[idx][1]) <= 2),
  `落盘的可见段与快照同一段（尾差 2 秒内）：${JSON.stringify(记录.落盘可见)} vs ${JSON.stringify(记录.可见快照)}`,
);

// —— 2) 旧形状（整天不分书的数组）读回来挂在未分书键下，不迁移不丢段 ——
const 读回 = await evaluate(`
  const m = await import('./js/滚动时段.js');
  const { 本地日期串 } = await import('./js/状态.js');
  const 今天 = 本地日期串(new Date());
  m.载入滚动时段统计({ 自动滚动统计: { 每日时段: {
    '2026-09-16': [[7200, 7300, 1]],
    '2026-09-15': { '旧书.txt': [[3600, 3700]] },
  } } });
  const { 未分书键 } = m;
  return {
    旧形状: m.获取当日按书滚动时段('2026-09-16', 未分书键),
    新形状: m.获取当日按书滚动时段('2026-09-15', '旧书.txt'),
    今天被清空: !m.每日滚动时段.has(今天),
  };`);
assert.deepEqual(读回.旧形状, [[7200, 7300]], '旧版带「种类」的段照常读回，多余一位丢掉');
assert.deepEqual(读回.新形状, [[3600, 3700]], '按书形状原样读回');
assert.ok(读回.今天被清空, '载入以持久化数据为准');

// —— 3) 进行中那一段也要上轴，且段尾就是打开弹窗的此刻 ——
// 打开前先空转 12 秒：这段时间只存在于未封口的可见段里。轴若只画已封口的段，
// 段尾就会停在 12 秒之前，下面的断言当场失败（2026-09-26 那回「33 分 vs 17 分」）。
await wait(12_000);
const 打开前 = await evaluate(`
  const a = await import('./js/可见时段.js');
  return { 进行中: a.获取进行中可见时段()?.起点 ?? null, 当日秒: ${当日秒} };`);
assert.ok(打开前.进行中, '可见会话还在进行中（没封口）');
await evaluate('document.querySelector("#阅读统计按钮").click()');
assert.ok(await evaluate('return document.querySelector("#阅读统计弹窗").open'));
const 渲染 = await evaluate(`
  const { 汇总书籍时间账, 计算时段布局 } = await import('./js/阅读统计.js');
  const { 快照时间账 } = await import('./js/统计展示.js');
  const { 状态, 本地日期串 } = await import('./js/状态.js');
  const 此刻 = Date.now();
  const 账 = 汇总书籍时间账(快照时间账(此刻));
  const 今天 = 本地日期串(new Date());
  const 行 = 账.按日.get(今天)?.get(状态.文件名);
  return {
    组数: document.querySelectorAll('.统计时段组标题').length,
    行数: document.querySelectorAll('.统计时段行').length,
    今天有无行: 账.按日.has(今天),
    带尾: 行 ? Math.max(...行.总计段.map((段) => 段[1])) : null,
    此刻当日秒: (() => { const d = new Date(此刻);
      return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); })(),
    恒等式不成立的行: [...账.按日.values()].flatMap((表) =>
      [...表.values()].filter((项) => 项.激活秒 + 项.滚动秒 !== 项.总计秒)),
    书级不成立: [...账.按书.values()].filter((项) => 项.激活秒 + 项.滚动秒 !== 项.总计秒),
  };`);
assert.ok(渲染.今天有无行, '今天这一组里有当前这本书的行');
assert.ok(
  Math.abs(渲染.带尾 - 渲染.此刻当日秒) <= 3,
  `进行中段要算到打开弹窗的此刻：带尾 ${渲染.带尾}，此刻 ${渲染.此刻当日秒}`,
);
assert.deepEqual(渲染.恒等式不成立的行, [], '每天每本书都要满足 激活 + 滚动 = 总计');
assert.deepEqual(渲染.书级不成立, [], '按书累计同样相加对账');
assert.ok(渲染.组数 >= 1 && 渲染.行数 >= 渲染.组数, `分组渲染 ${JSON.stringify(渲染)}`);

console.log(
  '✓ 时段账：一次滚动只记一段并按书落盘、旧形状照读、进行中段上轴到此刻、三笔账对账',
  JSON.stringify({ 段: 记录.今日, 组数: 渲染.组数, 行数: 渲染.行数 }),
);

// 收尾交给启动器（它负责杀 Chrome 与删 profile），
// 但用例自己必须把 WebSocket 关掉，否则 node 进程挂着不退，启动器会一直等。
ws.close();
