// 由 模块图.json 生成 dependency-map.dot 与 impact-map.dot（可复现，勿手改 dot）
// 运行：node tmp/arch-生成-dot.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const 目录 = resolve(import.meta.dirname, '架构视图-2026-09-18');
const 图 = JSON.parse(readFileSync(resolve(目录, '模块图.json'), 'utf-8'));
const 出 = new Map(); const 入 = new Map();
for (const n of 图.nodes) { 出.set(n.id, new Set()); 入.set(n.id, new Set()); }
for (const e of 图.edges) { 出.get(e.from).add(e.to); 入.get(e.to).add(e.from); }

function 半径(起点) {
  const 见过 = new Set([起点]); const 队 = [起点]; const 距离 = new Map([[起点, 0]]);
  while (队.length) { const 当前 = 队.shift(); for (const 下 of 入.get(当前)) if (!见过.has(下)) { 见过.add(下); 距离.set(下, 距离.get(当前) + 1); 队.push(下); } }
  见过.delete(起点); return { 集合: 见过, 距离 };
}
const 名 = (id) => id.replace(/^js\//, '').replace(/\.js$/, '');
const 转义 = (s) => `"${s.replace(/"/g, '\\"')}"`;
const 节点表 = new Map(图.nodes.map((n) => [n.id, n]));

function 头(标题) {
  return `digraph "${标题}" {\n  graph [rankdir=TB, splines=true, concentrate=false,\n         label=${转义(标题)}, labelloc=t, fontsize=16,\n         fontname="PingFang SC", nodesep=0.28, ranksep=0.55];\n  node  [shape=box, style="rounded,filled", fontname="PingFang SC", fontsize=11, margin="0.16,0.08"];\n  edge  [arrowhead=open, color="#66666666", fontsize=9];\n`;
}

// ---------- dependency-map：全量 31 节点 / 144 边，按爆炸半径着色 ----------
const 半径表 = new Map();
for (const n of 图.nodes) 半径表.set(n.id, 半径(n.id).集合.size);
const 色 = (r) => (r >= 20 ? '#e8a2a2' : r >= 12 ? '#f0cfa0' : r >= 6 ? '#e6e6b8' : '#cfe3cf');
let 依赖 = 头(`READER 模块依赖图 · 31 节点 / 144 import 边 / 0 环 · 2026-09-18 · 底色=被传递依赖数(爆炸半径) 红>=20 橙>=12 黄>=6 绿<6`)
  + '  node [fillcolor="#eeeeee"];\n';
for (const n of 图.nodes) {
  const r = 半径表.get(n.id);
  依赖 += `  ${转义(名(n.id))} [fillcolor=${转义(色(r))}, label=${转义(`${名(n.id)}\nL${n.level} 入${n.fanIn} 出${n.fanOut} 半径${r} · ${n.lines}行`)}];\n`;
}
for (const e of 图.edges) 依赖 += `  ${转义(名(e.from))} -> ${转义(名(e.to))};\n`;
依赖 += '}\n';
writeFileSync(resolve(目录, 'dependency-map.dot'), 依赖);

// ---------- impact-map：以工作区未提交改动为种子，按 BFS 距离分层 ----------
const 种子 = ['js/常量.js', 'js/查找弹窗.js', 'app.js'];
const 合并距离 = new Map();
for (const s of 种子) {
  const { 距离 } = 半径(s);
  for (const [id, d] of 距离) if (!合并距离.has(id) || 合并距离.get(id) > d) 合并距离.set(id, d);
}
const 距离色 = (d) => (d <= 1 ? '#e8a2a2' : d === 2 ? '#f0cfa0' : d <= 4 ? '#e6e6b8' : '#cfe3cf');
let 影响 = 头(`改动爆炸半径 · 种子=工作区未提交改动 {常量.js, 查找弹窗.js, app.js} · 底色=距种子反向传递跳数 红1 橙2 黄3-4 绿>=5`)
  + `  种子说明 [shape=note, fillcolor="#ffffff", label="种子(本次改动)\\n常量.js 半径29 · 查找弹窗.js 半径4\\napp.js 为叶子入口"];
`;
for (const s of 种子) 影响 += `  ${转义(名(s))} [fillcolor="#ff6b6b", penwidth=2.2, label=${转义(`★ ${名(s)}\n半径${半径表.get(s)}`)}];\n`;
for (const [id, d] of 合并距离) {
  if (种子.includes(id)) continue;
  影响 += `  ${转义(名(id))} [fillcolor=${转义(距离色(d))}, label=${转义(`${名(id)}\n距种子 ${d} 跳`)}];\n`;
}
const 受影响 = new Set([...合并距离.keys(), ...种子]);
for (const e of 图.edges) {
  if (!(受影响.has(e.from) && 受影响.has(e.to))) continue;
  影响 += `  ${转义(名(e.from))} -> ${转义(名(e.to))};\n`;
}
影响 += '}\n';
writeFileSync(resolve(目录, 'impact-map.dot'), 影响);

// ---------- violations.csv ----------
let csv = 'type,from,to,level_from,level_to,span,confidence,note\n';
for (const e of 图.edges) {
  const a = 节点表.get(e.from).level, b = 节点表.get(e.to).level;
  if (a - b > 1) csv += `cross_level,${e.from},${e.to},${a},${b},${a - b},high,层级为最长路径深度而非语义分层；跨层本身不是缺陷\n`;
}
for (const n of 图.nodes) {
  const I = n.fanIn + n.fanOut === 0 ? 0 : n.fanOut / (n.fanIn + n.fanOut);
  const r = 半径表.get(n.id);
  if (I > 0.5 && r >= 8) csv += `unstable_shared,${n.id},,-,-,-,high,I=${I.toFixed(2)} 且爆炸半径=${r}：不稳定抽象被大量模块依赖\n`;
}
writeFileSync(resolve(目录, 'violations.csv'), csv);

console.log('写出 dependency-map.dot / impact-map.dot / violations.csv');
console.log('种子合并影响面节点数:', new Set([...受影响]).size, '/', 图.nodeCount);
