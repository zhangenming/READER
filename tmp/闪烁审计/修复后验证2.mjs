// 修复 v2 验证：确定性恢复（<350ms）+ 翻转抑制 + 原行为保持
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 站点端口 = 15939;
const CDP端口 = 15940;
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
const profile = mkdtempSync(join(tmpdir(), 'reader-postfix2-'));
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

  // A) 翻转抑制（同区间小步滚动）
  const 小步 = await evaluate(`
    return new Promise((resolve) => {
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      容器.scrollTop = 150000;
      let 翻转 = 0, 上次 = null, i = 0;
      const step = () => {
        容器.scrollTop += 8;
        const 被遮挡 = 浮层.classList.contains('被正文遮挡');
        if (上次 !== null && 被遮挡 !== 上次) 翻转 += 1;
        上次 = 被遮挡;
        i += 1;
        if (i < 900) setTimeout(step, 16);
        else resolve({ 翻转, 终点遮挡: 被遮挡 });
      };
      step();
    });`);
  console.log('A) 小步滚动 900 步翻转:', JSON.stringify(小步), '(修复前 18)');

  // B) 确定性恢复：滚到空行处，等 300ms（< verify 脚本的 350ms），应已恢复
  let 恢复B = { ok: false };
  for (let 尝试 = 0; 尝试 < 3 && !恢复B.ok; 尝试++) {
    恢复B = await evaluate(`
      return new Promise(async (resolve) => {
        const 容器 = document.querySelector('.滚动容器');
        const 浮层 = document.querySelector('.时间信息');
        const { 状态 } = await import('./js/状态.js');
        let 空行idx = -1;
        for (let idx = ${5000 + 尝试 * 300}; idx < 状态.行起点列表.length; idx++) {
          if (状态.行终点列表[idx] === 状态.行起点列表[idx]) { 空行idx = idx; break; }
        }
        if (空行idx < 0) { resolve({ ok: false, 跳过: '无空行' }); return; }
        容器.scrollTop = (空行idx + 1) * 状态.行高 - window.innerHeight;
        // 先确认这条路径上浮层曾隐藏（前一位置有字）或直接进入等待
        await new Promise(r => setTimeout(r, 300));
        const vis = getComputedStyle(浮层).visibility;
        resolve({ ok: vis === 'visible', 空行idx, visibility: vis, 遮挡类: 浮层.classList.contains('被正文遮挡') });
      });`);
    if (!恢复B.ok) console.log(`  B 重试 ${尝试 + 1}:`, JSON.stringify(恢复B));
  }
  console.log('B) 停止后 300ms 确定性恢复:', JSON.stringify(恢复B));

  // C) 满行处停止：应保持隐藏（不能因复检误恢复）
  const 满行保持 = await evaluate(`
    return new Promise(async (resolve) => {
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      const { 状态 } = await import('./js/状态.js');
      // 找底部恰是满行的位置：行 idx 长度>40 且 idx+1 也长度>40
      let idx找到 = -1;
      for (let idx = 5000; idx < 状态.行起点列表.length - 1; idx++) {
        if (状态.行终点列表[idx] - 状态.行起点列表[idx] > 40 &&
            状态.行终点列表[idx+1] - 状态.行起点列表[idx+1] > 40) { idx找到 = idx; break; }
      }
      if (idx找到 < 0) { resolve({ 跳过: '无连续满行' }); return; }
      容器.scrollTop = (idx找到 + 1) * 状态.行高 - window.innerHeight;
      await new Promise(r => setTimeout(r, 300));
      const r = 浮层.getBoundingClientRect();
      const 有字 = document.elementsFromPoint(r.left + r.width/2, r.top + r.height/2).some(n => n.classList?.contains('字'));
      resolve({ idx: idx找到, 浮层下有字: 有字, 遮挡类: 浮层.classList.contains('被正文遮挡'), visibility: getComputedStyle(浮层).visibility });
    });`);
  console.log('C) 满行处停止 300ms 后:', JSON.stringify(满行保持), '(应保持隐藏)');

  // D) 交替场景：滚 300 步跨密集对话区，统计翻转（含起始显示的首次隐藏）
  const 交替 = await evaluate(`
    return new Promise((resolve) => {
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      容器.scrollTop = 152000;
      let 翻转 = 0, 上次 = null, i = 0;
      const step = () => {
        容器.scrollTop += 8;
        const 被遮挡 = 浮层.classList.contains('被正文遮挡');
        if (上次 !== null && 被遮挡 !== 上次) 翻转 += 1;
        上次 = 被遮挡;
        i += 1;
        if (i < 300) setTimeout(step, 16);
        else resolve({ 翻转 });
      };
      step();
    });`);
  console.log('D) 交替密集区 300 步翻转:', JSON.stringify(交替), '(修复前同区间约 6-10)');

  process.exit(0);
} catch (e) {
  console.error('验证失败:', e.message);
  process.exit(1);
}
