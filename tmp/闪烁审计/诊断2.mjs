// 深度诊断：几何探针 + 类翻转监控 + 自动滚动/滚轮模拟双场景。
// 目标：查明「时钟遮挡判定为何从未触发」+ 捕获滚动期间所有可见性类翻转。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 站点端口 = 15933;
const CDP端口 = 15934;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function 清理遗留profile(跳过) {
  for (const 名 of readdirSync(tmpdir())) {
    if (!名.startsWith('reader-')) continue;
    const 路径 = join(tmpdir(), 名);
    if (路径 === 跳过) continue;
    try { execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' }); continue; } catch {}
    rmSync(路径, { recursive: true, force: true });
  }
}
清理遗留profile();
const profile = mkdtempSync(join(tmpdir(), 'reader-diag2-'));
let 服务 = null, chrome = null, ws = null;
process.on('exit', () => {
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { 服务?.kill(); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
});
服务 = spawn('node', ['server.mjs', String(站点端口)], { cwd: '/Users/zem/AI/READER', stdio: 'ignore' });
await pause(1000);
chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP端口}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1440,900',
  `http://127.0.0.1:${站点端口}/`,
], { stdio: 'ignore' });
let 目标 = null;
for (let n = 0; n < 100 && !目标; n++) {
  try {
    const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
    目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${站点端口}/`));
  } catch {}
  if (!目标) await pause(300);
}
if (!目标) { console.error('CDP 未就绪'); process.exit(1); }
ws = new WebSocket(目标.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const console日志 = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === 'Runtime.consoleAPICalled') {
    console日志.push(`[${msg.params.type}] ${msg.params.args?.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 160)}`);
  }
  if (!msg.id) return;
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
});
const 发送 = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP 超时: ${method}`)); } }, 90_000);
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (code) => {
  const r = await 发送('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
await 发送('Runtime.enable');

try {
  // 1. 载书（点「嫌疑人」那本，上次实际载入的就是它）
  await evaluate(`
    const { 打开内容选择弹窗 } = await import("./js/内容选择弹窗.js");
    打开内容选择弹窗(); return 1;`);
  for (let n = 0; n < 60; n++) {
    const ready = await evaluate(`document.querySelectorAll('#内容选择列表 .书名, #内容选择列表 li, #内容选择列表 button').length`).catch(() => 0);
    if (ready > 0) break;
    await pause(300);
  }
  await evaluate(`
    const 项 = [...document.querySelectorAll('#内容选择列表 *')].find(el => el.textContent.includes('嫌疑人') && el.children.length === 0);
    (项?.closest('li,button,tr') ?? 项)?.click(); return 1;`);
  await pause(3000);
  const 基线 = await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    return { 行高: 状态.行高, 行数: 状态.行起点列表.length, 文件名: 状态.文件名, scrollTop: document.querySelector('.滚动容器').scrollTop };`);
  console.log('基线:', JSON.stringify(基线));

  // 2. 几何探针（静止状态）
  const 几何 = await evaluate(`
    const 浮层 = document.querySelector('.时间信息');
    const 容器 = document.querySelector('.滚动容器');
    const 矩形 = 浮层.getBoundingClientRect();
    const 视口 = { w: window.innerWidth, h: window.innerHeight };
    const 白线 = getComputedStyle(document.documentElement).getPropertyValue('--底部白线高');
    // 浮层 5 个采样点下的元素栈
    const 点位 = [];
    for (const [fx, fy] of [[0.05,0.5],[0.35,0.5],[0.65,0.5],[0.95,0.5],[0.5,0.15],[0.5,0.85]]) {
      const x = Math.round(矩形.left + (矩形.width - 1) * fx);
      const y = Math.round(矩形.top + (矩形.height - 1) * fy);
      点位.push({ x, y, 栈: document.elementsFromPoint(x, y).slice(0, 4).map(e => e.tagName + '.' + (e.className || e.id || '')) });
    }
    // 底部最后一行可见文字的右缘
    const 字列表 = [...document.querySelectorAll('.可见内容 .字')];
    let 最低字 = null;
    for (const 字 of 字列表) { const r = 字.getBoundingClientRect(); if (r.width && (!最低字 || r.bottom > 最低字.bottom)) 最低字 = r; }
    // 浮层矩形与 .字 的相交数
    let 相交 = 0;
    for (const 字 of 字列表) { const r = 字.getBoundingClientRect(); if (r.left < 矩形.right && r.right > 矩形.left && r.top < 矩形.bottom && r.bottom > 矩形.top) 相交 += 1; }
    // 手动调用遮挡判定看结果
    const { 刷新时钟遮挡 } = await import('./js/时钟遮挡.js');
    刷新时钟遮挡();
    return {
      视口, 白线: 白线.trim(),
      浮层矩形: { l: Math.round(矩形.left), t: Math.round(矩形.top), r: Math.round(矩形.right), b: Math.round(矩形.bottom), w: Math.round(矩形.width), h: Math.round(矩形.height) },
      浮层可见行数: [...浮层.children].filter(c => !c.hidden && getComputedStyle(c).display !== 'none').length,
      点位, 最低字右缘: 最低字 ? Math.round(最低字.right) : null, 最低字底: 最低字 ? Math.round(最低字.bottom) : null,
      相交字数: 相交, 遮挡类: 浮层.classList.contains('被正文遮挡'),
      浮层computedVisibility: getComputedStyle(浮层).visibility,
      body类: document.body.className,
    };`);
  console.log('几何探针(静止):', JSON.stringify(几何, null, 1));

  // 3. 滚到中部（正文密集区），再探一次
  const 几何中部 = await evaluate(`
    const 容器 = document.querySelector('.滚动容器');
    容器.scrollTop = 容器.scrollHeight / 2;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const { 刷新时钟遮挡 } = await import('./js/时钟遮挡.js');
    刷新时钟遮挡();
    const 浮层 = document.querySelector('.时间信息');
    const 矩形 = 浮层.getBoundingClientRect();
    const 字列表 = [...document.querySelectorAll('.可见内容 .字')];
    let 相交 = 0;
    for (const 字 of 字列表) { const r = 字.getBoundingClientRect(); if (r.left < 矩形.right && r.right > 矩形.left && r.top < 矩形.bottom && r.bottom > 矩形.top) 相交 += 1; }
    return { scrollTop: 容器.scrollTop, 相交字数: 相交, 遮挡类: 浮层.classList.contains('被正文遮挡'),
      浮层矩形: { t: Math.round(矩形.top), b: Math.round(矩形.bottom), r: Math.round(矩形.right), h: Math.round(矩形.height) } };`);
  console.log('几何探针(中部):', JSON.stringify(几何中部, null, 1));

  // 4. 安装类翻转监控（body/浮层/进度盒/指示器/按钮组 的 class/hidden/style 变更）
  await evaluate(`
    window.__翻转 = [];
    const 记 = (who, what) => { if (window.__翻转.length < 500) window.__翻转.push({ t: Math.round(performance.now()), who, what: what.slice(0, 80) }); };
    const 目标们 = [
      [document.body, 'body'],
      [document.querySelector('.时间信息'), '时间信息'],
      [document.querySelector('#滚动进度'), '滚动进度'],
      [document.querySelector('#关键词指示器'), '指示器'],
      [document.querySelector('.右下按钮组'), '按钮组'],
      [document.querySelector('.可见内容'), '可见内容'],
    ];
    for (const [el, name] of 目标们) {
      if (!el) continue;
      new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.attributeName === 'class') 记(name, (m.oldValue ?? '∅') + ' → ' + el.className);
          else if (m.attributeName === 'hidden') 记(name, 'hidden=' + el.hidden);
        }
      }).observe(el, { attributes: true, attributeFilter: ['class', 'hidden'], attributeOldValue: true });
    }
    return 目标们.filter(([el]) => el).length;`);

  // 5. 自动滚动 8 秒（含每 250ms 的状态采样）
  const 自动 = await evaluate(`
    return new Promise(async (resolve) => {
      const 自动滚动模块 = await import('./js/自动滚动.js');
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      const 采样 = [];
      容器.scrollTop = 容器.scrollHeight / 2;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const t0 = performance.now();
      自动滚动模块.开始自动滚动();
      const scrollTop0 = 容器.scrollTop;
      const tick = () => {
        if (performance.now() - t0 % 250 < 20) {} // no-op
        采样.push({ t: Math.round(performance.now() - t0), st: Math.round(容器.scrollTop), 遮: 浮层.classList.contains('被正文遮挡') });
        if (performance.now() - t0 < 8000) requestAnimationFrame(tick);
        else {
          自动滚动模块.停止自动滚动('诊断收尾');
          resolve({ 起点: scrollTop0, 终点: 容器.scrollTop, 采样: 采样.filter((_, i) => i % 15 === 0) });
        }
      };
      tick();
    });`);
  console.log('自动滚动 8s:', JSON.stringify(自动));
  const 翻转1 = await evaluate(`const f = window.__翻转; window.__翻转 = []; return f;`);
  console.log('自动滚动期间类翻转:', JSON.stringify(翻转1, null, 1));

  // 6. 滚轮模拟：scrollTop 阶跃 60px × 400 步（≈6.4s，模拟快速滚轮）
  const 手动 = await evaluate(`
    return new Promise((resolve) => {
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      let 遮挡帧 = 0, i = 0;
      const 采样 = [];
      const t0 = performance.now();
      const step = () => {
        容器.scrollTop += 60;
        if (浮层.classList.contains('被正文遮挡')) 遮挡帧 += 1;
        if (i % 25 === 0) 采样.push({ t: Math.round(performance.now() - t0), st: Math.round(容器.scrollTop), 遮: 浮层.classList.contains('被正文遮挡') });
        i += 1;
        if (i < 400) setTimeout(step, 16);
        else resolve({ 终点: 容器.scrollTop, 遮挡帧, 采样 });
      };
      step();
    });`);
  console.log('滚轮模拟 400 步:', JSON.stringify(手动));
  const 翻转2 = await evaluate(`return window.__翻转;`);
  console.log('滚轮模拟期间类翻转:', JSON.stringify(翻转2, null, 1));

  // 7. 应用自己的 console 日志（截尾）
  console.log('--- 页面 console（最后 12 条）---');
  for (const 行 of console日志.slice(-12)) console.log(行);

  process.exit(0);
} catch (e) {
  console.error('诊断失败:', e.message);
  console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}
