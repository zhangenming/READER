// 一次性验证脚本：上下两条白线均分「视口高 ÷ 行高」的余数 → 正文视口高恰好是
// 整数个行高。于是空格翻页每屏都是整行，首行与末行都不会被边线切成半截，
// 且上下对称（js/排版引擎.js 应用整行视口 / styles.css --顶部白线高 --底部白线高）。
// 断言五件事：
//  ① 任意窗口高度 × 任意字号/行距下：视口高 % 行高 ≈ 0，两条线相等且各在 [1px, 1+半行高)
//  ② 左缘白轴（.章节轨道）与正文容器同顶同底 —— 刻度 canvas 按 clientHeight 换算，
//     轨道仍钉在视口满高就会被拉高几像素，越靠下偏得越多；右下角那组白字读数
//     也要贴着正文底边，否则厚白线会把白字吃掉（同色）
//  ③ 连续翻页后视口内没有任何「半行」正文行（上下两条边线都不切字）
//  ④ 三下三上回到原点，且白线值稳定不抖（收敛，不来回改）
//  ⑤ 自动滚动会话中两条线动画收到 1px（连续滚动本就有半行，让出整行给正文），
//     停止后又动画回到均分值
// 自启 server.mjs + headless Chrome（CDP），用 Emulation.setDeviceMetricsOverride
// 换视口高度。按 AGENTS.md 规范：reader-* 一次性 profile 在 try/finally 中停进程后删除。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
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

