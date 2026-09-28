// 最终验证：小步连续滚动翻转频率 + 反事实 + 截图取证 + 长帧检测
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 站点端口 = 15935;
const CDP端口 = 15936;
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
const profile = mkdtempSync(join(tmpdir(), 'reader-diag3-'));
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
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
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
await 发送('Page.enable');

try {
  // 1. 载书
  await evaluate(`
    const { 打开内容选择弹窗 } = await import("./js/内容选择弹窗.js");
    打开内容选择弹窗(); return 1;`);
  for (let n = 0; n < 60; n++) {
    const ready = await evaluate(`document.querySelectorAll('#内容选择列表 *').length`).catch(() => 0);
    if (ready > 0) break;
    await pause(300);
  }
  await evaluate(`
    const 项 = [...document.querySelectorAll('#内容选择列表 *')].find(el => el.textContent.includes('嫌疑人') && el.children.length === 0);
    (项?.closest('li,button,tr') ?? 项)?.click(); return 1;`);
  await pause(3000);

  // 2. 长帧观察器
  await evaluate(`
    window.__长帧 = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (window.__长帧.length < 100) window.__长帧.push(Math.round(e.duration));
      }).observe({ entryTypes: ['long-animation-frame'] });
    } catch {}
    return 1;`);

  // 3. 小步连续滚动（8px/16ms × 900 步 ≈ 14.4s，模拟触控板惯性滚动）过对话密集区
  const 小步 = await evaluate(`
    return new Promise((resolve) => {
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      容器.scrollTop = 150000;
      let 翻转 = 0, 遮挡帧 = 0, 上次 = null, i = 0;
      const 间隔 = [];
      let 上次翻转t = 0;
      const t0 = performance.now();
      const step = () => {
        容器.scrollTop += 8;
        const 被遮挡 = 浮层.classList.contains('被正文遮挡');
        if (被遮挡) 遮挡帧 += 1;
        if (上次 !== null && 被遮挡 !== 上次) {
          翻转 += 1;
          const now = performance.now();
          if (上次翻转t) 间隔.push(Math.round(now - 上次翻转t));
          上次翻转t = now;
        }
        上次 = 被遮挡;
        i += 1;
        if (i < 900) setTimeout(step, 16);
        else resolve({ 滚动范围: [150000, Math.round(容器.scrollTop)], 翻转, 遮挡帧, 最短间隔ms: Math.min(...(间隔.length ? 间隔 : [9999])), 间隔样本: 间隔.slice(0, 20) });
      };
      step();
    });`);
  console.log('小步滚动 900 步(8px):', JSON.stringify(小步));

  // 4. 反事实：同样滚动区间，劫持 elementsFromPoint 令遮挡判定恒 false
  const 反事实 = await evaluate(`
    return new Promise((resolve) => {
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      const 原函数 = document.elementsFromPoint.bind(document);
      document.elementsFromPoint = () => [];
      容器.scrollTop = 150000;
      let 翻转 = 0, 上次 = null, i = 0;
      const step = () => {
        容器.scrollTop += 8;
        const 被遮挡 = 浮层.classList.contains('被正文遮挡');
        if (上次 !== null && 被遮挡 !== 上次) 翻转 += 1;
        上次 = 被遮挡;
        i += 1;
        if (i < 900) setTimeout(step, 16);
        else { document.elementsFromPoint = 原函数; resolve({ 翻转 }); }
      };
      step();
    });`);
  console.log('反事实(遮挡判定禁用) 同区间 900 步:', JSON.stringify(反事实));

  // 5. 长帧数据
  const 长帧 = await evaluate(`return window.__长帧;`);
  console.log('长帧(>50ms)数量:', 长帧.length, '样本:', JSON.stringify(长帧.slice(0, 15)));

  // 6. 截图取证：同一 scrollTop，遮挡挂上 vs 卸下的右下角差异
  容器截图: {
    const pos = await evaluate(`
      const 容器 = document.querySelector('.滚动容器');
      容器.scrollTop = 150000;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const { 刷新时钟遮挡 } = await import('./js/时钟遮挡.js');
      刷新时钟遮挡();
      const 浮层 = document.querySelector('.时间信息');
      const 自然 = 浮层.classList.contains('被正文遮挡');
      // 强制反相：若自然为遮挡则强制显示，反之强制隐藏
      浮层.classList.toggle('被正文遮挡', !自然);
      return { 自然 };`);
    const 截图A = await 发送('Page.captureScreenshot', { format: 'png' });
    writeFileSync('tmp/闪烁审计/截图-右下角-状态A(强制反相).png', Buffer.from(截图A.data, 'base64'));
    const 状态B = await evaluate(`
      const 浮层 = document.querySelector('.时间信息');
      浮层.classList.toggle('被正文遮挡');
      return 浮层.classList.contains('被正文遮挡');`);
    const 截图B = await 发送('Page.captureScreenshot', { format: 'png' });
    writeFileSync('tmp/闪烁审计/截图-右下角-状态B(自然态).png', Buffer.from(截图B.data, 'base64'));
    console.log('截图取证: 自然遮挡态 =', pos.自然, '状态B遮挡 =', 状态B, '（两张截图右下角时钟区域应有显隐差异）');
  }

  process.exit(0);
} catch (e) {
  console.error('诊断失败:', e.message);
  process.exit(1);
}
