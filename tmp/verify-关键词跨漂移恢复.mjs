// 守门脚本：持久化身份判据必须是「文件内容指纹」，正文长度只管偏移落不落得回去。
// 背景：app.js 旧实现用 `持久化状态.文本长度 !== 状态.文本.length` 一并拦住关键词与
// 阅读位置的恢复，而关键词只存文本、命中位置按当前正文重扫，本不受长度影响；
// 管道规则一改（45a85cd 的 spk 兜底），6 本书长度同时漂移（−17 ~ +3813），
// 被再次打开的书其关键词先不恢复、再被下一次保存用空列表覆盖。
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
const { 计算内容哈希 } = await import('../js/文本工具.js');

// 真实事故里的两组数：大明王朝1566 在 45a85cd 前后各差 3 个字符。
const 书名 = '大明王朝1566.txt';
const 旧长度 = 673001;
const 新长度 = 672998;
const 指纹 = 3735928559;
const 关键词 = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    文本: `词${i}`,
    当前命中idx: 0,
    配色idx: i % 6,
  }));
const 记录 = (覆盖 = {}) => ({
  文件名: 书名,
  内容哈希: 指纹,
  文本长度: 旧长度,
  阅读偏移: 336500,
  行内比例: 0.5,
  关键词列表: 关键词(237),
  ...覆盖,
});

// —— 1. 同一份文件、管道改了长度：词全回，位置折算，报「管道」——
const 管道 = 判断持久化恢复范围(记录(), 书名, 指纹, 新长度);
assert.equal(管道.漂移, '管道', '指纹一致而长度变了，只能怪管道');
assert.equal(管道.关键词列表?.length, 237, '管道漂移必须仍然带回 237 个关键词');
assert.ok(管道.阅读位置, '位置要折算回来而不是丢掉');
assert.ok(
  管道.阅读位置.阅读偏移 > 336490 && 管道.阅读位置.阅读偏移 < 336510,
  `折算后应仍在原比例附近，实际 ${管道.阅读位置.阅读偏移}`,
);

// —— 2. 同一份文件、长度也没变：精确回到原偏移 ——
const 精确 = 判断持久化恢复范围(记录(), 书名, 指纹, 旧长度);
assert.equal(精确.漂移, null, '指纹与长度都对得上就不该报漂移');
assert.equal(精确.阅读位置.阅读偏移, 336500, '必须原样回到旧偏移');

// —— 3. 文件真的换了：词仍按文本恢复，位置折算，报「文件」——
const 换文件 = 判断持久化恢复范围(记录(), 书名, 指纹 ^ 1, 新长度);
assert.equal(换文件.漂移, '文件', '指纹不同就是另一份内容');
assert.equal(换文件.关键词列表?.length, 237, '关键词是文本，换版本也该留着');

// —— 4. 加指纹之前的旧记录：按长度认内容，并标「无指纹」待补 ——
const 旧记录同长 = 判断持久化恢复范围(
  记录({ 内容哈希: undefined }),
  书名,
  指纹,
  旧长度,
);
assert.equal(旧记录同长.漂移, null, '旧记录长度一致时按同一份内容处理');
assert.equal(旧记录同长.阅读位置.阅读偏移, 336500, '旧记录长度一致要精确恢复');
const 旧记录漂移 = 判断持久化恢复范围(
  记录({ 内容哈希: null }),
  书名,
  指纹,
  新长度,
);
assert.equal(旧记录漂移.漂移, '无指纹', '旧记录无从判断文件是否换过，如实标出来');
assert.equal(旧记录漂移.关键词列表?.length, 237, '无指纹同样不得丢词');

// —— 5. 换书与损坏记录仍然拒绝 ——
assert.deepEqual(
  判断持久化恢复范围(记录(), '另一本书.txt', 指纹, 旧长度),
  { 关键词列表: null, 阅读位置: null, 漂移: null },
  '文件名不同不得带回任何内容',
);
assert.equal(
  判断持久化恢复范围(null, 书名, 指纹, 旧长度).关键词列表,
  null,
  '没有持久化记录时不该凭空造词',
);
assert.equal(
  判断持久化恢复范围(记录({ 关键词列表: '坏了' }), 书名, 指纹, 旧长度).关键词列表,
  null,
  '关键词列表不是数组时按缺失处理',
);
assert.equal(
  折算持久化阅读位置({ 阅读偏移: NaN, 行内比例: 0, 文本长度: 旧长度 }, 新长度),
  null,
  '阅读位置非法时返回 null，交给调用方从头开始',
);

// —— 6. 单条坏数据只丢那一条，不再整表抛错 ——
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

// —— 7. 折算不得越界 ——
assert.equal(
  折算持久化阅读位置(
    { 阅读偏移: 999999, 行内比例: 3, 文本长度: 100 },
    新长度,
    false,
  ).阅读偏移,
  新长度,
  '偏移要夹到文本末尾',
);
assert.equal(
  折算持久化阅读位置(
    { 阅读偏移: -5, 行内比例: -1, 文本长度: 100 },
    新长度,
    false,
  ).行内比例,
  0,
  '行内比例要夹回 [0,1]',
);

// —— 8. 指纹只认文件本身：改一个字就变，与长度无关 ——
assert.equal(计算内容哈希('嘉靖'), 计算内容哈希('嘉靖'), '同一内容必须同一指纹');
assert.notEqual(计算内容哈希('嘉靖'), 计算内容哈希('嘉靖 '), '多一个空格就是另一份文件');
assert.notEqual(计算内容哈希('严嵩'), 计算内容哈希('嵩严'), '顺序也算内容');
assert.ok(
  Number.isInteger(计算内容哈希('万寿宫')) && 计算内容哈希('万寿宫') >= 0,
  '指纹要能安全进 JSON',
);

// —— 9. 钉住 app.js：判据走纯函数，且不再拿长度当闸门 ——
const 应用源文 = readFileSync(resolve(import.meta.dirname, '../app.js'), 'utf8');
const 恢复段 = 应用源文.slice(
  应用源文.indexOf('function 恢复文本内容状态'),
  应用源文.indexOf('function 更新文档标题'),
);
assert.ok(恢复段.length > 200, '应能定位到 恢复文本内容状态 函数体');
assert.ok(
  !/\.文本长度\s*!==\s*状态\.文本\.length/.test(应用源文),
  '全文件都不能再出现「长度不等就当另一本书」的判据',
);
assert.ok(
  恢复段.includes('判断持久化恢复范围') && 恢复段.includes('状态.内容哈希'),
  '恢复判据必须带上内容指纹，走 持久化.js 的纯函数',
);
assert.ok(
  应用源文.includes('计算内容哈希(原始文本)'),
  '指纹必须算在解码后的原文上，而不是管道产物',
);

console.log('内容指纹恢复判据：全部断言通过');
