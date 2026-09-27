// 在真实 headless Chrome 里确认合并稿：书库只剩一本、章节表 7 条、正文与注条渲染正常。
// 按 AGENTS.md：自建 reader-* profile，成功/异常/超时都停子进程并删除该目录。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = join(import.meta.dirname, '../..');
const CDP端口 = 15932;
const 书名 = '激荡三十年.txt';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function 空闲端口() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const 端口 = s.address().port;
      s.close(() => resolve(端口));
    });
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

const 站点端口 = await 空闲端口();
const profile = mkdtempSync(join(tmpdir(), 'reader-合并激荡-'));
清理遗留(profile);
const 子 = [];
let ws = null;
let 序号 = 0;
const 待回复 = new Map();

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
  const r = await 发送('Runtime.evaluate', {
    expression: `(async () => { ${代码} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

try {
  const 服务 = spawn('node', ['server.mjs', String(站点端口)], { cwd: 项目根, stdio: 'ignore' });
  子.push(服务);
  const chrome = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--headless=new',
      `--remote-debugging-port=${CDP端口}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
      `http://127.0.0.1:${站点端口}/`,
    ],
    { stdio: 'ignore' },
  );
  子.push(chrome);

  let 目标 = null;
  for (let n = 0; n < 120 && !目标; n++) {
    await pause(400);
    try {
      const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
      目标 = 列表.find((t) => t.type === 'page' && t.url.includes(`:${站点端口}/`));
    } catch {}
  }
  if (!目标) throw new Error('headless Chrome 页面未就绪');
  ws = new WebSocket(目标.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (!m.id) return;
    const 请 = 待回复.get(m.id);
    待回复.delete(m.id);
    if (!请) return;
    m.error ? 请.reject(new Error(JSON.stringify(m.error))) : 请.resolve(m.result);
  });
  await 发送('Runtime.enable');

  for (let n = 0; n < 60; n++) {
    if (await 求值(`return !!document.querySelector('#内容选择列表')`)) break;
    await pause(300);
  }

  await 求值(`
    const { 打开内容选择弹窗 } = await import('./js/内容选择弹窗.js');
    打开内容选择弹窗(); return 1;`);
  let 书目 = [];
  for (let n = 0; n < 80; n++) {
    书目 = await 求值(`
      return [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
        .map(b => b.dataset.fileName);`);
    if (书目.length > 3) break;
    await pause(300);
  }
  const 激荡书目 = 书目.filter((f) => f.includes('激荡三十年'));
  console.log(`书库中「激荡三十年」条目: ${JSON.stringify(激荡书目)}`);

  // 启动时会从 localStorage 恢复上一本书，可能盖掉这一次点击，所以边点边轮询到本书就位。
  let 就绪 = false;
  for (let n = 0; n < 120 && !就绪; n++) {
    await 求值(`
      const { 状态 } = await import('./js/状态.js');
      if (状态.文件名 === ${JSON.stringify(书名)}) return 1;
      const 弹窗 = document.querySelector('#内容选择弹窗');
      if (!弹窗 || !弹窗.open) {
        const { 打开内容选择弹窗 } = await import('./js/内容选择弹窗.js');
        打开内容选择弹窗();
      }
      const 按钮 = [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
        .find(b => b.dataset.fileName === ${JSON.stringify(书名)});
      按钮?.click(); return 1;`);
    await pause(600);
    就绪 = await 求值(`
      const { 状态 } = await import('./js/状态.js');
      return !!(状态.文件名 === ${JSON.stringify(书名)} && 状态.章节列表?.length === 7 &&
        状态.行起点列表?.length > 1000 && document.querySelectorAll('.正文行').length > 0);`);
  }
  if (!就绪) throw new Error('合并稿始终没载入完成');
  await 求值(`const { 关闭内容选择弹窗 } = await import('./js/内容选择弹窗.js'); 关闭内容选择弹窗?.(); return 1;`).catch(() => {});

  const 跳转 = async (标题) => {
    const 首行 = await 求值(`
      const { 状态 } = await import('./js/状态.js');
      const { 跳到章节索引 } = await import('./js/章节目录.js');
      const idx = 状态.章节列表.findIndex(c => c.标题.startsWith(${JSON.stringify(标题)}));
      if (idx < 0 || !跳到章节索引(idx)) throw new Error('跳不过去 ' + ${JSON.stringify(标题)});
      return idx;`);
    // 跳章带动画，等 scrollTop 停下来再读，否则量到的是半路的视口
    let 上个 = -1;
    let 稳 = 0;
    for (let n = 0; n < 60 && 稳 < 4; n++) {
      await pause(200);
      const 当前 = await 求值(`const { 元素 } = await import('./js/状态.js'); return Math.round(元素.滚动容器.scrollTop);`);
      稳 = 当前 === 上个 ? 稳 + 1 : 0;
      上个 = 当前;
    }
    return await 求值(`
      const { 元素 } = await import('./js/状态.js');
      const 容器 = 元素.滚动容器;
      const 顶 = 容器.getBoundingClientRect().top;
      const 行 = [...容器.querySelectorAll('.正文行')]
        .filter(r => r.getBoundingClientRect().bottom > 顶)
        .slice(0, 3).map(r => r.textContent.trim().slice(0, 30)).filter(Boolean);
      return { 目标: ${JSON.stringify(标题)}, 首行: 行 };`);
  };
  const 结果 = await 求值(`
    const { 状态 } = await import('./js/状态.js');
    return {
      文件名: 状态.文件名,
      万字: +(状态.文本.replace(/\\s/g, '').length / 10000).toFixed(1),
      行数: 状态.文本.split('\\n').length,
      章节: 状态.章节列表.map(c => c.标题),
      行起点数: 状态.行起点列表.length,
      末章末字: 状态.文本.trim().slice(-24),
    };`);
  const 注条 = await 求值(`
    const t = await (await fetch('./txt/' + encodeURIComponent(${JSON.stringify(书名)}), { cache: 'no-store' })).text();
    return t.split('\\n').filter(l => /^\\[\\d+\\]/.test(l)).length;`);
  const 五部 = await 跳转('第五部');
  const 末部 = await 跳转('致谢');
  console.log('章节跳转:', JSON.stringify(五部), JSON.stringify(末部));
  console.log(JSON.stringify(结果, null, 2));

  const 错 = [];
  if (激荡书目.length !== 1) 错.push(`书库应只剩 1 本激荡三十年，实际 ${激荡书目.length}`);
  if (结果.文件名 !== 书名) 错.push('未载入合并稿');
  if (结果.章节.length !== 7) 错.push(`章节应 7 条，实际 ${结果.章节.length}`);
  if (结果.万字 < 55 || 结果.万字 > 62) 错.push(`万字异常 ${结果.万字}`);
  if (注条 !== 329) 错.push(`注条应 329，实际 ${注条}`);
  if (结果.行起点数 < 14000) 错.push(`行起点数偏少 ${结果.行起点数}`);
  if (!五部.首行.some((t) => t.startsWith('第五部'))) 错.push('跳到第五部后首行不符: ' + JSON.stringify(五部.首行));
  if (!末部.首行.some((t) => t === '致谢')) 错.push('跳到致谢后首行不符: ' + JSON.stringify(末部.首行));
  console.log(错.length ? '❌ ' + 错.join('\n❌ ') : '✅ 浏览器实测通过');
  if (错.length) process.exitCode = 1;
} finally {
  for (const p of 子) p.kill('SIGKILL');
  await pause(800);
  try {
    execFileSync('pkill', ['-f', `user-data-dir=${profile}`], { stdio: 'ignore' });
  } catch {}
  await pause(500);
  rmSync(profile, { recursive: true, force: true });
  ws?.close();
  if (existsSync(profile)) {
    console.log(`⚠️ profile 未删除: ${profile}`);
    process.exitCode = 1;
  } else {
    console.log(`profile 已清理: ${profile}`);
  }
}
