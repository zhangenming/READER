// 一次性验证脚本：Space 整屏翻页时，最下面一行露出超过 80% 则整行跳过，
// 不再保留为下一页的第一行；露出 ≤ 80% 或恰好对齐行界时保持原行为（残行作为下一页第一行）。
// 自启 server.mjs + headless Chrome（CDP），用 Emulation.setDeviceMetricsOverride
// 调出不同视口高度分别断言，并覆盖手动滚动到非行对齐位置的兜底分支。
// 按 AGENTS.md 规范：profile 用 reader- 前缀，try/finally 中先停进程再删目录并复核。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
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

// 上一次运行若被 SIGKILL/崩溃留下 reader-* 遗留 profile：先清掉确认无进程占用的
const 清理遗留profile = () => {
  for (const 名 of readdirSync(tmpdir())) {
    if (!名.startsWith('reader-')) continue;
    const 路径 = join(tmpdir(), 名);
    try {
      execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
      continue; // 有进程占用，跳过
    } catch {
      // pgrep 无匹配 → 无占用
    }
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
const profile = mkdtempSync(join(tmpdir(), 'reader-page-skip-'));
console.log('地址:', 地址, 'CDP:', CDP端口, 'profile:', profile);

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
        const 列表 = await (
          await fetch(`http://127.0.0.1:${CDP端口}/json`)
        ).json();
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
      throw new Error(
        结果.exceptionDetails.exception?.description ||
          JSON.stringify(结果.exceptionDetails),
      );
    return 结果.result.value;
  }
  const 滚动位置 = () => 求值(`return document.querySelector('#滚动容器').scrollTop;`);
  const 几何 = () =>
    求值(`const c = document.querySelector('#滚动容器');
    return {
      行高: parseFloat(getComputedStyle(document.querySelector('.正文行')).height),
      视口: c.clientHeight,
      总滚动: c.scrollHeight - c.clientHeight,
    };`);

  async function 设视口高度(h) {
    await 发送('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await pause(250); // 尺寸重排防抖 100ms + 渲染
  }

  async function 按键(key, code, keyCode, 修饰 = 0) {
    const 基 = {
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers: 修饰,
    };
    await 发送('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...基 });
    await 发送('Input.dispatchKeyEvent', { type: 'keyUp', ...基 });
  }
  const 按空格 = () => 按键(' ', 'Space', 32);
  const 按Shift空格 = () => 按键(' ', 'Space', 32, 8);

  for (let i = 0; i < 200; i++) {
    const 行数 = await 求值(`return document.querySelectorAll('.正文行').length;`);
    if (行数 > 20) break;
    await pause(200);
  }
  assert.ok(
    (await 求值(`return document.querySelectorAll('.正文行').length;`)) > 20,
    '正文应已载入（虚拟渲染视口行）',
  );
  const 首次几何 = await 几何();
  assert.ok(
    首次几何.总滚动 > 40 * 首次几何.行高,
    `总滚动高度应足够翻几页：${首次几何.总滚动}px`,
  );

  const 调出视口 = async (余数比例) => {
    const g0 = await 几何();
    const 行高 = g0.行高;
    // 滚动容器高度 ≈ 窗口高度 - 固定镶边；按目标余数反推窗口高度
    const 镶边 = 900 - g0.视口;
    const 整行数 = Math.floor(g0.视口 / 行高) - 1;
    const 目标容器高 = Math.round(整行数 * 行高 + 余数比例 * 行高);
    let h = Math.round(目标容器高 + 镶边);
    for (let i = 0; i < 8; i++) {
      await 设视口高度(h);
      const g = await 几何();
      const 实际比例 = (g.视口 % g.行高) / g.行高;
      if (Math.abs(实际比例 - 余数比例) < 0.05) return g;
      h += Math.round((余数比例 - 实际比例) * g.行高);
    }
    throw new Error(`调不出余数比例 ${余数比例}`);
  };

  // ① 露出 90% → 应整行跳过：第 1 页与第 2 页都多跳一行，且逐页稳定
  let g = await 调出视口(0.9);
  await 求值(`document.querySelector('#滚动容器').scrollTop = 0;`);
  await pause(120);
  const N1 = Math.floor(g.视口 / g.行高);
  await 按空格();
  await pause(120);
  const 位置1 = await 滚动位置();
  assert.ok(
    Math.abs(位置1 - (N1 + 1) * g.行高) < 1,
    `露出90%：应跳到第 ${N1 + 1} 行顶，实际 ${位置1} / 期望 ${(N1 + 1) * g.行高}`,
  );
  await 按空格();
  await pause(120);
  const 位置2 = await 滚动位置();
  assert.ok(
    Math.abs(位置2 - (2 * N1 + 2) * g.行高) < 1,
    `露出90%：第二页应再跳 ${N1 + 1} 行，实际 ${位置2} / 期望 ${(2 * N1 + 2) * g.行高}`,
  );

  // ② 露出 50% → 保持原行为：残行保留为下一页第一行（不多跳）
  g = await 调出视口(0.5);
  await 求值(`document.querySelector('#滚动容器').scrollTop = 0;`);
  await pause(120);
  const N2 = Math.floor(g.视口 / g.行高);
  await 按空格();
  await pause(120);
  const 位置3 = await 滚动位置();
  assert.ok(
    Math.abs(位置3 - N2 * g.行高) < 1,
    `露出50%：应恰好翻 N 行到 ${N2 * g.行高}，实际 ${位置3}`,
  );

  // ③ 露出 0（视口恰为整数行）→ 不触发跳行
  g = await 调出视口(0.02);
  await 求值(`document.querySelector('#滚动容器').scrollTop = 0;`);
  await pause(120);
  const g3 = await 几何();
  const N3 = Math.floor(g3.视口 / g3.行高);
  await 按空格();
  await pause(120);
  const 位置4 = await 滚动位置();
  assert.ok(
    Math.abs(位置4 - N3 * g3.行高) < 1,
    `整数行视口：应恰好翻 N 行，实际 ${位置4} / 期望 ${N3 * g3.行高}`,
  );

  // ④ Shift+Space 向后翻页不受影响：从行对齐位置原样回退 N 行
  const 回退前 = N3 * g3.行高;
  await 按Shift空格();
  await pause(120);
  const 回退后 = await 滚动位置();
  assert.ok(
    Math.abs(回退后) < 1 || Math.abs(回退后 - 0) < 1,
    `向后翻页应回到顶部附近，实际 ${回退后}`,
  );
  assert.ok(回退后 < 回退前, '向后翻页位置应减小');

  // ⑤ 手动滚到非行对齐位置（q=0.2 行高），底部残行只露出 10% → 不得多跳未读的行
  g = await 调出视口(0.9);
  const N5 = Math.floor(g.视口 / g.行高);
  const k5 = 40;
  await 求值(
    `document.querySelector('#滚动容器').scrollTop = ${(k5 + 0.2) * g.行高};`,
  );
  await pause(120);
  await 按空格();
  await pause(120);
  const 位置5 = await 滚动位置();
  assert.ok(
    Math.abs(位置5 - (k5 + N5) * g.行高) < 1,
    `非对齐+残行仅露10%：应翻到 ${((k5 + N5) * g.行高).toFixed(1)}（不误跳），实际 ${位置5}`,
  );

  // ⑥ 手动滚到非行对齐位置（q=0.05），底部残行露出 95% → 应跳过该残行
  await 求值(
    `document.querySelector('#滚动容器').scrollTop = ${(k5 + 0.05) * g.行高};`,
  );
  await pause(120);
  await 按空格();
  await pause(120);
  const 位置6 = await 滚动位置();
  assert.ok(
    Math.abs(位置6 - (k5 + N5 + 1) * g.行高) < 1,
    `非对齐+残行露95%：应跳到 ${((k5 + N5 + 1) * g.行高).toFixed(1)}，实际 ${位置6}`,
  );

  console.log('\nOK：露出>80% 的底部残行翻页时整行跳过；≤80% / 对齐 / 向后翻页行为不变');
  ws.close();
} finally {
  await 收尾();
}
