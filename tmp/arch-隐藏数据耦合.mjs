// 隐藏数据耦合检测：import 图无环，但 状态.js 是共享可变单例。
// 对每个 状态.<字段> 找出「写方」与「读方」，若读方层级低于写方 → 存在 import 图看不到的向上数据耦合。
// 运行：node tmp/arch-隐藏数据耦合.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const 根 = resolve(import.meta.dirname, '..');
const 图 = JSON.parse(readFileSync(resolve(根, 'tmp/架构视图-2026-09-18/模块图.json'), 'utf-8'));
const 层 = new Map(图.nodes.map((n) => [n.id, n.level]));
const 文件列表 = 图.nodes.map((n) => n.id);

const 写 = new Map(); const 读 = new Map(); // 字段 → Set(文件)
const 记 = (表, 键, 值) => { if (!表.has(键)) 表.set(键, new Set()); 表.get(键).add(值); };

for (const f of 文件列表) {
  const 文本 = readFileSync(join(根, f), 'utf-8');
  const re = /状态\.([\p{L}\p{N}_$]+)/gu;
  let 偏移 = 0;
  for (const m of 文本.matchAll(re)) {
    const 字段 = m[1];
    const 行首 = 文本.lastIndexOf('\n', m.index) + 1;
    const 片段 = 文本.slice(行首, 文本.indexOf('\n', m.index));
    const 是写入 = new RegExp(`状态\\.${字段.replace(/[$]/g, '\\$')}\\s*(=[^=]|\\+\\+|--|\\+=|-=)`).test(片段);
    const 是删除 = new RegExp(`状态\\.${字段}\\s*(\\[|delete)`).test(片段);
    if (是写入 || 是删除) 记(写, 字段, f); else 记(读, 字段, f);
  }
}

const 向上耦合 = [];
for (const [字段, 读集] of 读) {
  const 写集 = 写.get(字段);
  if (!写集) continue;
  let 最高写层 = -1;
  for (const w of 写集) 最高写层 = Math.max(最高写层, 层.get(w) ?? -1);
  for (const r of 读集) {
    const 读层 = 层.get(r) ?? -1;
    if (读层 < 最高写层) {
      const 写者 = [...写集].filter((w) => (层.get(w) ?? -1) === 最高写层);
      向上耦合.push({ 字段, 读方: r, 读层, 写方: 写者, 写层: 最高写层, 是否已import: 图.edges.some((e) => e.from === r && 写者.includes(e.to)) });
    }
  }
}

向上耦合.sort((a, b) => b.写层 - a.写层 || a.读层 - b.读层);
console.log(`字段总数(被读或写): ${new Set([...写.keys(), ...读.keys()]).size}`);
console.log(`存在写方的字段数: ${写.size} · 存在读方的字段数: ${读.size}`);
console.log(`\n向上数据耦合(读方层级 < 写方层级) 共 ${向上耦合.length} 条:\n`);
console.log('字段\t读方(L层)\t写方(L层)\t读方是否已import写方');
for (const c of 向上耦合) {
  console.log(`${c.字段}\t${c.读方}(L${c.读层})\t${c.写方.map((w) => `${w}(L${c.写层})`).join(' ')}\t${c.是否已import ? '是' : '否 ← import 图不可见'}`);
}
