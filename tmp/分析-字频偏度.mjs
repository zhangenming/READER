// 候选「全书平均偏度」口径对比：同一批字频数据上把几种算法都算出来，
// 看哪个数稳定、可解释、且和界面上已有的「倍数」列能对上账。
// 用法: node tmp/分析-字频偏度.mjs [txt文件名...]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// 与 js/文本工具.js 的 是汉字 同一口径（汉字模式 = \p{Script=Han}）。
// 不 import 文本工具.js：它经 常量.js 引用了 document，Node 侧跑不了。
const 汉字模式 = /^\p{Script=Han}$/u;
function 是汉字(字) {
  const 码点 = 字.codePointAt(0);
  return (
    (码点 >= 0x3400 && 码点 <= 0x4dbf) ||
    (码点 >= 0x4e00 && 码点 <= 0x9fff) ||
    (码点 >= 0xf900 && 码点 <= 0xfaff) ||
    (码点 > 0x7f && 汉字模式.test(字))
  );
}
import { 取知乎万分率 } from '../js/知乎字频.js';

function 直方图(全文) {
  const 映射 = new Map();
  let 总数 = 0;
  for (const 字 of 全文) {
    if (!是汉字(字)) continue;
    映射.set(字, (映射.get(字) ?? 0) + 1);
    总数 += 1;
  }
  return { 映射, 总数 };
}

function 分析一本书(文件名, 全文) {
  const { 映射: 本书, 总数: N } = 直方图(全文);
  const q = (字) => (取知乎万分率(字) ?? 0) / 10000;

  // ---- 口径 0：倍数的算术平均（界面上那一列直接求平均）----
  let 倍数和 = 0;
  let 倍数项 = 0;
  let 对数差和 = 0; // |log2 比值|，按字种等权
  let 外质量 = 0; // 本书有、知乎表无或计 0 次的字占全书汉字的比重
  let 命中字数 = 0;
  for (const [字, 次数] of 本书) {
    const 知乎 = q(字);
    if (知乎 <= 0) {
      外质量 += 次数;
      continue;
    }
    命中字数 += 1;
    const 比值 = 次数 / N / 知乎;
    倍数和 += 比值 >= 1 ? 比值 : 1 / 比值;
    倍数项 += 1;
    对数差和 += Math.abs(Math.log2(比值));
  }
  const 算术平均倍数 = 倍数和 / 倍数项;
  const 等权偏离 = 2 ** (对数差和 / 倍数项);

  // ---- 口径 1：按频次加权的平均偏离倍数（几何）----
  let 加权和 = 0;
  let 加权质量 = 0;
  for (const [字, 次数] of 本书) {
    const 知乎 = q(字);
    if (知乎 <= 0) continue;
    加权和 += 次数 * Math.abs(Math.log2(次数 / N / 知乎));
    加权质量 += 次数;
  }
  const 加权偏离 = 2 ** (加权和 / 加权质量);

  // ---- 口径 2：分布重合度 = Σ min(p, q)，等价于 1 - 全变差距离 ----
  let 重合 = 0;
  for (const [字, 次数] of 本书) 重合 += Math.min(次数 / N, q(字));
  // 表内收录但本书没用过的字：p=0，min 必为 0，不用补。
  // 知乎表本身合计 10000，本书合计 N，两侧都是真分布，直接可比。

  // ---- 口径 3：KL 散度（本书 → 知乎），单位 bit ----
  let kl = 0;
  for (const [字, 次数] of 本书) {
    const 知乎 = q(字);
    if (知乎 <= 0) continue;
    const p = 次数 / N;
    kl += p * Math.log2(p / 知乎);
  }

  // ---- 口径 4：高频段的偏离（前 100 字种，覆盖约 40% 篇幅）----
  const 前100 = [...本书.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100);
  let 高频和 = 0;
  let 高频质量 = 0;
  let 高频个数 = 0;
  for (const [字, 次数] of 前100) {
    const 知乎 = q(字);
    if (知乎 <= 0) continue;
    高频和 += 次数 * Math.abs(Math.log2(次数 / N / 知乎));
    高频质量 += 次数;
    高频个数 += 1;
  }

  return {
    文件名,
    汉字总数: N,
    字种数: 本书.size,
    命中字数,
    外质量: 外质量 / N,
    算术平均倍数,
    等权偏离,
    加权偏离,
    重合度: 重合,
    KL: kl,
    高频偏离: 2 ** (高频和 / 高频质量),
    高频覆盖: 高频质量 / N,
    高频个数,
  };
}

const 目录 = join(process.cwd(), 'txt');
const 指定 = process.argv.slice(2);
const 文件列表 = 指定.length
  ? 指定
  : readdirSync(目录)
      .filter((f) => f.endsWith('.txt'))
      .slice(0, 12);

const 结果 = [];
for (const 名 of 文件列表) {
  const 路径 = 名.includes('/') ? 名 : join(目录, 名);
  let 全文;
  try {
    全文 = readFileSync(路径, 'utf8');
  } catch {
    continue;
  }
  const r = 分析一本书(名.replace(/\.txt$/, ''), 全文);
  if (r.汉字总数 < 5000) continue;
  结果.push(r);
}

const 显示 = (v, d = 2) => (v === undefined ? '—' : v.toFixed(d));
console.log(
  [
    '书名'.padEnd(26),
    '汉字数'.padStart(8),
    '算术均倍'.padStart(12),
    '等权偏离'.padStart(10),
    '加权偏离'.padStart(10),
    '高频偏离'.padStart(10),
    '重合度%'.padStart(9),
    'KL(bit)'.padStart(9),
    '表外%'.padStart(8),
  ].join(' '),
);
for (const r of 结果) {
  console.log(
    [
      r.文件名.slice(0, 24).padEnd(26),
      String(r.汉字总数.toLocaleString('en-US')).padStart(8),
      显示(r.算术平均倍数, 0).padStart(12),
      显示(r.等权偏离, 2).padStart(10),
      显示(r.加权偏离, 2).padStart(10),
      显示(r.高频偏离, 2).padStart(10),
      显示(r.重合度 * 100, 1).padStart(9),
      显示(r.KL, 3).padStart(9),
      显示(r.外质量 * 100, 2).padStart(8),
    ].join(' '),
  );
}
console.log(
  `\n共 ${结果.length} 本 · 高频偏离基于字种降序前 100（平均覆盖 ${(
    (结果.reduce((s, r) => s + r.高频覆盖, 0) / 结果.length) *
    100
  ).toFixed(1)}% 篇幅）`,
);
