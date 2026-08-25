import assert from 'node:assert/strict';

const 空元素 = new Proxy(
  {},
  {
    get(目标, 键) {
      if (键 === 'getContext') {
        return function 获取画布上下文() {
          return {};
        };
      }
      if (键 === 'append') {
        return function 追加元素() {};
      }
      return 空元素;
    },
  },
);
const 存储 = new Map();

globalThis.document = {
  baseURI: 'http://127.0.0.1/',
  querySelector() {
    return 空元素;
  },
  createElement() {
    return 空元素;
  },
};
globalThis.localStorage = {
  getItem(键) {
    return 存储.get(键) ?? null;
  },
};

const { 读取持久化数据 } = await import('../js/持久化.js');

验证('无持久化数据', {}, { 当前文件名: '', 文本状态: {} });
验证(
  '合法 v1 数据',
  {
    '原文阅读器:阅读状态:v1': JSON.stringify({
      文件名: '旧书.txt',
      阅读偏移: 12,
    }),
  },
  {
    当前文件名: '旧书.txt',
    文本状态: { '旧书.txt': { 文件名: '旧书.txt', 阅读偏移: 12 } },
  },
);
验证(
  '非法 v1 文件名',
  {
    '原文阅读器:阅读状态:v1': JSON.stringify({ 文件名: '../旧书.txt' }),
  },
  { 当前文件名: '', 文本状态: {} },
);
验证(
  'v2 数据优先',
  {
    '原文阅读器:阅读状态:v1': JSON.stringify({ 文件名: '旧书.txt' }),
    '原文阅读器:阅读状态:v2': JSON.stringify({
      当前文件名: '新书.txt',
      文本状态: { '新书.txt': { 文件名: '新书.txt' } },
    }),
  },
  {
    当前文件名: '新书.txt',
    文本状态: { '新书.txt': { 文件名: '新书.txt' } },
  },
);

function 验证(名称, 数据, 预期) {
  存储.clear();
  for (const [键, 值] of Object.entries(数据)) {
    存储.set(键, 值);
  }
  assert.deepEqual(读取持久化数据(), 预期);
  console.log(`✓ ${名称}`);
}
