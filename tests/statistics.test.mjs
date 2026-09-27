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

test('segment geometry clamps to the window', () => {
  const 窗口 = { 起秒: 39804, 止秒: 51000 };
  assert.equal(时段百分比(39804, 窗口), 0);
  assert.equal(时段百分比(51000, 窗口), 100);
  assert.equal(时段百分比(45402, 窗口), 50);
  assert.equal(时段百分比(10, null), 0);
  const 布局 = 计算时段布局([[10, 60000], [40000, 40100], ['x']], 窗口);
  assert.equal(布局.length, 2); // 字段不足的坏段被忽略
  assert.deepEqual(布局[0], { 起: 10, 止: 60000, 左: 0, 宽: 100 });
  assert.equal(Number(布局[1].左.toFixed(3)), 1.751);
  assert.equal(Number(布局[1].宽.toFixed(3)), 0.893);
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

// 灰带按「激活 ∪ 滚动」画：滚动必然发生在页面开着的时候，激活账缺的那段要用滚动段补上，
// 黑块底下不许踩在白轨上。补的时候重叠/相接要并成一段，且不许改到原数组。
test('activation band absorbs scroll segments so black never sits on white', () => {
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
