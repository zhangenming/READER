// 一次性清洗 Gutenberg《封神演義》：去头尾、拆章回标题行、繁转简（保护特殊字）。
// 来源: Project Gutenberg ebook #23910《封神演義》(陸西星編次)
//   https://www.gutenberg.org/cache/epub/23910/pg23910.txt
// 下载后存为 tmp/封神演义-gutenberg-原.txt 再运行本脚本，输出到 txt/封神演义.txt。
import { readFileSync, writeFileSync } from 'node:fs';
import OpenCC from './opencc-tmp/node_modules/opencc-js/dist/esm/full.js';

const 原文 = readFileSync('/Users/zem/AI/READER/tmp/封神演义-gutenberg-原.txt', 'utf8');

// 1) 截取正文：去掉 Gutenberg 头尾
const 开始 = 原文.indexOf('*** START OF THE PROJECT GUTENBERG EBOOK');
const 结束 = 原文.indexOf('*** END OF THE PROJECT GUTENBERG EBOOK');
let 文本 = 原文.slice(原文.indexOf('\n', 开始) + 1, 结束);

// 2) 杂质与换行
文本 = 文本
  .replace(/\r\n/g, '\n')
  .split('\n')
  .filter((行) => !/^\/p$/.test(行) && !/^[A-Za-z /.:;'`_-]+$/.test(行))
  .join('\n');

// 3) 章回标题独立成行。标题与题目间是 U+00A0，且常粘在上一回末尾："…且聽下回分解。第三回　姬昌解圍進妲己"。
//    回号里"百"有写作"○"(U+25CB) 的，如"第一○○回"。
const 回号字 = '零〇○一二三四五六七八九十百千';
const 空白 = '[^\\S\\n]'; // 除换行外的空白（含 U+00A0/U+3000）
文本 = 文本.replace(
  new RegExp(`([^\\n])(第[${回号字}]{1,6}回${空白}+[^\\n]{2,40})`, 'g'),
  (_整, 前字, 标题) => `${前字}\n${标题}`,
);
文本 = 文本.replace(
  new RegExp(`^(第[${回号字}]{1,6}回)${空白}{2,}([^\\n]+)$`, 'gm'),
  (_整, 回号, 题目) => `${回号}　${题目.trim()}`,
);

// 4) 繁转简。OpenCC 会把"乾"一律转"干"，误伤乾坤/乾元山/人名（刘乾、高友乾、姬叔乾）；
//    先用私用区占位符保护，转完再逐例修"干燥"义用例（清单来自全文上下文清点）。
//    "著"同理：t2s 不转，除"著名/著者"外全部应为"着"。
const 替乾 = '\uE000';
文本 = 文本.replaceAll('乾', 替乾).replaceAll('著名', '\uE002名').replaceAll('著者', '\uE002u');
const 转简 = OpenCC.Converter({ from: 't', to: 'cn' });
文本 = 转简(文本);
文本 = 文本.replaceAll(替乾, '乾').replaceAll('\uE002名', '著名').replaceAll('\uE002u', '著者');
文本 = 文本.replaceAll('著', '着');

const 乾修 = [
  ['乾乾净净', '干干净净'], ['乾净', '干净'], ['乾面', '干面'], ['乾柴', '干柴'],
  ['乾燥', '干燥'], ['乾黄河', '干黄河'], ['乾的好', '干的好'],
  ['能乾', '能干'], ['未乾', '未干'], ['不乾', '不干'], ['难乾', '难干'], ['扇乾', '扇干'],
  ['煎乾', '煎干'], ['煮乾', '煮干'],
];
for (const [误, 正] of 乾修) 文本 = 文本.replaceAll(误, 正);
文本 = 文本.replaceAll('商、角、征、羽', '商、角、徵、羽');
// 6) 源文件"日/曰"形近讹字（仅修确凿的说话动词；"交兵日""非止一日"为日期义，不动）
for (const [误, 正] of [
  ['上前日：「', '上前曰：「'], ['妲己日：「', '妲己曰：「'],
  ['黄妃日：「', '黄妃曰：「'], ['驾日：「', '驾曰：「'],
]) 文本 = 文本.replaceAll(误, 正);

// 7) 多余空行收敛
文本 = 文本.replace(/\n{3,}/g, '\n\n').trim() + '\n';

writeFileSync('/Users/zem/AI/READER/txt/封神演义.txt', 文本);

// ── 校验 ──
const 汉字数 = (文本.match(/[\p{Script=Han}]/gu) ?? []).length;
const 标题行 = 文本.split('\n').filter((行) => new RegExp(`^第[${回号字}]{1,6}回`).test(行));
const 汉值 = { '零': 0, '〇': 0, '○': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
function 转数(串) {
  串 = 串.replace(/○/g, '〇');
  if (串.includes('〇')) {
    // 位值式（如"一〇〇"）
    let 数 = 0;
    for (const 字 of 串) 数 = 数 * 10 + 汉值[字];
    return 数;
  }
  if (串 === '十') return 10;
  if (串 === '百') return 100;
  let 数 = 0;
  const 百 = 串.match(/([零一二两三四五六七八九])?百/);
  if (百) 数 += 汉值[百[1] ?? '一'] * 100;
  const 十 = 串.match(/([零一二两三四五六七八九])?十/);
  if (十) 数 += (十[1] ? 汉值[十[1]] : 1) * 10;
  const 尾 = 串.match(/[零一二两三四五六七八九]$/);
  if (尾 && !/百$|十$/.test(串.slice(尾.index))) 数 += 汉值[尾[0]];
  return 数;
}
const 序号 = 标题行.map((行) => 转数(行.match(/^第(.{1,6}?)回/u)[1]));
console.log(`汉字数: ${汉字数}`);
console.log(`章回标题行: ${标题行.length}，序号连续 1..${序号.at(-1)}: ${序号.every((n, i) => n === i + 1)}`);
console.log(`残留占位符: ${(文本.match(/[\uE000\uE002]/gu) ?? []).length}，残留"著": ${(文本.match(/著/g) ?? []).length}，残留粘连"分解。第": ${(文本.match(/分解。第/g) ?? []).length}`);
console.log(`首回: ${标题行[0]}\n末回: ${标题行.at(-1)}`);
// 转换后剩余的"乾"应全部是专名用法，全部打印人工过目
const 组 = {};
for (const m of 文本.matchAll(/(.{3})乾(.{3})/gu)) {
  const 键 = m[1] + '▢' + m[2];
  组[键] = (组[键] ?? 0) + 1;
}
console.log(`\n剩余"乾" ${Object.values(组).reduce((a, b) => a + b, 0)} 处：`);
for (const [键, n] of Object.entries(组).sort((a, b) => b[1] - a[1])) console.log(`  ${n} ${键}`);
