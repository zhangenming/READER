// 从 Chrome LevelDB 的 .ldb（sstable）与 .log 中捞取该持久化键的历史取值。
// 只读浏览器文件，绝不写入；输出写到本目录。
import fs from 'node:fs';
import path from 'node:path';

const 目录 = '/Users/zem/Library/Application Support/Google/Chrome/Profile 1/Local Storage/leveldb';
const 针 = Buffer.from('原文阅读器:阅读状态:v2', 'utf16le');
const 块大小 = 4096;

function snappy(输入, 起) {
  let p = 起;
  let 总长 = 0, 移 = 0;
  for (;;) {
    if (p >= 输入.length) return null;
    const b = 输入[p++];
    总长 |= (b & 0x7f) << 移;
    if (!(b & 0x80)) break;
    移 += 7;
  }
  if (总长 <= 0 || 总长 > 64 * 1024) return null;
  const 出 = Buffer.allocUnsafe(总长);
  let 写 = 0;
  while (p < 输入.length && 写 < 总长) {
    const 标 = 输入[p++];
    const 型 = 标 & 3;
    if (型 === 0) {
      let 长 = 标 >> 2;
      if (长 >= 60) {
        const 额外 = 长 - 59;
        if (p + 额外 > 输入.length) return null;
        长 = 0;
        for (let i = 0; i < 额外; i++) 长 |= 输入[p + i] << (8 * i);
        p += 额外;
      }
      长 += 1;
      if (p + 长 > 输入.length) return null;
      输入.copy(出, 写, p, p + 长);
      p += 长;
      写 += 长;
    } else {
      let 长, 偏移;
      if (型 === 1) {
        if (p >= 输入.length) return null;
        长 = ((标 >> 2) & 7) + 4;
        偏移 = ((标 >> 5) << 8) | 输入[p++];
      } else if (型 === 2) {
        if (p + 2 > 输入.length) return null;
        长 = (标 >> 2) + 1;
        偏移 = 输入.readUInt16LE(p);
        p += 2;
      } else {
        if (p + 4 > 输入.length) return null;
        长 = (标 >> 2) + 1;
        偏移 = 输入.readUInt32LE(p);
        p += 4;
      }
      if (!偏移 || 偏移 > 写 || 写 + 长 > 总长) return null;
      for (let i = 0; i < 长; i++) 出[写 + i] = 出[写 + i - 偏移];
      写 += 长;
    }
  }
  return 写 === 总长 ? { 出, 耗: p - 起 } : null;
}

function 遍历sstable(文件) {
  const buf = fs.readFileSync(path.join(目录, 文件));
  const 块们 = [];
  let o = 0;
  let 失败 = 0;
  while (o < buf.length) {
    const 试 = snappy(buf, o);
    if (试 && buf[o + 试.耗] === 1) {
      块们.push(试.出);
      o += 试.耗 + 5;
      continue;
    }
    if (o + 块大小 + 5 <= buf.length && buf[o + 块大小] === 0) {
      块们.push(buf.subarray(o, o + 块大小));
      o += 块大小 + 5;
      continue;
    }
    失败++;
    o += 1;
    if (失败 > 4000) break;
  }
  return Buffer.concat(块们);
}

function 遍历日志(文件) {
  const buf = fs.readFileSync(path.join(目录, 文件));
  const 记录 = [];
  let 当前 = null;
  for (let 块 = 0; 块 + 7 <= buf.length; 块 += 32768) {
    let 偏 = 块;
    while (偏 + 7 <= Math.min(块 + 32768, buf.length)) {
      const 长 = buf.readUInt16LE(偏 + 4);
      const 型 = buf[偏 + 6];
      const 始 = 偏 + 7;
      if (长 === 0 || 始 + 长 > 块 + 32768) break;
      const 体 = buf.subarray(始, 始 + 长);
      if (型 === 1) { 记录.push(Buffer.from(体)); 当前 = null; }
      else if (型 === 2) 当前 = Buffer.from(体);
      else if (型 === 3 && 当前) 当前 = Buffer.concat([当前, 体]);
      else if (型 === 4 && 当前) { 记录.push(Buffer.concat([当前, 体])); 当前 = null; }
      偏 = 始 + 长;
    }
  }
  return Buffer.concat(记录);
}

function 取快照(数据) {
  const 结果 = [];
  let p = 数据.indexOf(针);
  while (p >= 0) {
    const s = 数据.subarray(p + 针.length).toString('utf16le');
    const 起 = s.indexOf('{');
    if (起 >= 0) {
      let 深 = 0, 串 = false, 转 = false, 终 = -1;
      for (let q = 起; q < s.length; q++) {
        const c = s[q];
        if (转) { 转 = false; continue; }
        if (c === '\\') { 转 = true; continue; }
        if (c === '"') { 串 = !串; continue; }
        if (串) continue;
        if (c === '{') 深++;
        else if (c === '}') { 深--; if (!深) { 终 = q + 1; break; } }
      }
      if (终 > 0) { try { 结果.push(JSON.parse(s.slice(起, 终))); } catch {} }
    }
    p = 数据.indexOf(针, p + 针.length);
  }
  return 结果;
}

const 全部 = [];
for (const f of fs.readdirSync(目录).sort()) {
  let 数据 = null;
  try {
    数据 = /\.log$/.test(f) ? 遍历日志(f) : /\.ldb$/.test(f) ? 遍历sstable(f) : null;
  } catch {}
  if (!数据) continue;
  const 快照 = 取快照(数据);
  if (快照.length) console.log(`${f} → ${快照.length} 份可解析快照`);
  全部.push(...快照);
}

const 去重 = new Map();
for (const s of 全部) {
  const 指纹 = Object.entries(s.文本状态 ?? {})
    .map(([k, v]) => `${k}=${v.文本长度}:${v.关键词列表?.length ?? 0}`)
    .join('|');
  if (!去重.has(指纹)) 去重.set(指纹, s);
}
let n = 0;
for (const [指纹, s] of 去重) {
  const 摘要 = 指纹.split('|').filter((x) => !x.endsWith(':0')).map((x) => {
    const [名, 长, 词] = x.split(/=(\d+):(\d+)$/);
    return `${名.slice(0, 10)} ${词}词/len${长}`;
  });
  console.log(`快照#${n}: ${摘要.join(' , ')}`);
  fs.writeFileSync(new URL(`./历史快照-${n}.json`, import.meta.url), JSON.stringify(s, null, 1));
  n++;
}
console.log('可解析快照（去重后）', n, '份 / 原始', 全部.length, '份');
