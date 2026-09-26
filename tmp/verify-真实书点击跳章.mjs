// 一次性验证脚本：在真实书上点击章节标题行跳章（截图里那本《解放战争（套装共6册）》）。
// 覆盖：真实书的目录块 / 分卷重号下标题行是否被标记、单击跳下一章、Shift+单击 回上一章、
// 以及跳章落点与「目录点击」完全一致。fixture 版见 tmp/verify-点击章节跳转.mjs。
// 自启 server.mjs + headless Chrome（CDP），按 AGENTS.md 规范清理 reader-* 一次性 profile。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const 书名 = process.argv[2] || '解放战争（套装共6册）.txt';
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

const 清理遗留profile = () => {
  for (const 名 of readdirSync(tmpdir())) {
    if (!名.startsWith('reader-')) continue;
    const 路径 = join(tmpdir(), 名);
    try {
      execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
      continue;
    } catch {}
    rmSync(路径, { recursive: true, force: true });
    if (existsSync(路径)) {
      console.error('遗留 profile 清理失败:', 路径);
      process.exit(1);
    }
  }
};
清理遗留profile();

const 站点端口 = await 取空闲端口();
const CDP端口 = await 取空闲端口();
const 地址 = `http://127.0.0.1:${站点端口}/`;
const profile = mkdtempSync(join(tmpdir(), 'reader-real-chapter-'));
console.log('地址:', 地址, 'CDP:', CDP端口, '书目:', 书名);

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
    地址,
  ],
  { stdio: 'ignore' },
);
let chrome已退出 = new Promise((r) => chrome.on('exit', r));
let 服务已退出 = new Promise((r) => 服务.on('exit', r));
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
process.on('exit', () => {
  chrome.kill();
  服务.kill();
});

