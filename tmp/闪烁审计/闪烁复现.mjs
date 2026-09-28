// 闪烁复现脚本：CDP 驱动 headless Chrome 打开阅读器 → 载书 → 自动滚动 →
// 逐帧记录 .时间信息 的遮挡类翻转、.滚动进度 translateY、visibility 状态。
// 按 AGENTS.md 规范：try/finally 清理 reader-* profile。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 站点端口 = 15931;
const CDP端口 = 15932;
const 书名 = '从0到1：开启商业与未来的秘密.txt';
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
const profile = mkdtempSync(join(tmpdir(), 'reader-flicker-'));
let 服务 = null, chrome = null, ws = null;
const cleanup = async () => {
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { 服务?.kill(); } catch {}
  await pause(800);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  console.log(`[清理] profile ${profile} ${rmSync ? '' : ''}已${require('fs').existsSync ? '' : ''}删除`);
};
// 简化清理日志
const cleanupSync = () => {
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { 服务?.kill(); } catch {}
};
process.on('exit', () => {
  cleanupSync();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
});

const 服务已起 = await (async () => {
  服务 = spawn('node', ['server.mjs', String(站点端口)], { cwd: '/Users/zem/AI/READER', stdio: 'ignore' });
  await pause(1000);
  return true;
})();

chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  `--remote-debugging-port=${CDP端口}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,900',
  `http://127.0.0.1:${站点端口}/`,
], { stdio: 'ignore' });

// 等 CDP
let 目标 = null;
for (let n = 0; n < 100 && !目标; n++) {
  try {
    const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
    目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${站点端口}/`));
  } catch {}
  if (!目标) await pause(300);
}
if (!目标) { console.error('CDP 页面未就绪'); process.exit(1); }
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
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP 超时: ${method}`)); } }, 60_000);
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (code) => {
  const r = await 发送('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

try {
  // 1. 载书
  await evaluate(`const { 载入文本 } = await import('./js/文本管线.js'); return 1;`).catch(() => {});
  // 通过内容选择弹窗载入（与回归脚本同路径）
  await evaluate(`
    const { 打开内容选择弹窗 } = await import("./js/内容选择弹窗.js");
    打开内容选择弹窗();
    return 1;`);
  for (let n = 0; n < 60; n++) {
    const ready = await evaluate(`document.querySelectorAll('#内容选择列表 .书名').length`).catch(() => 0);
    if (ready > 0) break;
    await pause(300);
  }
  await evaluate(`
    const 项 = [...document.querySelectorAll('#内容选择列表 .书名')].find(el => el.textContent.includes('${书名.slice(0, 6)}'));
    if (项) 项.click();
    return !!项;`);
  await pause(2500);

  // 2. 记录基线
  const 基线 = await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    return { 行高: 状态.行高, 字号: 状态.字号, 行数: 状态.行起点列表.length, 文件名: 状态.文件名 };`);
  console.log('基线:', JSON.stringify(基线));

  // 3. 空闲 3 秒：遮挡类翻转次数（应几乎为 0）
  const 空闲 = await evaluate(`
    return new Promise((resolve) => {
      let 翻转 = 0, 上次 = null;
      const 浮层 = document.querySelector('.时间信息');
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
  console.log('空闲 3 秒 遮挡类翻转次数:', 空闲);

  // 4. 自动滚动 12 秒：遮挡类翻转 + visibility 生效占比 + 采样
  const 滚动数据 = await evaluate(`
    return new Promise(async (resolve) => {
      const 自动滚动模块 = await import('./js/自动滚动.js');
      const 浮层 = document.querySelector('.时间信息');
      let 翻转 = 0, 上次 = null, 帧数 = 0, 遮挡帧 = 0;
      const 采样 = [];
      const t0 = performance.now();
      自动滚动模块.开始自动滚动();
      const tick = () => {
        帧数 += 1;
        const 被遮挡 = 浮层.classList.contains('被正文遮挡');
        if (上次 !== null && 被遮挡 !== 上次) { 翻转 += 1; 采样.push({ t: Math.round(performance.now() - t0), 类: 被遮挡 ? 'hidden' : 'shown' }); }
        if (被遮挡) 遮挡帧 += 1;
        上次 = 被遮挡;
        if (performance.now() - t0 < 12000) requestAnimationFrame(tick);
        else {
          自动滚动模块.停止自动滚动('测试收尾');
          resolve({ 翻转, 帧数, 遮挡帧, 采样: 采样.slice(0, 40) });
        }
      };
      tick();
    });`);
  console.log('自动滚动 12 秒:', JSON.stringify(滚动数据, null, 1));

  // 5. 手动模拟 scrollTop 阶跃（最小复现）：正文中部 ±3px 阶跃 200 次
  const 手动 = await evaluate(`
    return new Promise((resolve) => {
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      const 基点 = 容器.scrollHeight / 2;
      容器.scrollTop = 基点;
      let 翻转 = 0, 上次 = null;
      let i = 0;
      const step = () => {
        容器.scrollTop = 基点 + (i % 2 ? 3 : -3);
        const 被遮挡 = 浮层.classList.contains('被正文遮挡');
        if (上次 !== null && 被遮挡 !== 上次) 翻转 += 1;
        上次 = 被遮挡;
        i += 1;
        if (i < 200) setTimeout(step, 16);
        else resolve(翻转);
      };
      step();
    });`);
  console.log('手动 ±3px 阶跃 200 次 翻转次数:', 手动);

  // 6. 反事实：劫持 elementsFromPoint 恒返回 []（等效于遮挡判定永不出 true），
  //    再跑同样的阶跃，确认翻转归零 → 证明翻转全部来自该判定
  const 反事实 = await evaluate(`
    return new Promise((resolve) => {
      const 原函数 = document.elementsFromPoint.bind(document);
      document.elementsFromPoint = () => [];
      const 容器 = document.querySelector('.滚动容器');
      const 浮层 = document.querySelector('.时间信息');
      const 基点 = 容器.scrollHeight / 2;
      容器.scrollTop = 基点;
      let 翻转 = 0, 上次 = null;
      let i = 0;
      const step = () => {
        容器.scrollTop = 基点 + (i % 2 ? 3 : -3);
        const 被遮挡 = 浮层.classList.contains('被正文遮挡');
        if (上次 !== null && 被遮挡 !== 上次) 翻转 += 1;
        上次 = 被遮挡;
        i += 1;
        if (i < 200) setTimeout(step, 16);
        else { document.elementsFromPoint = 原函数; resolve(翻转); }
      };
      step();
    });`);
  console.log('反事实（elementsFromPoint 劫持）阶跃 200 次翻转:', 反事实);

  process.exit(0);
} catch (e) {
  console.error('复现脚本失败:', e.message);
  process.exit(1);
}
