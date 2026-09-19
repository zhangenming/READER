#!/usr/bin/env node
// 本地静态服务器。python3 -m http.server 不发送任何缓存头，浏览器只能靠
// Last-Modified 做启发式缓存，普通刷新经常直接用内存缓存里的旧 JS/CSS。
// 这里对所有响应统一加 Cache-Control: no-cache：浏览器每次刷新都会回源
// 校验，文件没变走 304，变了立刻拿新代码——普通刷新永远看到最新代码。
import { createServer } from 'node:http';
import { stat, createReadStream } from 'node:fs';
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
  let 路径;
  try {
    路径 = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return 响应(res, 400, 'Bad Request');
  }
  let 文件 = resolve(join(根目录, 路径));
  if (文件 !== 根目录.slice(0, -1) && !文件.startsWith(根目录)) {
    return 响应(res, 403, 'Forbidden');
  }
  let 信息 = await 查找文件(文件);
  if (!信息) return 响应(res, 404, 'Not Found');
  const { 文件: 最终文件, 信息: 统计 } = 信息;

  // HTTP 日期只有秒精度，毫秒归零后才能和 If-Modified-Since 严格比较。
  const 最近修改 = new Date(统计.mtimeMs);
  最近修改.setMilliseconds(0);
  const 响应头 = {
    'Content-Type': MIME类型[extname(最终文件).toLowerCase()] || 'application/octet-stream',
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
  createReadStream(最终文件)
    .on('error', () => res.destroy())
    .pipe(res);
}

async function 查找文件(文件) {
  let 信息 = await 查状态(文件);
  if (信息?.isDirectory()) {
    文件 = join(文件, 'index.html');
    信息 = await 查状态(文件);
  }
  if (!信息?.isFile()) return null;
  return { 文件, 信息 };
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
