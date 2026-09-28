// 统计弹窗浏览器回归：真实页面入口 → 可见时段记账 → 落盘 → 弹窗渲染。
// 时长不再另记一本毫秒账，「激活/滚动/总计」都是从 js/可见时段.js 与 js/滚动时段.js
// 里的按书起止时刻求和得来的，所以这里量的是段账，而不是某个计数器。
// 与 statistics.test.mjs 分工：纯函数与恒等式在单测里，浏览器只管真实入口与版式。
// 跑法：node tmp/跑-浏览器回归.mjs tests/statistics-browser.mjs
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

await 发送('Page.enable');

// —— 1) 可见时段就是「前台停留」这本账：开着页面就长，切走就停 ——
const 读数 = `
  const { 本书可见当日总秒 } = await import('./js/可见时段.js');
  const { 状态, 本地日期串 } = await import('./js/状态.js');
  return 本书可见当日总秒(状态.文件名, 本地日期串(new Date()));`;
const 前 = await evaluate(读数);
await wait(1100);
assert.ok((await evaluate(读数)) - 前 >= 1, '手动阅读也在计可见时长（不要求滚动）');

await evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));`);
const 隐藏时 = await evaluate(读数);
await wait(1100);
assert.equal(await evaluate(读数), 隐藏时, '切走标签页不再计时');
await evaluate(`delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'));`);
await wait(1100);
assert.ok((await evaluate(读数)) >= 隐藏时 + 1, '切回来重新起一段');

// —— 2) 落盘形状：可见段按书挂在 前台停留统计.每日可见时段 下 ——
const 落盘 = await evaluate(`
  const { 持久化键 } = await import('./js/常量.js');
  const { 保存持久化状态 } = await import('./js/持久化.js');
  const { 状态 } = await import('./js/状态.js');
  保存持久化状态();
  const 数据 = JSON.parse(localStorage.getItem(持久化键));
  const 今天 = (() => { const d = new Date(); const p = (v) => String(v).padStart(2, '0');
    return \`\${d.getFullYear()}-\${p(d.getMonth() + 1)}-\${p(d.getDate())}\`; })();
  return {
    书名: 状态.文件名, 今天,
    可见: 数据.前台停留统计.每日可见时段?.[今天]?.[状态.文件名]?.length ?? 0,
    旧键: 数据.前台停留统计.每日激活时段,
    旧毫秒: Object.keys(数据.前台停留统计.每日书籍毫秒 ?? {}).length,
    滚动键: 数据.自动滚动统计.每日时段 ? Object.keys(数据.自动滚动统计.每日时段).length : 0,
  };`);
assert.ok(落盘.可见 >= 1, `今天的可见段按书落盘：${JSON.stringify(落盘)}`);
assert.equal(落盘.旧键, undefined, '不再写旧键名 每日激活时段');
assert.ok(落盘.滚动键 >= 0);

// —— 3) 真实入口：点按钮开弹窗，两张表都是滚动 / 激活 / 总计三笔账 ——
await evaluate('document.querySelector("#阅读统计按钮").click()');
assert.ok(await evaluate('return document.querySelector("#阅读统计弹窗").open'));
const 版式 = await evaluate(`
  const 表 = document.querySelector('.统计时段表');
  if (!表) throw new Error('弹窗里没有 .统计时段表（渲染没跑起来）');
  return {
    行数: 表.querySelectorAll('.统计时段行').length,
    日期: [...表.querySelectorAll('.统计时段日期')].map((格) => 格.textContent),
    列头: [...表.querySelectorAll('.统计时段表头名')].map((项) => 项.textContent),
    上表列头: [...document.querySelectorAll('.阅读统计内容 table:not(.统计时段表) thead tr:first-child th')].map((项) => 项.textContent),
    底色: (() => { const s = getComputedStyle(document.querySelector('#阅读统计弹窗'));
      return [s.backgroundColor, s.color]; })(),
  };`);
assert.deepEqual(版式.列头, ['日期', '滚动', '激活', '总计'], '下表一天一行，第一列是日期');
assert.deepEqual(版式.上表列头, ['书籍', '滚动', '激活', '总计', '进度'], '上表同样的三笔账');
assert.ok(版式.行数 === 版式.日期.length && 版式.日期.length >= 1, `一天一行：${JSON.stringify(版式)}`);
assert.equal(
  new Set(版式.日期).size,
  版式.日期.length,
  `日期不许重复（当天全部书籍要并到同一条轴）：${版式.日期.join('、')}`,
);
assert.deepEqual(版式.底色, ['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
await evaluate('document.querySelector("#阅读统计弹窗").close()');

// —— 4) 无脚本的特殊字符书名必须保持纯文本，不创建标签 ——
await evaluate(`
  const { 创建阅读统计内容, 汇总书籍时间账 } = await import('./js/阅读统计.js');
  const 长名 = '很长的书名'.repeat(16) + '<b>特别版</b>.txt';
  const 秒 = (h, m) => h * 3600 + m * 60;
  const 时间账 = 汇总书籍时间账({
    滚动账: { '2026-09-17': { '当前书.txt': [[秒(9, 0), 秒(9, 30)]] } },
    可见账: { '2026-09-17': { '当前书.txt': [[秒(8, 50), 秒(10, 0)]], [长名]: [[秒(11, 0), 秒(11, 20)]] } },
    旧书总毫秒: { [长名]: 2_700_000 },
    旧书总可见毫秒: { '当前书.txt': 11_820_000 },
  });
  document.querySelector('#阅读统计内容').replaceChildren(创建阅读统计内容({
    文件名: '当前书.txt', 进度: 2.9, 今天: '2026-09-17',
    书籍: [['当前书.txt', {}], [长名, { 阅读偏移: 50, 文本长度: 100 }]],
    时间账,
  }));`);
assert.equal(
  await evaluate('return document.querySelectorAll("#阅读统计内容 b").length'),
  0,
  '书名里的 <b> 不许被当标签',
);
const 文本 = await evaluate(`
  const 行 = [...document.querySelectorAll('.阅读统计内容 table:not(.统计时段表) tbody tr')];
  return 行.map((项) => [...项.querySelectorAll('td')].map((格) => 格.textContent));`);
assert.equal(文本[0][0], '当前当前书.txt', '当前这本书在最前（总计更大也在其后，此处按账排）');
assert.match(文本[0][3], /3 小时 17 分钟/, '旧累计毫秒账回落进来：总计 11820 秒（有段的日子只用段）');
assert.ok(
  (await evaluate('return document.querySelector("#阅读统计内容").textContent')).includes('约 50.0%'),
);

console.log('✓ 统计弹窗：可见时长按书落盘、两张表三笔账、特殊字符书名安全');

// 收尾交给启动器（它负责杀 Chrome 与删 profile），
// 但用例自己必须把 WebSocket 关掉，否则 node 进程挂着不退，启动器会一直等。
ws.close();
