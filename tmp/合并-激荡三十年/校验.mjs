import fs from 'node:fs';
import path from 'node:path';
globalThis.document = { baseURI: 'file:///tmp/' };
const { 创建章节索引 } = await import('../../js/章节索引.js');
const 根 = path.resolve(import.meta.dirname, '../..');
const 读 = (f) => fs.readFileSync(path.join(根, f), 'utf8').replace(/\r\n/g, '\n');
const 上 = 读('tmp/合并-激荡三十年/原始-上下卷/激荡三十年 上.txt'), 下 = 读('tmp/合并-激荡三十年/原始-上下卷/激荡三十年 下.txt'), 合 = 读('txt/激荡三十年.txt');
const 行 = (t) => t.split('\n');
const 切 = (t, a, b) => 行(t).slice(a - 1, b).filter((l) => l.trim());
const 失败 = [];
const 断言 = (条, 说明) => { if (!条) 失败.push(说明); };

// 1 章节索引
const 列表 = await 创建章节索引(合, () => true);
console.log('章节列表:');
for (const c of 列表) console.log(`  ${c.类型}  ${c.标题}`);
断言(列表.length === 7, `章节数应为 7，实际 ${列表.length}`);

// 2 注条与角标
const 注 = 行(合).filter((l) => /^\[\d+\]/.test(l)).map((l) => Number(l.match(/^\[(\d+)\]/)[1]));
const 角 = [...合.matchAll(/\[(\d{1,4})\]/g)].map((m) => Number(m[1]));
const 正文角 = [];
for (const l of 行(合)) {
  if (/^\[\d+\]/.test(l)) continue;
  // 正文里另有「[2003]103号文」这类公文号，只统计落在注条量程内的角标
  正文角.push(...[...l.matchAll(/\[(\d{1,4})\]/g)].map((x) => Number(x[1])).filter((n) => n <= 329));
}
console.log(`注条 ${注.length} 条 1..${Math.max(...注)} 连续=${JSON.stringify(注) === JSON.stringify([...Array(Math.max(...注)).keys()].map((i) => i + 1))}`);
console.log(`正文角标 ${正文角.length} 个 单调递增=${正文角.every((v, i) => i === 0 || v > 正文角[i - 1])}`);
断言(注.length === 329, `注条应 329，实际 ${注.length}`);
断言(正文角.length === 329, `正文角标应 329，实际 ${正文角.length}`);
断言(行(合).filter((l) => /^\[\d+\]/.test(l)).length === 329, '注条行数不对');
断言(正文角.every((v, i) => v === i + 1), '正文角标必须是 1..329 各一次');

// 3 内容不丢：两卷正文每一段都要在合并稿里出现（下卷角标已整体后移 140）
const 移 = (s) => s.replace(/\[(\d{1,4})\]/g, (全, n) => (Number(n) <= 189 ? `[${Number(n) + 140}]` : 全));
const 合并行 = new Set(行(合));
const 段 = [
  ['上·总序', 切(上, 147, 170), (s) => s],
  ['上·题记', 切(上, 171, 178), (s) => s],
  ['上·前言', 切(上, 179, 248), (s) => s],
  ['上·第一二部', 切(上, 249, 2852), (s) => s],
  ['上·致谢', 切(上, 2853, 2872), (s) => s],
  ['上·声明', 切(上, 3147, 3156), (s) => s],
  ['上·注释', 切(上, 3157, 上.length), (s) => s],
  ['下·总序(重复,删)', 切(下, 49, 72), (s) => s],
  ['下·第三四五部', 切(下, 73, 2466), 移],
  ['下·致谢(重复,删)', 切(下, 2467, 2486), (s) => s],
  ['下·声明(重复,删)', 切(下, 2809, 2818), (s) => s],
  ['下·注释', 切(下, 2819, 下.length), 移],
];
const 应删 = new Set([...段[7][1], ...段[9][1], ...段[10][1]]);
for (const [名, 行组, f] of 段) {
  const 缺 = 行组.filter((l) => !合并行.has(f(l)));
  console.log(`${名}: ${行组.length} 段，合并稿缺 ${缺.length}${缺.length ? ' 例:' + 缺[0].slice(0, 40) : ''}`);
  if (名.includes('重复') && 名.includes('总序')) 断言(缺.length >= 2, `${名} 下卷异文应被上卷版本取代`);
  else 断言(缺.length === 0, `${名} 丢了 ${缺.length} 段`);
}
// 人物索引逐条对账
const 上索引 = new Set(切(上, 2873, 3146).filter((l) => !/^(人物索引|[A-Z])$/.test(l)));
const 下索引 = new Set(切(下, 2487, 2808).filter((l) => !/^(人物索引|[A-Z])$/.test(l)));
const 起 = 行(合).findIndex((l) => l === '人物索引');
const 止 = 行(合).indexOf('声明', 起);
const 合索引 = 行(合).slice(起, 止);
const 合索引条 = new Set(合索引.filter((l) => l.trim() && !/^(人物索引|[A-Z])$/.test(l)));
const 上名 = new Set([...上索引].map((l) => l.match(/^(\S+)/)[1]));
const 漏 = [...下索引].filter((l) => !上名.has(l.match(/^(\S+)/)[1]) && !合索引条.has(l));
console.log(`人物索引: 上 ${上索引.size} 下 ${下索引.size} 合并后 ${合索引条.size} 条；下卷新名漏 ${漏.length}`);
断言(合索引条.size === 上索引.size + [...下索引].filter((l) => !上名.has(l.match(/^(\S+)/)[1])).length, '人物索引条数不对');
断言(漏.length === 0, `人物索引漏 ${漏.length} 条`);

// 3.5 合并稿里不许出现重复段落（去重是否干净）
const 频 = new Map();
for (const l of 行(合)) if (l.trim().length > 8) 频.set(l, (频.get(l) ?? 0) + 1);
const 重 = [...频].filter(([, n]) => n > 1);
console.log(`重复段落 ${重.length} 处${重.length ? ' 例: ' + 重[0][0].slice(0, 50) : ''}`);
断言(重.length === 0, `合并稿有 ${重.length} 处重复段落`);

// 4 字数
const 字数 = 合.replace(/\s/g, '').length;
console.log(`总字数 ${(字数 / 10000).toFixed(1)} 万`);
console.log(失败.length ? `\n❌ 失败 ${失败.length}:\n` + 失败.join('\n') : '\n✅ 全部校验通过');
process.exit(失败.length ? 1 : 0);
