// 一次性验证脚本：统计弹窗的时间轴要把「正在进行、还没封口」的那段激活/滚动也画出来，
// 否则上表「前台停留 / 滚动」就地结转算到眼前，下表「激活 / 滚动」停在上一次切走标签页，
// 两行必然差出一整段正在进行的阅读（2026-09-26 用户截图：33 分钟 vs 17 分）。
// 做法：自启 server.mjs(15921) + headless Chrome，打开一本书后跑 tests/scroll-segments-browser.mjs，
// 该回归里新增的断言直接核对「今天那行浅色激活带的段尾 == 打开弹窗的此刻」。
// 按 AGENTS.md 规范：profile 用 reader- 前缀，try/finally 停子进程再删目录并确认已消失。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const pause = (毫秒) => new Promise((解决) => setTimeout(解决, 毫秒));

function 取空闲端口() {
  return new Promise((解决, 拒绝) => {
    const 探测 = createServer();
    探测.on('error', 拒绝);
    探测.listen(0, '127.0.0.1', () => {
      const 端口 = 探测.address().port;
      探测.close(() => 解决(端口));
    });
  });
}

// 上一次运行被 SIGKILL 留下的 reader-* profile：只清本项目范围内、确认无进程占用的
for (const 名 of readdirSync(tmpdir())) {
  if (!名.startsWith('reader-')) continue;
  const 路径 = join(tmpdir(), 名);
  try {
    execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
    continue; // 有进程占用，留给下一次
  } catch {
    /* 无匹配 → 可删 */
  }
  rmSync(路径, { recursive: true, force: true });
  if (existsSync(路径)) {
    console.error('遗留 profile 清理失败:', 路径);
    process.exit(1);
  }
}

// scroll-segments-browser.mjs 里写死了阅读器地址，站点必须起在 15921
const 站点端口 = 15921;
const 地址 = `http://127.0.0.1:${站点端口}/`;
const CDP端口 = await 取空闲端口();
const profile = mkdtempSync(join(tmpdir(), 'reader-ongoing-band-'));
console.log('地址:', 地址, 'CDP:', CDP端口, 'profile:', profile);

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: 项目根,
  stdio: 'ignore',
});
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
const 服务已退出 = new Promise((解决) => 服务.once('exit', 解决));
const chrome已退出 = new Promise((解决) => chrome.once('exit', 解决));

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
  if (existsSync(profile)) {
    console.error('profile 清理失败，目录仍存在:', profile);
    process.exitCode = 1;
  } else {
    console.log('profile 已清理:', profile);
  }
}

let ws = null;
try {
  for (let n = 0; n < 100; n += 1) {
    try {
      if ((await fetch(地址, { signal: AbortSignal.timeout(1000) })).ok) break;
    } catch {}
    if (n === 99) throw new Error('server.mjs 没有起来');
    await pause(100);
  }

  let 目标 = null;
  for (let n = 0; n < 150 && !目标; n += 1) {
    try {
      const 列表 = await (
        await fetch(`http://127.0.0.1:${CDP端口}/json`, { signal: AbortSignal.timeout(1000) })
      ).json();
      目标 = 列表.find((项) => 项.type === 'page' && 项.url.startsWith(地址));
    } catch {}
    await pause(200);
  }
  assert.ok(目标, '未找到 headless Chrome 的阅读器页面');

  ws = new WebSocket(目标.webSocketDebuggerUrl);
  await new Promise((解决, 拒绝) => {
    ws.addEventListener('open', 解决, { once: true });
    ws.addEventListener('error', () => 拒绝(new Error('CDP 连接失败')), { once: true });
  });
  let 消息号 = 0;
  const 待回复 = new Map();
  ws.addEventListener('message', (事件) => {
    const 消息 = JSON.parse(事件.data);
    if (!消息.id) return;
    const 请求 = 待回复.get(消息.id);
    if (!请求) return;
    待回复.delete(消息.id);
    if (消息.error) 请求.拒绝(new Error(JSON.stringify(消息.error)));
    else 请求.解决(消息.result);
  });
  const 发送 = (方法, 参数 = {}) =>
    new Promise((解决, 拒绝) => {
      const 下标 = ++消息号;
      待回复.set(下标, { 解决, 拒绝 });
      ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
      setTimeout(() => {
        if (待回复.has(下标)) {
          待回复.delete(下标);
          拒绝(new Error(`CDP ${方法} 超时`));
        }
      }, 20_000);
    });
  const 求值 = async (代码) => {
    const 结果 = await 发送('Runtime.evaluate', {
      expression: `(async () => { ${代码} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (结果.exceptionDetails)
      throw new Error(结果.exceptionDetails.exception?.description ?? '求值失败');
    return 结果.result.value;
  };

  await 发送('Page.enable');
  await 发送('Runtime.enable');
  for (let n = 0; n < 600; n += 1) {
    if (await 求值(`return !!document.querySelector('#内容选择按钮');`)) break;
    await pause(200);
    if (n === 599) throw new Error('阅读器没有启动（停在空白/载入态）');
  }
  // 内容列表是虚拟滚动的，点第一本可用的正文书即可：本测只验两本账同时刻，与是哪本书无关
  await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
  let 载入书名 = '';
  for (let n = 0; n < 150 && !载入书名; n += 1) {
    载入书名 = await 求值(`
      const 按钮 = [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
        .find((b) => !b.dataset.fileName.startsWith('.'));
      if (!按钮) return '';
      按钮.click();
      return 按钮.dataset.fileName;
    `);
    await pause(200);
  }
  assert.ok(载入书名, '内容选择列表没有出现可点的书');
  console.log('载入 →', 载入书名);
  for (let n = 0; n < 600; n += 1) {
    const 就绪 = await 求值(`
      const { 状态 } = await import('./js/状态.js');
      return 状态.文件名 === ${JSON.stringify(载入书名)} && 状态.行起点列表.length > 100;
    `);
    if (就绪) break;
    await pause(200);
    if (n === 599) throw new Error('正文没有载入完成');
  }

  // 回归本体：CDP_PORT 交给它复用这个已打开的阅读器标签；可换跑其它浏览器回归脚本
  const 回归脚本 = process.argv[2] || 'tests/scroll-segments-browser.mjs';
  const 子 = spawn(
    process.execPath,
    [回归脚本],
    { cwd: 项目根, stdio: 'inherit', env: { ...process.env, CDP_PORT: String(CDP端口) } },
  );
  const 退出码 = await new Promise((解决) => 子.once('exit', 解决));
  assert.equal(退出码, 0, `${回归脚本} 回归失败（退出码 ${退出码}）`);
  console.log(`\nOK：${回归脚本} 通过`);
  ws.close();
} finally {
  await 收尾();
}
