import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  格式化统计时长,
  格式化统计日期,
  计算时段窗口,
  计算刻度步长,
  计算整点刻度,
  时段百分比,
  计算时段布局,
  合并时段,
  差集时段,
  汇总书籍时间账,
  合并当日账,
  格式化时段时刻,
  格式化轴时刻,
  格式化时段时长,
  格式化时长到分,
} from '../js/阅读统计.js';

test('statistics duration handles invalid values and minute/hour boundaries', () => {
  for (const value of [undefined, null, NaN, Infinity, -1, 0, '60000']) {
    assert.equal(格式化统计时长(value), '0 分钟');
  }
  assert.equal(格式化统计时长(1), '不足 1 分钟');
  assert.equal(格式化统计时长(59999), '不足 1 分钟');
  assert.equal(格式化统计时长(60000), '1 分钟');
  assert.equal(格式化统计时长(3599999), '59 分钟');
  assert.equal(格式化统计时长(3600000), '1 小时 0 分钟');
  assert.equal(格式化统计时长(14520000), '4 小时 2 分钟');
});

test('statistics dates use today, same-year and full-year labels', () => {
  assert.equal(格式化统计日期('2026-09-17', '2026-09-17'), '今天');
  assert.equal(格式化统计日期('2026-01-02', '2026-09-17'), '1月2日');
  assert.equal(格式化统计日期('2025-12-31', '2026-09-17'), '2025年12月31日');
  assert.equal(格式化统计日期(null, '2026-09-17'), '');
  assert.equal(格式化统计日期('17日', '2026-09-17'), '17日');
});

test('segment axis covers only the recorded range and widens with new days', () => {
  assert.equal(计算时段窗口({}), null);
  assert.equal(计算时段窗口(null), null);
  assert.deepEqual(
    计算时段窗口({ '2026-09-18': [[39804, 39900]] }),
    { 起秒: 39804, 止秒: 39900 },
  );
  // 第二天更早/更晚的时间段把共用轴往外扩
  assert.deepEqual(
    计算时段窗口({
      '2026-09-18': [[39804, 39900]],
      '2026-09-19': [[50400, 51000]],
    }),
    { 起秒: 39804, 止秒: 51000 },
  );
  assert.deepEqual(计算时段窗口([['2026-09-18', [[0, 86400]]]]), {
    起秒: 0,
    止秒: 86400,
  });
});

test('tick step widens so a shared axis never crowds its labels', () => {
  const 窗口 = { 起秒: 39804, 止秒: 46000 };
  assert.equal(计算刻度步长(窗口), 3600);
  assert.deepEqual(计算整点刻度(窗口), [{ 秒: 43200, 标签: '12:00' }]);
  assert.equal(计算刻度步长({ 起秒: 0, 止秒: 86400 }), 21600);
  assert.deepEqual(计算整点刻度({ 起秒: 0, 止秒: 86400 }).map((项) => 项.标签), [
    '6:00',
    '12:00',
    '18:00',
  ]);
  assert.deepEqual(计算整点刻度({ 起秒: 100, 止秒: 200 }), []);
  assert.deepEqual(计算整点刻度(null), []);
});

test('segment geometry clamps to the window and never double-draws', () => {
  const 窗口 = { 起秒: 39804, 止秒: 51000 };
  assert.equal(时段百分比(39804, 窗口), 0);
  assert.equal(时段百分比(51000, 窗口), 100);
  assert.equal(时段百分比(45402, 窗口), 50);
  assert.equal(时段百分比(10, null), 0);
  const 布局 = 计算时段布局([[10, 39904], [39904, 40100], ['x'], [45000, 60000]], 窗口);
  assert.equal(布局.length, 2); // 坏段忽略；首尾相接并成一段（同一秒不画两次）；超窗口的夹到边
  assert.deepEqual(布局[0], { 起: 10, 止: 40100, 左: 0, 宽: 2.6438013576277243 });
  assert.equal(Number(布局[1].左.toFixed(3)), 46.409);
  assert.equal(Number(布局[1].宽.toFixed(3)), 53.591);
  assert.deepEqual(计算时段布局([[0, 1]], null), []);
});

test('segment clock and duration read to the second', () => {
  assert.equal(格式化时段时刻(39804), '11:03:24');
  assert.equal(格式化时段时刻(0), '00:00:00');
  assert.equal(格式化时段时刻(86400), '23:59:59');
  assert.equal(格式化时段时刻(NaN), '00:00:00');
  assert.equal(格式化轴时刻(39804), '11:03');
  assert.equal(格式化轴时刻(86400), '23:59');
  assert.equal(格式化时段时长(46), '46 秒');
  assert.equal(格式化时段时长(346), '5 分 46 秒');
  assert.equal(格式化时段时长(7380), '2 小时 3 分');
  assert.equal(格式化时段时长(-5), '0 秒');
});

