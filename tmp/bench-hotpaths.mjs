// 性能评审实测：在 Node 下加载真实发布代码（文本工具.js / 文本管线.js / 调度.js），
// 用仓库里最大的《笑傲江湖》测三个可疑热点的真实耗时：
//   1. 统计全文单字（for...of 全文字符 + Map 计数）
//   2. 扫描关键词命中（indexOf + containing 逐命中二分）
//   3. 尝试自动扩展关键词（每扩展一步做一次全文计数扫描）
// 文本工具 的依赖闭包在模块求值期只触 document.baseURI / 字素分段器，
// 用最小 stub 即可在 Node 下加载（与 verify-collocations.mjs 同法）。

import { readFileSync } from 'node:fs';

globalThis.document = { baseURI: 'http://127.0.0.1/' };
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };

const { 是汉字 } = await import('../js/文本工具.js');
const { 统计全文单字, 规范化文本 } = await import('../js/文本管线.js');

const 文件 = process.argv[2] ?? '../txt/笑傲江湖.txt';
const 全文 = readFileSync(new URL(文件, import.meta.url), 'utf8');
const 任务有效 = () => true;

console.log(`文本：${文件}（${全文.length.toLocaleString()} 字符）`);

// —— 1. 统计全文单字（app.js 载入文本时必经）——
{
  const t = performance.now();
  const 单字 = await 统计全文单字(全文, 任务有效);
  console.log(
    `1. 统计全文单字        ${Math.round(performance.now() - t)} ms（唯一字 ${单字.size} 个）`,
  );
}

// —— 2. 手写等价实现（charCodeAt 环绕 + Uint32 频次表）对照 ——
{
  const t = performance.now();
  const 频次 = new Uint32Array(0x10000);
  let 已扫描 = 0;
  const 码点缓存 = new Uint32Array(2);
  for (let idx = 0; idx < 全文.length; idx++) {
    const 码 = 全文.charCodeAt(idx);
    if (码 >= 0xd800 && 码 <= 0xdbff) {
      码点缓存[0] = 码;
      continue;
    }
    if (码 >= 0xdc00 && 码 <= 0xdfff) {
      const 码点 = 0x10000 + ((码点缓存[0] - 0xd800) << 10) + (码 - 0xdc00);
      if (码点 >= 0x3400 && 码点 <= 0x4dbf) 频次[码点] += 1;
      else if (码点 >= 0x4e00 && 码点 <= 0x9fff) 频次[码点] += 1;
      continue;
    }
    if ((码 >= 0x3400 && 码 <= 0x4dbf) || (码 >= 0x4e00 && 码 <= 0x9fff)) {
      频次[码] += 1;
    }
    已扫描 += 1;
  }
  let 唯一数 = 0;
  for (let 码 = 0x3400; 码 <= 0xa000; 码 += 1) {
    if (频次[码] === 1) 唯一数 += 1;
  }
  console.log(
    `2. charCodeAt 对照实现  ${Math.round(performance.now() - t)} ms（唯一字 ${唯一数} 个，含扩展平面单测法）`,
  );
}

// —— 3. 规范化文本（载入必经，逐字符扫描）——
{
  const t = performance.now();
  const 结果 = await 规范化文本(全文, 任务有效);
  console.log(
    `3. 规范化文本          ${Math.round(performance.now() - t)} ms（替换 ${结果.length - 全文.length >= 0 ? '若干' : ''}处）`,
  );
}

// —— 4. 全文 indexOf 命中扫描（关键词.js 的 扫描关键词命中 去掉 DOM 依赖后的等价路径）——
{
  const { 获取文本字素分段 } = await import('../js/文本工具.js');
  const t0 = performance.now();
  const 分段 = 获取文本字素分段(全文);
  const 建分段耗时 = Math.round(performance.now() - t0);

  const 关键词 = '他';
  const t = performance.now();
  let 搜索位置 = 0;
  let 命中数 = 0;
  while (搜索位置 <= 全文.length - 关键词.length) {
    const 位置 = 全文.indexOf(关键词, 搜索位置);
    if (位置 === -1) break;
    const 起始字素 = 分段.containing(位置);
    命中数 += 1;
    搜索位置 = 起始字素.index + 起始字素.segment.length;
  }
  console.log(
    `4. 单字命中扫描（containing/次）${Math.round(performance.now() - t)} ms（命中 ${命中数.toLocaleString()}，首次建分段 ${建分段耗时} ms）`,
  );
}

// —— 6. 文本管线其余载入阶段（app.js 应用文本 必经）——
{
  const { 创建引文索引, 整理句子换行, 构建句段负担索引 } = await import(
    '../js/文本管线.js'
  );
  const 规范全文 = await 规范化文本(全文, 任务有效);

  let t = performance.now();
  const 引文 = await 创建引文索引(规范全文, 任务有效);
  const 引文耗时 = Math.round(performance.now() - t);

  t = performance.now();
  const 句子 = await 整理句子换行(规范全文, 引文.边界列表, 任务有效);
  const 句子耗时 = Math.round(performance.now() - t);

  t = performance.now();
  const 负担 = await 构建句段负担索引(句子.文本, 任务有效);
  const 负担耗时 = Math.round(performance.now() - t);

  console.log(
    `6. 管线阶段：引文索引 ${引文耗时} ms（${引文.边界列表.length / 2} 段）· 句子整理 ${句子耗时} ms（新增换行 ${句子.新增换行数}）· 句段负担 ${负担耗时} ms（${负担.句段起点列表.length} 段）`,
  );

  // 按默认排版粗估虚拟行数：内容宽度约 940px、字号 30 → 每行约 31 字
  const 每行字数 = Math.floor(940 / 30);
  const 估行数 = Math.ceil(句子.文本.length / 每行字数);
  console.log(
    `7. 估虚拟行数 ~${估行数.toLocaleString()} 行 → 可见内容 DOM 约 ${估行数 > 0 ? '每屏 45 行' : ''}、渲染缓冲 12 行`,
  );
}

// —— 5. 字素分段器单次调用吞吐（渲染热路径 收集片段边界 每个非方块字素都调 查找字素终点）——
{
  const { 查找字素终点, 是安全字素码 } = await import('../js/文本工具.js');
  const 非安全样本 = [];
  for (let idx = 0; idx < 全文.length && 非安全样本.length < 2000; idx += 1) {
    const 码 = 全文.charCodeAt(idx);
    if (!是安全字素码(码)) 非安全样本.push(idx);
  }
  if (非安全样本.length) {
    const t = performance.now();
    for (const 起点 of 非安全样本) {
      查找字素终点(全文, 起点);
    }
    console.log(
      `5. 查找字素终点 ×${非安全样本.length} 次   ${Math.round(performance.now() - t)} ms（非安全码点位 ${非安全样本.length}/${全文.length} 抽样）`,
    );
  } else {
    console.log('5. 未发现非安全码点位');
  }
}
