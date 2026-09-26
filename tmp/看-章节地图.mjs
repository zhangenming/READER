// 一次性看图脚本：真实书上悬停章节标题行时，左缘那一列的章节地图长什么样。
// 分别拍「悬停视口内的章」与「悬停远处的章」两种情形，看红枚与阅读进度指针会不会叠在一起。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const 书名 = '解放战争（套装共6册）.txt';
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));
async function 取空闲端口() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
for (const 名 of readdirSync(tmpdir())) {
  if (!名.startsWith('reader-')) continue;
  const 路径 = join(tmpdir(), 名);
  try { execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' }); continue; } catch {}
  rmSync(路径, { recursive: true, force: true });
}
const 站点端口 = await 取空闲端口();
const CDP端口 = await 取空闲端口();
const 地址 = `http://127.0.0.1:${站点端口}/`;
const profile = mkdtempSync(join(tmpdir(), 'reader-map-shot-'));
const 服务 = spawn('node', ['server.mjs', String(站点端口)], { cwd: 项目根, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP端口}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1280,900', 地址,
], { stdio: 'ignore' });
const 退出 = [new Promise((r) => chrome.on('exit', r)), new Promise((r) => 服务.on('exit', r))];
process.on('exit', () => { chrome.kill(); 服务.kill(); });
try {
  let 目标;
  for (let i = 0; i < 150 && !目标; i++) {
    try {
      const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
      目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
    } catch {}
    await pause(200);
  }
  const ws = new WebSocket(目标.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let 序号 = 0; const 待回复 = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (!m.id) return;
    const r = 待回复.get(m.id); 待回复.delete(m.id);
    if (m.error) r.reject(new Error(JSON.stringify(m.error))); else r.resolve(m.result);
  });
  function 发送(方法, 参数 = {}) {
    return new Promise((resolve, reject) => {
      const 下标 = ++序号;
      const 计时器 = setTimeout(() => { 待回复.delete(下标); reject(new Error(`CDP 超时: ${方法}`)); }, 60_000);
      待回复.set(下标, { resolve: (v) => (clearTimeout(计时器), resolve(v)), reject: (e) => (clearTimeout(计时器), reject(e)) });
      ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
    });
  }
  async function 求值(代码) {
    const r = await 发送('Runtime.evaluate', { expression: `(async () => { ${代码} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  const S = 'const { 状态, 元素 } = await import("./js/状态.js");';
  await 发送('Page.enable'); await 发送('Runtime.enable');
  for (let n = 0; n < 900; n++) {
    try { if (await 求值(`${S} return document.querySelector("#载入状态")?.hidden && 状态.行起点列表.length > 0;`)) break; } catch {}
    await pause(100);
  }
  await 求值(`${S}
    document.querySelector('#内容选择按钮').click();`);
  await pause(500);
  await 求值(`${S} document.querySelector('[data-file-name="${书名}"]').click();`);
  await pause(1200);
  for (let n = 0; n < 900; n++) {
    try { if (await 求值(`${S} return document.querySelector("#载入状态")?.hidden && 状态.章节列表.length > 100;`)) break; } catch {}
    await pause(100);
  }
  console.log('章节数:', await 求值(`${S} return 状态.章节列表.length;`));

  async function 悬停(索引) {
    await 求值(`${S}
      const { 查找偏移所在行 } = await import('./js/排版引擎.js');
      元素.滚动容器.scrollTop = 查找偏移所在行(状态.章节列表[${索引}].偏移) * 状态.行高;`);
    await pause(250);
    const 位置 = await 求值(`${S}
      const 行 = document.querySelector('.正文行[data-chapter-index="${索引}"]');
      const 字 = 行.querySelector('.字');
      const 盒 = 字.getBoundingClientRect();
      return { x: 盒.left + 盒.width / 2, y: 盒.top + 盒.height / 2 };`);
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 460 });
    await pause(40);
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 位置.x, y: 位置.y });
    await pause(200);
  }
  async function 出图(名, clip) {
    const 图 = await 发送('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
    writeFileSync(join(项目根, 'tmp', 名), Buffer.from(图.data, 'base64'));
    console.log('已写入', 名);
  }
  // 悬停「视口正中那一章」：红枚会与阅读进度指针同行
  await 悬停(6);
  await 出图('章节地图-悬停当前章.png', { x: 0, y: 0, width: 620, height: 900 });
  // 悬停「远处的章」：把第 60 章的标题行滚到视口顶部，但悬停另一章（红枚与指针分开）
  await 求值(`${S}
    const { 查找偏移所在行 } = await import('./js/排版引擎.js');
    元素.滚动容器.scrollTop = 查找偏移所在行(状态.章节列表[6].偏移) * 状态.行高;`);
  await pause(250);
  await 求值(`${S}
    const { 更新关键词指示器 } = await import('./js/指示器.js');
    状态.悬停章节索引 = 60; 更新关键词指示器();`);
  await 出图('章节地图-悬停远处章.png', { x: 0, y: 0, width: 620, height: 900 });
  ws.close();
} finally {
  chrome.kill(); 服务.kill();
  await Promise.race([Promise.all(退出), pause(3000)]);
  rmSync(profile, { recursive: true, force: true });
  console.log(existsSync(profile) ? 'profile 清理失败' : 'profile 已清理');
}
