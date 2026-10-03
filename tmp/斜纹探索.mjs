// 一次性探索脚本：章节标题行「斜线背景」候选参数对比出图。
// 自启 server.mjs + headless Chrome（CDP + Fetch 拦截喂 fixture），
// 深色档（对齐用户截图：#000 纸面 + #E8E6E1 正文）逐组注入 background-image，各出一张裁图。
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
const profile = mkdtempSync(join(tmpdir(), 'reader-title-stripe-'));
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
  if (existsSync(profile)) {
    console.error('profile 清理失败:', profile);
    process.exitCode = 1;
  } else console.log('profile 已清理');
}

const 正文 = '话说纣王驾回龙德殿，百官朝贺毕，各归其位，静候来日早朝动静。'
  + '且说西伯侯姬昌自朝歌散后，星夜出城，取路往西岐而来。'.repeat(3);
const fixture = [
  '不知姬昌等性命如何，且听下回分解。',
  '',
  '第十一回　羑里城囚西伯侯',
  '',
  '诗曰：',
  正文,
  '',
  '第十二回　渭水文王聘子牙',
  '',
  正文,
].join('\n');

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
  ws.addEventListener('message', async (事件) => {
    const 消息 = JSON.parse(事件.data);
    if (消息.id) {
      const 请求 = 待回复.get(消息.id);
      待回复.delete(消息.id);
      if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
      else 请求.resolve(消息.result);
    } else if (消息.method === 'Fetch.requestPaused') {
      try {
        await 发送('Fetch.fulfillRequest', {
          requestId: 消息.params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/plain; charset=utf-8' }],
          body: Buffer.from(fixture).toString('base64'),
        });
      } catch {
        // 页面重载会把上一轮的请求一起作废，作废后 fulfill 报 Invalid InterceptionId，忽略即可
      }
    }
  });
  function 发送(方法, 参数 = {}) {
    return new Promise((resolve, reject) => {
      const 下标 = ++序号;
      const 计时器 = setTimeout(() => {
        待回复.delete(下标);
        reject(new Error(`CDP 超时: ${方法}`));
      }, 20_000);
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
  const 两帧 = 'await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); return 1;';

  await 发送('Page.enable');
  await 发送('Runtime.enable');
  await 发送('Fetch.enable', { patterns: [{ urlPattern: '*txt/*.txt', requestStage: 'Request' }] });
  await 发送('Page.reload', { ignoreCache: true });
  for (let n = 0; n < 240; n++) {
    try {
      if (await 求值('return document.querySelector("#载入状态")?.hidden && !!(await import("./js/状态.js")).状态.文件名')) break;
    } catch {}
    await pause(120);
  }
  await pause(400);
  await 发送('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 3, mobile: false });
  console.log('章节数:', await 求值(`${S} return 状态.章节列表.map(c=>c.标题).join('|');`));

  // 深色档 = 用户截图那一档
  await 求值(`${S}
    const { 设置纸面色, 设置页面背景色, 设置区域颜色 } = await import('./js/字体设置.js');
    设置页面背景色('#000000', { 静默: true });
    设置纸面色('#000000', { 静默: true });
    设置区域颜色('引号外', '#E8E6E1');
    设置区域颜色('引号内', '#E8E6E1');
    return 1;`);
  await pause(300);

  // 滚到标题行（fixture 唯一一章 = 第十一回，索引 0；前面有一行正文）
  await 求值(`${S}
    const { 查找偏移所在行 } = await import('./js/排版引擎.js');
    元素.滚动容器.scrollTop = Math.max(0, (查找偏移所在行(状态.章节列表[0].偏移) - 2) * 状态.行高);
    return 1;`);
  await pause(250);
  await 求值(两帧);

  const 变体 = [
    ['B-1.5px-8px-38', 'repeating-linear-gradient(45deg, color-mix(in oklab, var(--强调色) 38%, transparent) 0 1.5px, transparent 1.5px 8px)'],
    ['F-1.5px-7px-34', 'repeating-linear-gradient(45deg, color-mix(in oklab, var(--强调色) 34%, transparent) 0 1.5px, transparent 1.5px 7px)'],
    ['G-底纱+细纹', 'linear-gradient(color-mix(in oklab, var(--强调色) 10%, transparent), color-mix(in oklab, var(--强调色) 10%, transparent)), repeating-linear-gradient(45deg, color-mix(in oklab, var(--强调色) 30%, transparent) 0 1px, transparent 1px 7px)'],
    ['H-2px-9px-28', 'repeating-linear-gradient(45deg, color-mix(in oklab, var(--强调色) 28%, transparent) 0 2px, transparent 2px 9px)'],
    ['D-反斜对照-1.5px-7px-34', 'repeating-linear-gradient(135deg, color-mix(in oklab, var(--强调色) 34%, transparent) 0 1.5px, transparent 1.5px 7px)'],
  ];
  for (const [名, 图] of 变体) {
    await 求值(`${S}
      const 行 = document.querySelector('.正文行.章节标题行');
      行.style.backgroundImage = \`${图}\`.trim();
      return 1;`);
    await pause(150);
    await 求值(两帧);
    const 盒 = await 求值(`${S}
      const 行 = document.querySelector('.正文行.章节标题行');
      const r = 行.getBoundingClientRect();
      return { x: 0, y: Math.max(0, r.top - r.height * 1.2), w: 1280, h: r.height * 3.2 };`);
    const 图数据 = await 发送('Page.captureScreenshot', {
      format: 'png', clip: { x: 盒.x, y: 盒.y, width: 盒.w, height: 盒.h, scale: 1 },
    });
    writeFileSync(join(项目根, 'tmp', `斜纹候选-${名}.png`), Buffer.from(图数据.data, 'base64'));
    console.log('已出图', 名);
  }
  // 恢复浅色档，给前三个候选补浅色图（看浅纸上的浓度）
  await 求值(`${S}
    const { 默认纸面色, 默认页面背景色 } = await import('./js/常量.js');
    const { 设置纸面色, 设置页面背景色, 设置区域颜色 } = await import('./js/字体设置.js');
    设置区域颜色('引号外', null);
    设置区域颜色('引号内', null);
    设置纸面色(默认纸面色, { 静默: true });
    设置页面背景色(默认页面背景色, { 静默: true });
    return 1;`);
  await pause(300);
  for (const [名, 图] of 变体.slice(0, 3)) {
    await 求值(`${S}
      const 行 = document.querySelector('.正文行.章节标题行');
      行.style.backgroundImage = \`${图}\`.trim();
      return 1;`);
    await pause(150);
    await 求值(两帧);
    const 盒 = await 求值(`${S}
      const 行 = document.querySelector('.正文行.章节标题行');
      const r = 行.getBoundingClientRect();
      return { x: 0, y: Math.max(0, r.top - r.height * 1.2), w: 1280, h: r.height * 3.2 };`);
    const 图数据 = await 发送('Page.captureScreenshot', {
      format: 'png', clip: { x: 盒.x, y: 盒.y, width: 盒.w, height: 盒.h, scale: 1 },
    });
    writeFileSync(join(项目根, 'tmp', `斜纹候选-浅-${名}.png`), Buffer.from(图数据.data, 'base64'));
    console.log('已出图 浅-', 名);
  }
  // 清掉注入
  await 求值(`${S} document.querySelector('.正文行.章节标题行').style.backgroundImage = ''; return 1;`);
  console.log('完成。可拼图查看 tmp/斜纹候选-*.png');
  ws.close();
} finally {
  await 收尾();
}
