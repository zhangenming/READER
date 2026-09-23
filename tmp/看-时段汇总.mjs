// 看一眼「页面激活与滚动」汇总表：一行一条，段数+滚动时长在前，激活时长进括号。
// 跑法：node tmp/看-时段汇总.mjs
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const 秒 = (h, m, s = 0) => h * 3600 + m * 60 + s;
const 数据 = {
  '2026-09-23': [
    [
      [秒(8, 0), 秒(8, 10, 22)],
      [秒(9, 5), 秒(9, 15)],
      [秒(11, 30), 秒(11, 33)],
      [秒(13, 0), 秒(13, 9)],
      [秒(17, 0), 秒(17, 5)],
      [秒(19, 10), 秒(19, 14)],
      [秒(19, 20), 秒(19, 26)],
      [秒(20, 0), 秒(20, 6, 22)],
    ],
    [
      [秒(7, 50), 秒(8, 20)],
      [秒(18, 40), 秒(19, 16, 4)],
    ],
  ],
  '2026-09-22': [
    [
      [秒(0, 30), 秒(0, 36)],
      [秒(0, 40), 秒(0, 44)],
      [秒(0, 50), 秒(1, 2)],
      [秒(11, 20), 秒(11, 25)],
      [秒(17, 0), 秒(17, 12)],
      [秒(22, 50), 秒(23, 7)],
      [秒(23, 10), 秒(23, 33, 25)],
    ],
    [
      [秒(0, 20), 秒(1, 40)],
      [秒(11, 15), 秒(11, 28)],
      [秒(16, 55), 秒(17, 15)],
      [秒(22, 40), 秒(23, 52)],
    ],
  ],
  '2026-09-21': [
    [[秒(11, 40), 秒(11, 47, 28)]],
    [
      [秒(11, 30), 秒(12, 3, 14)],
      [秒(23, 30), 秒(23, 40)],
    ],
  ],
  '2026-09-20': [
    [
      [秒(10, 0), 秒(10, 7)],
      [秒(10, 10), 秒(10, 16)],
      [秒(10, 20), 秒(10, 24, 45)],
      [秒(10, 30), 秒(10, 33)],
    ],
    [[秒(10, 22), 秒(10, 22, 1)]],  ],
};
// 与 js/阅读统计.js 的 格式化时段时长 同口径
function 时长(总输入) {
  const 总 = Math.floor(总输入);
  const 小时 = Math.floor(总 / 3600);
  const 分 = Math.floor(总 / 60) % 60;
  const 秒数 = 总 % 60;
  if (小时) return `${小时} 小时 ${分} 分`;
  if (分) return `${分} 分 ${秒数} 秒`;
  return `${秒数} 秒`;
}
const 期望 = Object.entries(数据).map(
  ([, [滚动, 激活]]) =>
    `${滚动.length} 段 · ${时长(滚动.reduce((n, [起, 止]) => n + 止 - 起, 0))}` +
    `（${时长(激活.reduce((n, [起, 止]) => n + 止 - 起, 0))}）`,
);

async function 取空闲端口(首选) {
  const 试 = async (端口) => {
    const 探测 = createServer();
    try {
      await new Promise((完成, 失败) => {
        探测.once('error', 失败);
        探测.listen(端口, '127.0.0.1', 完成);
      });
      return 探测.address().port;
    } catch {
      return 0;
    } finally {
      await new Promise((完成) => 探测.close(完成));
    }
  };
  return (await 试(首选)) || 试(0);
}
const CDP端口 = await 取空闲端口(9461);
const 站点端口 = await 取空闲端口(15961);
const 地址 = `http://127.0.0.1:${站点端口}/`;

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: resolve(import.meta.dirname, '..'),
  stdio: ['ignore', 'pipe', 'pipe'],
});
服务.stdout.resume();
服务.stderr.on('data', (块) => console.error('[server]', String(块).trim()));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(地址, { signal: AbortSignal.timeout(1000) })).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-stats-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1400',
    地址,
  ],
  { stdio: 'ignore' },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function 收尾(错误) {
  if (错误) console.error(错误);
  chrome.kill();
  服务.kill();
  process.exit(错误 ? 1 : 0);
}
process.on('unhandledRejection', 收尾);
process.on('uncaughtException', 收尾);

