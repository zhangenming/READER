// 量右下按钮组几何 vs 悬停热区，并模拟真实鼠标移动验证「内容」能否 hover。
// 用法：node tmp/verify-右下热区.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const CDP端口 = 15933;
const 书名 = '从0到1：开启商业与未来的秘密.txt';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function 端口空闲(端口) {
  return new Promise((resolve) => {
    const s = createServer();
    s.on('error', () => resolve(false));
    s.listen(端口, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}
const 清理遗留 = (跳过) => {
  for (const 名 of readdirSync(tmpdir())) {
    if (!名.startsWith('reader-')) continue;
    const 路径 = join(tmpdir(), 名);
    if (路径 === 跳过) continue;
    try {
      execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
      continue;
    } catch {}
    rmSync(路径, { recursive: true, force: true });
  }
};

const profile = mkdtempSync(join(tmpdir(), 'reader-hotzone-'));
let ws = null, 序号 = 0;
const 待回复 = new Map();
function 发送(方法, 参数 = {}) {
  return new Promise((resolve, reject) => {
    const 下标 = ++序号;
    const t = setTimeout(() => (待回复.delete(下标), reject(new Error('CDP 超时 ' + 方法))), 30_000);
    待回复.set(下标, { resolve: (v) => (clearTimeout(t), resolve(v)), reject: (e) => (clearTimeout(t), reject(e)) });
    ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
  });
}
async function 求值(代码) {
  const r = await 发送('Runtime.evaluate', { expression: `(async () => { ${代码} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function 移动鼠标(x, y) {
  await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}

try {
  for (let n = 0; n < 100 && !(await 端口空闲(CDP端口)); n++) await pause(200);
  清理遗留(profile);
  const 站点 = await new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const 服务 = spawn('node', ['server.mjs', String(站点)], { cwd: 项目根, stdio: 'ignore' });
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', `--remote-debugging-port=${CDP端口}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,900',
    `http://127.0.0.1:${站点}/`,
  ], { stdio: 'ignore' });
  process.on('exit', () => { chrome.kill(); 服务.kill(); });
  try {
    for (let n = 0; n < 150; n++) {
      try {
        const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
        const 目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${站点}/`));
        if (!目标) { await pause(300); continue; }
        ws = new WebSocket(目标.webSocketDebuggerUrl);
        await new Promise((r) => ws.addEventListener('open', r, { once: true }));
        ws.addEventListener('message', (e) => {
          const m = JSON.parse(e.data);
          if (!m.id) return;
          const q = 待回复.get(m.id);
          待回复.delete(m.id);
          if (!q) return;
          m.error ? q.reject(new Error(JSON.stringify(m.error))) : q.resolve(m.result);
        });
        await 发送('Runtime.enable');
        break;
      } catch { await pause(300); }
    }
    if (!ws) throw new Error('页面未就绪');

    await 求值(`
      const { 打开内容选择弹窗 } = await import("./js/内容选择弹窗.js");
      打开内容选择弹窗(); return 1;`);
    for (let n = 0; n < 80; n++) {
      if (await 求值(`const { 状态 } = await import("./js/状态.js"); return !!状态.文件名;`)) break;
      await 求值(`
        const b = [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
          .find(x => x.dataset.fileName === ${JSON.stringify(书名)}) ?? document.querySelector('#内容选择列表 [data-file-name]');
        b?.click(); return 1;`);
      await pause(700);
    }
    await 求值(`document.querySelector('#内容选择弹窗')?.close(); return 1;`);
    await pause(400);

    const 几何 = await 求值(`
      const 组 = document.querySelector('.右下按钮组');
      const r = 组.getBoundingClientRect();
      const 常 = await import('./js/常量.js');
      const 每个 = {};
      for (const [名, el] of [['滚动', '#自动滚动按钮'], ['内容', '#内容选择按钮'], ['目录', '#章节目录按钮'], ['统计', '#阅读统计按钮']]) {
        const q = document.querySelector(el);
        const b = q.getBoundingClientRect();
        每个[名] = { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), 在热区: b.left > innerWidth - 常.右下热区宽度 && b.top > innerHeight - 常.右下热区高度 };
      }
      return { innerWidth, innerHeight, 热区宽: 常.右下热区宽度, 热区高: 常.右下热区高度,
        热区左界: innerWidth - 常.右下热区宽度, 热区上界: innerHeight - 常.右下热区高度,
        组: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) }, 每个 };`);
    console.log(JSON.stringify(几何, null, 2));

    // 模拟：逐点把鼠标移到「内容」按钮上，看控件是否还在显示
    async function 显示中() {
      return 求值(`return document.body.classList.contains('右下控件显示');`);
    }
    async function 探测(名, x, y) {
      const { innerWidth: w, innerHeight: h } = await 求值('return {innerWidth, innerHeight};');
      await 移动鼠标(90, 90); // 先离开热区
      await pause(80);
      await 移动鼠标(Math.round(w - 60), Math.round(h - 30)); // 再从右下角进入
      await pause(80);
      await 移动鼠标(Math.round(x), Math.round(y));
      await pause(120);
      const 在 = await 显示中();
      const 命中 = await 求值(
        `const el = document.elementFromPoint(${x}, ${y}); return el ? (el.closest('button')?.id ?? el.tagName) : 'null';`,
      );
      console.log(`${在 ? 'OK  ' : 'FAIL'} ${名} (${Math.round(x)},${Math.round(y)}) 命中=${命中}`);
      return 在;
    }
    const innerW = 几何.innerWidth, innerH = 几何.innerHeight;
    const 内容 = 几何.每个.内容;
    const cy = (内容.top + 内容.bottom) / 2;
    let 全通过 = true;
    全通过 = (await 探测('内容-左缘(文图标)', 内容.left + 4, cy)) && 全通过;
    全通过 = (await 探测('内容-正中', (内容.left + 内容.right) / 2, cy)) && 全通过;
    全通过 = (await 探测('内容-右缘', 内容.right - 4, cy)) && 全通过;
    全通过 = (await 探测('滚动-左缘', 几何.每个.滚动.left + 4, (几何.每个.滚动.top + 几何.每个.滚动.bottom) / 2)) && 全通过;
    全通过 = (await 探测('组下方 6px', (内容.left + 内容.right) / 2, 几何.组.bottom + 6)) && 全通过;

    // 底线抬高（空格翻页后的整行视口）时，第二行是否会被顶出热区
    await 求值(`document.documentElement.style.setProperty('--底部白线高','70px'); return 1;`);
    await pause(200);
    const 抬高 = await 求值(`const b=document.querySelector('#内容选择按钮').getBoundingClientRect();
      return {top: Math.round(b.top), bottom: Math.round(b.bottom), innerHeight};`);
    console.log('底线抬到70px后 内容按钮:', JSON.stringify(抬高), '热区上界=', 抬高.innerHeight - 几何.热区高);
    全通过 = (await 探测('内容-抬高后正中', (内容.left + 内容.right) / 2, (抬高.top + 抬高.bottom) / 2)) && 全通过;
    await 求值(`document.documentElement.style.setProperty('--底部白线高','2px'); return 1;`);

    console.log(全通过 ? 'PASS: 内容按钮处处可悬停' : 'FAIL: 存在不可悬停的点');

    // 反向对照：指针离开按钮组足够远时仍应隐藏（不能改成常驻）
    await 移动鼠标(Math.round(内容.left + 30), Math.round(cy));
    await pause(100);
    await 移动鼠标(240, 200);
    await pause(150);
    const 远处 = await 显示中();
    console.log(远处 ? 'FAIL: 移到正文远处仍显示（热区没收）' : 'OK   移到正文远处已隐藏');

    // 文案与点击
    const 文案 = await 求值(`const b=document.querySelector('#内容选择按钮');
      return { 文本: b.innerText.replace(/\\s+/g,''), title: b.title };`);
    const 点了 = await 求值(`document.querySelector('#内容选择按钮').click();
      return document.querySelector('#内容选择弹窗').open;`);
    console.log('按钮文案:', JSON.stringify(文案), '| 点击后弹窗打开:', 点了);

    // 窄窗口（700x520）下按钮组左缘更靠外，复测
    await 求值(`document.querySelector('#内容选择弹窗').close(); return 1;`);
    await 发送('Emulation.setDeviceMetricsOverride', { width: 700, height: 520, deviceScaleFactor: 1, mobile: false });
    await pause(500);
    const 窄 = await 求值(`const b=document.querySelector('#内容选择按钮').getBoundingClientRect();
      return {left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), innerWidth, innerHeight};`);
    console.log('窄窗内容按钮:', JSON.stringify(窄));
    const 窄通过 =
      (await 探测('窄-内容-左缘', 窄.left + 3, (窄.top + 窄.bottom) / 2)) &&
      (await 探测('窄-内容-正中', (窄.left + 窄.right) / 2, (窄.top + 窄.bottom) / 2));
    await 发送('Emulation.clearDeviceMetricsOverride');
    console.log(窄通过 ? 'PASS: 窄窗口同样可悬停' : 'FAIL: 窄窗口仍有死区');
  } finally {
    ws?.close(); ws = null;
    chrome.kill(); 服务.kill();
    await Promise.race([Promise.all([new Promise(r => chrome.on('exit', r)), new Promise(r => 服务.on('exit', r))]), pause(3000)]);
    chrome.kill('SIGKILL'); 服务.kill('SIGKILL');
  }
} finally {
  rmSync(profile, { recursive: true, force: true });
  if (existsSync(profile)) { console.error('profile 清理失败:', profile); process.exitCode = 1; }
  else console.log('profile 已清理:', profile);
  清理遗留(profile);
}
