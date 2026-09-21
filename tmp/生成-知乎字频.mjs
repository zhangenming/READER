// 从入库的字频源表重新生成 js/知乎字频.js（纯数据模块）。
// 源表：tmp/字频-知乎6亿字.csv —— github.com/forfudan/chinese-characters-frequency
//       《六億知乎語料通規漢字字頻表》（Apache-2.0），知乎语料 485,594,082 个通用规范汉字。
// 跑法：node tmp/生成-知乎字频.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const 根目录 = resolve(import.meta.dirname, '..');
const 源表路径 = resolve(根目录, 'tmp/字频-知乎6亿字.csv');
const 输出路径 = resolve(根目录, 'js/知乎字频.js');
const 语料汉字总数 = 485594082;

const 行列表 = readFileSync(源表路径, 'utf8')
  .trim()
  .split('\n')
  .slice(1) // 去掉表头 char,count,freq,cum_freq
  .map(function 拆行(行) {
    const [字, 计数] = 行.split(',');
    return { 字, 计数: Number(计数) };
  })
  .filter(function 只留汉字(项) {
    // 源表里混进过 1 条 '#'（计数 1），非汉字，剔除。
    // 计数为 0 的通规字要保留：本书用到它时该列显示 0，而不是「查无此字」。
    return /^\p{Script=Han}$/u.test(项.字);
  });

const 汉字序列 = 行列表.map((项) => 项.字).join('');
const 万分率序列 = 行列表.map((项) =>
  Math.round((项.计数 / 语料汉字总数) * 10000 * 10000) / 10000,
);

const 代码 = `// 知乎现代汉语字频表（纯数据模块：无 import、无依赖，供 词频弹窗.js 的「字频对照」视图查表）
// 源：github.com/forfudan/chinese-characters-frequency（Apache-2.0）《六億知乎語料通規漢字字頻表》，
//     本地留档 tmp/字频-知乎6亿字.csv，生成脚本 tmp/生成-知乎字频.mjs（改数据后重跑它）。
// 口径：万分之 = 每 1 万个汉字中该字出现的次数，按语料汉字总数 ${语料汉字总数} 折算；
//       表内 ${行列表.length} 字合计 10000。源表里的 1 条 '#'（非汉字，计数 1）已剔除，
//       计数为 0 的通规字保留（显示 0，而非「—」）。
// 与「本书词频」列同用 万分之 单位，两列可直接对读。
export const 知乎语料汉字总数 = ${语料汉字总数};
export const 知乎字频说明 = '知乎语料 4.86 亿汉字 · 通用规范汉字表 ${行列表.length.toLocaleString('zh-CN')} 字';

const 汉字序列 = '${汉字序列}';
const 万分率序列 = ${JSON.stringify(万分率序列)};

const 知乎万分率映射 = new Map();
for (let i = 0; i < 汉字序列.length; i += 1) {
  知乎万分率映射.set(汉字序列[i], 万分率序列[i]);
}

/** 某字的知乎万分之频次；表内没有该字（含扩展区、繁体、生僻字）时返回 undefined */
export function 取知乎万分率(字) {
  return 知乎万分率映射.get(字);
}
`;

writeFileSync(输出路径, 代码, 'utf8');
const 模块 = await import(`data:text/javascript,${encodeURIComponent(代码)}`);
console.log(
  `已生成 js/知乎字频.js：${行列表.length} 字 / ${(代码.length / 1024).toFixed(0)} KB；` +
    `的=${模块.取知乎万分率('的')} 是=${模块.取知乎万分率('是')}`,
);
if (模块.取知乎万分率('#') !== undefined) {
  throw new Error('非汉字条目未剔除干净');
}
