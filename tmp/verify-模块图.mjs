// 模块图静态检查：验证 js/ 与 app.js 的 ES Module 依赖图
//   1. 所有 import 的具名导出在目标模块中存在（抓改名/漏改）
//   2. 依赖图无环（架构约束：允许的环为零）
// 运行：node tmp/verify-模块图.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, normalize } from 'node:path';

const 根目录 = resolve(import.meta.dirname, '..');
const 模块文件列表 = ['app.js', '语音订阅.js', ...readdirSync(join(根目录, 'js'))
  .filter((名) => 名.endsWith('.js'))
  .map((名) => join('js', 名))];

const 导出缓存 = new Map();
const import边 = new Map(); // 文件 → [{ 目标, 具名列表 }]

function 读取导出(文件) {
  if (导出缓存.has(文件)) return 导出缓存.get(文件);
  const 文本 = readFileSync(join(根目录, 文件), 'utf-8');
  const 导出集合 = new Set();
  const 标识符 = String.raw`[\p{L}\p{N}_$]+`;
  for (const 匹配 of 文本.matchAll(
    new RegExp(`export\\s+(?:async\\s+)?function\\s+(${标识符})`, 'gu'),
  )) {
    导出集合.add(匹配[1]);
  }
  for (const 匹配 of 文本.matchAll(
    new RegExp(`export\\s+const\\s+(${标识符})`, 'gu'),
  )) {
    导出集合.add(匹配[1]);
  }
  for (const 匹配 of 文本.matchAll(
    new RegExp(`export\\s+class\\s+(${标识符})`, 'gu'),
  )) {
    导出集合.add(匹配[1]);
  }
  导出缓存.set(文件, 导出集合);
  return 导出集合;
}

let 错误数 = 0;

for (const 文件 of 模块文件列表) {
  const 文本 = readFileSync(join(根目录, 文件), 'utf-8');
  for (const 匹配 of 文本.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const 具名列表 = 匹配[1].split(',').map((名) => 名.trim()).filter(Boolean);
    const 是相对路径 = 匹配[2].startsWith('.');
    const 目标 = 是相对路径
      ? normalize(join(dirname(文件), 匹配[2]))
      : 匹配[2];
    if (!是相对路径 && !目标.endsWith('.js')) {
      console.error(`✗ ${文件}: import 目标不是相对 .js 模块: ${匹配[2]}`);
      错误数 += 1;
      continue;
    }
    const 目标文件 = 是相对路径 ? 目标 : null;
    if (目标文件 && !existsSync(join(根目录, 目标文件))) {
      console.error(`✗ ${文件}: 目标模块不存在: ${匹配[2]}`);
      错误数 += 1;
      continue;
    }
    if (目标文件) {
      const 导出集合 = 读取导出(目标文件);
      for (const 名 of 具名列表) {
        if (!导出集合.has(名)) {
          console.error(`✗ ${文件}: 从 ${目标文件} import 的导出不存在: ${名}`);
          错误数 += 1;
        }
      }
      (import边.get(文件) ?? import边.set(文件, []).get(文件)).push(目标文件);
    }
  }
}

// 环检测（DFS 三色标记）
const 颜色 = new Map(); // 0=未访问 1=访问中 2=完成
const 栈 = [];

function 检测环(文件) {
  if (颜色.get(文件) === 2) return;
  if (颜色.get(文件) === 1) {
    const 环起点 = 栈.indexOf(文件);
    const 环 = [...栈.slice(环起点), 文件];
    console.error(`✗ 依赖环: ${环.join(' → ')}`);
    错误数 += 1;
    return;
  }
  颜色.set(文件, 1);
  栈.push(文件);
  for (const 目标 of import边.get(文件) ?? []) {
    if (导入目标在模块集合(目标)) {
      检测环(目标);
    }
  }
  栈.pop();
  颜色.set(文件, 2);
}

function 导入目标在模块集合(目标) {
  return 模块文件列表.includes(目标);
}

for (const 文件 of 模块文件列表) {
  检测环(文件);
}

// 汇总依赖边（便于人工核对分层）
const 边列表 = [];
for (const [文件, 目标列表] of import边) {
  for (const 目标 of 目标列表) {
    if (导入目标在模块集合(目标)) {
      边列表.push(`${文件} → ${目标}`);
    }
  }
}
console.log('依赖边:');
for (const 边 of 边列表.sort()) {
  console.log(`  ${边}`);
}

if (错误数 > 0) {
  console.error(`\n失败：${错误数} 个错误`);
  process.exit(1);
}
console.log('\n通过：依赖图无环，全部 import 具名导出存在');
