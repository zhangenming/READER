// 一次性基准脚本：量化 js/时钟遮挡.js 的真实开销，回答「不会有性能问题吧」。
// 自启 server.mjs + headless Chrome（一次性 profile，reader- 前缀，AGENTS.md 清理规范）。
// 测三件事：
//   1) DOM 规模：命中测试要在多大的树上做（虚拟列表应让规模与书长无关）；
//   2) 单次 刷新时钟遮挡() 耗时：早退路径（有字，首个采样点即命中）vs
//      全扫描路径（空行，扫满全部采样点），以及读数两行加宽后的最坏采样点数；
//   3) 逐帧 A/B：自动滚动（最高速 600px/s）下，开关这条 scroll 监听各采两轮，
//      对比帧间隔 avg/p95/max 与卡帧数——这是用户唯一能感知的口径。
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const 站点端口 = Number(process.env.SITE_PORT || 16119);
const CDP端口 = Number(process.env.VERIFY_CDP_PORT || 9519);
const 地址 = `http://127.0.0.1:${站点端口}/`;
const 项目根 = new URL('..', import.meta.url).pathname;

const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

// 开跑前：清掉本项目遗留且无进程占用的 reader-* 一次性 profile（AGENTS.md）
let 遗留已清 = 0;
for (const 名字 of readdirSync(tmpdir())) {
  if (!名字.startsWith('reader-')) continue;
  const 路径 = join(tmpdir(), 名字);
  try {
    execFileSync('pgrep', ['-f', 名字], { stdio: 'pipe' });
    continue; // 有进程占用，跳过
  } catch {}
  rmSync(路径, { recursive: true, force: true });
  遗留已清 += 1;
}
if (遗留已清) console.log(`已清理本项目遗留 profile：${遗留已清} 个`);

const 服务 = spawn('node', ['server.mjs', String(站点端口)], {
  cwd: 项目根,
  stdio: 'ignore',
});
const profile = mkdtempSync(join(tmpdir(), 'reader-clock-bench-'));
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    '--force-color-profile=srgb',
    地址,
  ],
  { stdio: 'ignore' },
);

let 已收尾 = false;
function 收尾并校验() {
  if (已收尾) return;
  已收尾 = true;
  try {
    for (const 子进程 of [chrome, 服务]) {
      if (子进程.exitCode === null && 子进程.signalCode === null) {
        子进程.kill();
        子进程.kill('SIGKILL');
      }
    }
    const profile名 = profile.split('/').pop();
    for (let i = 0; i < 20; i += 1) {
      try {
        execFileSync('pgrep', ['-f', profile名], { stdio: 'pipe' });
      } catch {
        break;
      }
      const wait直到 = Date.now() + 100;
      while (Date.now() < wait直到) {}
    }
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    if (existsSync(profile)) {
      console.log(`❌ profile 清理失败，目录仍存在：${profile}`);
      process.exitCode = 1;
    } else {
      console.log(`✅ profile 已删除：${profile}`);
    }
  } catch (错误) {
    console.log(`❌ profile 清理异常：${错误?.message ?? 错误}`);
    process.exitCode = 1;
  }
}
process.on('exit', 收尾并校验);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

async function 等待目标() {
  for (let i = 0; i < 150; i++) {
    try {
      const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
      const 目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
      if (目标) return 目标;
    } catch {}
    await pause(200);
  }
  throw new Error('未找到 headless Chrome 页面');
}

const 目标 = await 等待目标();
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
    待回复.set(下标, { resolve, reject });
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
    throw new Error(
      结果.exceptionDetails.exception?.description || JSON.stringify(结果.exceptionDetails),
    );
  return 结果.result.value;
}

function 统计(数组) {
  const 排序 = [...数组].sort((a, b) => a - b);
  const 求和 = 排序.reduce((a, b) => a + b, 0);
  return {
    n: 排序.length,
    avg: +(求和 / 排序.length).toFixed(3),
    p50: +排序[Math.floor(排序.length * 0.5)].toFixed(3),
    p95: +排序[Math.floor(排序.length * 0.95)].toFixed(3),
    max: +排序[排序.length - 1].toFixed(3),
  };
}

