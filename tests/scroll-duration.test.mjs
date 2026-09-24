import assert from 'node:assert/strict';
import { test } from 'node:test';

// 时长会话住在 状态.js，导入它需要最小 DOM 桩（与 foreground.test.mjs 同一套）。
globalThis.document = { baseURI: 'http://127.0.0.1/', querySelector: () => null };
const {
  状态,
  统计,
  确保今日滚动统计,
  结转未入账滚动毫秒,
  开始滚动会话,
  结转滚动会话时长,
  结束滚动会话,
} = await import('../js/状态.js');

const 中午 = new Date(2026, 8, 18, 11, 3, 24).getTime();

function 清零(文件名 = '甲.txt') {
  状态.文件名 = 文件名;
  统计.今日滚动日期 = '';
  统计.今日滚动毫秒 = 0;
  统计.今日书籍滚动毫秒.clear();
  统计.书籍滚动毫秒.clear();
  统计.书籍每日滚动毫秒.clear();
  统计.未入账滚动毫秒 = 0;
  确保今日滚动统计();
}

test('duration ledger bills the wall-clock span of a scroll session', () => {
  清零();
  开始滚动会话(中午);
  结转滚动会话时长(中午 + 4000);
  结转滚动会话时长(中午 + 4000); // 同一时刻重复结清不重复入账
  结束滚动会话(中午 + 9000);
  结转未入账滚动毫秒();
  assert.equal(统计.未入账滚动毫秒, 0);
  assert.equal(统计.书籍滚动毫秒.get('甲.txt'), 9000);
  assert.equal(统计.今日书籍滚动毫秒.get('甲.txt'), 9000);
  assert.deepEqual(
    [...统计.书籍每日滚动毫秒.get('甲.txt')],
    [[统计.今日滚动日期, 9000]],
  );
});

test('re-triggering keeps one session and mid-session flush stays live', () => {
  清零();
  开始滚动会话(中午);
  开始滚动会话(中午 + 3000); // 自动滚动途中改按方向键：不重开、不丢已走过的时间
  结转滚动会话时长(中午 + 5000);
  assert.equal(统计.未入账滚动毫秒, 5000);
  结转未入账滚动毫秒();
  assert.equal(统计.今日滚动毫秒, 5000);
  结束滚动会话(中午 + 8000);
  结转未入账滚动毫秒();
  assert.equal(统计.今日滚动毫秒, 8000);
});

test('closed or bookless sessions bill nothing', () => {
  清零();
  结转滚动会话时长(中午 + 60000); // 没开会话
  结束滚动会话(中午 + 60000);
  assert.equal(统计.未入账滚动毫秒, 0);
  开始滚动会话(中午);
  状态.文件名 = ''; // 会话开着但没载入书：不入账也不报错
  结束滚动会话(中午 + 5000);
  结转未入账滚动毫秒();
  assert.equal(统计.未入账滚动毫秒, 5000);
  assert.equal(统计.今日滚动毫秒, 0);
});
