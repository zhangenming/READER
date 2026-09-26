import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  清理关键词行,
  解析批量关键词,
  描述批量解析,
  描述批量导入结果,
} from '../js/批量导入解析.js';

test('trims edges and drops zero-width characters, keeps inner spaces', () => {
  assert.equal(清理关键词行('  国民党\u200b '), '国民党');
  assert.equal(清理关键词行('\ufeff蒋 介石\r'), '蒋 介石');
  assert.equal(清理关键词行('\t\n'), '');
});

test('counts blank, repeated and existing lines so the totals reconcile', () => {
  const 解析 = 解析批量关键词(
    ['国民党', '', '  ', '国民党', '共党', '共党', '蒋介石'].join('\n'),
    new Set(['共党', '孙兰峰']),
  );
  // 7 行 = 待导入 2 + 已存在 1 + 本次重复 2 + 空行 2
  assert.equal(解析.总行数, 7);
  assert.deepEqual(解析.待导入列表, ['国民党', '蒋介石']);
  assert.equal(解析.已存在数, 1);
  assert.equal(解析.重复行数, 2);
  assert.equal(解析.空行数, 2);
  assert.equal(
    解析.待导入列表.length + 解析.已存在数 + 解析.重复行数 + 解析.空行数,
    解析.总行数,
  );
});

test('splits on CRLF and lone CR, keeps input order', () => {
  const 解析 = 解析批量关键词('乙\r\n甲\r丙', new Set());
  assert.deepEqual(解析.待导入列表, ['乙', '甲', '丙']);
});

test('empty input reports no lines at all', () => {
  const 解析 = 解析批量关键词('', new Set());
  assert.equal(解析.总行数, 0);
  assert.equal(描述批量解析(解析), '');
});

test('feedback line omits zero categories and reads as one account', () => {
  assert.equal(
    描述批量解析(解析批量关键词('国民党\n共党\n', new Set(['共党']))),
    '共 3 行 · 待导入 1 · 已存在 1 · 空行 1',
  );
  assert.equal(
    描述批量解析(解析批量关键词('甲\n甲\n甲', new Set())),
    '共 3 行 · 待导入 1 · 本次重复 2',
  );
});

test('result line reconciles against the pending count', () => {
  assert.equal(描述批量导入结果(3, []), '已导入 3');
  assert.equal(
    描述批量导入结果(0, ['张三', '李四']),
    '本书未出现 2：「张三」、「李四」',
  );
  assert.equal(
    描述批量导入结果(2, ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬']),
    '已导入 2 · 本书未出现 9：「甲」、「乙」、「丙」、「丁」、「戊」、「己」、「庚」、「辛」… 共 9 个',
  );
  assert.equal(描述批量导入结果(0, []), '');
});
