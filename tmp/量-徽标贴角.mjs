// 量：x/y 徽标要「贴在这个字的右上角」，往下挪多少才像、又压掉多少真墨。
// 上一轮用的是「徽标盒 ∩ 字形墨盒(矩形)」，对中文这种墨集中在中间的方块字会高估——
// 右上角那一块常常是空的。所以这里改成像素法：把徽标藏了拍底片，
// 再按每档候选的徽标盒去底片里数「有多少字墨被盖住了」。
// 同时报贴角程度：入盒竖 = 徽标底 - 字盒顶，入盒横 = 字盒右缘 - 徽标左缘。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));
function 取空闲端口() {
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
const profile = mkdtempSync(join(tmpdir(), 'reader-badge-corner-'));
const 服务 = spawn('node', ['server.mjs', String(站点端口)], { cwd: 项目根, stdio: 'ignore' });
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
    地址,
  ],
  { stdio: 'ignore' },
);
const chrome已退出 = new Promise((r) => chrome.on('exit', r));
const 服务已退出 = new Promise((r) => 服务.on('exit', r));
process.on('exit', () => {
  chrome.kill();
  服务.kill();
});
async function 收尾() {
  chrome.kill();
  服务.kill();
  await Promise.race([
    Promise.all([chrome已退出, 服务已退出]),
    pause(3000).then(() => {
      chrome.kill('SIGKILL');
      服务.kill('SIGKILL');
    }),
  ]);
  rmSync(profile, { recursive: true, force: true });
  console.log(existsSync(profile) ? 'profile 清理失败' : 'profile 已清理');
}

