import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { TextDecoder } from 'node:util';

// The pipeline imports shared browser state, but these tests exercise only text transforms.
globalThis.document = {
  baseURI: 'http://localhost/',
  querySelector: () => null,
};
globalThis.scheduler = { yield: setImmediate };
const { 创建章节索引, 计算章节进度 } = await import('../js/章节索引.js');
const { 规范化文本, 创建引文索引, 整理句子换行 } = await import(
  '../js/文本管线.js'
);
const 有效 = () => true;

async function 处理文本(原文) {
  const 文本 = await 规范化文本(原文, 有效);
  const 章节 = await 创建章节索引(文本);
  const 引文 = await 创建引文索引(文本, 有效);
  const 结果 = await 整理句子换行(文本, 引文.边界列表, 有效, 章节);
  return { ...结果, 原章节: 章节, 规范文本: 文本 };
}

test('recognizes Chinese, full-width, volume, prologue and explicit English headings', async () => {
  const 标题 = [
    '序章',
    '第十二章',
    '　第三回 风雨',
    '第１２章：出发',
    '第贰拾章 遇见',
    '卷一 起点',
    '第二卷',
    '第三部分 归途',
    'Chapter IV: Return',
    '尾声',
  ];
  const 原文 = 标题.join('\n这里是正文，不是标题。\n');
  const 章节 = await 创建章节索引(原文);
  assert.deepEqual(
    章节.map((项) => 项.标题),
    标题.map((项) => 项.trim()),
  );
  assert.equal(章节[0].偏移, 0);
  assert.equal(章节.filter((项) => 项.类型 === '分卷').length, 3);
});

test('ignores inline mentions, prose, numbered lists and oversized lines', async () => {
  const 原文 = [
    '他说第一章应该重读。',
    '第一辆马车的轿篷里竟坐着李妃和芸娘。',
    '第十三研究室的门上挂着牌子。',
    '一、德业相劝',
    '二、过失相规',
    '8.你在高中阶段赚过钱吗？',
    '如何赚钱的？',
    '第一章讲述了他的往事。',
    '第一章 ' + '很长的正文'.repeat(50),
  ].join('\n');
  assert.deepEqual(await 创建章节索引(原文), []);
});

test('skips both front and back contents without globally deduplicating repeated volume chapters', async () => {
  const 目录 = '目录\n楔子\n第一章 开端\n第二章 归来\n';
  const 正文 = '楔子\n序幕。\n第一章 开端\n正文。\n第二章 归来\n结尾。\n';
  const 原文 = 目录 + 正文 + 目录;
  const 章节 = await 创建章节索引(原文);
  assert.equal(章节.length, 3);
  assert.equal(章节[0].偏移, 目录.length);
  const 分卷 = '第一卷\n第一章\n正文。\n第二卷\n第一章\n更多正文。';
  assert.equal((await 创建章节索引(分卷)).length, 4);
});

test('skips a one-chapter contents block', async () => {
  const 原文 = '目录\n第一章\n\n第一章\n正文。';
  const 章节 = await 创建章节索引(原文);
  assert.equal(章节.length, 1);
  assert.equal(章节[0].偏移, 原文.lastIndexOf('第一章'));
});

test('contents page numbers do not swallow the first body chapter', async () => {
  const 目录 = '目录\n第一章 开端 1\n第二章 归来……20\n\n';
  const 正文 = '第一章 开端\n正文。\n第二章 归来\n结尾。';
  const 章节 = await 创建章节索引(目录 + 正文);
  assert.equal(章节.length, 2);
  assert.equal(章节[0].偏移, 目录.length);
});

test('volume-scoped repeats in back contents are never body chapters', async () => {
  const 目录 = '目录\n第一卷\n第一章\n第二卷\n第一章\n第二章\n';
  const 正文 =
    '第一卷\n第一章\n正文。\n第二卷\n第一章\n正文。\n第二章\n结尾。\n';
  const 章节 = await 创建章节索引(目录 + 正文 + 目录);
  assert.equal(章节.length, 5);
  assert.equal(章节[0].偏移, 目录.length);
  assert.ok(章节.every((项) => 项.偏移 < 目录.length + 正文.length));
});

test('only enables bare English numbering for a continuous bilingual sequence', async () => {
  const 原文 = ['One', 'Two', 'Three']
    .map((词, idx) => `${idx + 1} ${词}\n\n中文标题\n正文。\n\n`)
    .join('');
  assert.equal((await 创建章节索引(原文)).length, 3);
  assert.equal((await 创建章节索引('1 Example\n\n正文说明\n正文。')).length, 0);
});

test('maps UTF-16 offsets through BOM, CRLF, astral characters and inserted sentence breaks', async () => {
  const 原文 =
    '\uFEFF😀前文。还有一段！\r\n第一章 为什么？然后出发！\r\n他说：“走吧！现在走。”后面...\r\n  第二章 后续\r\n结束。';
  const 结果 = await 处理文本(原文);
  assert.equal(结果.章节列表.length, 2);
  assert.equal(结果.章节列表[0].标题, '第一章 为什么？然后出发！');
  for (const 章节 of 结果.章节列表) {
    const 首行 = 章节.标题.split('？')[0];
    assert.ok(结果.文本.slice(章节.偏移).trimStart().startsWith(首行));
  }
  assert.ok(结果.章节列表[1].偏移 > 结果.原章节[1].偏移);
  const 无目录 = await 整理句子换行(
    结果.规范文本,
    (await 创建引文索引(结果.规范文本, 有效)).边界列表,
    有效,
  );
  assert.equal(结果.文本, 无目录.文本);
  assert.deepEqual(结果.引文边界列表, 无目录.引文边界列表);
  assert.deepEqual(结果.缩进起点集合, 无目录.缩进起点集合);
});

