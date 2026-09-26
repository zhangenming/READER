// 守门脚本：正文长度漂移时关键词必须仍然恢复（回归自 2026-09-24 的关键词丢失事故）。
// 背景：app.js 旧实现用 `持久化状态.文本长度 !== 状态.文本.length` 一并拦住关键词与
// 阅读位置的恢复，而关键词只存文本、命中位置按当前正文重扫，本不受长度影响；
// 管道规则一改（45a85cd 的 spk 兜底），5 本书长度漂移，被再次打开的书其关键词先不恢复、
// 再被下一次保存用空列表覆盖。
// 运行：node tmp/verify-关键词跨漂移恢复.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

globalThis.document = {
  baseURI: 'http://127.0.0.1/',
  documentElement: 空元素,
  body: 空元素,
  querySelector() {
    return 空元素;
  },
  createElement() {
    return 空元素;
  },
};
globalThis.window = {
  innerWidth: 800,
  clearTimeout() {},
  setTimeout() {
    return 1;
  },
};
globalThis.getComputedStyle = function 获取计算样式() {
  return {
    getPropertyValue() {
      return '';
    },
  };
};
globalThis.localStorage = {
  getItem() {
    return null;
  },
  setItem() {},
};

const { 判断持久化恢复范围, 是有效持久化关键词, 折算持久化阅读位置 } =
  await import('../js/持久化.js');

// 真实事故里的两组数：大明王朝1566 在 45a85cd 前后各差 3 个字符、秦二世差 110 个。
const 旧长度 = 673001;
const 新长度 = 672998;
const 关键词 = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    文本: `词${i}`,
    当前命中idx: 0,
    配色idx: i % 6,
  }));
const 记录 = (覆盖 = {}) => ({
  文件名: '大明王朝1566.txt',
  文本长度: 旧长度,
  阅读偏移: 336500,
  行内比例: 0.5,
  关键词列表: 关键词(237),
  ...覆盖,
});

// —— 1. 长度漂移不再牵连关键词 ——
const 漂移 = 判断持久化恢复范围(记录(), '大明王朝1566.txt', 新长度);
assert.equal(漂移.长度漂移, true, '长度不等必须报漂移');
assert.equal(漂移.关键词列表?.length, 237, '漂移必须仍然带回 237 个关键词');
assert.ok(漂移.阅读位置, '漂移时阅读位置要折算而不是丢弃');
assert.ok(
  漂移.阅读位置.阅读偏移 > 336490 && 漂移.阅读位置.阅读偏移 < 336510,
  `折算后应仍在原比例附近，实际 ${漂移.阅读位置.阅读偏移}`,
);

// —— 2. 长度一致时精确恢复，不做无谓折算 ——
const 精确 = 判断持久化恢复范围(记录(), '大明王朝1566.txt', 旧长度);
assert.equal(精确.长度漂移, false, '长度一致不该报漂移');
assert.equal(精确.阅读位置.阅读偏移, 336500, '长度一致必须原样回到旧偏移');

// —— 3. 换书与损坏记录仍然拒绝 ——
assert.deepEqual(
  判断持久化恢复范围(记录(), '另一本书.txt', 旧长度),
  { 关键词列表: null, 阅读位置: null, 长度漂移: false },
  '文件名不同不得带回任何内容',
);
assert.equal(
  判断持久化恢复范围(null, '大明王朝1566.txt', 旧长度).关键词列表,
  null,
  '没有持久化记录时不该凭空造词',
);
assert.equal(
  判断持久化恢复范围(记录({ 关键词列表: '坏了' }), '大明王朝1566.txt', 旧长度)
    .关键词列表,
  null,
  '关键词列表不是数组时按缺失处理',
);
assert.equal(
  折算持久化阅读位置({ 阅读偏移: NaN, 行内比例: 0, 文本长度: 旧长度 }, 新长度),
  null,
  '阅读位置非法时返回 null，交给调用方从头开始',
);

// —— 4. 单条坏数据只丢那一条，不再整表抛错 ——
const 混入 = [
  { id: 1, 文本: '嘉靖', 当前命中idx: 0, 配色idx: 0 },
  { id: 2, 当前命中idx: 0, 配色idx: 0 },
  { id: '三', 文本: '严嵩', 当前命中idx: 0, 配色idx: 0 },
  { id: 4, 文本: '', 当前命中idx: 0, 配色idx: 0 },
  { id: 5, 文本: '严世蕃', 当前命中idx: 0, 配色idx: 0 },
];
assert.deepEqual(
  混入.filter(是有效持久化关键词).map((项) => 项.文本),
  ['嘉靖', '严世蕃'],
  '缺文本、id 非数值、空文本都要被剔掉，其余照常恢复',
);

// —— 5. 折算不得越界 ——
assert.equal(
  折算持久化阅读位置(
    { 阅读偏移: 999999, 行内比例: 3, 文本长度: 100 },
    新长度,
  ).阅读偏移,
  新长度,
  '偏移要夹到文本末尾',
);
assert.equal(
  折算持久化阅读位置({ 阅读偏移: -5, 行内比例: -1, 文本长度: 100 }, 新长度)
    .行内比例,
  0,
  '行内比例要夹回 [0,1]',
);

// —— 6. 钉住 app.js 不再用长度当关键词的闸门 ——
const 应用源文 = readFileSync(resolve(import.meta.dirname, '../app.js'), 'utf8');
const 恢复段 = 应用源文.slice(
  应用源文.indexOf('function 恢复文本内容状态'),
  应用源文.indexOf('function 更新文档标题'),
);
assert.ok(恢复段.length > 200, '应能定位到 恢复文本内容状态 函数体');
assert.ok(
  !/持久化状态\.文本长度\s*!==\s*状态\.文本\.length/.test(恢复段),
  '恢复函数里不能再出现「长度不等就 return」这道闸门',
);
assert.ok(
  恢复段.includes('判断持久化恢复范围'),
  '恢复判据必须走 持久化.js 的纯函数，便于脱离浏览器验证',
);

console.log('关键词跨长度漂移恢复：全部断言通过');
