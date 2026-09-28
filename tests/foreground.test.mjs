import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.document = { baseURI: 'http://127.0.0.1/', querySelector: () => null };
const {
  载入前台停留统计,
  更新前台停留计时,
  前台停留统计快照,
  获取书籍前台毫秒,
} = await import('../js/前台停留.js');
const {
  载入可见时段统计,
  获取当日按书可见时段,
  可见时段统计快照,
  可见当日总秒,
} = await import('../js/可见时段.js');

const 起点 = new Date(2026, 8, 17, 12).getTime(); // 当日第 43200 秒

function 重置会话() {
  载入前台停留统计({});
  载入可见时段统计({});
}

test('a visible session with a book records one span for that book', () => {
  重置会话();
  更新前台停留计时('甲.txt', true, 起点);
  assert.deepEqual(可见时段统计快照(起点 + 30000).每日时段, {
    '2026-09-17': { '甲.txt': [[43200, 43230]] },
  }, '未封口的进行中段也要进快照');
  assert.equal(可见当日总秒('2026-09-17', 起点 + 30000), 30);
  更新前台停留计时('甲.txt', false, 起点 + 30000);
  assert.deepEqual(获取当日按书可见时段('2026-09-17', '甲.txt'), [[43200, 43230]]);
});

test('repeat notifications do not reopen or double-count', () => {
  重置会话();
  更新前台停留计时('甲.txt', true, 起点);
  更新前台停留计时('甲.txt', true, 起点 + 5000); // 同书再次通知：同一段，不切断
  更新前台停留计时('甲.txt', true, 起点 + 9000);
  更新前台停留计时('甲.txt', false, 起点 + 10000);
  assert.deepEqual(获取当日按书可见时段('2026-09-17', '甲.txt'), [[43200, 43210]]);
});

test('switching books splits the span so each book owns its own time', () => {
  重置会话();
  更新前台停留计时('甲.txt', true, 起点);
  更新前台停留计时('乙.txt', true, 起点 + 10000);
  更新前台停留计时('', false, 起点 + 15000);
  assert.deepEqual(获取当日按书可见时段('2026-09-17', '甲.txt'), [[43200, 43210]]);
  assert.deepEqual(获取当日按书可见时段('2026-09-17', '乙.txt'), [[43210, 43215]]);
  assert.equal(可见当日总秒('2026-09-17'), 15, '两本书相加仍是这 15 秒，没有重复计时');
});

test('no book or hidden page bills nothing', () => {
  重置会话();
  更新前台停留计时('', true, 起点);
  assert.deepEqual(可见时段统计快照(起点 + 60000).每日时段, {}, '没载入书不算开着页面');
  更新前台停留计时('甲.txt', false, 起点 + 5000);
  assert.deepEqual(可见时段统计快照(起点 + 60000).每日时段, {});
});

test('a sub-second flicker leaves no trace', () => {
  重置会话();
  更新前台停留计时('甲.txt', true, 起点);
  更新前台停留计时('甲.txt', false, 起点 + 400);
  assert.deepEqual(获取当日按书可见时段('2026-09-17', '甲.txt'), []);
});

test('a real away-gap stays a gap', () => {
  重置会话();
  更新前台停留计时('甲.txt', true, 起点);
  更新前台停留计时('甲.txt', false, 起点 + 5000);
  更新前台停留计时('甲.txt', true, 起点 + 20000); // 离开 15 秒：是真离开，账上就是两段
  更新前台停留计时('甲.txt', false, 起点 + 25000);
  assert.deepEqual(获取当日按书可见时段('2026-09-17', '甲.txt'), [
    [43200, 43205],
    [43220, 43225],
  ]);
  assert.equal(可见当日总秒('2026-09-17'), 10, '空闲的 15 秒没有被算进阅读时间');
});

test('segments split at local midnight', () => {
  重置会话();
  const 午夜 = new Date(2026, 8, 18).getTime();
  更新前台停留计时('甲.txt', true, 午夜 - 10000);
  更新前台停留计时('甲.txt', false, 午夜 + 20000);
  assert.deepEqual(获取当日按书可见时段('2026-09-17', '甲.txt'), [[86390, 86400]]);
  assert.deepEqual(获取当日按书可见时段('2026-09-18', '甲.txt'), [[0, 20]]);
});

test('clock moving backwards never subtracts time', () => {
  重置会话();
  更新前台停留计时('甲.txt', true, 起点);
  更新前台停留计时('甲.txt', false, 起点 - 1000);
  assert.deepEqual(获取当日按书可见时段('2026-09-17', '甲.txt'), []);
});

test('the legacy per-book millisecond ledger still loads and round-trips', () => {
  载入前台停留统计({
    前台停留统计: {
      每日书籍毫秒: {
        '甲.txt': { '2026-09-17': 123, '2026-09-16': '123', '2026-09-15': -1, bad: 123 },
        '乙.txt': [],
        '丙.txt': null,
      },
    },
  });
  assert.equal(获取书籍前台毫秒('甲.txt'), 123, '坏一天丢一天，不牵连有效记录');
  // 时段记录出现之前的老日子只能靠这笔账回落；运行期不再新增，但保存时要原样写回
  更新前台停留计时('甲.txt', true, 起点);
  更新前台停留计时('甲.txt', false, 起点 + 60000);
  assert.deepEqual(前台停留统计快照().每日书籍毫秒, {
    '甲.txt': { '2026-09-17': 123 },
  }, '新的可见时长不再写进旧毫秒账');
});

test('visibility spans load under the legacy activation key too', () => {
  载入可见时段统计({
    前台停留统计: { 每日激活时段: { '2026-09-17': { '甲.txt': [[43200, 43230, 1]] } } },
  });
  assert.deepEqual(
    获取当日按书可见时段('2026-09-17', '甲.txt'),
    [[43200, 43230]],
    '旧键名 每日激活时段 读得回，多余的「种类」位丢掉',
  );
});