// 两列读数到分为止：秒数被抹掉，但 0 与「不到一分钟」要分得开
test('column readouts round durations down to the minute', () => {
  assert.equal(格式化时长到分(46), '不足 1 分钟');
  assert.equal(格式化时长到分(59), '不足 1 分钟');
  assert.equal(格式化时长到分(60), '1 分');
  assert.equal(格式化时长到分(346), '5 分');
  assert.equal(格式化时长到分(2_665), '44 分');
  assert.equal(格式化时长到分(7_380), '2 小时 3 分');
  assert.equal(格式化时长到分(86_400), '24 小时 0 分');
  assert.equal(格式化时长到分(0), '0 分');
  assert.equal(格式化时长到分(-5), '0 分');
  assert.equal(格式化时长到分(NaN), '0 分');
});

// 带子画的是总计（可见 ∪ 滚动）：滚动必然发生在页面开着的时候，把带子铺到底，
// 黑块底下就不许踩白。并的时候重叠/相接要并成一段，且不许改到原数组。
test('the total band unions visible and scroll spans so black never sits on white', () => {
  assert.deepEqual(合并时段([[100, 200]], [[300, 400]]), [
    [100, 200],
    [300, 400],
  ]);
  assert.deepEqual(合并时段([[300, 400]], [[100, 200]]), [
    [100, 200],
    [300, 400],
  ], '两组各说各的，仍按时间排序');
  assert.deepEqual(合并时段([[0, 60]], [[30, 90]]), [[0, 90]], '重叠并成一段，不重复计时');
  assert.deepEqual(合并时段([[0, 60]], [[60, 90]]), [[0, 90]], '首尾相接也并掉，中间不留一丝白');
  assert.deepEqual(合并时段([[0, 60]], [[61, 90]]), [
    [0, 60],
    [61, 90],
  ], '差 1 秒就是两段');
  assert.deepEqual(合并时段([[0, 60]], [[70, 70]]), [[0, 60]], '零长段（封口抖动）不上轴');
  assert.deepEqual(合并时段([], [[3600, 3660]]), [[3600, 3660]], '整天空闲：灰带就是滚动段');
  assert.deepEqual(合并时段([[100, 200]], [[150, 160]]), [[100, 200]], '带内滚动不外扩');
  const 激活 = [[100, 200]];
  const 滚动 = [[150, 400]];
  合并时段(激活, 滚动);
  assert.deepEqual(激活, [[100, 200]], '时段存储里的数组不许被合并改写');
});

// 激活 = 可见 − 滚动：三笔账由同一组段切出来，激活不含滚动，
// 所以 激活 + 滚动 = 总计 是构造出来的恒等式，不是碰巧对上。
test('activation is the visible span minus the scroll span', () => {
  assert.deepEqual(差集时段([[0, 100]], [[20, 30]]), [[0, 20], [30, 100]]);
  assert.deepEqual(差集时段([[0, 100]], []), [[0, 100]], '没滚过：整段都是激活');
  assert.deepEqual(差集时段([[0, 100]], [[0, 100]]), [], '全程在滚：激活为空');
  assert.deepEqual(差集时段([[0, 100]], [[150, 200]]), [[0, 100]], '滚动在带外，减不动');
  assert.deepEqual(差集时段([[0, 100], [200, 300]], [[90, 210]]), [
    [0, 90],
    [210, 300],
  ], '跨段的滚动两侧都切');
  assert.deepEqual(差集时段([[0, 60, 0], [60, 120]], [[30, 40]]), [
    [0, 30],
    [40, 120],
  ], '重叠/相接先并成一段，多余一位丢掉');
  const 可见 = [[0, 100]];
  差集时段(可见, [[20, 30]]);
  assert.deepEqual(可见, [[0, 100]], '不许改到时段存储里的数组');
});

test('three readouts reconcile per book and per day', () => {
  const 账 = 汇总书籍时间账({
    滚动账: { '2026-09-18': { '甲.txt': [[3600, 3660], [7200, 7260]] } },
    可见账: { '2026-09-18': { '甲.txt': [[3000, 7500]] } },
  });
  const 行 = 账.按日.get('2026-09-18').get('甲.txt');
  assert.equal(行.滚动秒, 120, '两段各 60 秒');
  assert.equal(行.总计秒, 4500, '3000→7500');
  assert.equal(行.激活秒, 4500 - 120, '激活 + 滚动 = 总计');
  assert.deepEqual(行.总计段, [[3000, 7500]], '带子铺到底，黑块底下不踩白');
  assert.equal(账.按书.get('甲.txt').总计秒, 4500);
});