// 上次运行被 SIGKILL/崩溃留下的 reader-* profile：先清掉确认无进程占用的
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
const profile = mkdtempSync(join(tmpdir(), 'reader-whole-line-viewport-'));
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
        [
          消息.params.type,
          ...消息.params.args.map((a) => a.value ?? a.description ?? ''),
        ].join(' '),
      );
    } else if (消息.method === 'Runtime.exceptionThrown') {
      页面日志.push(
        'EXCEPTION: ' +
          (消息.params.exceptionDetails.exception?.description ||
            消息.params.exceptionDetails.text),
      );
    }
  });
  function 发送(方法, 参数 = {}, 超时 = 20_000) {
    return new Promise((resolve, reject) => {
      const 下标 = ++序号;
      const 计时器 = setTimeout(() => {
        待回复.delete(下标);
        reject(new Error(`CDP 超时: ${方法}`));
      }, 超时);
      待回复.set(下标, {
        resolve: (v) => (clearTimeout(计时器), resolve(v)),
        reject: (e) => (clearTimeout(计时器), reject(e)),
      });
      ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
    });
  }
  await 发送('Runtime.enable');
  // headless Chrome 默认把 prefers-reduced-motion 报成 reduce，而样式在该模式下
  // 会关掉白线过渡（尊重系统设置）。本用例要量的就是这条过渡，显式改回不减弱。
  await 发送('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });

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

  // 一次量齐：行高、正文视口高、两条白线、左缘轨道几何、半行计数
  const 量 = () => 求值(`
    const c = document.querySelector('#滚动容器');
    const 轨 = document.querySelector('#章节轨道');
    const 行高 = parseFloat(getComputedStyle(document.querySelector('.正文行')).height);
    const 界 = c.getBoundingClientRect();
    const 半行 = [...document.querySelectorAll('.正文行')].filter((行) => {
      const r = 行.getBoundingClientRect();
      if (r.bottom <= 界.top + 0.5 || r.top >= 界.bottom - 0.5) return false; // 完全在视口外
      return r.top < 界.top - 0.5 || r.bottom > 界.bottom + 0.5;
    }).length;
    return {
      行高,
      窗口高: window.innerHeight,
      视口: c.clientHeight,
      容器顶: 界.top,
      顶线: parseFloat(getComputedStyle(document.body).borderTopWidth),
      底线: parseFloat(getComputedStyle(document.body).borderBottomWidth),
      轨道顶: 轨 ? 轨.getBoundingClientRect().top : null,
      轨道高: 轨 ? 轨.getBoundingClientRect().height : null,
      读数底: document.querySelector('.时间信息')?.getBoundingClientRect().bottom ?? null,
      按钮底: document.querySelector('.右下按钮组')?.getBoundingClientRect().bottom ?? null,
      容器底: 界.bottom,
      半行,
      滚动: c.scrollTop,
      总滚动: c.scrollHeight - c.clientHeight,
    };
  `);

  async function 设视口高度(h) {
    await 发送('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await pause(320); // 尺寸重排防抖 100ms + 白线二次收敛 + 渲染
  }

  // 白线带 220ms 过渡，且要等尺寸重排防抖（100ms）之后才开始写：
  // 一次固定 sleep 很容易量到过渡中的中间态。连读两帧，视口高与两条线都不再变
  // 且已是整数行时才返回；等不到就把最后一帧交回断言去报失败。
  async function 等整行稳定() {
    let 上 = null;
    for (let i = 0; i < 40; i++) {
      const g = await 量();
      if (
        上 &&
        上.视口 === g.视口 &&
        上.顶线 === g.顶线 &&
        上.底线 === g.底线 &&
        偏移(g.视口, g.行高) < 0.6
      ) {
        return g;
      }
      上 = g;
      await pause(120);
    }
    return 上;
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

  // 距最近行界的偏移（上下两条边线各自量一次）
  const 偏移 = (值, 行高) => {
    const r = 值 - Math.round(值 / 行高) * 行高;
    return Math.abs(r);
  };

  function 断言整行(g, 说明) {
    assert.ok(g.行高 > 0, `${说明}：行高未读到`);
    assert.ok(
      偏移(g.视口, g.行高) < 0.6,
      `${说明}：正文视口高 ${g.视口}px 不是行高 ${g.行高}px 的整数倍（偏 ${偏移(g.视口, g.行高).toFixed(2)}px）`,
    );
    assert.ok(
      g.顶线 >= 0.99 && g.顶线 < g.行高 / 2 + 1.01,
      `${说明}：顶部白线 ${g.顶线}px 应在 [1, 1+半行高) 内`,
    );
    assert.ok(
      g.底线 >= 0.99 && g.底线 < g.行高 / 2 + 1.01,
      `${说明}：底部白线 ${g.底线}px 应在 [1, 1+半行高) 内`,
    );
    assert.ok(
      Math.abs(g.顶线 - g.底线) <= 1.01,
      `${说明}：余数要上下均分（整数像素，最多差 1px），实际顶 ${g.顶线} / 底 ${g.底线}`,
    );
    // 三条边加起来必须正好是窗口高，否则说明有像素被浏览器吞了（残行的来源）
    assert.ok(
      Math.abs(g.顶线 + g.底线 + g.视口 - g.窗口高) < 1.01,
      `${说明}：顶 ${g.顶线} + 底 ${g.底线} + 正文 ${g.视口} 应等于窗口高 ${g.窗口高}`,
    );
    if (g.轨道高 != null && g.轨道顶 != null) {
      assert.ok(
        Math.abs(g.轨道高 - g.视口) < 1.2 && Math.abs(g.轨道顶 - g.容器顶) < 1.2,
        `${说明}：左缘轨道 ${g.轨道顶}+${g.轨道高} 与正文 ${g.容器顶}+${g.视口} 不同顶同底`,
      );
    }
    // 右下角读数是白字，必须留在纸面上：底边贴正文底边，不能压进同色的白线里
    if (g.读数底 != null) {
      assert.ok(
        Math.abs(g.读数底 - g.容器底) < 1.2,
        `${说明}：时间读数底边 ${g.读数底} 应贴着正文底边 ${g.容器底}`,
      );
    }
    if (g.按钮底 != null) {
      assert.ok(
        g.按钮底 <= g.容器底 + 1.2 && g.按钮底 >= g.容器底 - 42,
        `${说明}：按钮组底边 ${g.按钮底} 应贴着正文底边 ${g.容器底}`,
      );
    }
  }

  for (let i = 0; i < 200; i++) {
    const 行数 = await 求值(`return document.querySelectorAll('.正文行').length;`);
    if (行数 > 20) break;
    await pause(200);
  }
  assert.ok(
    (await 求值(`return document.querySelectorAll('.正文行').length;`)) > 20,
    '正文应已载入（虚拟渲染视口行）',
  );

  // ① 窗口高度扫一遍：每种高度都要把底线收成整行
  for (const h of [900, 863, 780, 700, 640, 523, 400, 1080]) {
    await 设视口高度(h);
    const g = await 等整行稳定();
    assert.ok(g.总滚动 > 60 * g.行高, `窗口 ${h}：总滚动高度不足`);
    断言整行(g, `窗口高 ${h}（视口 ${g.视口} / 行高 ${g.行高} / 底线 ${g.底线}）`);
    console.log(
      `窗口 ${h}: 视口 ${g.视口} = ${Math.round(g.视口 / g.行高)} 行 × ${g.行高}，底线 ${g.底线}px，轨道 ${g.轨道顶}+${g.轨道高}`,
    );
    // 留两张不同余数的底边截图：一张底线最厚（900）、一张最薄（700）
    if (h === 900 || h === 700) {
      await 求值(
        `document.querySelector('#滚动容器').scrollTop = 20 * ${g.行高}; return 1;`,
      );
      await pause(200);
      const 图 = await 发送('Page.captureScreenshot', { format: 'png' });
      writeFileSync(
        join(项目根, 'tmp', `整行视口-窗口${h}-底线${Math.round(g.底线)}.png`),
        Buffer.from(图.data, 'base64'),
      );
    }
  }

  // ② 字号扫一遍：走 app 的调字号路径（重建行索引 → 刷新画布尺寸 → 收整行视口）
  for (const 字号 of [30, 44, 22, 17, 36]) {
    await 求值(
      `(await import('./js/字体设置.js')).调整字号(${字号}); return 1;`,
    );
    await pause(420);
    const g = await 等整行稳定();
    断言整行(g, `字号 ${字号}`);
    console.log(
      `字号 ${字号}: 行高 ${g.行高}，视口 ${g.视口} = ${Math.round(g.视口 / g.行高)} 行，底线 ${g.底线}px`,
    );
  }

  // ③ 行距扫一遍：走 调整行高（不重建行索引，只改行高 → 也要重收整行视口）
  for (const 行距 of [48, 26, 40]) {
    await 求值(
      `(await import('./js/字体设置.js')).调整行高(${行距}); return 1;`,
    );
    await pause(320);
    const g = await 等整行稳定();
    断言整行(g, `行距 ${行距}`);
    console.log(`行距 ${行距}: 行高 ${g.行高}，视口 ${g.视口}，底线 ${g.底线}px`);
  }
  await 求值(`(await import('./js/字体设置.js')).调整字号(30); return 1;`);
  await pause(420);
  await 求值(
    `(await import('./js/字体设置.js')).调整行高(30); return 1;`,
  );
  await pause(320);

  // ④ 翻页：连续三下，每一下之后上下边线都不切字
  await 设视口高度(760);
  await 求值(`document.querySelector('#滚动容器').scrollTop = 0;`);
  await pause(200);
  const 起始 = await 等整行稳定();
  断言整行(起始, '翻页前');
  assert.equal(起始.半行, 0, '翻页前视口内不该有半行');
  let 位置 = 0;
  for (let n = 1; n <= 3; n++) {
    await 按空格();
    await pause(160);
    const g = await 量();
    位置 = g.滚动;
    assert.ok(
      偏移(位置, g.行高) < 0.6 && 偏移(位置 + g.视口, g.行高) < 0.6,
      `第 ${n} 下：顶边 ${位置} 底边 ${位置 + g.视口} 应都贴齐行界（行高 ${g.行高}）`,
    );
    assert.equal(g.半行, 0, `第 ${n} 下：视口内有 ${g.半行} 个半行`);
    assert.ok(
      位置 > (n - 1) * 起始.视口 - 1,
      `第 ${n} 下：应至少推进一屏（${位置} vs ${(n - 1) * 起始.视口}）`,
    );
    console.log(
      `第 ${n} 下: scrollTop ${位置.toFixed(1)} = ${Math.round(位置 / g.行高)} 行，视口内 ${Math.round(g.视口 / g.行高)} 整行`,
    );
  }

  // ⑤ 原路返回：三上回到 0
  for (let n = 1; n <= 3; n++) {
    await 按Shift空格();
    await pause(160);
    位置 = (await 量()).滚动;
  }
  assert.ok(Math.abs(位置) < 1, `三下三上应回到顶部，实际 ${位置}`);
  console.log(`三下三上回到 ${位置.toFixed(1)}`);

  // ⑥ 手动滚到半行位置 + 空格：底边贴齐行界后不再产生半行
  const g6 = await 量();
  await 求值(
    `document.querySelector('#滚动容器').scrollTop = ${Math.round(20.37 * g6.行高)}; return 1;`,
  );
  await pause(160);
  await 按空格();
  await pause(160);
  const 之后 = await 量();
  assert.ok(
    偏移(之后.滚动 + 之后.视口, 之后.行高) < 0.6,
    '从半行位置翻页后底边应贴齐行界',
  );
  assert.ok(偏移(之后.滚动, 之后.行高) < 0.6, '整行视口下顶边也应贴齐行界');
  assert.equal(之后.半行, 0, `兜底翻页后仍有 ${之后.半行} 个半行`);

  // ⑦ 收敛：白线值不再变化（不来回抖动）
  const 底线序列 = [];
  for (let i = 0; i < 3; i++) {
    底线序列.push((await 量()).底线);
    await pause(250);
  }
  assert.equal(
    new Set(底线序列).size,
    1,
    `底部白线应收敛为定值，实际 ${底线序列.join(' / ')}`,
  );

  // ⑧ 自动滚动会话：两条白线收到 1px 让给正文，且是过渡动画不是跳变；停止后回到均分
  const 收紧前 = await 等整行稳定();
  const 过渡属性 = await 求值(
    `return getComputedStyle(document.body).transitionProperty;`,
  );
  assert.ok(
    过渡属性.includes('border-top-width') &&
      过渡属性.includes('border-bottom-width'),
    `白线收放要有过渡动画，实际 transition-property: ${过渡属性}`,
  );
  await 求值(
    `(await import('./js/自动滚动.js')).开始自动滚动(); return 1;`,
  );
  const 收紧采样 = [];
  for (let i = 0; i < 6; i++) {
    收紧采样.push((await 量()).底线);
    await pause(35);
  }
  const 收紧时 = await 量();
  assert.ok(
    收紧时.顶线 <= 1.01 && 收紧时.底线 <= 1.01,
    `自动滚动中两条白线应收到 1px，实际 ${收紧时.顶线} / ${收紧时.底线}`,
  );
  assert.ok(
    new Set(收紧采样.map((值) => 值.toFixed(2))).size >= 2,
    `白线应逐帧收拢（过渡），采样 ${收紧采样.join(' / ')}`,
  );
  assert.ok(
    收紧采样.some((值) => 值 > 1.05 && 值 < 收紧前.底线 - 0.05),
    `采样里应有介于 1px 与原均分值之间的中间态，实际 ${收紧采样.join(' / ')}（原 ${收紧前.底线}）`,
  );
  if (收紧前.底线 > 1.5) {
    assert.ok(
      收紧时.视口 >= 收紧前.视口 + 1,
      `收紧后正文应多出一截，实际 ${收紧前.视口} → ${收紧时.视口}`,
    );
  }
  console.log(
    `自动滚动中: 白线 ${收紧前.底线} → ${收紧采样.map((v) => v.toFixed(1)).join('→')}，正文 ${收紧前.视口} → ${收紧时.视口}`,
  );
  await 求值(
    `(await import('./js/自动滚动.js')).停止自动滚动('整行视口验证'); return 1;`,
  );
  await pause(600); // 过渡 220ms + 尺寸重排防抖 100ms
  const 恢复后 = await 等整行稳定();
  断言整行(恢复后, '停止自动滚动后');
  assert.ok(
    Math.abs(恢复后.底线 - 收紧前.底线) < 0.51,
    `停止后应回到均分值 ${收紧前.底线}，实际 ${恢复后.底线}`,
  );
  console.log(
    `停止自动滚动: 白线回到 ${恢复后.顶线}/${恢复后.底线}，正文 ${恢复后.视口} = ${Math.round(恢复后.视口 / 恢复后.行高)} 行`,
  );

  await 发送('Emulation.clearDeviceMetricsOverride');
  await pause(400);
  const 最后 = await 等整行稳定();
  断言整行(最后, '清掉视口覆盖后');
  const 截图 = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(
    join(项目根, 'tmp', '整行视口-底边.png'),
    Buffer.from(截图.data, 'base64'),
  );
  console.log(
    '\nOK：余数上下均分，翻页无半行，轨道同顶同底，自动滚动中白线动画收到 1px、停止后复原',
  );
  console.log(
    '页面日志尾部:\n' + 页面日志.filter((l) => l.includes('白线')).slice(-4).join('\n'),
  );
  ws.close();
} finally {
  await 收尾();
}
