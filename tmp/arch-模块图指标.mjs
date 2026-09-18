// 从 js/*.js + app.js + 语音订阅.js 抽取 ES Module import 图，输出 JSON + 分层/扇入扇出指标。
// 运行：node tmp/arch-模块图指标.mjs > tmp/架构视图-2026-09-18/模块图.json
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, normalize, relative } from 'node:path';

const 根 = resolve(import.meta.dirname, '..');
const 名单 = ['app.js', '语音订阅.js', ...readdirSync(join(根, 'js')).filter((f) => f.endsWith('.js')).map((f) => join('js', f))];
const 集合 = new Set(名单);

const 出边 = new Map();
const 入边 = new Map();
for (const f of 名单) { 出边.set(f, new Set()); 入边.set(f, new Set()); }

const 具名 = new Map(); // 文件 → [{to, names}]
for (const f of 名单) {
  const 文本 = readFileSync(join(根, f), 'utf-8');
  具名.set(f, []);
  const re = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of 文本.matchAll(re)) {
    const spec = m[2];
    if (!spec.startsWith('.')) continue;
    const t = normalize(join(dirname(f), spec));
    if (!集合.has(t)) continue;
    出边.get(f).add(t);
    入边.get(t).add(f);
    具名.get(f).push({ to: t, names: m[1].split(',').map((s) => s.trim()).filter(Boolean) });
  }
}

// 最长路径分层（Kahn 拓扑序 + 深度）：深度 = 被依赖者的最大深度 + 1
const 深度 = new Map();
for (const f of 名单) 深度.set(f, 0);
const 待处理依赖数 = new Map();
for (const f of 名单) 待处理依赖数.set(f, 出边.get(f).size);
let 队列 = 名单.filter((f) => 待处理依赖数.get(f) === 0);
while (队列.length) {
  const 新队列 = [];
  for (const f of 队列) {
    for (const 引入者 of 入边.get(f)) {
      深度.set(引入者, Math.max(深度.get(引入者), 深度.get(f) + 1));
      待处理依赖数.set(引入者, 待处理依赖数.get(引入者) - 1);
      if (待处理依赖数.get(引入者) === 0) 新队列.push(引入者);
    }
  }
  队列 = 新队列;
}

const 节点 = 名单.map((f) => ({
  id: f,
  label: relative(根, f).replace(/\.js$/, ''),
  lines: readFileSync(join(根, f), 'utf-8').split('\n').length,
  fanOut: 出边.get(f).size,
  fanIn: 入边.get(f).size,
  level: 深度.get(f),
  edges: [...具名.get(f)].map((e) => ({ to: e.to, names: e.names })),
}));

const 边数组 = [];
for (const f of 名单) for (const t of 出边.get(f)) 边数组.push({ from: f, to: t });

const 按层 = {};
for (const n of 节点) (按层[n.level] ??= []).push(n.id);

console.log(JSON.stringify({
  generatedFrom: 'tmp/verify-模块图.mjs 同一套 import 正则',
  nodeCount: 节点.length,
  edgeCount: 边数组.length,
  maxLevel: Math.max(...节点.map((n) => n.level)),
  layers: 按层,
  topFanIn: [...节点].sort((a, b) => b.fanIn - a.fanIn).slice(0, 10).map((n) => `${n.id}:${n.fanIn}`),
  topFanOut: [...节点].sort((a, b) => b.fanOut - a.fanOut).slice(0, 10).map((n) => `${n.id}:${n.fanOut}`),
  nodes: 节点,
  edges: 边数组,
}, null, 2));
