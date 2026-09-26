// 浏览器回归启动器（复用已在 15921 上的静态服务）。
// 默认版 tmp/跑-浏览器回归.mjs 自己拉起 server.mjs:15921；当 15921 已被别的进程
// （例如另一会话的 python -m http.server，cwd 同样是本仓）占用时，用例里的
// `t.url.startsWith('http://127.0.0.1:15921')` 就找不到页面。本变体不再起服务，
// 直接对着 15921 上那份静态文件跑，只负责起/收自己的 headless Chrome。
// 用法：node tmp/跑-浏览器回归-外部站点.mjs [tests/a-browser.mjs ...]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const 站点端口 = Number(process.env.SITE_PORT ?? 15921);
const CDP端口 = Number(process.env.CDP_PORT ?? 15923);
const 书名 = process.env.书名 ?? '从0到1：开启商业与未来的秘密.txt';
const 默认用例 = [
  'tests/search-browser.mjs',
  'tests/keyword-longpress-browser.mjs',
  'tests/statistics-browser.mjs',
  'tests/scroll-segments-browser.mjs',
  'tests/batch-import-browser.mjs',
];
const 用例列表 = process.argv.slice(2).length ? process.argv.slice(2) : 默认用例;
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

function 端口空闲(端口) {
  return new Promise((resolve) => {
    const s = createServer();
    s.on('error', () => resolve(false));
    s.listen(端口, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

const 清理遗留profile = (跳过) => {
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

async function 等端口空闲(端口, 说明) {
  for (let n = 0; n < 50; n++) {
    if (await 端口空闲(端口)) return;
    await pause(200);
  }
  throw new Error(`${说明} ${端口} 一直被占用`);
}

if (
  !(await fetch(`http://127.0.0.1:${站点端口}/`, {
    signal: AbortSignal.timeout(3000),
  }).then((r) => r.ok))
) {
  throw new Error(`127.0.0.1:${站点端口} 上没有可用的静态服务`);
}
await 等端口空闲(CDP端口, 'CDP端口');
清理遗留profile();

const profile = mkdtempSync(join(tmpdir(), 'reader-ext-site-'));
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
const chrome已退出 = new Promise((r) => chrome.on('exit', r));
process.on('exit', () => chrome.kill());

let ws = null;
let 序号 = 0;
const 待回复 = new Map();
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
    throw new Error(
      结果.exceptionDetails.exception?.description ||
        JSON.stringify(结果.exceptionDetails),
    );
  return 结果.result.value;
}

async function 连接页面() {
  for (let n = 0; n < 150; n++) {
    try {
      const 列表 = await (
        await fetch(`http://127.0.0.1:${CDP端口}/json`)
      ).json();
      const 目标 = 列表.find(
        (t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${站点端口}/`),
      );
      if (!目标) {
        await pause(300);
        continue;
      }
      ws = new WebSocket(目标.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener('open', r, { once: true }));
      ws.addEventListener('message', (事件) => {
        const 消息 = JSON.parse(事件.data);
        if (!消息.id) return;
        const 请求 = 待回复.get(消息.id);
        待回复.delete(消息.id);
        if (!请求) return;
        if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
        else 请求.resolve(消息.result);
      });
      await 发送('Runtime.enable');
      return;
    } catch {}
    await pause(300);
  }
  throw new Error('headless Chrome 页面未就绪');
}

async function 载入一本书() {
  const 状态前缀 = 'const { 状态 } = await import("./js/状态.js");';
  await 求值(`
    const { 打开内容选择弹窗 } = await import("./js/内容选择弹窗.js");
    打开内容选择弹窗();
    return 1;`);
  for (let n = 0; n < 60; n++) {
    if (await 求值(`${状态前缀} return !!状态.文件名;`)) return;
    const 点到 = await 求值(`
      const 按钮 = [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
        .find(b => b.dataset.fileName === ${JSON.stringify(书名)})
        ?? document.querySelector('#内容选择列表 [data-file-name]');
      if (!按钮) return false;
      按钮.click();
      return true;`);
    await pause(点到 ? 700 : 400);
  }
  throw new Error(`未能载入 ${书名}`);
}

let 退出码 = 0;
try {
  await 连接页面();
  await 载入一本书();
  console.log('已载入正文，开始跑用例:', 用例列表.join(' '));
  ws.close();
  ws = null;
  for (const 用例 of 用例列表) {
    console.log('\n=== ' + 用例 + ' ===');
    const 子 = spawn('node', [用例], {
      cwd: 项目根,
      env: { ...process.env, CDP_PORT: String(CDP端口) },
      stdio: 'inherit',
    });
    const 码 = await new Promise((r) => 子.on('exit', r));
    if (码) {
      console.error(`用例失败：${用例}（退出码 ${码}）`);
      退出码 = 1;
    }
  }
} catch (错误) {
  console.error('环境失败:', 错误);
  退出码 = 1;
} finally {
  ws?.close();
  chrome.kill();
  await Promise.race([chrome已退出, pause(3000).then(() => chrome.kill('SIGKILL'))]);
  await pause(300);
  rmSync(profile, { recursive: true, force: true });
  if (existsSync(profile)) {
    console.error('profile 清理失败，目录仍存在:', profile);
    退出码 = 1;
  } else {
    console.log('\nprofile 已清理:', profile);
  }
  清理遗留profile();
}
process.exitCode = 退出码;
console.log(退出码 ? '浏览器回归：有用例失败' : '浏览器回归：全部通过');
