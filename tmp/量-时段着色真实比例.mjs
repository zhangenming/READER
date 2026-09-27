// 量一问：轨道上「着色的宽度」和「账面时长」是不是同一个比例？
// 用真实快照数据（tmp/关键词救援-2026-09-26/localStorage-快照-A.json）注入统计弹窗，
// 逐块比对 真实像素宽（时长/轴跨度×轨道宽）与 实际绘制宽（getBoundingClientRect），
// 把 CSS min-width:3px 这条「短段兜底」造成的虚增算回时长里。
// 跑法：node tmp/跑-浏览器回归.mjs tmp/量-时段着色真实比例.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const 快照路径 = resolve(import.meta.dirname, '关键词救援-2026-09-26/localStorage-快照-A.json');
const 快照 = JSON.parse(readFileSync(快照路径, 'utf8'));
const 每日时段 = 快照['自动滚动统计'].每日时段;
const 每日激活时段 = 快照['前台停留统计'].每日激活时段;

const port = process.env.CDP_PORT;
const 站点 = 'http://127.0.0.1:15921';
const 目标列表 = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const 目标 = 目标列表.find((t) => t.type === 'page' && t.url.startsWith(站点));
const ws = new WebSocket(目标.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let 序号 = 0;
const 待回复 = new Map();
ws.addEventListener('message', (事件) => {
  const 消息 = JSON.parse(事件.data);
  const 请求 = 待回复.get(消息.id);
  if (!请求) return;
  待回复.delete(消息.id);
  消息.error ? 请求.reject(new Error(JSON.stringify(消息.error))) : 请求.resolve(消息.result);
});
const 发送 = (方法, 参数 = {}) =>
  new Promise((解决, 拒绝) => {
    const 下标 = ++序号;
    const 计时器 = setTimeout(() => {
      待回复.delete(下标);
      拒绝(new Error(`CDP 超时: ${方法}`));
    }, 30_000);
    待回复.set(下标, {
      resolve: (v) => (clearTimeout(计时器), 解决(v)),
      reject: (e) => (clearTimeout(计时器), 拒绝(e)),
    });
    ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
  });
async function 求值(代码) {
  const 结果 = await 发送('Runtime.evaluate', {
    expression: `(async () => { ${代码} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (结果.exceptionDetails)
    throw new Error(
      结果.exceptionDetails.exception?.description || JSON.stringify(结果.exceptionDetails),
    );
  return 结果.result.value;
}
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

await 发送('Page.enable');
await 发送('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await 发送('Page.reload', { ignoreCache: true });
for (let n = 0; n < 200; n++) {
  await pause(100);
  if (await 求值('return document.querySelector("#载入状态")?.hidden === true')) break;
}

const 量 = await 求值(`
  const { 创建阅读统计内容, 计算时段窗口 } = await import('./js/阅读统计.js');
  const 每日时段 = ${JSON.stringify(每日时段)};
  const 每日激活时段 = ${JSON.stringify(每日激活时段)};
  const 内容 = document.querySelector('#阅读统计内容');
  内容.textContent = '';
  内容.append(创建阅读统计内容({
    书籍: [['x.txt', { 总滚动毫秒: 0, 总前台毫秒: 0 }]],
    文件名: 'x.txt', 进度: 0, 每日时段, 每日激活时段, 今天: '2026-09-26',
  }));
  document.querySelector('#阅读统计弹窗').showModal();
  const 表 = document.querySelector('.统计时段表');
  const 轴 = 计算时段窗口(Object.entries(每日时段).concat(Object.entries(每日激活时段)));
  const 解析 = (标题) => {
    const [起, 止] = 标题.split(' · ')[0].split(' → ');
    const 到秒 = (串) => 串.split(':').map(Number).reduce((总, 段) => 总 * 60 + 段, 0);
    return 到秒(止) - 到秒(起);
  };
  return [...表.querySelectorAll('tbody tr')].map((行) => {
    const 轨道 = 行.querySelector('.统计时段轨道');
    const 轨 = 轨道.getBoundingClientRect();
    return {
      日期: 行.querySelector('.统计时段日期').title,
      激活列: 行.querySelector('.统计时段激活格').textContent,
      滚动列: 行.querySelector('.统计时段滚动格').textContent,
      轨道宽: 轨.width,
      块: [...轨道.children].map((块) => {
        const 秒 = 解析(块.title);
        const 真实 = (秒 / (轴.止秒 - 轴.起秒)) * 轨.width;
        return {
          激活: 块.classList.contains('统计时段块-激活'),
          秒,
          真实宽: +真实.toFixed(2),
          绘制宽: +块.getBoundingClientRect().width.toFixed(2),
        };
      }),
    };
  }).concat([{ 起秒: 轴.起秒, 止秒: 轴.止秒, 跨度: 轴.止秒 - 轴.起秒 }]);
`);

const 元信息 = 量.pop();
const 分 = (秒) => `${Math.floor(秒 / 60)} 分 ${String(Math.round(秒 % 60)).padStart(2, '0')} 秒`;
const 时 = (秒) =>
  `${String(Math.floor(秒 / 3600)).padStart(2, '0')}:${String(Math.floor(秒 / 60) % 60).padStart(2, '0')}`;
console.log(`轴 ${时(元信息.起秒)}–${时(元信息.止秒)} 跨度 ${(元信息.跨度 / 3600).toFixed(2)} 小时`);
let 总真实 = 0;
let 总绘制 = 0;
for (const 行 of 量) {
  for (const 类名 of ['激活', '滚动']) {
    const 块们 = 行.块.filter((块) => (类名 === '激活') === 块.激活);
    if (!块们.length) continue;
    const 真实秒 = 块们.reduce((总, 块) => 总 + 块.秒, 0);
    const 抬起 = 块们.filter((块) => 块.绘制宽 > 块.真实宽 + 0.01);
    const 绘制秒 = 块们.reduce((总, 块) => 总 + Math.max(块.绘制宽, 块.真实宽), 0);
    const 比例 = 行.轨道宽;
    const 着色占比 = 块们.reduce((总, 块) => 总 + 块.绘制宽, 0) / 比例;
    const 真实占比 = 真实秒 / 元信息.跨度;
    if (类名 === '激活') {
      总真实 += 真实秒;
      总绘制 += 着色占比 * 元信息.跨度;
    }
    console.log(
      `${行.日期} ${类名}：${块们.length} 段 账面 ${分(真实秒)}（占轴 ${(真实占比 * 100).toFixed(1)}%）` +
        ` 着色占轴 ${(着色占比 * 100).toFixed(1)}% = 看上去 ${分(着色占比 * 元信息.跨度)}` +
        `；被 3px 兜底抬起 ${抬起.length} 段`,
    );
  }
}
console.log(
  `灰带合计：账面 ${分(总真实)}，看上去 ${分(总绘制)}，虚增 ${(总绘制 / 总真实).toFixed(2)} 倍`,
);
console.log(`1px ≈ ${分(元信息.跨度 / 量[0].轨道宽)}；3px 兜底 ≈ ${分((3 * 元信息.跨度) / 量[0].轨道宽)}`);
assert.ok(量.length >= 5, '至少量到 5 天');
// 面积诚实闸：灰带合计的着色时长不许明显超过账面时长（3px 兜底只留给滚动块那一档）
assert.ok(
  总绘制 / 总真实 < 1.25,
  `灰带面积仍虚涨 ${(总绘制 / 总真实).toFixed(2)} 倍：账面 ${分(总真实)} 看上去 ${分(总绘制)}`,
);

// 顺手把真实数据的这一段截下来（弹窗自身有滚动，先把区块转到视口内再量）
const 区块 = await 求值(`
  document.querySelector('.统计时段').scrollIntoView({ block: 'start' });
  await new Promise((r) => setTimeout(r, 120));
  const b = document.querySelector('.统计时段').getBoundingClientRect();
  const 弹窗 = document.querySelector('.阅读统计弹窗').getBoundingClientRect();
  return { x: Math.max(b.x, 弹窗.x) - 6, y: Math.max(b.y, 弹窗.y) - 6,
    w: Math.min(b.width, 弹窗.width) + 12, h: Math.min(b.height, 弹窗.bottom - b.y) + 12 };
`);
const { data } = await 发送('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
  clip: { x: 区块.x, y: 区块.y, width: 区块.w, height: 区块.h, scale: 2 },
});
const { writeFileSync } = await import('node:fs');
writeFileSync(
  resolve(import.meta.dirname, '时段着色真实比例.png'),
  Buffer.from(data, 'base64'),
);
console.log('已写 tmp/时段着色真实比例.png（真实 7 天数据）');
ws.close();
process.exit(0);