test('books and days without segments fall back to the legacy millisecond ledger', () => {
  const 账 = 汇总书籍时间账({
    滚动账: { '2026-09-18': { '甲.txt': [[3600, 3660]] } }, // 只有今天有段
    可见账: {},
    旧滚动每日毫秒: { '甲.txt': { '2026-09-17': 600_000 }, '乙.txt': { '2026-09-17': 120_000 } },
    旧可见每日毫秒: { '甲.txt': { '2026-09-17': 900_000 } },
    旧书总毫秒: { '乙.txt': 120_000 },
    旧书总可见毫秒: { '甲.txt': 900_000 },
  });
  const 甲 = 账.按书.get('甲.txt');
  assert.equal(甲.滚动秒, 60 + 600, '今天用段，昨天回落旧毫秒账');
  assert.equal(甲.总计秒, 60 + 900);
  assert.equal(甲.激活秒, 甲.总计秒 - 甲.滚动秒, '老日子没有段，激活只能从两笔旧账相减');
  assert.equal(账.按日.get('2026-09-18').get('甲.txt').有段, true);
  assert.equal(账.按日.get('2026-09-17').get('甲.txt').有段, false, '画不出带子的行标成无段');
  assert.equal(账.按日.get('2026-09-17').get('乙.txt').总计秒, 120, '没有可见账时总计就是滚动');
  assert.equal(账.按日.get('2026-09-17').get('乙.txt').激活秒, 0);
});

test('legacy totals larger than the sum of days are booked without breaking the identity', () => {
  // 分日记录出现之前的书只有一个累计值（毫秒），比逐日和多出来的那截补在滚动与总计上，
  // 多出来的总计时间归给激活 —— 三笔账必须仍能相加对账。
  const 账 = 汇总书籍时间账({
    滚动账: { '2026-09-18': { '甲.txt': [[0, 60]] } },
    可见账: { '2026-09-18': { '甲.txt': [[0, 600]] } },
    旧书总毫秒: { '甲.txt': 600_000 }, // 10 分钟
    旧书总可见毫秒: { '甲.txt': 3_600_000 }, // 1 小时
  });
  const 甲 = 账.按书.get('甲.txt');
  assert.equal(甲.滚动秒, 600, '逐日 60 秒 + 旧累计里补出来的 540 秒');
  assert.equal(甲.总计秒, 3600);
  assert.equal(甲.激活秒 + 甲.滚动秒, 甲.总计秒, '补完仍然相加对账');
  assert.equal(甲.激活秒, 3000, '未知日期那截多出来的总计时间归激活');
});

test('axis window reads both the per-book shape and the legacy flat shape', () => {
  assert.deepEqual(
    计算时段窗口({ '2026-09-18': { '甲.txt': [[100, 200]], '乙.txt': [[300, 400]] } }),
    { 起秒: 100, 止秒: 400 },
  );
  assert.deepEqual(计算时段窗口({ '2026-09-18': [[100, 200]] }), {
    起秒: 100,
    止秒: 200,
  }, '旧的不分书形状照样撑开轴');
});

// 旧滚动累计比逐日和还大时（分日记录出现之前的书），补进来的那截必然也开着页面，
// 总计至少要跟着滚动走，否则 激活 + 滚动 = 总计 会被旧账撑破。
test('legacy scroll backlog never outruns the total', () => {
  const 账 = 汇总书籍时间账({
    可见账: { '2026-09-18': { '乙.txt': [[0, 1200]] } },
    旧书总毫秒: { '乙.txt': 2_700_000 },
  });
  const 乙 = 账.按书.get('乙.txt');
  assert.equal(乙.滚动秒, 2700);
  assert.equal(乙.激活秒, 1200);
  assert.equal(乙.总计秒, 3900, '总计 = 激活 + 滚动，旧累计没把恒等式撑破');
});

// 一天一行：当天全部书籍并到同一条轴上，重叠的时刻只算一次，
// 恒等式 激活 + 滚动 = 总计 在日级照样成立（激活取日级差集，不是各行相加）。
test('a day merges every book onto one axis without double-counting', () => {
  const 账 = 汇总书籍时间账({
    滚动账: { '2026-09-18': { '甲.txt': [[100, 200]], '乙.txt': [[300, 400]] } },
    可见账: {
      '2026-09-18': { '甲.txt': [[0, 250], [1000, 1100]], '乙.txt': [[240, 600]] },
    },
  });
  const 按书 = [...账.按日.get('2026-09-18').values()];
  const 合并 = 合并当日账(按书);
  assert.deepEqual(合并.滚动段, [[100, 200], [300, 400]], '两本书的滚动段并到一条轴上');
  assert.deepEqual(合并.总计段, [[0, 600], [1000, 1100]], '首尾交错的可见带接成一条');
  assert.equal(合并.滚动秒, 200);
  assert.equal(合并.总计秒, 700);
  assert.ok(
    合并.总计秒 < 按书.reduce((总, 项) => 总 + 项.总计秒, 0),
    '甲乙重叠的那 10 秒在合并行里只算一次',
  );
  assert.equal(合并.激活秒, 500, '激活 = 总计 − 滚动');
  assert.deepEqual(
    合并当日账([{ 有段: false, 滚动段: [], 总计段: [] }]),
    { 滚动段: [], 总计段: [], 滚动秒: 0, 激活秒: 0, 总计秒: 0 },
    '一段都没有的日子并出来全零',
  );
});
