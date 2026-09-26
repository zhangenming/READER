// 浏览器回归启动器：tests/*-browser.mjs 需要一个「已开启远程调试、并已打开
// http://127.0.0.1:15921/、且正文已载入」的 Chrome，本脚本负责把这套环境起好：
// 起服务 → 起 headless Chrome → 选一本书载入 → 依次跑指定用例 → 收尾。
// 按 AGENTS.md 规范：停子进程并删除 reader-* 一次性 profile，成功/异常/超时都不跳过。
// 用法：node tmp/跑-浏览器回归.mjs [tests/a-browser.mjs ...]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const 站点端口 = 15921;
const CDP端口 = 15922;
const 书名 = process.env.书名 ?? '从0到1：开启商业与未来的秘密.txt';
const 默认用例 = [
  'tests/search-browser.mjs',
  'tests/keyword-longpress-browser.mjs',
  'tests/statistics-browser.mjs',
  'tests/scroll-segments-browser.mjs',
  'tests/batch-import-browser.mjs',
]; // chapter-browser.mjs 在 HEAD 上本就跑不到底，不在默认列表里
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
      continue; // 有进程占用，跳过
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

await 等端口空闲(站点端口, '站点端口');
await 等端口空闲(CDP端口, 'CDP端口');
清理遗留profile();

const profile = mkdtempSync(join(tmpdir(), 'reader-browser-regression-'));
const 服务 = spawn('node', ['server.mjs', String(站点端口)], {
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
    '--window-size=1280,900',
    `http://127.0.0.1:${站点端口}/`,
  ],
  { stdio: 'ignore' },
);
const chrome已退出 = new Promise((r) => chrome.on('exit', r));
const 服务已退出 = new Promise((r) => 服务.on('exit', r));
process.on('exit', () => {
  chrome.kill();
  服务.kill();
});

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
      const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
      const 目标 = 列表.find(
        (t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${站点端口}/`),
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
  // 弹窗内部要读目录 + 统计每本字数（几十个文件），不去 await 它，只轮询列表出现后再点
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
    退出码 = 1;
  } else {
    console.log('\nprofile 已清理:', profile);
  }
  清理遗留profile();
}
process.exitCode = 退出码;
console.log(退出码 ? '浏览器回归：有用例失败' : '浏览器回归：全部通过');
