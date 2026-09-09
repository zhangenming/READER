import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';

const css变量 = new Map([
  ['--正文字号', '31'],
  ['--行高', '32'],
  ['--西文字号', '0.95'],
  ['--正文字体', 'serif'],
  ['--西文字体', 'serif'],
  ['--正文粗细', '100'],
  ['--引文粗细', '900'],
  ['--正文左留白', '0'],
  ['--末处标记留白比例', '0'],
]);
const 节点 = new Map();
let 几何读取次数 = 0;
function 元素替身(选择器) {
  if (!节点.has(选择器)) {
    const 属性 = new Map();
    节点.set(选择器, {
      style: {},
      classList: { add() {}, remove() {}, contains: () => false },
      clientWidth: 800,
      clientHeight: 200,
      scrollHeight: 2000,
      scrollTop: 0,
      textContent: '',
      open: false,
      hidden: true,
      setAttribute: (键, 值) => 属性.set(键, 值),
      getAttribute: (键) => 属性.get(键),
    });
  }
  return 节点.get(选择器);
}
globalThis.document = {
  baseURI: 'http://localhost/',
  documentElement: {},
  querySelector: 元素替身,
  createElement: () => ({
    getContext: () => ({
      measureText: (文字) => ({ width: 文字.length * 10 }),
    }),
  }),
};
globalThis.window = { innerWidth: 800 };
globalThis.scheduler = { yield: setImmediate };
globalThis.getComputedStyle = () => ({
  getPropertyValue: (名称) => css变量.get(名称) ?? '',
});
const { 状态, 元素 } = await import('../js/状态.js');
const { 创建行索引, 提交行索引, 读取正文排版, 重建行索引, 查找偏移所在行 } =
  await import('../js/排版引擎.js');
const { 更新滚动块位置 } = await import('../js/滚动条.js');
const { 读取当前章节 } = await import('../js/章节目录.js');

test(
  'font-driven reflow commits current CSS line height after capturing the old text anchor',
  { timeout: 3000 },
  async () => {
    状态.文本 = '第一章\n甲乙丙丁\n第二章\n后续正文';
    状态.字号 = 31;
    状态.行高 = 32;
    状态.缩进起点集合 = new Set();
    const 旧索引 = await 创建行索引(
      状态.文本,
      读取正文排版(),
      new Set(),
      null,
      () => true,
    );
    提交行索引(旧索引);
    const 偏移 = 状态.文本.indexOf('第二章');
    元素.滚动容器.scrollTop = 查找偏移所在行(偏移) * 32;
    css变量.set('--正文字号', '40');
    css变量.set('--行高', '40');
    状态.字号 = 40;
    await new Promise((resolve) => 重建行索引(读取正文排版(), null, resolve));
    assert.equal(状态.行高, 40);
    assert.equal(状态.排版键, 读取正文排版().键);
    assert.equal(元素.滚动容器.scrollTop, 查找偏移所在行(偏移) * 40);
  },
);

test('chapter progress reuses supplied geometry and floating-point scroll positions', () => {
  Object.defineProperties(元素.滚动容器, {
    clientHeight: {
      configurable: true,
      get() {
        几何读取次数++;
        return 200;
      },
    },
    scrollHeight: {
      configurable: true,
      get() {
        几何读取次数++;
        return 2000;
      },
    },
  });
  状态.文件名 = '测试.txt';
  状态.文本 = '甲'.repeat(200);
  状态.行高 = 30;
  状态.行起点列表 = new Uint32Array([0, 50, 100, 150]);
  状态.章节列表 = [
    { 标题: '第一章', 类型: '章节', 偏移: 0 },
    { 标题: '第二章', 类型: '章节', 偏移: 100 },
  ];
  const 度量 = { 轨道高度: 200, 容器高度: 200, 滚动高度: 2000 };
  几何读取次数 = 0;
  for (let idx = 0; idx < 60; idx++) 更新滚动块位置(度量, 59.6);
  assert.equal(几何读取次数, 0);
  assert.ok(元素.章节目录按钮.title.includes('第二章'));
  assert.deepEqual(读取当前章节(1800, 1800), { 索引: 1, 进度: 1 });
  assert.equal(几何读取次数, 0);
  assert.equal(读取当前章节(60).索引, 1);
  assert.equal(几何读取次数, 2);
});
