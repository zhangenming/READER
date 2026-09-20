import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.document = { baseURI: 'http://127.0.0.1/', querySelector: () => null };
const {
  载入前台停留统计, 更新前台停留计时, 结转前台停留时长,
  前台停留统计快照, 获取书籍前台毫秒, 获取今日前台毫秒,
} = await import('../js/前台停留.js');
const {
  载入激活时段统计, 获取当日激活时段, 激活时段统计快照,
} = await import('../js/激活时段.js');
const 起点 = new Date(2026, 8, 17, 12).getTime(); // 当日第 43200 秒
// 时长与时段共用 更新前台停留计时 这一个入口，测试之间要一起清零才不会互相并段
function 重置会话() {
  载入前台停留统计({});
  载入激活时段统计({});
}

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

test('activation spans the session, not each book', () => {
  重置会话();
  更新前台停留计时('甲.txt', true, 起点);
  更新前台停留计时('乙.txt', true, 起点 + 10000); // 中途换书：轴上仍是一段
  更新前台停留计时('', false, 起点 + 15000);
  assert.deepEqual(获取当日激活时段('2026-09-17'), [[43200, 43215]]);
  assert.equal(获取书籍前台毫秒('甲.txt'), 10000, '时长仍按书分账');
});

test('activation keeps real away-gaps but absorbs a short flicker', () => {
  重置会话();
  更新前台停留计时('甲.txt', true, 起点);
  更新前台停留计时('甲.txt', false, 起点 + 5000);
  更新前台停留计时('甲.txt', true, 起点 + 20000); // 离开 15 秒：是真离开，不并
  更新前台停留计时('甲.txt', false, 起点 + 25000);
  assert.deepEqual(获取当日激活时段('2026-09-17'), [[43200, 43205], [43220, 43225]]);
  重置会话();
  更新前台停留计时('甲.txt', true, 起点);
  更新前台停留计时('甲.txt', false, 起点 + 5000);
  更新前台停留计时('甲.txt', true, 起点 + 10000); // 5 秒内回来：抖动，抹平成一段
  更新前台停留计时('甲.txt', false, 起点 + 15000);
  assert.deepEqual(获取当日激活时段('2026-09-17'), [[43200, 43215]]);
});

test('activation persists under the foreground stats and survives a reload', () => {
  重置会话();
  更新前台停留计时('甲.txt', true, 起点);
  assert.deepEqual(激活时段统计快照(起点 + 30000).每日时段, {
    '2026-09-17': [[43200, 43230]],
  }, '未封口的进行中段也要进快照');
  更新前台停留计时('甲.txt', false, 起点 + 30000);
  assert.deepEqual(前台停留统计快照().每日书籍毫秒, {
    '甲.txt': { '2026-09-17': 30000 },
  });
  载入激活时段统计({
    前台停留统计: { 每日激活时段: { '2026-09-17': [[43200, 43230, 1]] } },
  });
  assert.deepEqual(获取当日激活时段('2026-09-17'), [[43200, 43230]], '旧格式多余一位照样读回');
  assert.deepEqual(
    前台停留统计快照().每日书籍毫秒,
    { '甲.txt': { '2026-09-17': 30000 } },
    '只读时段不动时长账',
  );
});
