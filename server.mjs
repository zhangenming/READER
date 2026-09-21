#!/usr/bin/env node
// 本地静态服务器。python3 -m http.server 不发送任何缓存头，浏览器只能靠
// Last-Modified 做启发式缓存，普通刷新经常直接用内存缓存里的旧 JS/CSS。
// 这里对所有响应统一加 Cache-Control: no-cache：浏览器每次刷新都会回源
// 校验，文件没变走 304，变了立刻拿新代码——普通刷新永远看到最新代码。
// 同时保留 python3 -m http.server 的目录列表能力：阅读器「内容选择」弹窗
// fetch('./txt/') 靠解析目录页里的 <a href> 得到文本清单，缺了列表弹窗会报
// 「无法读取 txt 目录」。
import { createServer } from 'node:http';
import { stat, createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const 根目录 = fileURLToPath(new URL('.', import.meta.url));
const 端口 = Number(process.argv[2]) || 15921;

const MIME类型 = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

createServer((req, res) => {
  处理请求(req, res).catch(() => {
    if (!res.headersSent) 响应(res, 500, 'Internal Server Error');
    else res.end();
  });
}).listen(端口, '0.0.0.0', () => {
  console.log(`阅读器服务: http://localhost:${端口} （所有资源 Cache-Control: no-cache，普通刷新即最新）`);
}).on('error', (错误) => {
  console.error(`服务启动失败: ${错误.message}`);
  process.exit(1);
});

async function 处理请求(req, res) {
  const 地址 = new URL(req.url, 'http://localhost');
  let 路径;
  try {
    路径 = decodeURIComponent(地址.pathname);
  } catch {
    return 响应(res, 400, 'Bad Request');
  }
  let 文件 = resolve(join(根目录, 路径));
  if (文件 !== 根目录.slice(0, -1) && !文件.startsWith(根目录)) {
    return 响应(res, 403, 'Forbidden');
  }
  let 信息 = await 查状态(文件);
  if (信息?.isDirectory()) {
    // 目录列表里的链接是相对路径，只有请求地址以 '/' 结尾时浏览器才能正确解析，
    // 所以先补斜杠重定向（与 python3 -m http.server 的行为一致）。
    if (!路径.endsWith('/')) {
      return 重定向(res, 地址.pathname + '/');
    }
    const 首页 = join(文件, 'index.html');
    const 首页信息 = await 查状态(首页);
    if (首页信息?.isFile()) {
      文件 = 首页;
      信息 = 首页信息;
    } else {
      return 目录列表(res, 文件, 路径);
    }
  }
  if (!信息?.isFile()) return 响应(res, 404, 'Not Found');
  const 统计 = 信息;

  // HTTP 日期只有秒精度，毫秒归零后才能和 If-Modified-Since 严格比较。
  const 最近修改 = new Date(统计.mtimeMs);
  最近修改.setMilliseconds(0);
  const 响应头 = {
    'Content-Type': MIME类型[extname(文件).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Last-Modified': 最近修改.toUTCString(),
  };
  const 客户端时间 = req.headers['if-modified-since'];
  const 解析时间 = 客户端时间 ? new Date(客户端时间) : null;
  if (解析时间 && !Number.isNaN(解析时间.getTime()) && 解析时间 >= 最近修改) {
    res.writeHead(304, 响应头);
    return res.end();
  }
  响应头['Content-Length'] = 统计.size;
  res.writeHead(200, 响应头);
  createReadStream(文件)
    .on('error', () => res.destroy())
    .pipe(res);
}

async function 目录列表(res, 目录, 路径) {
  let 条目;
  try {
    条目 = await readdir(目录, { withFileTypes: true });
  } catch {
    return 响应(res, 403, 'Forbidden');
  }
  // 目录排在文件前面，其余按名称（忽略大小写）排序；阅读器自己会再做拼音排序。
  条目.sort(function 排序条目(左, 右) {
    if (左.isDirectory() !== 右.isDirectory()) return 左.isDirectory() ? -1 : 1;
    const 左名 = 左.name.toLowerCase();
    const 右名 = 右.name.toLowerCase();
    return 左名 < 右名 ? -1 : 左名 > 右名 ? 1 : 0;
  });
  const 列表项 = 条目.map(function 渲染条目(条目项) {
    const 是目录 = 条目项.isDirectory();
    // href 只放文件名本身（百分号编码），这样它永远相对于当前目录解析，
    // 不受请求路径的编码差异影响。
    const 链接 = encodeURIComponent(条目项.name) + (是目录 ? '/' : '');
    return `  <li><a href="${链接}">${转义HTML(条目项.name + (是目录 ? '/' : ''))}</a></li>`;
  });
  const 正文 = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>目录列表 ${转义HTML(路径)}</title></head>
<body>
<h1>目录列表：${转义HTML(路径)}</h1>
<ul>
${列表项.join('\n')}
</ul>
</body>
</html>
`;
  const 字节 = Buffer.from(正文, 'utf8');
  // 目录内容随时可能变化，列表不参与任何缓存与条件请求。
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': 字节.length,
  });
  res.end(字节);
}

function 转义HTML(文本) {
  return 文本
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function 重定向(res, 位置) {
  res.writeHead(301, {
    Location: 位置,
    'Cache-Control': 'no-store',
    'Content-Length': 0,
  });
  res.end();
}

function 查状态(文件) {
  return new Promise((完成) => {
    stat(文件, (错误, 信息) => 完成(错误 ? null : 信息));
  });
}

function 响应(res, 状态码, 文本) {
  res.writeHead(状态码, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(文本);
}
