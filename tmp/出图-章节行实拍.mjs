// 一次性出图：真书（诡秘之主）深色档下的章节标题行长什么样。
// 走真实入口：内容选择弹窗点书名 → 滚到某一章 → 裁标题行那两行。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));
async function 取空闲端口() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const 端口 = s.address().port;
      s.close(() => resolve(端口));
    });
  });
}
for (const 名 of readdirSync(tmpdir())) {
  if (!名.startsWith('reader-')) continue;
  const 路径 = join(tmpdir(), 名);
  try {
    execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
    continue;
  } catch {}
  rmSync(路径, { recursive: true, force: true });
}
const 站点端口 = await 取空闲端口();
const CDP端口 = await 取空闲端口();
const 地址 = `http://127.0.0.1:${站点端口}/`;
const profile = mkdtempSync(join(tmpdir(), 'reader-title-shot-'));
const 服务 = spawn('node', ['server.mjs', String(站点端口)], { cwd: 项目根, stdio: 'ignore' });
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${CDP端口}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,900', 地址],
  { stdio: 'ignore' },
);
process.on('exit', () => {
  chrome.kill();
  服务.kill();
});
async function 收尾() {
  chrome.kill();
  服务.kill();
  await pause(500);
  chrome.kill('SIGKILL');
  服务.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
  console.log('profile 已清理:', !existsSync(profile));
}
try {
  let 页 = null;
  for (let i = 0; i < 150 && !页; i++) {
    try {
      const 出 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
      页 = 出.find((t) => t.type === 'page' && t.url.startsWith(地址));
    } catch {}
    if (!页) await pause(200);
  }
  const ws = new WebSocket(页.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let 序号 = 0;
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
    return new Promise((resolve, reject) => {
      const 下标 = ++序号;
      const 计时器 = setTimeout(() => {
        待回复.delete(下标);
        reject(new Error(`CDP 超时: ${方法}`));
      }, 30_000);
      待回复.set(下标, {
        resolve: (v) => (clearTimeout(计时器), resolve(v)),
        reject: (e) => (clearTimeout(计时器), reject(e)),
      });
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
      throw new Error(结果.exceptionDetails.exception?.description || JSON.stringify(结果.exceptionDetails));
    return 结果.result.value;
  }
  const S = 'const { 状态, 元素 } = await import("./js/状态.js");';
  await 发送('Page.enable');
  await 发送('Runtime.enable');
  await 发送('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 3, mobile: false });
  for (let n = 0; n < 300; n++) {
    try {
      if (await 求值('return document.querySelector("#载入状态")?.hidden && !!(await import("./js/状态.js")).状态.文本')) break;
    } catch {}
    await pause(150);
  }
  await pause(500);
  // 走真实入口换书：内容选择弹窗里点含「诡秘」的那一行（与 tests/chapter-browser.mjs 同款，
  // 直接在页面上 .click()，委托监听照样收到）
  await 求值(`document.getElementById('内容选择按钮').click(); return 1;`);
  await pause(600);
  const 换书 = await 求值(`
    const 行 = [...document.querySelectorAll('#内容选择弹窗 tr, #内容选择弹窗 button, #内容选择弹窗 [role=row]')]
      .find((元) => 元.textContent.includes('诡秘'));
    if (!行) return null;
    行.click();
    return 行.tagName + '.' + 行.className.slice(0, 20);`);
  assert.ok(换书, '内容选择弹窗里该能找到「诡秘之主」那一行');
  console.log('点到:', 换书);
  for (let n = 0; n < 300; n++) {
    const 好 = await 求值(`${S} return 状态.文件名.includes('诡秘') && 状态.章节列表.length > 10;`);
    if (好) break;
    await pause(150);
  }
  await pause(800);
  const 书 = await 求值(`${S} return { 名: 状态.文件名, 章: 状态.章节列表.length };`);
  console.log('已换到:', JSON.stringify(书));
  assert.ok(书.名.includes('诡秘'), `没换到诡秘之主：${书.名}`);
  await 求值(`${S}
    const { 设置纸面色, 设置页面背景色, 设置区域颜色 } = await import('./js/字体设置.js');
    设置页面背景色('#000000', { 静默: true });
    设置纸面色('#000000', { 静默: true });
    设置区域颜色('引号外', '#E8E6E1');
    设置区域颜色('引号内', '#E8E6E1');
    return 1;`);
  await pause(400);
  // 挑一条中等长度的标题（用户截图那一档：独占一行的短标题）；要它上面至少还有两行正文可拍
  const 索引 = await 求值(`${S}
    const { 查找偏移所在行 } = await import('./js/排版引擎.js');
    return 状态.章节列表.findIndex((章, i) => i > 2 && 章.标题.length > 6 && 章.标题.length < 14
      && 查找偏移所在行(章.偏移) > 3);`);
  // 让标题行整行落在视口里（再往下留 4 行正文做对照）
  await 求值(`${S}
    const { 查找偏移所在行 } = await import('./js/排版引擎.js');
    元素.滚动容器.scrollTop = 查找偏移所在行(状态.章节列表[${索引}].偏移) * 状态.行高 - 状态.行高;`);
  await pause(300);
  await 求值('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); return 1;');
  await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 760 });
  await pause(250);
  const 盒 = await 求值(`${S}
    const 行 = document.querySelector('.正文行[data-chapter-index="${索引}"]');
    const r = 行.getBoundingClientRect();
    return { x: Math.max(0, r.left - 20), y: Math.max(0, r.top - r.height), w: Math.min(820, r.width + 28),
      h: r.height * 5 };`);
  const 图 = await 发送('Page.captureScreenshot', {
    format: 'png', clip: { x: 盒.x, y: 盒.y, width: 盒.w, height: 盒.h, scale: 1 },
  });
  writeFileSync(join(项目根, 'tmp', '章节行醒目-实拍.png'), Buffer.from(图.data, 'base64'));
  console.log('标题:', await 求值(`${S} return 状态.章节列表[${索引}].标题;`), '→ tmp/章节行醒目-实拍.png');
  ws.close();
} finally {
  await 收尾();
}
