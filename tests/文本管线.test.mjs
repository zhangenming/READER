import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';

// The pipeline imports shared browser state, but these tests exercise only text transforms.
globalThis.document = {
  baseURI: 'http://localhost/',
  querySelector: () => null,
};
globalThis.scheduler = { yield: setImmediate };
const { 规范化文本, 创建引文索引, 整理句子换行 } = await import(
  '../js/文本管线.js'
);
const 有效 = () => true;

test('strips the paragraph-leading indentation whitespace the source ships with', async () => {
  const 文本 = await 规范化文本(
    '\uFEFF　　且说妲己见未曾拿住殷郊， 复进言曰：\n  \u3000其祸不小。\n\t缩进制表符。',
    有效,
  );
  assert.equal(
    文本,
    '且说妲己见未曾拿住殷郊， 复进言曰：\n其祸不小。\n缩进制表符。',
  );
});

test('mid-line spaces survive: full-width title separators and prose spacing', async () => {
  assert.equal(await 规范化文本('第一回　风雪。', 有效), '第一回　风雪。');
  assert.equal(
    await 规范化文本('　　行中空格 与全角空格　都保留。', 有效),
    '行中空格 与全角空格　都保留。',
  );
});

test('an indented-only line collapses to an empty paragraph line', async () => {
  assert.equal(
    await 规范化文本('上段。\n　　\n下段。', 有效),
    '上段。\n\n下段。',
  );
});

test('stripping keeps the newline count so chapter line numbers stay put', async () => {
  const 原文 = '　　第一回 开端\n　　正文?开始。\r\n　　第二回 归来\n';
  const 文本 = await 规范化文本(原文, 有效);
  assert.equal(文本, '第一回 开端\n正文？开始。\n第二回 归来\n');
  assert.equal(文本.split('\n').length, 原文.split('\n').length);
});

test('paragraph starts land on real characters for the downstream indent tracking', async () => {
  const 文本 = await 规范化文本(
    '　　且说妲己进宫候旨。\n　　纣王问曰：「可曾拿了？」',
    有效,
  );
  const 结果 = await 整理句子换行(
    文本,
    (await 创建引文索引(文本, 有效)).边界列表,
    有效,
  );
  assert.deepEqual([...结果.缩进起点集合], [10]);
  assert.equal(结果.文本[10], '纣');
});

test('an indented continued quotation still spans paragraphs', async () => {
  const 文本 = await 规范化文本(
    '他说：“第一段。\n　　“第二段。”他说完。\n后来没事。',
    有效,
  );
  const 边界列表 = (await 创建引文索引(文本, 有效)).边界列表;
  const 片段 = [];
  for (let idx = 0; idx < 边界列表.length; idx += 2) {
    片段.push(文本.slice(边界列表[idx], 边界列表[idx + 1]));
  }
  assert.deepEqual(片段, ['第一段。\n“第二段。']);
});

const 实书目录 = new URL('../txt/', import.meta.url);

test('real book: 封神演义 keeps no paragraph-leading whitespace after normalization', async () => {
  const 原文 = await readFile(new URL('封神演义.txt', 实书目录), 'utf8');
  const 文本 = await 规范化文本(原文, 有效);
  assert.equal(文本.match(/(^|\n)[\t \u00a0\u3000]/), null);
});