try {
  let 目标 = null;
  for (let i = 0; i < 150 && !目标; i++) {
    try {
      const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
      目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
    } catch {}
    if (!目标) await pause(200);
  }
  if (!目标) throw new Error('未找到 headless Chrome 页面');
  const ws = new WebSocket(目标.webSocketDebuggerUrl);
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
      throw new Error(结果.exceptionDetails.exception?.description || '');
    return 结果.result.value;
  }
  const S = 'const { 状态, 元素 } = await import("./js/状态.js");';
  await 发送('Page.enable');
  await 发送('Runtime.enable');
  await 发送('Page.reload', { ignoreCache: true });
  for (let n = 0; n < 300; n++) {
    try {
      if (
        await 求值(
          'return document.querySelector("#载入状态")?.hidden && !!(await import("./js/状态.js")).状态.文件名',
        )
      )
        break;
    } catch {}
    await pause(100);
  }
  await pause(500);
  await 求值(`${S}
    const 根 = document.documentElement.style;
    根.setProperty('--背景色', '#1d1f21');
    根.setProperty('--正文字色', '#c9c5bd');
    return true;`);
  const 选词 = await 求值(`${S}
    const 计次 = new Map();
    for (let i = 0; i + 2 <= 状态.文本.length; i++) {
      const 组 = 状态.文本.slice(i, i + 2);
      if (!/^[\\u4e00-\\u9fff]{2}$/.test(组)) continue;
      计次.set(组, (计次.get(组) || 0) + 1);
    }
    const 候选 = [];
    for (const [词, 次] of [...计次.entries()].sort((a, b) => b[1] - a[1])) {
      if (候选.length === 2) break;
      if ([...词].some((字) => 候选.some((x) => [...x.词].includes(字)))) continue;
      候选.push({ 词, 次 });
    }
    return { 书名: 状态.文件名, 候选 };`);
  console.log('书名:', 选词.书名, '| 词:', 选词.候选.map((x) => `${x.词}×${x.次}`).join(' / '));
  await 求值(`${S}
    const { 添加关键词标记 } = await import('./js/关键词.js');
    for (const { 词 } of ${JSON.stringify(选词.候选)}) 添加关键词标记(词, 状态.文本.indexOf(词));
    return true;`);
  await pause(1500);
  // 滚到命中最密的窗口，样本量才够
  const 密窗 = await 求值(`${S}
    const 行高 = 状态.行高;
    const 可视 = Math.floor(元素.滚动容器.clientHeight / 行高);
    const 行起点 = 状态.行起点列表;
    const 总行 = 行起点.length;
    const 所在行 = (偏移) => {
      let 低 = 0;
      let 高 = 总行 - 1;
      while (低 < 高) {
        const 中 = (低 + 高 + 1) >> 1;
        if (行起点[中] <= 偏移) 低 = 中;
        else 高 = 中 - 1;
      }
      return 低;
    };
    const 每行 = new Int32Array(总行);
    for (const 词 of 状态.关键词列表) for (const 偏 of 词.命中位置) 每行[所在行(偏)] += 1;
    let 最佳行 = 0;
    let 最佳分 = -1;
    let 累 = 0;
    for (let 行 = 0; 行 < 总行; 行++) {
      累 += 每行[行];
      if (行 >= 可视) 累 -= 每行[行 - 可视];
      if (行 >= 可视 - 1 && 累 > 最佳分) { 最佳分 = 累; 最佳行 = 行 - 可视 + 1; }
    }
    元素.滚动容器.scrollTop = (最佳行 + 2) * 行高;
    return { 最佳行, 命中数: 最佳分 };`);
  await pause(700);
  console.log('密窗:', 密窗);

  const 报告 = await 求值(`${S}
    const 档列表 = ${JSON.stringify([
      { 名: '现状 fs9 lh9 p0×2 b1 top-9 r-3', css: '' },
      { 名: 'top-6 r-3', css: 'top:-6px' },
      { 名: 'top-4 r-3', css: 'top:-4px' },
      { 名: 'top-4 r-1', css: 'top:-4px;right:-1px' },
      { 名: 'top-4 r1', css: 'top:-4px;right:1px' },
      { 名: 'top-2 r-3', css: 'top:-2px' },
      { 名: 'top0 r-3', css: 'top:0' },
      { 名: '收 fs8 lh8 p0×1 top-4 r-3', css: 'font-size:8px;line-height:8px;padding:0 1px;min-width:16px;top:-4px' },
      { 名: '收 fs8 lh8 p0×1 top-2 r-3', css: 'font-size:8px;line-height:8px;padding:0 1px;min-width:16px;top:-2px' },
      { 名: '收 fs8 lh8 p0×1 top0 r-3', css: 'font-size:8px;line-height:8px;padding:0 1px;min-width:16px;top:0' },
      { 名: '收 fs8 lh8 p0×1 top-2 r1', css: 'font-size:8px;line-height:8px;padding:0 1px;min-width:16px;top:-2px;right:1px' },
      { 名: '更小 fs7.5 lh7.5 p0×1 top-2 r-2', css: 'font-size:7.5px;line-height:7.5px;padding:0 1px;min-width:15px;top:-2px;right:-2px' },
    ])};
    const 藏 = document.createElement('style');
    藏.id = '量-藏';
    document.head.append(藏);
    const 铺 = (css) =>
      ".字.命中[data-hit-position]::after{transition:none!important;opacity:1!important;visibility:visible!important}.字.命中[data-hit-position]::after{" + css + "}";
    const 数 = (v) => parseFloat(v) || 0;
    const 取 = (v) => Math.round(v * 10) / 10;
    const 列 = [...document.querySelectorAll('.字.命中[data-hit-position]')].filter((字) => {
      const 盒 = 字.getBoundingClientRect();
      return 盒.top > 24 && 盒.bottom < window.innerHeight - 24 && 盒.left > 60;
    });
    const 出 = [];
    for (const 档 of 档列表) {
      藏.textContent = 铺(档.css);
      const 记录 = [];
      for (const 字 of 列) {
        const 样 = getComputedStyle(字, '::after');
        const 盒 = 字.getBoundingClientRect();
        const 宽 = 数(样.width) + 数(样.paddingLeft) + 数(样.paddingRight) + 数(样.borderLeftWidth) + 数(样.borderRightWidth);
        const 高 = 数(样.height) + 数(样.paddingTop) + 数(样.paddingBottom) + 数(样.borderTopWidth) + 数(样.borderBottomWidth);
        const 右 = 盒.right - 数(样.right);
        记录.push({
          内容: 样.content,
          盒: [取(右 - 宽), 取(盒.top + 数(样.top)), 取(右), 取(盒.top + 数(样.top) + 高)],
          入盒竖: 取(盒.top + 数(样.top) + 高 - 盒.top),
          入盒横: 取(盒.right - (右 - 宽)),
          字顶: 取(盒.top),
        });
      }
      出.push({ 档: 档.名, 枚数: 记录.length, 记录 });
    }
    藏.remove();
    return 出;`);
  console.log('样本枚数:', 报告[0].枚数);
  writeFileSync(join(项目根, 'tmp', '徽标贴角-档.json'), JSON.stringify(报告));
  await 求值(`${S}
    const s = document.createElement('style');
    s.id = '量-藏徽标';
    s.textContent = '.字.命中[data-hit-position]::after{opacity:0!important;visibility:hidden!important}';
    document.head.append(s);
    return true;`);
  await pause(150);
  const 底片 = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(项目根, 'tmp', '徽标贴角-底片.png'), Buffer.from(底片.data, 'base64'));
  console.log('已写入 tmp/徽标贴角-{底片.png,档.json}');
  await 求值(`${S}
    const s = document.getElementById('量-藏徽标');
    s.textContent = '.字.命中[data-hit-position]::after{transition:none!important;opacity:1!important;visibility:visible!important}';
    return true;`);
  await pause(250);
  const 成品 = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(项目根, 'tmp', '徽标贴角-成品.png'), Buffer.from(成品.data, 'base64'));
  console.log('已写入 tmp/徽标贴角-成品.png');
  ws.close();
} finally {
  await 收尾();
}
