import assert from 'node:assert/strict';
import { test } from 'node:test';
import { 格式化统计时长 } from '../js/阅读统计.js';

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
