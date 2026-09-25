// 一次性验证脚本：整屏翻页改为「底对齐」——视口底边贴齐行界，最后一行完整，
// 第一行可残缺。同时验证跳行规则：视口残留 R + 底边行已露出 o ≥ 比例×行高
// （照搬将重复超过该比例的一行）时多跳一行；向上翻页同一步长可原路返回。
// 自启 server.mjs + headless Chrome（CDP），用 Emulation.setDeviceMetricsOverride
// 调出不同视口高度分别断言。按 AGENTS.md 规范清理 reader-* 一次性 profile。
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
      页面日志.push(
        'EXCEPTION: ' +
          (消息.params.exceptionDetails.exception?.description ||
            消息.params.exceptionDetails.text),
      );
    }
  });
  await 发送连接后('Runtime.enable');
  function 发送连接后(方法, 参数 = {}) {
    return new Promise((resolve, reject) => {
      const 下标 = ++序号;
      待回复.set(下标, { resolve, reject });
      ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
    });
  }
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
    首次几何.总滚动 > 60 * 首次几何.行高,
    `总滚动高度应足够翻几页：${首次几何.总滚动}px`,
  );
  // 阈值从页面同源的 常量.js 源码读取，用户在 常量.js 里调整后脚本无需改动
  const 常量源码 = await 求值(`return (await fetch('./js/常量.js')).text();`);
  const 跳行比例 = parseFloat(
    常量源码.match(/整屏翻页跳行比例\s*=\s*([\d.]+)/)[1],
  );
  console.log('跳行比例:', 跳行比例);

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
      if (Math.abs(实际比例 - 余数比例) < 0.03) return g;
      h += Math.round((余数比例 - 实际比例) * g.行高);
    }
    throw new Error(`调不出余数比例 ${余数比例}`);
  };

  // 与实现同构的期望值计算（钳制到 [0, 总滚动]）
  const 期望目标 = (g, 起点, 向上) => {
    const 整行数 = Math.floor(g.视口 / g.行高);
    const 残留 = g.视口 - 整行数 * g.行高;
    const 底边 = 起点 + g.视口;
    const 底边行 = Math.floor(底边 / g.行高 + 1e-6);
    const 露出 = 底边 - 底边行 * g.行高;
    const 步长 =
      整行数 + (露出 + 残留 >= g.行高 * 跳行比例 ? 1 : 0);
    const 目标 = (底边行 + (向上 ? -步长 : 步长)) * g.行高 - g.视口;
    return Math.min(g.总滚动, Math.max(0, 目标));
  };
  // 底对齐断言：底边贴齐行界，或已被钳制到顶/底
  const 断言底对齐 = async (g, 位置, 说明) => {
    const 底边 = 位置 + g.视口;
    const 余数 = 底边 - Math.round(底边 / g.行高) * g.行高;
    const 已钳制 =
      Math.abs(位置) < 0.5 || Math.abs(位置 - g.总滚动) < 0.5;
    assert.ok(
      Math.abs(余数) < 0.5 || 已钳制,
      `${说明}：底边应贴齐行界（余数 ${余数.toFixed(1)}px）或已到顶/底`,
    );
  };
  const 断言翻页 = async (g, 起点, 向上, 说明) => {
    if (向上) await 按Shift空格();
    else await 按空格();
    await pause(120);
    const 期望 = 期望目标(g, 起点, 向上);
    const 实际 = await 滚动位置();
    assert.ok(
      Math.abs(实际 - 期望) < 1,
      `${说明}：应在 ${期望.toFixed(1)}，实际 ${实际.toFixed(1)}\n页面日志:\n${页面日志.slice(-6).join('\n')}`,
    );
    await 断言底对齐(g, 实际, 说明);
    return 实际;
  };

  // ① 露出 90%：首次翻页底边行已大半读过 → 跳行；此后每页都因残留 ≥ 比例继续跳行
  let g = await 调出视口(0.9);
  await 求值(`document.querySelector('#滚动容器').scrollTop = 0;`);
  await pause(120);
  let 位置 = await 断言翻页(g, 0, false, '①-1 露出90% 首翻');
  位置 = await 断言翻页(g, 位置, false, '①-2 连翻');
  位置 = await 断言翻页(g, 位置, false, '①-3 连翻');
  // 原路返回：向上翻页同一步长
  位置 = await 断言翻页(g, 位置, true, '①-4 向上返回');
  位置 = await 断言翻页(g, 位置, true, '①-5 向上返回');
  位置 = await 断言翻页(g, 位置, true, '①-6 向上返回');
  assert.ok(Math.abs(位置) < 1, `①-7 三上三下应回到顶部，实际 ${位置}`);

  // ② 露出 50%：首翻因 o+R 达标跳行（恰好衔接未读部分），稳态残留 < 比例不再跳
  g = await 调出视口(0.5);
  await 求值(`document.querySelector('#滚动容器').scrollTop = 0;`);
  await pause(120);
  位置 = await 断言翻页(g, 0, false, '②-1 露出50% 首翻');
  位置 = await 断言翻页(g, 位置, false, '②-2 稳态不跳行');
  位置 = await 断言翻页(g, 位置, false, '②-3 稳态不跳行');

  // ③ 残留≈0（视口接近整数行）：不触发跳行，等价于整行推进
  g = await 调出视口(0.02);
  await 求值(`document.querySelector('#滚动容器').scrollTop = 0;`);
  await pause(120);
  位置 = await 断言翻页(g, 0, false, '③-1 整数行视口');
  // ④ 顶部再向上翻：钳制回 0
  await 按Shift空格();
  await pause(120);
  const 回退位置 = await 滚动位置();
  assert.ok(Math.abs(回退位置) < 1, `④ 顶部向上翻应停在 0，实际 ${回退位置}`);

  // ⑤ 手动滚到非行对齐位置（q=0.2 行高）：底边行已露 10%，残留 90% → 跳行
  g = await 调出视口(0.9);
  const k = 40;
  await 求值(
    `document.querySelector('#滚动容器').scrollTop = ${(k + 0.2) * g.行高};`,
  );
  await pause(120);
  await 断言翻页(g, (k + 0.2) * g.行高, false, '⑤ 非对齐 q=0.2');

  // ⑥ 手动滚到非行对齐位置（q=0.05）：底边行已露 95% → 跳行，不整行重复
  await 求值(
    `document.querySelector('#滚动容器').scrollTop = ${(k + 0.05) * g.行高};`,
  );
  await pause(120);
  await 断言翻页(g, (k + 0.05) * g.行高, false, '⑥ 非对齐 q=0.05');

  // ⑦ 底对齐的直接验证：翻页后视口底边所在行应完整可见（底边=行界），
  //    且渲染的最后一行文本行底部不被裁切
  const 末行完整 = await 求值(`const c = document.querySelector('#滚动容器');
    const 底边 = c.scrollTop + c.clientHeight;
    const 行高 = parseFloat(getComputedStyle(document.querySelector('.正文行')).height);
    return Math.abs(底边 - Math.round(底边 / 行高) * 行高) < 0.5;`);
  assert.ok(末行完整, '⑦ 底边应贴齐行界（最后一行完整）');

  console.log('\nOK：翻页底对齐（最后一行完整、第一行可残缺），重复超比例时跳行，可原路返回');
  ws.close();
} finally {
  await 收尾();
}
