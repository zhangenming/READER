import assert from 'node:assert/strict';

const 滚动容器 = { clientHeight: 0 };
const 虚拟画布 = { clientWidth: 800, style: {} };
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
globalThis.document = {
  baseURI: 'http://localhost/',
  // 排版引擎会把「不足一字的余量」写回 --章节轨道宽度：桩里让它落进同一张变量表，
  // 读回来即是刚写下的值，与浏览器里 setProperty → getComputedStyle 的往返一致。
  documentElement: {
    clientWidth: 800,
    style: {
      setProperty(变量名, 值) {
        css变量.set(变量名, 值);
      },
    },
  },
  querySelector(选择器) {
    if (选择器 === '#滚动容器') {
      return 滚动容器;
    }
    if (选择器 === '#虚拟画布') {
      return 虚拟画布;
    }
    return {};
  },
};
globalThis.window = { innerWidth: 800 };
globalThis.getComputedStyle = function getComputedStyle() {
  return {
    getPropertyValue(变量名) {
      return css变量.get(变量名) ?? '';
    },
  };
};

const [{ 提交行索引, 创建排版键, 读取正文排版 }, { 状态 }] = await Promise.all([
  import('../js/排版引擎.js'),
  import('../js/状态.js'),
]);

const 旧排版 = 读取正文排版();
css变量.set('--行高', '36');
const 新排版 = 读取正文排版();
assert.equal(新排版.换行键, 旧排版.换行键, '行高不应影响换行键');
assert.notEqual(新排版.键, 旧排版.键, '完整排版键应记录行高变化');

状态.文本 = '甲\n乙\n丙';
状态.行高 = 36;
状态.句段负担总合 = 54;

const 总高度 = 提交行索引({
  行起点列表: new Uint32Array([0, 2, 4]),
  行终点列表: new Uint32Array([1, 3, 5]),
  行逻辑索引: new Uint32Array([0, 1, 2]),
  行段落索引: new Uint32Array([0, 1, 2]),
  行阶梯索引: null,
  换行键: '宽度:800|字号:30',
  行高: 30,
  总高度: 90,
});

assert.equal(状态.行高, 36, '在途任务不应覆盖当前行高');
assert.equal(总高度, 108, '总高度应按当前行高重算');
assert.equal(虚拟画布.style.height, '108px');
assert.equal(状态.换行键, '宽度:800|字号:30');
assert.equal(状态.排版键, 创建排版键(状态.换行键, 36));
assert.equal(状态.全文负担密度, 0.5);

console.log('✓ 在途排版结果保留最新行高');
