import assert from 'node:assert/strict';
import { test } from 'node:test';

// js/常量.js 顶层用到 document.baseURI，Node 下先补最小桩（同其他测试的做法）。
globalThis.document = { baseURI: 'http://127.0.0.1/' };

const { 是数字字素 } = await import('../js/文本工具.js');

test('数字字素：整数、小数与汉字数字照常判定', () => {
  for (const 样本 of ['25', '10', '0', '3.14', '1984', '〇', '一二三']) {
    assert.equal(是数字字素(样本), true, 样本);
  }
});

test('数字字素：千分位分隔符并进同一西文片段，须整体判定为数字', () => {
  for (const 样本 of [
    '6 000',
    '16 000',
    '500 000',
    '6 000 000',
    '555,000',
    '6\u00a0000',
  ]) {
    assert.equal(是数字字素(样本), true, 样本);
  }
});

test('数字字素：聚合片段首尾带入的空格（「军 200余人」聚成「 200」）', () => {
  for (const 样本 of [' 200', '805 ', ' 24 000 ', '\u00a0200']) {
    assert.equal(是数字字素(样本), true, 样本);
  }
});

test('数字字素：非数字片段不误判', () => {
  for (const 样本 of ['W', 'the 3', '1/16', '000 1/16', ' ', '', '1, 2', 'a1']) {
    assert.equal(是数字字素(样本), false, 样本);
  }
});
