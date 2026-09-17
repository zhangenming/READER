import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.document = { baseURI: 'http://127.0.0.1/', querySelector: () => null };
const {
  载入前台停留统计, 更新前台停留计时, 结转前台停留时长,
  前台停留统计快照, 获取书籍前台毫秒, 获取今日前台毫秒,
} = await import('../js/前台停留.js');
const 起点 = new Date(2026, 8, 17, 12).getTime();

test('foreground counts manual reading, pauses hidden, resumes without double counting', () => {
  载入前台停留统计({});
  更新前台停留计时('甲.txt', true, 起点);
  结转前台停留时长(起点 + 5000);
  更新前台停留计时('甲.txt', false, 起点 + 6000);
  结转前台停留时长(起点 + 60000);
  assert.equal(获取书籍前台毫秒('甲.txt'), 6000);
  更新前台停留计时('甲.txt', true, 起点 + 60000);
  更新前台停留计时('甲.txt', true, 起点 + 61000);
  结转前台停留时长(起点 + 62000);
  结转前台停留时长(起点 + 62000);
  assert.equal(获取书籍前台毫秒('甲.txt'), 8000);
});

test('switching books settles the previous book; no book means no counting', () => {
  载入前台停留统计({});
  更新前台停留计时('', true, 起点);
  更新前台停留计时('甲.txt', true, 起点 + 10000);
  更新前台停留计时('乙.txt', true, 起点 + 12000);
  更新前台停留计时('', false, 起点 + 15000);
  结转前台停留时长(起点 + 30000);
  assert.equal(获取书籍前台毫秒('甲.txt'), 2000);
  assert.equal(获取书籍前台毫秒('乙.txt'), 3000);
  assert.equal(获取今日前台毫秒('2026-09-17'), 5000);
});

test('foreground splits at local midnight and today excludes yesterday', () => {
  载入前台停留统计({});
  const 午夜 = new Date(2026, 8, 18).getTime();
  更新前台停留计时('甲.txt', true, 午夜 - 1000);
  结转前台停留时长(午夜 + 2000);
  assert.deepEqual(前台停留统计快照(), {
    每日书籍毫秒: { '甲.txt': { '2026-09-17': 1000, '2026-09-18': 2000 } },
  });
  assert.equal(获取今日前台毫秒('2026-09-18'), 2000);
  assert.equal(获取书籍前台毫秒('甲.txt'), 3000);
});

test('snapshot restores both books without counting offline time', () => {
  载入前台停留统计({});
  更新前台停留计时('甲.txt', true, 起点);
  更新前台停留计时('乙.txt', true, 起点 + 2000);
  结转前台停留时长(起点 + 5000);
  const 快照 = JSON.parse(JSON.stringify(前台停留统计快照()));
  载入前台停留统计({ 前台停留统计: 快照 });
  结转前台停留时长(起点 + 90000);
  assert.equal(获取书籍前台毫秒('甲.txt'), 2000);
  assert.equal(获取书籍前台毫秒('乙.txt'), 3000);
  更新前台停留计时('乙.txt', true, 起点 + 90000);
  结转前台停留时长(起点 + 91000);
  assert.equal(获取书籍前台毫秒('乙.txt'), 4000);
});

test('legacy data starts at zero; malformed entries do not discard valid records', () => {
  载入前台停留统计({ 文本状态: { '旧书.txt': { 总滚动毫秒: 60000 } } });
  assert.equal(获取书籍前台毫秒('旧书.txt'), 0);
  载入前台停留统计({ 前台停留统计: { 每日书籍毫秒: {
    '甲.txt': { '2026-09-17': 123, '2026-09-16': '123', '2026-09-15': -1, bad: 123 },
    '乙.txt': [], '丙.txt': null,
  } } });
  assert.deepEqual(前台停留统计快照(), {
    每日书籍毫秒: { '甲.txt': { '2026-09-17': 123 } },
  });
});

test('clock moving backwards never subtracts time', () => {
  载入前台停留统计({});
  更新前台停留计时('甲.txt', true, 起点);
  结转前台停留时长(起点 - 1000);
  assert.equal(获取书籍前台毫秒('甲.txt'), 0);
  结转前台停留时长(起点);
  assert.equal(获取书籍前台毫秒('甲.txt'), 1000);
});
