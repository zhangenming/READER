// 临时变体：dev server 已占用 15921 时的浏览器回归启动器。
// 不自起服务，headless Chrome 直接指向运行中的 http://127.0.0.1:15921/，
// 载入书后依次跑指定用例（环境部分与 跑-浏览器回归.mjs 一致）。
// 用法：node tmp/跑-浏览器回归-复用服务.mjs [tests/a-browser.mjs ...]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const 项目根 = new URL('..', import.meta.url).pathname;
const 站点端口 = 15921;
const CDP端口 = 15922;
const 书名 = process.env.书名 ?? '从0到1：开启商业与未来的秘密.txt';
const 用例列表 = process.argv.slice(2);
if (!用例列表.length) {
  console.error('用法：node tmp/跑-浏览器回归-复用服务.mjs <tests/x-browser.mjs ...>');
  process.exit(2);
}
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

const profile = mkdtempSync(join(tmpdir(), 'reader-cdp-reuse-'));
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
        (t) =>
          t.type === 'page' &&
          t.url.startsWith(`http://127.0.0.1:${站点端口}/`),
      );
      if (!目标) continue;
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
  await pause(500);
  chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
  if (existsSync(profile)) console.error('profile 清理失败:', profile);
}
process.exitCode = 退出码;
console.log(退出码 ? '浏览器回归：有用例失败' : '浏览器回归：全部通过');