try {
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
  const 页面日志 = [];
  ws.addEventListener('message', (事件) => {
    const 消息 = JSON.parse(事件.data);
    if (消息.id) {
      const 请求 = 待回复.get(消息.id);
      待回复.delete(消息.id);
      if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
      else 请求.resolve(消息.result);
    } else if (消息.method === 'Runtime.consoleAPICalled') {
      页面日志.push(
        [消息.params.type, ...消息.params.args.map((a) => a.value ?? a.description ?? '')].join(' '),
      );
    } else if (消息.method === 'Runtime.exceptionThrown') {
      页面日志.push('EXCEPTION: ' + (消息.params.exceptionDetails.exception?.description || 消息.params.exceptionDetails.text));
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
  const 失败 = (说明) => `${说明}\n页面日志:\n${页面日志.slice(-8).join('\n')}`;
  const 状态前缀 = 'const { 状态, 元素 } = await import("./js/状态.js");';

  await 发送('Page.enable');
  await 发送('Runtime.enable');

  async function 等待就绪(说明) {
    for (let n = 0; n < 600; n++) {
      try {
        const 好 = await 求值(`${状态前缀}
          return document.querySelector("#载入状态")?.hidden && 状态.行起点列表.length > 0;`);
        if (好) return;
      } catch {}
      await pause(100);
    }
    throw new Error(`载入超时：${说明}`);
  }
  await 等待就绪('首本书');

  // 通过「内容」按钮切到目标书（真实入口，不注入 fixture）
  const 找到 = await 求值(`${状态前缀}
    document.querySelector('#内容选择按钮').click();
    return new Promise((r) => setTimeout(() => {
      const 按钮 = document.querySelector('[data-file-name=${JSON.stringify(书名)}]');
      if (!按钮) return r(null);
      按钮.click();
      r(按钮.textContent.slice(0, 40));
    }, 400));`);
  assert.ok(找到, 失败(`内容列表里找不到《${书名}》`));
  await pause(600);
  await 等待就绪(书名);
  const 章节数 = await 求值(`${状态前缀} return 状态.章节列表.length;`);
  console.log('已载入:', 找到, '章节数:', 章节数);
  assert.ok(章节数 > 50, 失败(`真实书应识别出大量章节，实际 ${章节数}`));

  const 期望顶部 = (索引) =>
    求值(`${状态前缀}
      const { 查找偏移所在行 } = await import("./js/排版引擎.js");
      return 查找偏移所在行(状态.章节列表[${索引}].偏移) * 状态.行高;`);
  const 标题 = (索引) => 求值(`${状态前缀} return 状态.章节列表[${索引}].标题;`);
  const 滚动位置 = () => 求值(`${状态前缀} return 元素.滚动容器.scrollTop;`);
  const 行高 = () => 求值(`${状态前缀} return 状态.行高;`);
  async function 等待落位(说明) {
    await pause(240);
    for (let n = 0; n < 120; n++) {
      if (await 求值(`${状态前缀} return !状态.滚动动画目标`)) return;
      await pause(50);
    }
    throw new Error(失败(`${说明}：跳转未在 6s 内结束`));
  }
  async function 取标题行(索引) {
    return 求值(`${状态前缀}
      const 行 = document.querySelector('.正文行[data-chapter-index="${索引}"]');
      if (!行) return null;
      const 字 = 行.querySelector('.字');
      const 盒 = (字 || 行).getBoundingClientRect();
      const 容器盒 = 元素.滚动容器.getBoundingClientRect();
      return {
        x: 盒.left + 盒.width / 2,
        y: 盒.top + 盒.height / 2,
        类: 行.className,
        提示: getComputedStyle(行, '::after').content,
        在视口内: 盒.top >= 容器盒.top - 1 && 盒.bottom <= 容器盒.bottom + 1,
      };`);
  }
  async function 点击(x, y, 修饰 = 0) {
    const 基 = { x, y, button: 'left', clickCount: 1, modifiers: 修饰 };
    await 发送('Input.dispatchMouseEvent', { type: 'mousePressed', ...基 });
    await 发送('Input.dispatchMouseEvent', { type: 'mouseReleased', ...基 });
  }

  // 挑一章正文里真实存在的标题（跳过目录块里的同名条目），逐段验证前进 / 后退
  const 候选 = await 求值(`${状态前缀}
    const 结果 = [];
    for (let 索引 = 0; 索引 < 状态.章节列表.length; 索引 += 1) {
      const 标题 = 状态.章节列表[索引].标题;
      if (/^第\\s*5\\s*章/.test(标题) || /黄河归故斗争/.test(标题)) {
        结果.push({ 索引, 标题, 偏移: 状态.章节列表[索引].偏移 });
      }
    }
    return 结果;`);
  console.log(
    '匹配到的第5章 / 黄河归故斗争:',
    候选.map((项) => `${项.索引}·${项.标题}`).join(' | '),
  );

  let 已验证 = 0;
  for (const { 索引 } of 候选.slice(0, 3)) {
    await 求值(`${状态前缀} 元素.滚动容器.scrollTop = ${await 期望顶部(索引)};`);
    await pause(200);
    const 行 = await 取标题行(索引);
    if (!行 || !行.在视口内) continue;
    assert.ok(行.类.includes('章节标题行'), 失败(`真实书标题行应被标记：${行.类}`));
    const 下一章顶部 = await 期望顶部(索引 + 1);
    await 点击(行.x, 行.y);
    await 等待落位('真实书单击跳章');
    const 位置 = await 滚动位置();
    assert.ok(
      Math.abs(位置 - 下一章顶部) < 1,
      失败(
        `真实书单击「${await 标题(索引)}」应跳到「${await 标题(索引 + 1)}」顶部：期望 ${下一章顶部}，实际 ${位置}`,
      ),
    );
    // 跳完后本章标题行已不在原位：把「下一章」标题行滚回顶部，Shift+点击 回到本章
    await 求值(`${状态前缀} 元素.滚动容器.scrollTop = ${下一章顶部};`);
    await pause(200);
    const 下一章行 = await 取标题行(索引 + 1);
    if (下一章行 && 下一章行.在视口内) {
      await 点击(下一章行.x, 下一章行.y, 8);
      await 等待落位('真实书 Shift 回上一章');
      const 回位 = await 滚动位置();
      const 本章顶部 = await 期望顶部(索引);
      assert.ok(
        Math.abs(回位 - 本章顶部) < 1,
        失败(`真实书 Shift+单击应回到「${await 标题(索引)}」：期望 ${本章顶部}，实际 ${回位}`),
      );
    }
    已验证 += 1;
    console.log(
      `  ✓ ${await 标题(索引)} → ${await 标题(索引 + 1)}（提示 ${行.提示}，行高 ${await 行高()}）`,
    );
  }
  assert.ok(已验证 > 0, 失败('真实书至少应验证一次点击跳章'));

  const 标记行数 = await 求值(`${状态前缀}
    return {
      标题行: document.querySelectorAll('.正文行.章节标题行').length,
      带提示: document.querySelectorAll('.正文行[data-chapter-hint]').length,
    };`);
  console.log('当前视口内标记:', 标记行数);
  assert.ok(标记行数.标题行 > 0, 失败('视口内应有被标记的标题行'));

  console.log(`\nOK：《${书名}》点击章节标题行跳下一章 / Shift+点击 回上一章，落点与目录点击一致`);
  ws.close();
} finally {
  await 收尾();
}
