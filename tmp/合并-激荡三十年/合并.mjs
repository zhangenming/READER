import fs from 'node:fs';
import path from 'node:path';

const 根 = path.resolve(import.meta.dirname, '../..');
const 上文件 = path.join(根, 'tmp/合并-激荡三十年/原始-上下卷/激荡三十年 上.txt');
const 下文件 = path.join(根, 'tmp/合并-激荡三十年/原始-上下卷/激荡三十年 下.txt');
const 输出 = path.join(根, 'txt/激荡三十年.txt');

const 读行 = (f) =>
  fs
    .readFileSync(f, 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n');

const 上 = 读行(上文件);
const 下 = 读行(下文件);
// 行号为文件内 1 起，切片转 0 起
const 取 = (行, 起, 止) => 行.slice(起 - 1, 止);

const 块 = {
  上_总序: 取(上, 147, 170),
  上_题记: 取(上, 171, 178),
  上_前言: 取(上, 179, 248),
  上_一二部: 取(上, 249, 2852),
  上_致谢: 取(上, 2853, 2872),
  上_声明: 取(上, 3147, 3156),
  上_注释: 取(上, 3157, 上.length),
  下_三四五部: 取(下, 73, 2466),
  下_致谢: 取(下, 2467, 2486),
  下_声明: 取(下, 2809, 2818),
  下_注释: 取(下, 2819, 下.length),
};

// 上下卷各自从 [1] 重新编号，合并后必须整体后移，否则正文角标与注条一对多。
const 上注数 = 块.上_注释.filter((l) => /^\[\d+\]/.test(l)).length;
const 偏移 = 上注数;
const 改号 = (行) =>
  行.replace(/\[(\d{1,4})\]/g, (全, 数) =>
    Number(数) <= 189 ? `[${Number(数) + 偏移}]` : 全,
  );

// 人物索引按字母段合并：同名只留一条、年份并起来，下卷新名接在同字母尾部。
function 解析索引(行段) {
  const 段序 = [];
  const 段 = new Map();
  let 当前 = null;
  for (const 原行 of 行段) {
    const s = 原行.trim();
    if (!s || s === '人物索引') continue;
    if (/^[A-Z]$/.test(s)) {
      当前 = s;
      if (!段.has(s)) {
        段.set(s, []);
        段序.push(s);
      }
      continue;
    }
    const m = s.match(/^(\S+)\s+(.+)$/);
    if (!m || !当前) throw new Error(`人物索引出现无法解析的行：${s}`);
    段.get(当前).push([m[1], m[2]]);
  }
  return { 段序, 段 };
}

function 合并索引(上段行, 下段行) {
  const a = 解析索引(上段行);
  const b = 解析索引(下段行);
  const 字母 = [...a.段序];
  for (const z of b.段序) if (!字母.includes(z)) 字母.push(z);
  字母.sort();
  const 出 = ['人物索引', ''];
  let 条数 = 0;
  for (const z of 字母) {
    出.push(z, '');
    const 上条 = a.段.get(z) ?? [];
    const 下条 = b.段.get(z) ?? [];
    const 下名 = new Map(下条);
    for (const [名, 年] of 上条) {
      const 新 = 下名.get(名);
      出.push(新 ? `${名} ${年}、${新}` : `${名} ${年}`, '');
      下名.delete(名);
      条数 += 1;
    }
    for (const [名, 年] of 下条) {
      if (下名.has(名)) {
        出.push(`${名} ${年}`, '');
        条数 += 1;
      }
    }
  }
  return { 文本: 出, 条数, 上条数: a.段序.reduce((n, z) => n + a.段.get(z).length, 0), 下条数: b.段序.reduce((n, z) => n + b.段.get(z).length, 0) };
}

const 上索引 = 取(上, 2873, 3146);
const 下索引 = 取(下, 2487, 2808);
const 索引 = 合并索引(上索引, 下索引);

const 拼接 = [
  ...块.上_总序,
  ...块.上_题记,
  ...块.上_前言,
  ...块.上_一二部,
  ...块.下_三四五部.map(改号),
  ...块.上_致谢,
  ...索引.文本,
  ...块.上_声明,
  ...块.上_注释,
  ...块.下_注释.map(改号),
];
// 块与块之间保证一个空行分隔
const 合并 = [];
for (const 行 of 拼接) {
  if (行.trim() === '') continue;
  if (合并.length) 合并.push('');
  合并.push(行);
}
合并.push('');

fs.writeFileSync(输出, 合并.join('\n'), 'utf8');
console.log(
  JSON.stringify(
    {
      输出,
      上注数,
      下注重编号至: 189 + 偏移,
      索引: { 上条数: 索引.上条数, 下条数: 索引.下条数, 合并后条数: 索引.条数 },
      行数: 合并.length,
      字节: fs.statSync(输出).size,
    },
    null,
    2,
  ),
);
