import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// js/常量.js 顶层用到 document.baseURI，Node 下先补最小桩（同其他测试的做法）。
globalThis.document = { baseURI: 'http://127.0.0.1/' };

const { 收集片段边界, 是西文范围 } = await import('../js/文本工具.js');

const 分段器 = new Intl.Segmenter('zh', { granularity: 'grapheme' });
const 字素数 = (文本) => [...分段器.segment(文本)].length;

// 返回每个片段的字文本，便于按「一格装了几个字」断言。
function 切片(行文本, 关键词游标列表 = []) {
  const 边界 = 收集片段边界(0, 行文本.length, 行文本, 关键词游标列表);
  const 片 = [];
  for (let idx = 0; idx < 边界.length - 1; idx += 1) {
    片.push(行文本.slice(边界[idx], 边界[idx + 1]));
  }
  return 片;
}

test('连续符号各占一格：「──」不得挤进一个 1em 字格压在后面的字上', () => {
  assert.deepEqual(切片('──郑伦也曾拜'), [
    '─',
    '─',
    '郑',
    '伦',
    '也',
    '曾',
    '拜',
  ]);
  assert.deepEqual(切片('※※※分隔'), ['※', '※', '※', '分', '隔']);
  assert.deepEqual(切片('•••与□□及○○'), [
    '•',
    '•',
    '•',
    '与',
    '□',
    '□',
    '及',
    '○',
    '○',
  ]);
});

test('西文仍按词连排，不拆成单字母', () => {
  assert.deepEqual(切片('Cloudflare 用 1984 年'), [
    'Cloudflare ',
    '用',
    ' 1984 ',
    '年',
  ]);
  assert.deepEqual(切片('3.14 是 π'), ['3.14 ', '是', ' ', 'π']);
});

test('命中边界切开西文片段，让命中底色逐字接管', () => {
  const 游标 = [{ 关键词: { 文本: 'ab', 命中位置: [1] }, idx: 0 }];
  assert.deepEqual(切片('xabc中', 游标), ['x', 'ab', 'c', '中']);
});

test('非西文片段一律一字一格：整库扫描不出多字格', () => {
  const 目录 = new URL('../txt/', import.meta.url).pathname;
  const 样本 = readdirSync(目录).filter((名) => 名.endsWith('.txt'));
  assert.ok(样本.length > 0, 'txt 目录没有样本文件');
  let 已扫行数 = 0;
  for (const 名 of 样本) {
    const 文本 = readFileSync(join(目录, 名), 'utf8');
    for (const 行文本 of 文本.split('\n')) {
      if (!行文本) continue;
      已扫行数 += 1;
      if (已扫行数 > 20000) break;
      for (const 片 of 切片(行文本)) {
        if (是西文范围(片, 0, 片.length)) continue;
        assert.equal(
          字素数(片),
          1,
          `${名}：片段「${片}」占了 ${字素数(片)} 个字格却没有 .西文`,
        );
      }
    }
  }
});
