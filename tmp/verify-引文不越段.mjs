// 用真实模块跑全库：确认「引号未闭合不越段」兜底生效，且无跨段野鸡引文。
import fs from 'node:fs';
import { setImmediate } from 'node:timers/promises';

globalThis.document = {
  baseURI: 'http://localhost/',
  querySelector: () => null,
};
globalThis.scheduler = { yield: setImmediate };
const { 规范化文本, 创建引文索引, 整理句子换行 } =
  await import('../js/文本管线.js');
const 有效 = () => true;

const 行号 = (全文, 位置) => {
  let 行 = 1;
  for (let i = 0; i < 位置; i += 1) if (全文[i] === '\n') 行 += 1;
  return 行;
};

const 目录 = 'txt';
const 文件列表 = fs
  .readdirSync(目录)
  .filter((f) => f.endsWith('.txt') && !f.startsWith('.'));

let 最长全局 = 0;
let 野鸡总数 = 0;
for (const f of 文件列表.sort((a, b) => a.localeCompare(b, 'zh'))) {
  const 原 = fs.readFileSync(`${目录}/${f}`, 'utf8');
  const 文本 = await 规范化文本(原, 有效);
  const 引文 = await 创建引文索引(文本, 有效);
  const 边 = 引文.边界列表;
  let 最长 = 0,
    最长起点 = 0,
    字数 = 0,
    越段 = 0;
  for (let i = 0; i < 边.length; i += 2) {
    const L = 边[i + 1] - 边[i];
    字数 += L;
    if (L > 最长) {
      最长 = L;
      最长起点 = 边[i];
    }
    if (L > 500) 越段 += 1;
    // 兜底断言：除多段引文续段外，普通引文不得跨过原文段落边界后仍吞掉非引文段
  }
  最长全局 = Math.max(最长全局, 最长);
  野鸡总数 += 越段;
  console.log(
    `${String(边.length / 2).padStart(6)}条 ${String(字数).padStart(7)}字 最长${String(最长).padStart(6)} 超500:${String(越段).padStart(3)} 未配对${String(引文.未配对数量).padStart(5)}  ${f}`,
  );
  if (最长 > 3000)
    console.log(
      `   ↳ L${行号(文本, 最长起点)} 起: ${JSON.stringify(文本.slice(最长起点, 最长起点 + 40))}`,
    );
}
console.log(`\n全库最长引文 ${最长全局} 字，>500 字共 ${野鸡总数} 条`);

// 用户报的那一段
const 阿里 = await 规范化文本(fs.readFileSync('txt/阿里传.txt', 'utf8'), 有效);
const 边 = (await 创建引文索引(阿里, 有效)).边界列表;
const 起 = 阿里.indexOf('当天晚上，正当我收拾行李时');
const 止 =
  阿里.indexOf('当天晚上，正当我收拾行李时') + 阿里.slice(起).indexOf('\n');
console.log('\n== 报错段 L1469 及其后 3 段 ==');
for (let i = 0; i < 边.length; i += 2) {
  if (边[i] > 止 + 400) break;
  if (边[i + 1] < 起) continue;
  console.log(
    `  [${起 <= 边[i] && 边[i + 1] <= 止 ? '本段内' : '越界!'}] ${JSON.stringify(阿里.slice(边[i], Math.min(边[i + 1], 边[i] + 46)))}`,
  );
}
