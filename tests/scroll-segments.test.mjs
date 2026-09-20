import assert from 'node:assert/strict';
import { test } from 'node:test';

// 滚动时段是叶子记账模块，但它复用 状态.js 的 本地日期串，需要先补最小 DOM 桩。
globalThis.document = { baseURI: 'http://127.0.0.1/', querySelector: () => null };
const {
  切分跨日区间,
  合并时段列表,
  开始滚动时段,
  结束滚动时段,
  载入滚动时段统计,
  滚动时段统计快照,
  获取当日时段,
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

test('gaps merge regardless of how the scrolling was triggered', () => {
  assert.deepEqual(合并时段列表([[100, 200], [230, 300], [320, 400]], 60), [
    [100, 400],
  ]);
  assert.deepEqual(合并时段列表([[100, 200], [300, 400]], 60), [
    [100, 200],
    [300, 400],
  ]);
  // 旧数据每段多一位「种类」，读取时丢掉即可
  assert.deepEqual(合并时段列表([[100, 200, 0], [230, 300, 1]], 60), [[100, 300]]);
});

test('daily cap collapses the tightest gaps first', () => {
  assert.deepEqual(
    合并时段列表([[0, 100], [1000, 1100], [1200, 1300], [5000, 5100]], 0, 2),
    [[0, 1300], [5000, 5100]],
  );
});

test('start and stop record one closed segment', () => {
  载入滚动时段统计({});
  开始滚动时段(中午);
  assert.equal(滚动时段统计快照(中午 + 30000).每日时段['2026-09-18'].length, 1);
  结束滚动时段(中午 + 90000);
  assert.deepEqual(获取当日时段('2026-09-18'), [[39804, 39894]]);
  assert.deepEqual(滚动时段统计快照(中午 + 90000).每日时段, {
    '2026-09-18': [[39804, 39894]],
  });
});

test('re-triggering while scrolling keeps one continuous segment', () => {
  载入滚动时段统计({});
  开始滚动时段(中午);
  开始滚动时段(中午 + 10000); // 自动滚到一半改按方向键：同一段，不切断
  结束滚动时段(中午 + 20000);
  assert.deepEqual(获取当日时段('2026-09-18'), [[39804, 39824]]);
});

test('sub-second sessions are dropped', () => {
  载入滚动时段统计({});
  开始滚动时段(中午);
  结束滚动时段(中午 + 400);
  assert.deepEqual(获取当日时段('2026-09-18'), []);
});

test('snapshot includes the in-progress segment closed at now', () => {
  载入滚动时段统计({});
  开始滚动时段(中午);
  assert.deepEqual(滚动时段统计快照(中午 + 40000).每日时段, {
    '2026-09-18': [[39804, 39844]],
  });
  结束滚动时段(中午 + 40000);
});

test('loading ignores malformed segments and dates', () => {
  载入滚动时段统计({
    自动滚动统计: {
      每日时段: {
        '2026-09-18': [[1, 2, 0], [5, 3, 0], ['a', 'b', 0], [9000, 9060]],
        坏键: [[0, 1]],
        '2026-09-17': '不是数组',
      },
    },
  });
  assert.deepEqual(获取当日时段('2026-09-18'), [[1, 2], [9000, 9060]]);
  assert.deepEqual(获取当日时段('2026-09-17'), []);
});

test('loading malformed container or absent field resets to empty', () => {
  载入滚动时段统计({});
  开始滚动时段(中午);
  结束滚动时段(中午 + 60000);
  assert.ok(获取当日时段('2026-09-18').length);
  载入滚动时段统计({ 自动滚动统计: { 每日时段: [] } });
  assert.deepEqual(获取当日时段('2026-09-18'), []);
  载入滚动时段统计({ 自动滚动统计: {} });
  assert.deepEqual(获取当日时段('2026-09-18'), []);
});