try {
  for (let i = 0; i < 200; i++) {
    const 行数 = await 求值(`return document.querySelectorAll('.正文行').length;`);
    if (行数 > 20) break;
    await pause(200);
  }

  // —— 1) DOM 规模 ——
  const 规模 = await 求值(`
    return {
      字元素: document.querySelectorAll('.字').length,
      全部节点: document.getElementsByTagName('*').length,
      行数: document.querySelectorAll('.正文行').length,
    };
  `);
  console.log('DOM 规模:', JSON.stringify(规模));

  // 装一个常驻逐帧采样器（两条相位共用，自身开销对等）
  await 求值(`
    window.__帧差 = [];
    window.__记帧 = false;
    window.__上帧 = 0;
    const 步 = (t) => {
      if (window.__上帧 && window.__记帧) window.__帧差.push(t - window.__上帧);
      window.__上帧 = t;
      requestAnimationFrame(步);
    };
    requestAnimationFrame(步);
    return true;
  `);

  // —— 2) 单次判定耗时 ——
  // 2a. 早退路径：满行滚进浮层下方，第一个采样点就命中 .字
  // 2b. 全扫描路径：空行落到浮层下方，扫满全部采样点（最坏点数）
  // 2c. 加宽最坏态：两行读数全开（矩形 ~112px 宽），同样全扫描
  // 统计函数没有宿主注入通道，直接在求值串里展开
  const 统计源 = `
    const 自统计 = (数组) => {
      const s = [...数组].sort((a,b)=>a-b);
      return { n: s.length, avg: +(s.reduce((a,b)=>a+b,0)/s.length).toFixed(3),
               p50: +s[Math.floor(s.length*0.5)].toFixed(3), p95: +s[Math.floor(s.length*0.95)].toFixed(3),
               max: +s[s.length-1].toFixed(3) };
    };
  `;

  await 求值(`
    ${统计源}
    const { 状态 } = await import('./js/状态.js');
    window.__行高 = 状态.行高;
    window.__视口高 = innerHeight;
    // 找一个满行（长 ≥ 30 字）和一个空行（长 = 0），都落在 40..600 行之间
    window.__密行 = -1; window.__疏行 = -1;
    for (let idx = 40; idx < Math.min(600, 状态.行起点列表.length); idx += 1) {
      const 长 = 状态.行终点列表[idx] - 状态.行起点列表[idx];
      if (window.__密行 < 0 && 长 >= 30) window.__密行 = idx;
      if (window.__疏行 < 0 && 长 === 0) window.__疏行 = idx;
    }
    return { 行高: window.__行高, 密行: window.__密行, 疏行: window.__疏行 };
  `);

  const 判定早退 = await 求值(`
    ${统计源}
    document.querySelector('#滚动容器').scrollTop = (window.__密行 + 1) * window.__行高 - window.__视口高;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const m = await import('./js/时钟遮挡.js');
    for (let i = 0; i < 100; i += 1) m.刷新时钟遮挡();
    const 单次 = [];
    for (let i = 0; i < 2000; i += 1) {
      const t0 = performance.now();
      m.刷新时钟遮挡();
      单次.push(performance.now() - t0);
    }
    return { 遮挡中: document.querySelector('.时间信息').classList.contains('被正文遮挡'), 早退路径: 自统计(单次) };
  `);
  console.log('判定·早退路径(有字):', JSON.stringify(判定早退));

  const 判定全扫 = await 求值(`
    ${统计源}
    document.querySelector('#滚动容器').scrollTop = (window.__疏行 + 1) * window.__行高 - window.__视口高;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const m = await import('./js/时钟遮挡.js');
    for (let i = 0; i < 100; i += 1) m.刷新时钟遮挡();
    const 单次 = [];
    for (let i = 0; i < 2000; i += 1) {
      const t0 = performance.now();
      m.刷新时钟遮挡();
      单次.push(performance.now() - t0);
    }
    // 原始 elementsFromPoint 同点数对照
    const rect = document.querySelector('.时间信息').getBoundingClientRect();
    const 列数 = Math.max(2, Math.ceil(rect.width / 12) + 1);
    const 原始 = [];
    for (let i = 0; i < 2000; i += 1) {
      const t0 = performance.now();
      for (let 行序 = 0; 行序 < 3; 行序 += 1) {
        const y = rect.top + ((rect.height - 1) * 行序) / 2;
        for (let 列序 = 0; 列序 < 列数; 列序 += 1) {
          document.elementsFromPoint(rect.left + ((rect.width - 1) * 列序) / (列数 - 1), y);
        }
      }
      原始.push(performance.now() - t0);
    }
    return { 遮挡中: document.querySelector('.时间信息').classList.contains('被正文遮挡'),
             点数: 列数 * 3, 全扫描路径: 自统计(单次), 纯命中测试: 自统计(原始) };
  `);
  console.log('判定·全扫描路径(空行):', JSON.stringify(判定全扫));

  const 判定加宽 = await 求值(`
    ${统计源}
    document.querySelector('#已滚动时间行').hidden = false;
    document.querySelector('#剩余滚动时间行').hidden = false;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const m = await import('./js/时钟遮挡.js');
    for (let i = 0; i < 100; i += 1) m.刷新时钟遮挡();
    const 单次 = [];
    for (let i = 0; i < 2000; i += 1) {
      const t0 = performance.now();
      m.刷新时钟遮挡();
      单次.push(performance.now() - t0);
    }
    const rect = document.querySelector('.时间信息').getBoundingClientRect();
    return { 宽: +rect.width.toFixed(1), 点数: (Math.max(2, Math.ceil(rect.width / 12) + 1)) * 3,
             加宽全扫描: 自统计(单次) };
  `);
  console.log('判定·加宽最坏态:', JSON.stringify(判定加宽));

  // —— 3) 逐帧 A/B：最高速自动滚动，开关 scroll 监听各两轮 ——
  async function 采帧相位(监听开, 持续毫秒) {
    await 求值(`
      const { 元素 } = await import('./js/状态.js');
      const { 安排刷新时钟遮挡 } = await import('./js/时钟遮挡.js');
      元素.滚动容器.removeEventListener('scroll', 安排刷新时钟遮挡);
      ${监听开 ? "元素.滚动容器.addEventListener('scroll', 安排刷新时钟遮挡, { passive: true });" : ''}
      return true;
    `);
    await 求值(`
      const { 状态 } = await import('./js/状态.js');
      const 滚 = await import('./js/自动滚动.js');
      状态.自动滚动速度 = 600; // 最高速：行更替最频繁，命中测试压力最大
      document.querySelector('#滚动容器').scrollTop = 60000;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await 滚.开始自动滚动();
      window.__记帧 = true;
      return true;
    `);
    await pause(持续毫秒);
    const 帧差 = await 求值(`
      window.__记帧 = false;
      const 滚 = await import('./js/自动滚动.js');
      if (滚.自动滚动进行中()) await 滚.停止自动滚动('基准相位结束');
      return window.__帧差.splice(0);
    `);
    return 统计(帧差.map((d) => +d.toFixed(3)));
  }

  const 相位A1 = await 采帧相位(false, 5000); // 基线：无遮挡判定
  const 相位B1 = await 采帧相位(true, 5000); // 有遮挡判定
  const 相位A2 = await 采帧相位(false, 5000);
  const 相位B2 = await 采帧相位(true, 5000);
  console.log('帧间隔·无判定 A1:', JSON.stringify(相位A1));
  console.log('帧间隔·有判定 B1:', JSON.stringify(相位B1));
  console.log('帧间隔·无判定 A2:', JSON.stringify(相位A2));
  console.log('帧间隔·有判定 B2:', JSON.stringify(相位B2));
  const 卡帧 = (s) => s.p95 > 25 || s.max > 40;
  console.log(
    `卡帧判定(>25ms 或 max>40ms)：A1=${卡帧(相位A1)} B1=${卡帧(相位B1)} A2=${卡帧(相位A2)} B2=${卡帧(相位B2)}`,
  );
  console.log('✅ 基准完成');
} finally {
  收尾并校验();
  ws.close();
}
