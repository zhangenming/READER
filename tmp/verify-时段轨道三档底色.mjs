// 一次性验证：时段轴改成「一天一组、组内按书一行」+ 三档底色与三列对账。
// 三笔账由同一段区间切出来：总计带（可见 ∪ 滚动）铺在底下，滚动块（深色芯）压在上面，
// 露出来的灰＝激活（可见 − 滚动，不含滚动）。黑块自己再垫一层灰底，
// 于是「只有滚动、没有可见段」的老数据也不许踩白轨。
// 跑法：node tmp/跑-浏览器回归.mjs tmp/verify-时段轨道三档底色.mjs
// 产出 tmp/时段轨道三档-截图.png（给人看）+ 下面的断言（给机器量）。
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const port = process.env.CDP_PORT;
const 站点 = 'http://127.0.0.1:15921';
const 目标列表 = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const 目标 = 目标列表.find((t) => t.type === 'page' && t.url.startsWith(站点));
const ws = new WebSocket(目标.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let 序号 = 0;
const 待回复 = new Map();
ws.addEventListener('message', (事件) => {
  const 消息 = JSON.parse(事件.data);
  const 请求 = 待回复.get(消息.id);
  if (!请求) return;
  待回复.delete(消息.id);
  消息.error ? 请求.reject(new Error(JSON.stringify(消息.error))) : 请求.resolve(消息.result);
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
async function 求值(代码) {
  const 结果 = await 发送('Runtime.evaluate', {
    expression: `(async () => { ${代码} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (结果.exceptionDetails)
    throw new Error(
      结果.exceptionDetails.exception?.description || JSON.stringify(结果.exceptionDetails),
    );
  return 结果.result.value;
}
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

await 发送('Page.enable');
await 发送('Runtime.enable');
const 控制台错误 = [];
const 页面错误 = [];
ws.addEventListener('message', (事件) => {
  const 消息 = JSON.parse(事件.data);
  if (消息.method === 'Runtime.consoleAPICalled' && 消息.params.type === 'error') {
    控制台错误.push(
      消息.params.args.map((项) => 项.value ?? 项.description ?? '').join(' '),
    );
  }
  if (消息.method === 'Runtime.exceptionThrown') {
    页面错误.push(
      消息.params.exceptionDetails.exception?.description ||
        JSON.stringify(消息.params.exceptionDetails),
    );
  }
});
await 发送('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
// js/ 子模块不带版本号，必须 ignoreCache 重载才拿得到最新的 styles.css 与 阅读统计.js
await 发送('Page.reload', { ignoreCache: true });
for (let n = 0; n < 200; n++) {
  await pause(100);
  if (await 求值('return document.querySelector("#载入状态")?.hidden === true')) break;
}

const 当前书名 = await 求值(`
  const { 状态 } = await import('./js/状态.js');
  return 状态.文件名;
`);

const 量 = await 求值(`
  const { 创建阅读统计内容, 汇总书籍时间账, 计算时段窗口 } = await import('./js/阅读统计.js');
  const 秒 = (h, m, s = 0) => h * 3600 + m * 60 + s;
  // 新形状：日期 -> 书名 -> 段。09-23 两本书共用一条轴；
  // 09-22 只有可见段（没滚过）；09-21 可见段把滚动整个包住；
  // 09-20 故意只有滚动没有可见段（升级前的旧数据）——黑块不许踩在白轨上，
  // 而激活列必须留白（照实留白，不再用滚动段把激活带补满）。
  const 滚动账 = {
    '2026-09-23': { '${当前书名}': [[秒(8, 0), 秒(8, 10)], [秒(11, 30), 秒(11, 33)], [秒(14, 30), 秒(14, 30, 40)]], '乙.txt': [[秒(20, 0), 秒(20, 6)]] },
    '2026-09-22': {},
    '2026-09-21': { '${当前书名}': [[秒(1, 0), 秒(1, 4)]] },
    '2026-09-20': { '${当前书名}': [[秒(3, 0), 秒(3, 20)], [秒(4, 0), 秒(4, 5)]] },
  };
  const 可见账 = {
    '2026-09-23': { '${当前书名}': [[秒(7, 50), 秒(12, 0)], [秒(19, 40), 秒(20, 20)]], '乙.txt': [[秒(20, 0), 秒(20, 30)]] },
    '2026-09-22': { '${当前书名}': [[秒(0, 30), 秒(23, 30)]] },
    '2026-09-21': { '${当前书名}': [[秒(0, 0), 秒(2, 0)], [秒(23, 0), 秒(23, 59)]] },
    '2026-09-20': {},
  };
  const 时间账 = 汇总书籍时间账({ 滚动账, 可见账 });
  // 轴窗口与模块内部同算法：每天把两本书的总计段与滚动段并成一个平面列表
  const 窗口源 = {};
  for (const [日期, 行表] of 时间账.按日) {
    const 段 = [];
    for (const 账 of 行表.values()) 段.push(...账.总计段, ...账.滚动段);
    窗口源[日期] = 段;
  }
  const 窗口 = 计算时段窗口(窗口源);
  const 精确 = [];
  for (const [日期, 行表] of 时间账.按日) {
    for (const [书名, 账] of 行表) {
      精确.push({ 日期, 书名, 滚动秒: 账.滚动秒, 激活秒: 账.激活秒, 总计秒: 账.总计秒 });
    }
  }
  const 书级 = [...时间账.按书].map(([书名, 账]) => ({
    书名,
    滚动秒: 账.滚动秒,
    激活秒: 账.激活秒,
    总计秒: 账.总计秒,
  }));
  const 内容 = document.querySelector('#阅读统计内容');
  内容.textContent = '';
  内容.append(创建阅读统计内容({
    书籍: [['${当前书名}', {}], ['乙.txt', {}]],
    文件名: '${当前书名}',
    进度: 0,
    时间账,
    今天: '2026-09-23',
  }));
  document.querySelector('#阅读统计弹窗').showModal();

  const 画布 = document.createElement('canvas');
  画布.width = 画布.height = 1;
  const ctx = 画布.getContext('2d', { willReadFrequently: true });
  const RGB = (色串) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = 色串;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, 串: 色串 };
  };
  const 盒 = (节点) => { const b = 节点.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const 到秒 = (串) => 串.split(':').map(Number).reduce((总, 段) => 总 * 60 + 段, 0);
  const 表 = document.querySelector('.统计时段表');
  const 行们 = [...表.querySelectorAll('tbody tr')].map((行) => {
    const 组标题 = 行.querySelector('.统计时段组标题');
    if (组标题) {
      return {
        种类: '组',
        日期: 组标题.querySelector('.统计时段组日期').textContent,
        完整: 组标题.querySelector('.统计时段组日期完整').textContent,
        注: 组标题.querySelector('.统计时段组注').textContent,
        标题格: 盒(组标题),
      };
    }
    const 轨道 = 行.querySelector('.统计时段轨道');
    const 轨道样式 = getComputedStyle(轨道);
    const 轨宽 = 轨道.getBoundingClientRect().width;
    return {
      种类: '书',
      书名: 行.querySelector('.统计时段书名文本').textContent,
      是当前: 行.classList.contains('统计时段行-当前'),
      滚动列文本: 行.querySelector('.统计时段滚动格').textContent.trim(),
      激活列文本: 行.querySelector('.统计时段激活格').textContent.trim(),
      总计列文本: 行.querySelector('.统计时段总计格').textContent.trim(),
      轨道: 盒(轨道),
      轨道底色: RGB(轨道样式.backgroundColor),
      块: [...轨道.children].map((块) => {
        const [起, 止] = 块.title.split(' · ')[0].split(' → ');
        const 秒数 = 到秒(止) - 到秒(起);
        const 芯 = getComputedStyle(块, '::before');
        return {
          总计: 块.classList.contains('统计时段块-总计'),
          盒: 盒(块),
          底色: RGB(getComputedStyle(块).backgroundColor),
          芯: { 高: parseFloat(芯.height), 内容: 芯.content, 色: RGB(芯.backgroundColor) },
          秒数,
          真实宽: +((秒数 / (窗口.止秒 - 窗口.起秒)) * 轨宽).toFixed(2),
          标题: 块.title,
        };
      }),
    };
  });
  const 书籍表 = document.querySelector('.阅读统计内容 table:not(.统计时段表)');
  return {
    时段表头: [...表.querySelectorAll('.统计时段表头名')].map((项) => 项.textContent.trim()),
    时段表头提示: [...表.querySelectorAll('thead th')].map((项) => 项.title),
    图例: [...document.querySelectorAll('.统计时段图例项')].map((项) => 项.textContent),
    图例说明: document.querySelector('.统计时段图例说明').textContent,
    行们,
    窗口,
    精确,
    书级,
    书籍表头: [...书籍表.querySelectorAll('thead tr:first-child th')].map((项) => 项.textContent),
    书籍合计行: [...书籍表.querySelectorAll('.统计短合计行 td, .统计短合计行 th')].map((项) => 项.textContent.trim()),
    书籍表体: [...书籍表.querySelectorAll('tbody tr')].map((行) =>
      [...行.querySelectorAll('td')].map((格) => 格.textContent.trim()),
    ),
    区块: 盒(document.querySelector('.统计时段')),
  };
`);

const { data } = await 发送('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
  clip: {
    x: 量.区块.x - 6,
    y: 量.区块.y - 6,
    width: 量.区块.w + 12,
    height: 量.区块.h + 12,
    scale: 2,
  },
});
writeFileSync(
  resolve(import.meta.dirname, '时段轨道三档-截图.png'),
  Buffer.from(data, 'base64'),
);

// —— 判据 1：版式 —— 一天一组、组内按书一行，三笔账各占一栏，列头都带合计
const 组们 = 量.行们.filter((行) => 行.种类 === '组');
const 书行们 = 量.行们.filter((行) => 行.种类 === '书');
assert.deepEqual(
  组们.map((行) => 行.日期),
  ['今天', '9月22日', '9月21日', '9月20日'],
  '一天一组，今天在最上',
);
assert.deepEqual(
  组们.map((行) => 行.注),
  [
    '2 本 · 共 5 小时 20 分',
    '1 本 · 共 23 小时 0 分',
    '1 本 · 共 2 小时 59 分',
    '1 本 · 共 25 分',
  ],
  '组标题右侧：本书数 + 当日总计（各行只到分再相加）',
);
assert.equal(书行们.length, 5, '09-23 两本书各一行，其余一天一本');
assert.deepEqual(量.时段表头, ['书籍', '滚动', '激活', '总计'], '下表四栏：书名 + 三笔账');
assert.deepEqual(量.书籍表头, ['书籍', '滚动', '激活', '总计', '进度'], '上表同样的三笔账');
assert.deepEqual(量.图例, ['激活', '滚动'], '图例两项');
assert.match(量.图例说明, /浅灰＝激活.*深色＝滚动.*两者相加＝总计/);
assert.equal(书行们[0].是当前, true, '当天当前这本书钉在组内最前');
assert.equal(书行们.filter((行) => 行.是当前).length, 4, '四个日子都有当前这本书的一行，且排在组内最前');

// —— 判据 2：三笔账逐行对账 —— 激活 + 滚动 = 总计，且激活不含滚动
assert.deepEqual(
  量.精确.filter((项) => 项.激活秒 + 项.滚动秒 !== 项.总计秒),
  [],
  '每天每本书都要满足 激活 + 滚动 = 总计',
);
assert.deepEqual(
  量.书级.filter((项) => 项.激活秒 + 项.滚动秒 !== 项.总计秒),
  [],
  '按书累计同样相加对账',
);
const 取账 = (日期, 书名) =>
  量.精确.find((项) => 项.日期 === 日期 && 项.书名 === 书名);
assert.deepEqual(
  取账('2026-09-23', 当前书名),
  { 日期: '2026-09-23', 书名: 当前书名, 滚动秒: 820, 激活秒: 16620, 总计秒: 17440 },
  '可见 17400 秒 + 带外滚动 40 秒；激活把滚动整段扣掉',
);
assert.deepEqual(取账('2026-09-23', '乙.txt'), {
  日期: '2026-09-23',
  书名: '乙.txt',
  滚动秒: 360,
  激活秒: 1440,
  总计秒: 1800,
});
assert.deepEqual(
  取账('2026-09-20', 当前书名),
  { 日期: '2026-09-20', 书名: 当前书名, 滚动秒: 1500, 激活秒: 0, 总计秒: 1500 },
  '旧数据只有滚动：激活不再拿滚动段补成 25 分，照实为 0',
);
const 甲23 = 书行们.find((行) => 行.是当前 && 行.滚动列文本.startsWith('3 段'));
assert.ok(甲23, '当前这本书 09-23 那行');
assert.equal(甲23.滚动列文本, '3 段·13 分', '秒级短段照样算一段，时长只到分');
assert.equal(甲23.激活列文本, '4 小时 37 分');
assert.equal(甲23.总计列文本, '4 小时 50 分');
const 只可见 = 书行们.find((行) => 行.激活列文本 === '23 小时 0 分');
assert.ok(只可见, '09-22 只有可见段：激活就是全部');
assert.equal(只可见.滚动列文本, '', '没滚过整格留白，不写「0 段」');
const 只滚动 = 书行们.find((行) => 行.滚动列文本 === '2 段·25 分');
assert.ok(只滚动, '09-20 只有滚动段');
assert.equal(只滚动.激活列文本, '', '激活缺账的日子留白，不拿滚动补');
assert.equal(只滚动.总计列文本, '25 分');
assert.deepEqual(量.书籍表体, [
  [`当前${当前书名}`, '42 分钟', '30 小时 32 分钟', '31 小时 14 分钟', '0.0%'],
  ['乙.txt', '6 分钟', '24 分钟', '30 分钟', '—'],
], '上表按书累计与下表各行同源');
assert.deepEqual(量.书籍合计行, ['共', '48 分钟', '30 小时 56 分钟', '31 小时 44 分钟', ''], '列头下面一行合计＝各行相加');

// —— 判据 3：几何与面积 —— 带子按总计铺到底、黑芯按滚动压在上面，两侧都不许有兜底宽度
assert.ok(量.窗口 && 量.窗口.起秒 === 0 && 量.窗口.止秒 > 86000, `共用轴 ${JSON.stringify(量.窗口)}`);
for (const 行 of 书行们) {
  const 带们 = 行.块.filter((块) => 块.总计);
  const 芯们 = 行.块.filter((块) => !块.总计);
  for (const 块 of 行.块) {
    assert.ok(
      Math.abs(块.真实宽 - 块.盒.w) < 1.2,
      `面积不按时长：${行.书名} ${块.标题} 画了 ${块.盒.w}px，该是 ${块.真实宽}px`,
    );
    assert.ok(块.芯.内容 === 'none' || 块.芯.内容 === '""', `${行.书名}：${块.标题}`);
    if (块.总计) assert.equal(块.芯.内容, 'none', '总计带上不许画黑芯');
  }
  for (const 芯 of 芯们) {
    assert.equal(芯.芯.内容, '""', '滚动块中间要有那枚黑芯');
    assert.ok(
      Math.abs(芯.芯.高 / 行.轨道.h - 0.7) < 0.03,
      `黑芯该是 70% 高：${行.书名} ${芯.芯.高}`,
    );
    const 盖住 = 带们.some(
      (丁) => 丁.盒.x - 0.5 <= 芯.盒.x && 丁.盒.x + 丁.盒.w + 0.5 >= 芯.盒.x + 芯.盒.w,
    );
    assert.ok(盖住 || 芯.底色.串 === 'var(--灰带色)', `黑块踩在白轨上：${行.书名} ${芯.标题}`);
  }
  if (带们.length) {
    for (const 带 of 带们) {
      assert.ok(
        Math.abs(带.盒.h / 行.轨道.h - 1) < 0.02,
        `总计带没撑满轨道：${行.书名} ${(带.盒.h / 行.轨道.h).toFixed(3)}`,
      );
    }
  }
}
const 短段 = 甲23.块.find((块) => 块.秒数 === 40);
assert.ok(短段 && 短段.盒.w <= 1.5, `40 秒的短段不许被兜底抬成可见墨块：${短段?.盒.w}`);

// —— 判据 4：真实入口走一遍（点统计按钮 → app.js 取快照 → 渲染），不许有报错 ——
await 求值(`document.querySelector('#阅读统计弹窗').close();`);
await 求值(`document.querySelector('#阅读统计按钮').click(); return true;`);
for (let n = 0; n < 50; n++) {
  await pause(100);
  if (await 求值('return document.querySelector("#阅读统计弹窗").open')) break;
}
const 真渲染 = await 求值(`
  const 表 = document.querySelector('.统计时段表');
  return {
    开着: document.querySelector('#阅读统计弹窗').open,
    组数: 表 ? 表.querySelectorAll('.统计时段组标题').length : 0,
    行数: 表 ? 表.querySelectorAll('.统计时段行').length : 0,
    书籍行数: document.querySelectorAll('.阅读统计内容 table:not(.统计时段表) tbody tr').length,
    空状态: !!document.querySelector('.统计空状态'),
  };
`);
assert.ok(真渲染.开着, '点按钮要能打开统计弹窗');
assert.ok(真渲染.组数 >= 1, `真实账本里至少有一组（本次会话已经滚过一段）：${JSON.stringify(真渲染)}`);
assert.ok(真渲染.行数 >= 1);
assert.deepEqual(控制台错误, [], '渲染过程中不许报错');
assert.deepEqual(页面错误, [], '页面不许抛未捕获异常');

console.log(
  '✓ 一天一组、组内按书一行；三笔账相加对账；激活不含滚动；缺可见段的日子照实留白',
  JSON.stringify({ 组数: 组们.length, 书行数: 书行们.length, ...真渲染 }),
);
