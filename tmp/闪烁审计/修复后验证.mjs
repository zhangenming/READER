// 修复后验证：同样的滚动场景下
//  A) 小步连续滚动：显隐翻转应 ≤ 偶发（滚动中保持隐藏，无 85-103ms 翻转串）
//  B) 停止滚动后 150ms+：浮层应恢复显示（空行/短行区域）
//  C) 有字压上来：立即隐藏（迟滞只在恢复方向）
//  D) 原有行为回归：verify-时钟遮挡.mjs 的核心断言
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 站点端口 = 15937;
const CDP端口 = 15938;
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
const profile = mkdtempSync(join(tmpdir(), 'reader-postfix-'));
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

try {
  // 载书
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
  const 基线 = await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    return { 行高: 状态.行高, 行数: 状态.行起点列表.length, 文件名: 状态.文件名 };`);
  console.log('基线:', JSON.stringify(基线));

  // A) 小步连续滚动（与修复前同区间同参数）：翻转应大幅下降
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
  console.log('A) 修复后小步滚动 900 步:', JSON.stringify(小步));

  // B) 停止后恢复：滚到一个「短行/空行在浮层下方」的位置，等 600ms，应恢复显示
  const 停止恢复 = await evaluate(`
    return new Promise(async (resolve) => {
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      // 找一个空行位置：行终点=行起点 的行
      const { 状态 } = await import('./js/状态.js');
      let 空行idx = -1;
      for (let idx = 5000; idx < 状态.行起点列表.length; idx++) {
        if (状态.行终点列表[idx] === 状态.行起点列表[idx]) { 空行idx = idx; break; }
      }
      if (空行idx < 0) { resolve({ 跳过: '无空行' }); return; }
      容器.scrollTop = (空行idx + 1) * 状态.行高 - window.innerHeight;
      await new Promise(r => setTimeout(r, 700));
      resolve({ 空行idx, 遮挡类: 浮层.classList.contains('被正文遮挡'), visibility: getComputedStyle(浮层).visibility });
    });`);
  console.log('B) 停止滚动后恢复:', JSON.stringify(停止恢复));

  // C) 有字立即隐藏：滚到满行处（探针确认浮层下有字），应已隐藏
  const 立即隐藏 = await evaluate(`
    return new Promise(async (resolve) => {
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      const { 状态 } = await import('./js/状态.js');
      // 找连续长行
      let 满行idx = -1;
      for (let idx = 5000; idx < 状态.行起点列表.length - 1; idx++) {
        if (状态.行终点列表[idx] - 状态.行起点列表[idx] > 40) { 满行idx = idx; break; }
      }
      容器.scrollTop = (满行idx + 1) * 状态.行高 - window.innerHeight;
      await new Promise(r => setTimeout(r, 350));
      const 有字 = (() => {
        const r = 浮层.getBoundingClientRect();
        for (const [fx, fy] of [[0.5,0.5],[0.9,0.5],[0.1,0.5]]) {
          const x = r.left + r.width * fx, y = r.top + r.height * fy;
          if (document.elementsFromPoint(x, y).some(n => n.classList?.contains('字'))) return true;
        }
        return false;
      })();
      resolve({ 满行idx, 浮层下有字: 有字, 遮挡类: 浮层.classList.contains('被正文遮挡'), visibility: getComputedStyle(浮层).visibility });
    });`);
  console.log('C) 有字立即隐藏:', JSON.stringify(立即隐藏));

  // D) 静止 3 秒无翻转（回归）
  const 静止 = await evaluate(`
    return new Promise((resolve) => {
      const 浮层 = document.querySelector('.时间信息');
      let 翻转 = 0, 上次 = null;
      const t0 = performance.now();
      const tick = () => {
        const 被遮挡 = 浮层.classList.contains('被正文遮挡');
        if (上次 !== null && 被遮挡 !== 上次) 翻转 += 1;
        上次 = 被遮挡;
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
        else resolve(翻转);
      };
      tick();
    });`);
  console.log('D) 静止 3 秒翻转:', 静止);

  // E) 自动滚动长程验证（8s，起点中部）：翻转应接近 0（滚动中保持隐藏）
  const 自动 = await evaluate(`
    return new Promise(async (resolve) => {
      const 自动滚动模块 = await import('./js/自动滚动.js');
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      容器.scrollTop = 容器.scrollHeight / 2;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      let 翻转 = 0, 上次 = null, 帧数 = 0, 遮挡帧 = 0;
      const t0 = performance.now();
      自动滚动模块.开始自动滚动();
      const tick = () => {
        帧数 += 1;
        const 被遮挡 = 浮层.classList.contains('被正文遮挡');
        if (被遮挡) 遮挡帧 += 1;
        if (上次 !== null && 被遮挡 !== 上次) 翻转 += 1;
        上次 = 被遮挡;
        if (performance.now() - t0 < 8000) requestAnimationFrame(tick);
        else {
          自动滚动模块.停止自动滚动('验证收尾');
          resolve({ 翻转, 帧数, 遮挡帧 });
        }
      };
      tick();
    });`);
  console.log('E) 修复后自动滚动 8s:', JSON.stringify(自动));

  process.exit(0);
} catch (e) {
  console.error('验证失败:', e.message);
  process.exit(1);
}