let 目标 = null;
for (let i = 0; i < 300 && !目标; i++) {
  try {
    const 列表 = await (
      await fetch(`http://127.0.0.1:${CDP端口}/json`)
    ).json();
    目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
  } catch {}
  await pause(200);
}
if (!目标) throw new Error('未找到 headless Chrome 页面');

const ws = new WebSocket(目标.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let 消息号 = 0;
const 待回复 = new Map();
ws.addEventListener('message', (事件) => {
  const 消息 = JSON.parse(事件.data);
  if (!消息.id) return;
  const 请求 = 待回复.get(消息.id);
  待回复.delete(消息.id);
  if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
  else 请求.resolve(消息.result);
});
function 发送(方法, 参数 = {}) {
  return new Promise((解决, 拒绝) => {
    const 下标 = ++消息号;
    待回复.set(下标, { resolve: 解决, reject: 拒绝 });
    ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
  });
}
async function 求值(代码) {
  const 结果 = await 发送('Runtime.evaluate', {
    expression: `(async () => { ${代码} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (结果.exceptionDetails)
    throw new Error(
      结果.exceptionDetails.exception?.description ||
        JSON.stringify(结果.exceptionDetails),
    );
  return 结果.result.value;
}
for (let i = 0; i < 600; i++) {
  const 就绪 = await 求值(`
    return !!document.querySelector('#阅读统计按钮') &&
      (document.querySelector('#载入状态')?.hidden ?? true);
  `);
  if (就绪) break;
  await pause(200);
}
// app.js 静态 import 了 阅读统计.js；轮询到模块可解析再动手，避免早于 app 启动时抓到半载的模块图
const 模块地址 = 地址 + 'js/' + encodeURIComponent('阅读统计') + '.js';
let 模块就绪 = false;
let 最后错误 = '';
for (let i = 0; i < 300 && !模块就绪; i++) {
  const 试 = await 求值(`
    try { const m = await import(${JSON.stringify(模块地址)});
      return { ok: typeof m.创建阅读统计内容 === 'function' }; }
    catch (e) { return { ok: false, 错: String(e), 页面: document.URL, 就绪: document.readyState }; }
  `);
  模块就绪 = 试.ok;
  最后错误 = 试.错 ? JSON.stringify(试) : '';
  if (!模块就绪) await pause(200);
}
if (!模块就绪) throw new Error('js/阅读统计.js 始终无法在页面里解析 ' + 最后错误);

const 结果 = await 求值(`
  const { 创建阅读统计内容 } = await import(${JSON.stringify(模块地址)});
  const 数据 = ${JSON.stringify(数据)};
  const 每日时段 = {}, 每日激活时段 = {};
  for (const [日期, [滚动, 激活]] of Object.entries(数据)) {
    每日时段[日期] = 滚动; 每日激活时段[日期] = 激活;
  }
  const 内容 = document.querySelector('#阅读统计内容');
  内容.textContent = '';
  内容.append(创建阅读统计内容({
    今日: 0, 今日前台: 0, 每日前台: {},
    书籍: [['x.txt', { 总滚动毫秒: 0, 总前台毫秒: 0 }]],
    文件名: 'x.txt', 进度: 0, 每日: {}, 每日时段, 每日激活时段,
    今天: '2026-09-23',
  }));
  document.querySelector('#阅读统计弹窗').showModal();
  const 表 = document.querySelector('.统计时段表');
  return {
    表头: [...表.querySelectorAll('thead th')].map((t) => t.textContent.trim()),
    行: [...表.querySelectorAll('tbody tr')].map((r) => {
      const 格 = r.querySelector('.统计时段汇总');
      const 括号 = 格.querySelector('.统计时段次要');
      const 行高 = parseFloat(getComputedStyle(格).lineHeight);
      const 轨 = r.querySelector('.统计时段轨道');
      const 文本度量 = document.createRange();
      文本度量.selectNodeContents(格);
      return {
        日期: r.querySelector('.统计时段日期').textContent,
        文本: 格.textContent,
        子节点数: 格.children.length,
        括号类: 括号 ? 括号.className : null,
        格宽: Math.round(格.getBoundingClientRect().width),
        文本宽: Math.round(文本度量.getBoundingClientRect().width),
        滚动宽: Math.round(轨.getBoundingClientRect().width),
        表宽: Math.round(document.querySelector('.统计时段表').width),
        格高: Math.round(格.getBoundingClientRect().height),
        行高: Math.round(行高),
        溢出: 格.scrollWidth > 格.clientWidth + 1,
      };
    }),
    弹窗宽: Math.round(document.querySelector('.阅读统计弹窗').getBoundingClientRect().width),
  };
`);
console.log(JSON.stringify(结果, null, 1));

assert.equal(结果.行.length, 4, '4 天数据 4 行');
assert.equal(结果.表头[0], '日期');
assert.equal(结果.表头[2], '滚动 · 激活', '列头仍标明两个数各是什么');
let 下标 = 0;
for (const 行 of 结果.行) {
  assert.doesNotMatch(行.文本, /滚动|激活/, `读数里不再出现「滚动/激活」：${行.文本}`);
  assert.equal(行.子节点数, 1, `每条读数只占一行：${行.文本}`);
  assert.match(行.文本, /^\d+ 段 · .+（.+）$/, `「N 段 · 时长（时长）」：${行.文本}`);
  assert.equal(行.括号类, '统计时段次要', '括号里的激活时长是次要墨色');
  assert.equal(行.文本, 期望[下标++], '数字与注入的段一致');
  assert.ok(
    !行.溢出 && 行.文本宽 <= 行.格宽 + 1,
    `一行读数放不下（文本 ${行.文本宽}px / 列宽 ${行.格宽}px，溢出 ${行.溢出}）：${行.文本}`,
  );
}
console.log('汇总行文案与单行检查通过');

// 窄屏（媒体查询把汇总列改回可换行）：不许横向溢出，宁可换行
async function 量窄屏(宽度) {
  await 发送('Emulation.setDeviceMetricsOverride', {
    width: 宽度,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await pause(400);
  const 窄 = await 求值(`
    const 表 = document.querySelector('.统计时段表');
    const 格 = 表.querySelector('.统计时段汇总');
    const 轨 = 表.querySelector('.统计时段轨道');
    return {
      弹窗宽: Math.round(document.querySelector('.阅读统计弹窗').getBoundingClientRect().width),
      格宽: Math.round(格.getBoundingClientRect().width),
      格高: Math.round(格.getBoundingClientRect().height),
      滚动宽: Math.round(轨.getBoundingClientRect().width),
      横向溢出: 格.scrollWidth > 格.clientWidth + 1,
      表溢出弹窗: Math.round(表.getBoundingClientRect().right -
        document.querySelector('.阅读统计内容').getBoundingClientRect().right),
    };
  `);
  console.log(`窄屏 ${宽度}px:`, JSON.stringify(窄));
  assert.ok(!窄.横向溢出, `窄屏汇总列横向溢出：${JSON.stringify(窄)}`);
  assert.ok(窄.表溢出弹窗 <= 1, `窄屏表格超出弹窗 ${窄.表溢出弹窗}px`);
  assert.ok(窄.滚动宽 > 100, `窄屏轨道被挤没了：${JSON.stringify(窄)}`);
  return 窄;
}
const 窄屏 = await 量窄屏(520);
assert.ok(窄屏.格高 > 21, '窄屏汇总列应换行占两行高');
await 发送('Emulation.clearDeviceMetricsOverride');
await pause(400);

const 盒 = await 求值(`
  const b = document.querySelector('.统计时段').getBoundingClientRect();
  return { x: Math.round(b.x) - 6, y: Math.round(b.y) - 6, w: Math.round(b.width) + 12, h: Math.round(b.height) + 12 };
`);
const { data } = await 发送('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 盒.x, y: 盒.y, width: 盒.w, height: 盒.h, scale: 2 },
});
writeFileSync(
  resolve(import.meta.dirname, '时段汇总-一行.png'),
  Buffer.from(data, 'base64'),
);
console.log('已写 tmp/时段汇总-一行.png');
收尾();
