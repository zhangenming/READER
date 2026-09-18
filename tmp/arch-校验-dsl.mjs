// 无 Structurizr CLI 时的 DSL 静态自检（保守版，不依赖括号嵌套推算）。
// 校验 skill 文档列出的三类致命错误：
//   1. 位置参数字符串数超上限（person/softwareSystem<=3, container/component/关系<=4）
//   2. 关系与视图引用的标识符从未以 `名 = 关键字` 形式声明（Unknown element）
//   3. 使用了 component 视图却未开 !identifiers hierarchical
// 运行：node tmp/arch-校验-dsl.mjs <file.dsl>
import { readFileSync } from 'node:fs';

const 文件 = process.argv[2];
if (!文件) { console.error('用法: node tmp/arch-校验-dsl.mjs <file.dsl>'); process.exit(2); }
const 行列表 = readFileSync(文件, 'utf-8').split('\n');
const 错误 = [];
const 声明名 = new Map(); // 局部变量名 → 关键字
const 上限 = { person: 3, softwareSystem: 3, container: 4, component: 4 };
let 有层级标识 = false;
let 有component视图 = false;

// 逐字符扫描：只有引号外的 // 才是行注释；引号内的 //（如 "wss://host"）必须保留。
function 去注释(行) {
  let 出 = ''; let 在串内 = false;
  for (let i = 0; i < 行.length; i++) {
    const c = 行[i];
    if (c === '"' && 行[i - 1] !== '\\') { 在串内 = !在串内; 出 += c; continue; }
    if (!在串内 && c === '/' && 行[i + 1] === '/') break;
    出 += c;
  }
  return 出;
}
const 去引号 = (行) => 行.replace(/"(?:[^"\\]|\\.)*"/g, '""');

行列表.forEach((原始行, i) => {
  const 行号 = i + 1;
  const 行 = 去注释(原始行).trim();
  if (!行) return;

  if (/!\s*identifiers\s+hierarchical/.test(行)) 有层级标识 = true;

  const m = 行.match(/^([A-Za-z_$\p{L}][\p{L}\p{N}_$]*)\s*=\s*(person|softwareSystem|container|component)\s+(.*)$/u);
  if (m) {
    const [, 名, 关键字, 剩余] = m;
    if (声明名.has(名)) 错误.push(`L${行号} 变量名重复声明: ${名}`);
    声明名.set(名, 关键字);
    const 串 = [...剩余.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
    if (串.length > 上限[关键字]) {
      错误.push(`L${行号} ${关键字} "${名}" 位置字符串 ${串.length} 个 > 上限 ${上限[关键字]} → Too many tokens`);
    }
    return;
  }

  const r = 行.match(/^([\w.$\p{L}]+)\s*(->|<->|\.\.>|-->)\s*([\w.$\p{L}]+)(.*)$/u);
  if (r) {
    for (const 端点 of [r[1], r[3]]) {
      const 段 = 端点.split('.');
      for (const s of 段) {
        if (!声明名.has(s)) 错误.push(`L${行号} 端点 "${端点}" 的段 "${s}" 未声明 → Unknown element`);
      }
    }
    const 尾 = [...r[4].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
    const 带块 = /\{\s*$/.test(行);
    if (尾.length + (带块 ? 1 : 0) > 4) 错误.push(`L${行号} 关系位置参数 ${尾.length} > 4`);
    return;
  }

  const v = 行.match(/^(systemContext|container|component|deployment|dynamic|filtered)\s+([\w.$\p{L}]+)/u);
  if (v) {
    if (v[1] === 'component') 有component视图 = true;
    for (const s of v[2].split('.')) {
      if (!声明名.has(s)) 错误.push(`L${行号} 视图键 "${v[2]}" 的段 "${s}" 未声明`);
    }
    const 关键字集 = new Set([...声明名.values()]);
    if (v[1] === 'component' && !关键字集.has('container')) 错误.push(`L${行号} component 视图但模型中无 container 父级`);
  }
});

if (有component视图 && !有层级标识) 错误.push('存在 component 视图但未声明 !identifiers hierarchical → 路径不可解析');

let 净 = 0;
for (const 行 of 行列表.map(去注释).map((x) => x.replace(/"[^"]*"/g, '""'))) 净 += (x_(行, '{')) - (x_(行, '}'));
function x_(行, 符号) { return (行.split(符号).length - 1); }
if (净 !== 0) 错误.push(`花括号失衡，净深度 ${净}`);

console.log(`校验 ${文件}`);
console.log(`声明 ${声明名.size} 个元素：`);
for (const [名, 关键字] of 声明名) console.log(`  ${关键字.padEnd(15)} ${名}`);
if (错误.length) { console.log(`\n✗ ${错误.length} 个问题:`); for (const e of 错误) console.log(`  ${e}`); process.exit(1); }
console.log('\n✓ 通过：位置参数未超量、所有引用段均可解析到声明、括号平衡、component 视图具备 hierarchical 标识');
