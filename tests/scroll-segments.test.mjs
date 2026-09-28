import assert from 'node:assert/strict';
import { test } from 'node:test';

// 时段是叶子记账模块，但它复用 状态.js 的 本地日期串，需要先补最小 DOM 桩。
globalThis.document = { baseURI: 'http://127.0.0.1/', querySelector: () => null };
const {
  切分跨日区间,
  合并时段列表,
  开始滚动时段,
  结束滚动时段,
  载入滚动时段统计,
  滚动时段统计快照,
  获取当日按书滚动时段,
  滚动当日总秒,
  本书滚动当日总秒,
  未分书键,
} = await import('../js/滚动时段.js');

const 中午 = new Date(2026, 8, 18, 11, 3, 24).getTime(); // 当日第 39804 秒

test('segment keeps second precision inside one day', () => {
  assert.deepEqual(切分跨日区间(中午, 中午 + 5000), [['2026-09-18', 39804, 39809]]);
});

test('segment splits at local midnight into both days', () => {
  const 午夜前 = new Date(2026, 8, 17, 23, 59, 50).getTime();
  assert.deepEqual(切分跨日区间(午夜前, 午夜前 + 20000), [
    ['2026-09-17', 86390, 86400],
    ['2026-09-18', 0, 10],
  ]);
});

// 时长就是从这些段求和得来的，所以写入只许做无损合并：并掉重叠与首尾相接，
// 间隙一律留在账上。旧的「间隙 ≤60 秒并成一段」会把发呆的时间算成阅读时长，已撤掉。
test('write-time merge is lossless: gaps stay on the ledger', () => {
  assert.deepEqual(合并时段列表([[100, 200], [230, 300], [320, 400]]), [
    [100, 200],
    [230, 300],
    [320, 400],
  ], '30 秒的间隙不再被抹平');
  assert.deepEqual(合并时段列表([[100, 200], [200, 260]]), [[100, 260]], '首尾相接并成一段');
  assert.deepEqual(合并时段列表([[100, 300], [200, 260]]), [[100, 300]], '重叠并掉，不重复计时');
  assert.deepEqual(合并时段列表([[100, 200, 0], [230, 300, 1]]), [
    [100, 200],
    [230, 300],
  ], '旧数据每段多一位「种类」，读取时丢掉即可');
});

test('daily cap collapses the tightest gaps first', () => {
  assert.deepEqual(
    合并时段列表([[0, 100], [1000, 1100], [1200, 1300], [5000, 5100]], 0, 2),
    [[0, 1300], [5000, 5100]],
  );
});

test('a session is booked against the book it was started on', () => {
  载入滚动时段统计({});
  开始滚动时段(中午, '甲.txt');
  assert.deepEqual(滚动时段统计快照(中午 + 30000).每日时段, {
    '2026-09-18': { '甲.txt': [[39804, 39834]] },
  }, '未封口的进行中段也要进快照');
  结束滚动时段(中午 + 90000);
  assert.deepEqual(获取当日按书滚动时段('2026-09-18', '甲.txt'), [[39804, 39894]]);
  assert.deepEqual(滚动时段统计快照(中午 + 90000).每日时段, {
    '2026-09-18': { '甲.txt': [[39804, 39894]] },
  });
});

test('switching books seals the old book and opens a new span', () => {
  载入滚动时段统计({});
  开始滚动时段(中午, '甲.txt');
  开始滚动时段(中午 + 10000, '乙.txt'); // 边滚边换书：甲那段就地封口
  结束滚动时段(中午 + 20000);
  assert.deepEqual(获取当日按书滚动时段('2026-09-18', '甲.txt'), [[39804, 39814]]);
  assert.deepEqual(获取当日按书滚动时段('2026-09-18', '乙.txt'), [[39814, 39824]]);
  assert.equal(本书滚动当日总秒('甲.txt', '2026-09-18'), 10);
  assert.equal(滚动当日总秒('2026-09-18'), 20, '全部书籍相加');
});

test('re-triggering on the same book keeps one continuous segment', () => {
  载入滚动时段统计({});
  开始滚动时段(中午, '甲.txt');
  开始滚动时段(中午 + 10000, '甲.txt'); // 自动滚到一半改按方向键：同一段，不切断
  结束滚动时段(中午 + 20000);
  assert.deepEqual(获取当日按书滚动时段('2026-09-18', '甲.txt'), [[39804, 39824]]);
});

test('sub-second sessions are dropped', () => {
  载入滚动时段统计({});
  开始滚动时段(中午, '甲.txt');
  结束滚动时段(中午 + 400);
  assert.deepEqual(获取当日按书滚动时段('2026-09-18', '甲.txt'), []);
  assert.deepEqual(滚动时段统计快照(中午).每日时段, {});
});

test('in-progress segment counts toward the live today readout', () => {
  载入滚动时段统计({});
  开始滚动时段(中午, '甲.txt');
  assert.equal(滚动当日总秒('2026-09-18', 中午 + 40000), 40);
  assert.equal(本书滚动当日总秒('甲.txt', '2026-09-18', 中午 + 40000), 40);
  assert.equal(本书滚动当日总秒('乙.txt', '2026-09-18', 中午 + 40000), 0);
  结束滚动时段(中午 + 40000);
});

test('loading accepts both the per-book shape and the legacy flat shape', () => {
  载入滚动时段统计({
    自动滚动统计: {
      每日时段: {
        '2026-09-18': { '甲.txt': [[1, 2, 0], [9000, 9060]] },
        '2026-09-17': [[7200, 7260]], // 旧形状：整天的段不分书
        坏键: [[0, 1]],
        '2026-09-16': '不是数组',
        '2026-09-15': { '乙.txt': [[5, 3], ['a', 'b'], [10, 10]] },
      },
    },
  });
  assert.deepEqual(获取当日按书滚动时段('2026-09-18', '甲.txt'), [[1, 2], [9000, 9060]]);
  assert.deepEqual(
    获取当日按书滚动时段('2026-09-17', 未分书键),
    [[7200, 7260]],
    '不分书的旧数据读回来挂在未分书键下',
  );
  assert.deepEqual(获取当日按书滚动时段('2026-09-15', '乙.txt'), []);
  assert.equal(滚动时段统计快照(中午).每日时段['2026-09-15'], undefined, '全是坏段就不建这一行');
});

test('loading malformed container or absent field resets to empty', () => {
  载入滚动时段统计({});
  开始滚动时段(中午, '甲.txt');
  结束滚动时段(中午 + 60000);
  assert.ok(获取当日按书滚动时段('2026-09-18', '甲.txt').length);
  载入滚动时段统计({ 自动滚动统计: { 每日时段: [] } });
  assert.deepEqual(滚动时段统计快照(中午).每日时段, {});
  载入滚动时段统计({ 自动滚动统计: {} });
  assert.deepEqual(滚动时段统计快照(中午).每日时段, {});
});
