// 由 模块图.json 计算：反向可达闭包(爆炸半径)、不稳定性指数 I、跨层边统计。
// 运行：node tmp/arch-影响面.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const 图 = JSON.parse(readFileSync(resolve(import.meta.dirname, '架构视图-2026-09-18/模块图.json'), 'utf-8'));
const 出 = new Map(); const 入 = new Map();
for (const n of 图.nodes) { 出.set(n.id, new Set()); 入.set(n.id, new Set()); }
for (const e of 图.edges) { 出.get(e.from).add(e.to); 入.get(e.to).add(e.from); }

function 闭包(起点, 邻接) {
  const 见过 = new Set([起点]); const 栈 = [起点];
  while (栈.length) { const 当前 = 栈.pop(); for (const 下 of 邻接.get(当前)) if (!见过.has(下)) { 见过.add(下); 栈.push(下); } }
  见过.delete(起点); return 见过;
}

const 最大层 = 图.maxLevel;
const 行 = 图.nodes.map((n) => {
  const 下游 = 闭包(n.id, 入); // 谁（直接或间接）依赖我
  const 上游 = 闭包(n.id, 出); // 我依赖谁
  const 稳定度 = n.fanIn + n.fanOut === 0 ? 0 : n.fanOut / (n.fanIn + n.fanOut);
  return {
    id: n.id, level: n.level, fanIn: n.fanIn, fanOut: n.fanOut, lines: n.lines,
    爆炸半径: 下游.size, 依赖面: 上游.size, I: Number(稳定度.toFixed(2)),
    下游: [...下游].sort(),
  };
});

// 跨层边（跳过 > 1 层）与"层级空洞"
const 跨层 = 图.edges.filter((e) => {
  const a = 图.nodes.find((n) => n.id === e.from).level;
  const b = 图.nodes.find((n) => n.id === e.to).level;
  return a - b > 1;
});

const 按半径 = [...行].sort((x, y) => y.爆炸半径 - x.爆炸半径);
console.log('id\tlevel\tfanIn\tfanOut\tI\t爆炸半径\t依赖面\t行数');
for (const r of 按半径) console.log(`${r.id}\t${r.level}\t${r.fanIn}\t${r.fanOut}\t${r.I}\t${r.爆炸半径}\t${r.依赖面}\t${r.lines}`);
console.log('\n跨层边(from→to, 跨度>1层):', 跨层.length, '条 /', 图.edgeCount, '总边');
console.log('高危：I>0.5 且 爆炸半径>=8');
for (const r of 按半径) if (r.I > 0.5 && r.爆炸半径 >= 8) console.log(`  ${r.id} I=${r.I} 半径=${r.爆炸半径}`);
console.log('\n最不可依赖(半径>=15)的直接下游:');
for (const r of 按半径.slice(0, 6)) console.log(`  ${r.id} (${r.爆炸半径}) → ${r.下游.slice(0, 12).join(' ')}${r.下游.length > 12 ? ' …' : ''}`);
console.log('\n最大层', 最大层);
