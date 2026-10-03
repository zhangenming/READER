// 一次性看图脚本：真实《封神演义》里章节标题的斜线背景长什么样（对齐用户截图那一档：
// #000 纸面 + #E8E6E1 正文），滚到「第十一回」标题出图。
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
const profile = mkdtempSync(join(tmpdir(), 'reader-fs-look-'));
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
  console.log(existsSync(profile) ? `profile 清理失败: ${profile}` : 'profile 已清理');
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
  if (!页) throw new Error('未找到 headless Chrome 页面');
  const ws = new WebSocket(页.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let 序号 = 0;
  const 待回复 = new Map();
  ws.addEventListener('message', (事件) => {
    const 消息 = JSON.parse(事件.data);
    if (消息.id) {
      const 请求 = 待回复.get(消息.id);
      待回复.delete(消息.id);
      if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
      else 请求.resolve(消息.result);
    }
  });
  function 发送(方法, 参数 = {}) {
    return new Promise((resolve, reject) => {
      const 下标 = ++序号;
      const 计时器 = setTimeout(() => {
        待回复.delete(下标);
        reject(new Error(`CDP 超时: ${方法}`));
      }, 60_000);
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
  for (let n = 0; n < 600; n++) {
    try {
      if (await 求值(`${S} return document.querySelector("#载入状态")?.hidden && 状态.行起点列表.length > 0;`)) break;
    } catch {}
    await pause(100);
  }
  // 切到《封神演义》
  await 求值(`${S}
    document.querySelector('#内容选择按钮').click();
    return new Promise((r) => setTimeout(() => {
      const 按钮 = document.querySelector('[data-file-name="封神演义.txt"]');
      if (按钮) 按钮.click();
      r(!!按钮);
    }, 400));`);
  await pause(800);
  for (let n = 0; n < 600; n++) {
    try {
      if (await 求值(`${S} return document.querySelector("#载入状态")?.hidden && 状态.文件名 === '封神演义.txt' && 状态.行起点列表.length > 0;`)) break;
    } catch {}
    await pause(100);
  }
  await 发送('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
  // 深色档 = 用户截图那一档
  await 求值(`${S}
    const { 设置纸面色, 设置页面背景色, 设置区域颜色 } = await import('./js/字体设置.js');
    设置页面背景色('#000000', { 静默: true });
    设置纸面色('#000000', { 静默: true });
    设置区域颜色('引号外', '#E8E6E1');
    设置区域颜色('引号内', '#E8E6E1');
    return 1;`);
  await pause(300);
  // 滚到「第十一回」标题的上两行处（让标题落在视口上半部，和用户截图接近）
  const 索引 = await 求值(`${S} return 状态.章节列表.findIndex((c) => /第十一回/.test(c.标题));`);
  console.log('第十一回 章节索引:', 索引);
  await 求值(`${S}
    const { 查找偏移所在行 } = await import('./js/排版引擎.js');
    元素.滚动容器.scrollTop = Math.max(0, (查找偏移所在行(状态.章节列表[${索引}].偏移) - 1) * 状态.行高);
    return 1;`);
  await pause(300);
  await 求值('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); return 1;');
  await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 780 });
  await pause(200);
  const 盒 = await 求值(`${S}
    const 行 = document.querySelector('.正文行.章节标题行');
    if (!行) return null;
    const r = 行.getBoundingClientRect();
    return { 标题: 行.textContent.slice(0, 20), y: Math.max(0, r.top - r.height * 2), height: r.height * 6 };`);
  console.log('标题行:', JSON.stringify(盒));
  const 图 = await 发送('Page.captureScreenshot', {
    format: 'png', clip: { x: 0, y: 盒.y, width: 1280, height: 盒.height, scale: 1 },
  });
  writeFileSync(join(项目根, 'tmp', '封神-第十一回-斜纹-深.png'), Buffer.from(图.data, 'base64'));
  console.log('已写入 tmp/封神-第十一回-斜纹-深.png');
  ws.close();
} finally {
  await 收尾();
}
