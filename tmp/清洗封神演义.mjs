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
  // 少数正文行混用半角空格缩进（如"海島名師授秘奇"诗行），统一成全角，宽度不变
  .map((行) => 行.replace(/^ +/, (m) => '　'.repeat(m.length)))
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
// 7) 源文件"日/曰"形近讹字（仅修确凿的说话动词；"交兵日""非止一日"为日期义，不动）
for (const [误, 正] of [
  ['上前日：「', '上前曰：「'], ['妲己日：「', '妲己曰：「'],
  ['黄妃日：「', '黄妃曰：「'], ['驾日：「', '驾曰：「'],
]) 文本 = 文本.replaceAll(误, 正);

// 8) 诗行重排。阅读器每句自动断行、引号跨行强制闭合，所以：
//    - 两联挤一行的诗会在行中被拆开、缩进错乱（用户截图的乱象）；
//    - 「…」跨行包诗会留下孤儿闭引号成行。
//    处理（两遍）：先全文配对引号，凡跨行且任一端落在诗行（缩进≥3全角空格）的
//    引号对整对剥除；再把诗行按句末标点拆成一行一句（缩进原样保留）。
//    行内自闭合同一对的引号（如整篇诏书、诗中夹注）原样保留。
文本 = 重排诗行(文本);

function 重排诗行(文本) {
  const 行 = 文本.split('\n');
  const 是诗行 = 行.map((l) => (l.match(/^　+/)?.[0].length ?? 0) >= 3);
  const 配对 = { '「': '」', '『': '』', '“': '”' };
  const 闭引号集合 = new Set(Object.values(配对));
  const 开引号集合 = new Set(Object.keys(配对));

  // 第一遍：全文配对，标记待剥除的跨行诗引号
  const 删字符 = new Set(); // "行号:列号"
  const 栈 = [];
  for (let 行号 = 0; 行号 < 行.length; 行号 += 1) {
    for (let 列 = 0; 列 < 行[行号].length; 列 += 1) {
      const 字 = 行[行号][列];
      if (开引号集合.has(字)) 栈.push({ 行号, 列, 字 });
      else if (闭引号集合.has(字)) {
        const 开 = 栈.at(-1);
        if (开 && 配对[开.字] === 字) {
          栈.pop();
          if (开.行号 !== 行号 && (是诗行[开.行号] || 是诗行[行号])) {
            删字符.add(`${开.行号}:${开.列}`);
            删字符.add(`${行号}:${列}`);
          }
        } else {
          // 无配对的闭引号：落在诗行上就剥掉（跨行诗块的遗留右半）
          if (是诗行[行号]) 删字符.add(`${行号}:${列}`);
        }
      }
    }
  }
  for (const 开 of 栈) {
    if (是诗行[开.行号]) 删字符.add(`${开.行号}:${开.列}`);
  }

  // 第二遍：诗行剥引号后按句末标点拆行
  const 句末 = new Set(['。', '！', '？', '…']);
  const 输出 = [];
  for (let 行号 = 0; 行号 < 行.length; 行号 += 1) {
    const 原行 = 行[行号];
    if (!是诗行[行号]) {
      // 散文行也应用剥除标记（如"诗曰：「"的行尾半截引号），只是不拆行
      if ([...原行].some((_, 列) => 删字符.has(`${行号}:${列}`))) {
        输出.push([...原行].filter((_, 列) => !删字符.has(`${行号}:${列}`)).join(''));
      } else {
        输出.push(原行);
      }
      continue;
    }
    const 缩进 = 原行.match(/^　+/)[0];
    let 内容 = [...原行.slice(缩进.length)]
      .filter((_, 列) => !删字符.has(`${行号}:${列 + 缩进.length}`))
      .join('');
    const 段 = [];
    let 起 = 0;
    let 深度 = 0;
    for (let i = 0; i < 内容.length; i += 1) {
      const 字 = 内容[i];
      if (开引号集合.has(字)) 深度 += 1;
      else if (闭引号集合.has(字)) 深度 = Math.max(0, 深度 - 1);
      else if (句末.has(字) && 深度 === 0) {
        let 终 = i + 1;
        while (终 < 内容.length && 句末.has(内容[终])) 终 += 1;
        段.push(内容.slice(起, 终));
        起 = 终;
        i = 终 - 1;
      }
    }
    if (起 < 内容.length) 段.push(内容.slice(起));
    for (const 句 of 段) 输出.push(缩进 + 句);
  }
  return 输出.join('\n');
}

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
