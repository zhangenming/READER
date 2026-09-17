import assert from 'node:assert/strict';
import { test } from 'node:test';
import { 格式化统计时长, 格式化统计日期 } from '../js/阅读统计.js';

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