async function 引文片段(原文) {
  const 文本 = await 规范化文本(原文, 有效);
  const { 边界列表 } = await 创建引文索引(文本, 有效);
  const 片段 = [];
  for (let idx = 0; idx < 边界列表.length; idx += 2) {
    片段.push(文本.slice(边界列表[idx], 边界列表[idx + 1]));
  }
  return 片段;
}

test('an unclosed quote stops at the end of its own paragraph', async () => {
  assert.deepEqual(
    await 引文片段(
      '他说：“走吧。她坚持改名‘甲”。很麻烦。\n显然他不会让步。\n“好主意。”他说完。',
    ),
    ['走吧。她坚持改名‘甲”。很麻烦。', '好主意。'],
  );
});

test('a quotation continued by opening quotes still spans paragraphs', async () => {
  assert.deepEqual(
    await 引文片段(
      '他说：“第一段。\n\n“第二段。\n\n“第三段。”他说完。\n后来没事。',
    ),
    ['第一段。\n\n“第二段。\n\n“第三段。'],
  );
});

test('a nested quote inside a continued quotation does not end it', async () => {
  assert.deepEqual(
    await 引文片段(
      '他续道：“第一段。\n“位列‘青城四秀’之首。\n“末段。”他说完。\n后来没事。',
    ),
    ['第一段。\n“位列‘青城四秀’之首。\n“末段。'],
  );
});

test('a quote closed at a paragraph end does not gain a blank line', async () => {
  const 原文 = '他说：“走吧。很麻烦。\n显然他不让步。\n结束。';
  const 文本 = await 规范化文本(原文, 有效);
  const 结果 = await 整理句子换行(
    文本,
    (await 创建引文索引(文本, 有效)).边界列表,
    有效,
  );
  assert.equal(结果.文本.match(/\n\n/g), null);
});

test('an inserted newline at a tracked offset counts before that offset', async () => {
  const 结果 = await 整理句子换行('前。第一章', new Uint32Array(), 有效, [
    { 标题: '第一章', 偏移: 2, 类型: '章节' },
  ]);
  assert.equal(结果.章节列表[0].偏移, 3);
  assert.equal(结果.文本.slice(3), '第一章');
});

test('current chapter lookup handles preface, boundaries, EOF and no chapters', () => {
  const 章节 = [{ 偏移: 10 }, { 偏移: 30 }, { 偏移: 90 }];
  assert.deepEqual(计算章节进度([], 0, 0), { 索引: -1, 进度: 0 });
  assert.deepEqual(计算章节进度(章节, 0, 100), { 索引: -1, 进度: 0 });
  assert.deepEqual(计算章节进度(章节, 20, 100), { 索引: 0, 进度: 0.5 });
  assert.deepEqual(计算章节进度(章节, 30, 100), { 索引: 1, 进度: 0 });
  assert.deepEqual(计算章节进度(章节, 100, 100), { 索引: 2, 进度: 1 });
  assert.deepEqual(计算章节进度([{ 偏移: 0 }], 0, 0), { 索引: 0, 进度: 0 });
});

test('cancels superseded scans and handles large chapter lists', async () => {
  const 原文 = Array.from(
    { length: 10000 },
    (_, idx) => `第${idx + 1}章 标题\n正文。\n`,
  ).join('');
  let 检查次数 = 0;
  assert.equal(await 创建章节索引(原文, () => ++检查次数 < 3), null);
  const 章节 = await 创建章节索引(原文);
  assert.equal(章节.length, 10000);
  assert.equal(计算章节进度(章节, 章节[9999].偏移, 原文.length).索引, 9999);
  assert.equal(await 创建章节索引('', () => false), null);
});

const 实书目录 = new URL('../txt/', import.meta.url);
const 实书文件 = await readdir(实书目录);
const 实书断言 = [
  ['成吉思汗.txt', 11, '第一章 当时之诸部族', 50],
  ['大明王朝1566', 39, '第一章', 86],
  ['嫌疑人X', 19, '第一章', 1],
  ['成吉思汗与今日世界之形成', 10, '1 The Blood Clot · 一块凝血', 369],
  ['白鹿原', 34, '第一章', 53],
  ['秦二世必须死', 27, '第1章 柱下史的野心', 89],
  ['香农传', 32, '第1章 小镇男孩的科学基因', 415],
];
for (const [前缀, 数量, 首章, 行号] of 实书断言) {
  test(`real book: ${前缀}, ${数量} body chapters and exact first heading`, async () => {
    const 文件名 = 实书文件.find((名称) => 名称.startsWith(前缀));
    assert.ok(文件名);
    const 原文 = await readFile(new URL(文件名, 实书目录), 'utf8');
    const 结果 = await 处理文本(原文);
    assert.equal(结果.原章节.filter((项) => 项.类型 === '章节').length, 数量);
    const 章节 = 结果.原章节.find((项) => 项.标题 === 首章);
    assert.ok(章节, `missing ${首章}`);
    assert.equal(结果.规范文本.slice(0, 章节.偏移).split('\n').length, 行号);
    for (const 项 of 结果.章节列表) {
      assert.ok(
        结果.文本
          .slice(项.偏移)
          .trimStart()
          .startsWith(项.标题.split(' · ')[0]),
        `offset for ${项.标题}`,
      );
    }
  });
}

test('all bundled text files are valid UTF-8', async () => {
  const 无效文件 = [];
  for (const 文件名 of 实书文件.filter((名称) =>
    名称.toLowerCase().endsWith('.txt'),
  )) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(
        await readFile(new URL(文件名, 实书目录)),
      );
    } catch {
      无效文件.push(文件名);
    }
  }
  assert.deepEqual(无效文件, []);
});
