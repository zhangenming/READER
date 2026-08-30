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
const 正文类名 = new Set();

globalThis.document = {
  baseURI: 'http://127.0.0.1/',
  body: {
    classList: {
      add(类名) {
        正文类名.add(类名);
      },
      remove(类名) {
        正文类名.delete(类名);
      },
    },
  },
  documentElement: 空元素,
  querySelector() {
    return 空元素;
  },
  createElement() {
    return 空元素;
  },
};
globalThis.window = {
  getSelection() {
    return null;
  },
};
globalThis.localStorage = {
  getItem() {
    return null;
  },
};

const [
  { 状态 },
  { 查找关键词命中, 尝试自动扩展关键词 },
  {
    处理关键词手势开始,
    处理关键词手势移动,
    处理关键词手势松开,
    处理关键词手势取消,
  },
  { 获取文本字素分段, 清除文本字素分段缓存 },
] = await Promise.all([
  import('../js/状态.js'),
  import('../js/关键词.js'),
  import('../js/关键词手势.js'),
  import('../js/文本工具.js'),
]);

状态.文本 = '甲😀乙😀甲';
assert.deepEqual(Array.from(查找关键词命中('')), []);
assert.deepEqual(Array.from(查找关键词命中('😀')), [1, 4]);
assert.deepEqual(Array.from(查找关键词命中('\ud83d')), []);
assert.deepEqual(Array.from(查找关键词命中('😀乙')), [1]);

状态.文本 = '哈哈哈';
assert.deepEqual(Array.from(查找关键词命中('哈哈')), [0, 1]);

状态.文本 = 'e\u0301|e';
assert.deepEqual(Array.from(查找关键词命中('e')), [3]);
assert.deepEqual(Array.from(查找关键词命中('e\u0301')), [0]);

const 第一次分段 = 获取文本字素分段(状态.文本);
assert.strictEqual(获取文本字素分段(状态.文本), 第一次分段);
状态.文本 = '新的文本';
assert.notStrictEqual(获取文本字素分段(状态.文本), 第一次分段);
const 清除前分段 = 获取文本字素分段(状态.文本);
清除文本字素分段缓存();
assert.notStrictEqual(获取文本字素分段(状态.文本), 清除前分段);

状态.文本 = '甲乙甲乙';
assert.deepEqual(尝试自动扩展关键词('甲', 0), { 词: '甲乙', 起点: 0 });

状态.文本 = 'e\u0301甲e\u0301甲';
assert.deepEqual(尝试自动扩展关键词('甲', 2), { 词: 'e\u0301甲', 起点: 0 });

const 命中字元素 = {
  classList: {
    contains(类名) {
      return 类名 === '命中';
    },
  },
  dataset: { keywordId: '1', hitIndex: '0' },
};
const 命中目标 = {
  closest() {
    return 命中字元素;
  },
};
assert.equal(处理关键词手势开始(创建指针事件(2, false)), false);
assert.equal(处理关键词手势开始(创建指针事件(1, true)), true);
处理关键词手势移动({ ...创建指针事件(2, false), clientY: 100 });
assert.equal(正文类名.has('关键词手势中'), false);
assert.equal(处理关键词手势松开(创建指针事件(2, false)), false);
处理关键词手势移动({ ...创建指针事件(1, true), clientY: 100 });
assert.equal(正文类名.has('关键词手势中'), true);
assert.equal(处理关键词手势取消(创建指针事件(2, false)), false);
assert.equal(正文类名.has('关键词手势中'), true);
assert.equal(处理关键词手势取消(创建指针事件(1, true)), true);
assert.equal(正文类名.has('关键词手势中'), false);

assert.equal(处理关键词手势开始(创建指针事件(3, true)), true);
assert.equal(处理关键词手势取消(创建指针事件(4, false)), false);
assert.equal(处理关键词手势松开(创建指针事件(3, true)), true);

console.log('✓ 关键词命中遵守字素边界，且多指事件不会串扰当前手势');

function 创建指针事件(pointerId, isPrimary) {
  return {
    button: 0,
    pointerId,
    isPrimary,
    target: 命中目标,
    clientX: 0,
    clientY: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    cancelable: true,
    preventDefault() {},
  };
}
