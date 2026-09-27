// 一次性验证脚本：上下两条白线是「障眼法」浮层（body::before / body::after），
// 不参与正文布局；它们均分掉「视口高 ÷ 行高」的余数，使正文可视高恰好是整数个
// 行高 —— 空格翻页每屏都是整行，首行末行都不会被切成半截（js/白线.js）。
// 断言：
//  ① 容器高恒等于 innerHeight：白线怎么变都不碰布局（浮层相对边框方案的全部意义）
//     —— 收紧到 1px 也只是浮层变矮，布局量（正文层 top、画布高、翻页步长）一律不动
//  ② 任意窗口高 × 任意行距：可视高 % 行高 ≈ 0，两条线相等（整数像素最多差 1px）
//     且各在 [1px, 1+半行高)，顶 + 底 + 可视高 = 容器高
//  ③ 翻页后可视区内没有任何「半行」正文行；滚到量程底时末行贴在可视区底边之上
//  ④ 三下三上回到原点；从非行界位置翻页也收敛回行界
//  ⑤ 左侧白轴整窗高、顶边贴视口顶，白线收放一像素都不挪它；衔接线的画布坐标
//     跟着顶线一起下移
//  ⑥ 自动滚动会话中两条线动画收到 1px（采到中间态 = 确实在过渡），真实鼠标移动停机
//     后**仍然是 1px**（解收紧已从停止路径上摘掉），按空格整屏翻页才回到均分值；
//     整个过程中容器高 / 可视高 / 画布高 / scrollTop / 正文首行位置逐项不变 —— 开关不抖；
//     左侧进度读数的位移在会话中与按空闲量法重算的结果逐字符相同（红箭头不跳）
//  ⑨ 鼠标滚轮滚动（真实 wheel 事件）同样把两条线收到 1px，按空格整屏翻页才滑回均分值，
//     收放全程布局量与正文位置一个都不动；收紧可反复挂卸（轮 → 空格 → 再轮）
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

const chrome已退出 = new Promise((r) => chrome.on('exit', r));
const 服务已退出 = new Promise((r) => 服务.on('exit', r));
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
        const 目标 = 列表.find(
          (t) => t.type === 'page' && t.url.startsWith(地址),
        );
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
  // headless Chrome 默认把 prefers-reduced-motion 报成 reduce，样式在那一档里把白线
  // 过渡缩短到 120ms。本用例量的是默认时长那一档，显式改回「不减弱」。
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

  // 一次量齐：容器/可视高、两条白线实际绘制的高度、轨道几何、可视区内的半行计数
  const 量 = () => 求值(`
    const c = document.querySelector('#滚动容器');
    const 轨 = document.querySelector('#章节轨道');
    const 界 = c.getBoundingClientRect();
    const 行高 = parseFloat(getComputedStyle(document.querySelector('.正文行')).height);
    const { 白线高 } = await import('./js/白线.js');
    const 布 = 白线高(); // 布局量：正文层 top / 画布高 / 翻页步长都按它算
    const 顶 = parseFloat(getComputedStyle(document.body, '::before').height);
    const 底 = parseFloat(getComputedStyle(document.body, '::after').height);
    const 可视顶 = 界.top + 顶, 可视底 = 界.bottom - 底;
    const 半行 = [...document.querySelectorAll('.正文行')].filter((行) => {
      const r = 行.getBoundingClientRect();
      if (r.bottom <= 可视顶 + 0.5 || r.top >= 可视底 - 0.5) return false; // 全在可视区外
      return r.top < 可视顶 - 0.5 || r.bottom > 可视底 + 0.5;
    }).length;
    const 末行 = [...document.querySelectorAll('.正文行')]
      .map((行) => 行.getBoundingClientRect())
      .filter((r) => r.top < 可视底 - 0.5).pop();
    return {
      行高,
      窗口高: window.innerHeight,
      容器高: c.clientHeight,
      可视高: c.clientHeight - 布.顶 - 布.底,
      布局顶: 布.顶, 布局底: 布.底,
      顶, 底, 半行,
      末行底: 末行 ? 末行.bottom : null,
      可视底,
      轨道顶: 轨 ? 轨.getBoundingClientRect().top : null,
      轨道高: 轨 ? 轨.getBoundingClientRect().height : null,
      滚动: c.scrollTop,
      量程: c.scrollHeight - c.clientHeight,
      行数: document.querySelectorAll('.正文行').length,
      首行顶: document.querySelector('.正文行')?.getBoundingClientRect().top ?? null,
      画布高: parseFloat(getComputedStyle(document.querySelector('#虚拟画布')).height),
    };
  `);

  const 偏移 = (值, 行高) => Math.abs(值 - Math.round(值 / 行高) * 行高);

  async function 设视口高度(h) {
    await 发送('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await pause(320); // 尺寸重排防抖 100ms + 渲染
  }

  // 白线带 height 过渡，一次固定 sleep 容易量到中间态：连读两帧，两条线都不再变
  // 且可视高已是整数行时才返回。
  async function 等稳定() {
    let 上 = null;
    for (let i = 0; i < 40; i++) {
      const g = await 量();
      if (
        上 &&
        上.顶 === g.顶 &&
        上.底 === g.底 &&
        上.可视高 === g.可视高 &&
        偏移(g.可视高, g.行高) < 0.6
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

  // 真实滚轮事件：落在正文区中央（避开左缘白轴与右下控件组），
  // 触发 app.js 绑定在滚动容器上的 处理手动滚动
  async function 滚轮(deltaY, x = 640, y = 450) {
    await 发送('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaX: 0,
      deltaY,
      pointerType: 'mouse',
    });
  }

  // 真实鼠标移动：走 CDP Input.dispatchMouseEvent(mouseMoved)，让 window 上的
  // mousemove 监听（app.js → js/自动滚动.js 处理鼠标移动）收到可信事件而停机。
  async function 移动鼠标(x = 640, y = 452) {
    await 发送('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      pointerType: 'mouse',
    });
    await 发送('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: x + 3,
      y: y + 3,
      button: 'none',
      pointerType: 'mouse',
    });
  }

  function 断言整行(g, 说明) {
    assert.ok(g.行高 > 0, `${说明}：行高未读到`);
    assert.ok(
      Math.abs(g.容器高 - g.窗口高) < 1.01,
      `${说明}：白线是浮层，容器高应等于窗口高，实际 ${g.容器高} vs ${g.窗口高}`,
    );
    assert.ok(
      偏移(g.可视高, g.行高) < 0.6,
      `${说明}：正文可视高 ${g.可视高}px 不是行高 ${g.行高}px 的整数倍（偏 ${偏移(g.可视高, g.行高).toFixed(2)}px）`,
    );
    assert.ok(
      g.顶 >= 0.99 && g.顶 < g.行高 / 2 + 1.01,
      `${说明}：顶线 ${g.顶}px 应在 [1, 1+半行高) 内`,
    );
    assert.ok(
      g.底 >= 0.99 && g.底 < g.行高 / 2 + 1.01,
      `${说明}：底线 ${g.底}px 应在 [1, 1+半行高) 内`,
    );
    assert.ok(
      Math.abs(g.顶 - g.底) <= 1.01,
      `${说明}：余数要上下均分（整数像素最多差 1px），实际 ${g.顶} / ${g.底}`,
    );
    assert.ok(
      Math.abs(g.布局顶 + g.布局底 + g.可视高 - g.容器高) < 1.01,
      `${说明}：布局顶 ${g.布局顶} + 布局底 ${g.布局底} + 可视高 ${g.可视高} 应等于容器高 ${g.容器高}`,
    );
    assert.ok(
      Math.abs(g.顶 - g.布局顶) < 1.01 && Math.abs(g.底 - g.布局底) < 1.01,
      `${说明}：静止时浮层绘制高度应落回布局量，实际 ${g.顶}/${g.底} vs ${g.布局顶}/${g.布局底}`,
    );
    if (g.轨道高 != null && g.轨道顶 != null) {
      // 左侧白轴按整窗高定位：白线收放不许挪它一根像素（用户明确要求）
      assert.ok(
        Math.abs(g.轨道高 - g.容器高) < 1.2 && Math.abs(g.轨道顶) < 1.2,
        `${说明}：轨道应整窗高、顶边贴视口顶，实际 ${g.轨道顶}+${g.轨道高} vs 容器 ${g.容器高}`,
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

  // ①② 窗口高扫一遍：容器高不动，可视高恒为整数行
  for (const h of [900, 863, 780, 700, 640, 523, 400, 1080]) {
    await 设视口高度(h);
    const g = await 等稳定();
    assert.ok(g.量程 > 60 * g.行高, `窗口 ${h}：总滚动高度不足`);
    断言整行(g, `窗口高 ${h}`);
    console.log(
      `窗口 ${h}: 容器 ${g.容器高} = 顶 ${g.顶} + 可视 ${g.可视高}(${Math.round(g.可视高 / g.行高)} 行×${g.行高}) + 底 ${g.底}，轨道 ${g.轨道顶}+${g.轨道高}`,
    );
    if (h === 900 || h === 700) {
      await 求值(
        `document.querySelector('#滚动容器').scrollTop = 20 * ${g.行高}; return 1;`,
      );
      await pause(200);
      const 图 = await 发送('Page.captureScreenshot', { format: 'png' });
      writeFileSync(
        join(项目根, 'tmp', `整行视口-窗口${h}-线${g.顶}.png`),
        Buffer.from(图.data, 'base64'),
      );
    }
  }

  // ③ 字号 / 行距扫一遍：走 app 的重排路径，白线要跟着重排
  for (const 字号 of [44, 22, 30]) {
    await 求值(`(await import('./js/字体设置.js')).调整字号(${字号}); return 1;`);
    await pause(420);
    const g = await 等稳定();
    断言整行(g, `字号 ${字号}`);
    console.log(`字号 ${字号}: 行高 ${g.行高} 可视 ${g.可视高} 顶 ${g.顶}/底 ${g.底}`);
  }
  for (const 行距 of [48, 26, 36]) {
    await 求值(`(await import('./js/字体设置.js')).调整行高(${行距}); return 1;`);
    await pause(320);
    const g = await 等稳定();
    断言整行(g, `行距 ${行距}`);
    console.log(`行距 ${行距}: 行高 ${g.行高} 可视 ${g.可视高} 顶 ${g.顶}/底 ${g.底}`);
  }

  // ④ 翻页：每一下之后都贴回行界、可视区内没有半行
  await 设视口高度(760);
  await 等稳定();
  await 求值(`document.querySelector('#滚动容器').scrollTop = 0;`);
  await pause(200);
  const 起始 = await 等稳定();
  断言整行(起始, '翻页前');
  assert.equal(起始.半行, 0, '翻页前可视区内不该有半行');
  let 位置 = 0;
  for (let n = 1; n <= 3; n++) {
    await 按空格();
    await pause(160);
    const g = await 量();
    位置 = g.滚动;
    assert.ok(
      偏移(位置, g.行高) < 0.6,
      `第 ${n} 下：scrollTop ${位置} 应是行高 ${g.行高} 的整数倍`,
    );
    assert.equal(g.半行, 0, `第 ${n} 下：可视区内有 ${g.半行} 个半行`);
    assert.ok(
      位置 > (n - 1) * 起始.可视高 - 1,
      `第 ${n} 下：应至少推进一屏（${位置} vs ${(n - 1) * 起始.可视高}）`,
    );
    console.log(
      `第 ${n} 下: scrollTop ${位置.toFixed(1)} = ${Math.round(位置 / g.行高)} 行，可视 ${Math.round(g.可视高 / g.行高)} 整行`,
    );
  }
  for (let n = 1; n <= 3; n++) {
    await 按Shift空格();
    await pause(160);
    位置 = (await 量()).滚动;
  }
  assert.ok(Math.abs(位置) < 1, `三下三上应回到顶部，实际 ${位置}`);
  console.log(`三下三上回到 ${位置.toFixed(1)}`);

  // ⑤ 滚到量程底：末行不能被白条盖住；再把它放到可视区底边，验证画布多算的
  //    那条底线确实留出了余量（末段顶部所需高度还会再留一段空白，那是给
  //    「最后一段能滚到屏顶」用的，不是遮挡）
  await 求值(
    `const c = document.querySelector('#滚动容器'); c.scrollTop = c.scrollHeight; return 1;`,
  );
  await pause(700);
  const 末屏 = await 量();
  assert.ok(
    末屏.末行底 <= 末屏.可视底 + 0.5,
    `滚到底时末行底边 ${末屏.末行底} 不该越过可视区底边 ${末屏.可视底}（被白条盖住）`,
  );
  assert.equal(末屏.半行, 0, `滚到底时可视区内有 ${末屏.半行} 个半行`);
  console.log(
    `  滚到底: scrollTop ${末屏.滚动}（量程 ${末屏.量程}），末行底 ${末屏.末行底.toFixed(1)} ≤ 可视底 ${末屏.可视底.toFixed(1)}`,
  );
  await 求值(
    `const c = document.querySelector('#滚动容器'); c.scrollTop -= ${Math.round((末屏.可视底 - 末屏.末行底) * 100) / 100}; return 1;`,
  );
  await pause(500);
  const 贴底 = await 量();
  assert.ok(
    Math.abs(贴底.末行底 - 贴底.可视底) < 1.5,
    `末行应能正好贴在可视区底边：${贴底.末行底} vs ${贴底.可视底}（画布少留了底线）`,
  );
  assert.equal(贴底.半行, 0, `末行贴底时可视区内有 ${贴底.半行} 个半行`);
  console.log(
    `  末行贴底: scrollTop ${贴底.滚动}，末行底 ${贴底.末行底.toFixed(1)} = 可视底 ${贴底.可视底.toFixed(1)}`,
  );

  // ⑥ 衔接线的画布坐标要跟着顶线下移（正文层 .可见内容 整体下移了一条顶线高）
  const 衔接线 = await 求值(`
    const c = document.querySelector('#滚动容器');
    c.scrollTop = 0;
    const { 显示衔接线 } = await import('./js/跳转动画.js');
    const { 白线高 } = await import('./js/白线.js');
    const { 状态 } = await import('./js/状态.js');
    显示衔接线(3 * 状态.行高);
    const 线 = document.querySelector('#衔接线');
    const 顶 = 白线高().顶;
    const 实际 = parseFloat(线.style.top);
    线.hidden = true;
    return { 期望: 3 * 状态.行高 + 顶, 实际, 顶, 行高: 状态.行高 };
  `);
  assert.ok(
    Math.abs(衔接线.实际 - 衔接线.期望) < 0.01,
    `衔接线应画在 ${衔接线.期望}px（含顶线 ${衔接线.顶}），实际 ${衔接线.实际}`,
  );
  console.log(
    `衔接线 top ${衔接线.实际} = 3 行(${3 * 衔接线.行高}) + 顶线 ${衔接线.顶}`,
  );

  // ⑦ 从非行界位置翻页：仍收敛回行界
  const g7 = await 等稳定();
  await 求值(
    `document.querySelector('#滚动容器').scrollTop = ${Math.round(20.37 * g7.行高)}; return 1;`,
  );
  await pause(160);
  await 按空格();
  await pause(160);
  const 之后 = await 量();
  assert.ok(
    偏移(之后.滚动, 之后.行高) < 0.6,
    `非行界处翻页后应贴回行界，实际 scrollTop ${之后.滚动}`,
  );
  assert.equal(之后.半行, 0, `兜底翻页后仍有 ${之后.半行} 个半行`);

  // ⑧ 自动滚动会话：白条动画收到 1px，但布局量与正文位置一动不动（开关不抖）。
  //    先直接调 设置白线收紧 逐项比对「一个字都没动」，再采过渡中间态，
  //    最后走真实路径：开始自动滚动 → 鼠标移动停机（线仍 1px）→ 按空格（线回均分值）。
  // 换一档白线较厚的窗口（900 / 行高 30 → 上下各约 15px），收放才有 14px 的位移可看
  await 设视口高度(900);
  await 求值(`document.querySelector('#滚动容器').scrollTop = 0;`);
  const 收紧前 = await 等稳定();
  assert.ok(收紧前.底 >= 6, `这一档白线应当有厚度可看，实际 ${收紧前.顶}/${收紧前.底}`);
  const 过渡 = await 求值(
    `const s = getComputedStyle(document.body, '::before');
     return s.transitionProperty + ' ' + s.transitionDuration + ' ' + s.position;`,
  );
  assert.ok(
    过渡.includes('height') && 过渡.includes('fixed'),
    `白线应是带 height 过渡的固定浮层，实际 ${过渡}`,
  );
  await 求值(`(await import('./js/白线.js')).设置白线收紧(true); return 1;`);
  await pause(460); // 240ms 过渡走完
  const 收紧后 = await 量();
  assert.ok(
    收紧后.顶 <= 1.01 && 收紧后.底 <= 1.01,
    `收紧后两条线应是 1px，实际 ${收紧后.顶} / ${收紧后.底}`,
  );
  assert.ok(
    await 求值(`return document.body.classList.contains('白线收紧');`),
    '收紧应挂上 body.白线收紧 这个纯绘制类',
  );
  for (const 字段 of [
    '容器高',
    '可视高',
    '布局顶',
    '布局底',
    '画布高',
    '滚动',
    '轨道顶',
    '轨道高',
    '首行顶',
  ]) {
    assert.ok(
      Math.abs(收紧后[字段] - 收紧前[字段]) < 0.01,
      `白线收紧不许动 ${字段}（动了就是正文在跳）：${收紧前[字段]} → ${收紧后[字段]}`,
    );
  }
  console.log(
    `收紧: 线 ${收紧前.顶}/${收紧前.底} → ${收紧后.顶}/${收紧后.底}，容器/可视/画布/正文位置逐项不变（${收紧后.容器高}/${收紧后.可视高}/${收紧后.画布高}）`,
  );
  await 求值(`(await import('./js/白线.js')).设置白线收紧(false); return 1;`);
  const 采样 = [];
  for (let i = 0; i < 6; i++) {
    采样.push((await 量()).底);
    await pause(35);
  }
  assert.ok(
    采样.some((值) => 值 > 1.05 && 值 < 收紧前.底 - 0.05),
    `采样里应有介于 1px 与均分值之间的中间态（证明在过渡），实际 ${采样.join(' / ')}（原 ${收紧前.底}）`,
  );
  console.log(`放开: 线 ${采样.map((v) => v.toFixed(1)).join('→')} 回到 ${收紧前.底}`);

  // 把起点挪到轨道中段（≈ 用户截图那枚 13.6%）：书首书尾读数被夹取，
  // 两套量法算出来都是 0，测不出差别
  await 求值(`
    const c = document.querySelector('#滚动容器');
    c.scrollTop = Math.round((c.scrollHeight - c.clientHeight) * 0.136);
    return 1;
  `);
  await pause(300);
  await 求值(`(await import('./js/自动滚动.js')).开始自动滚动(); return 1;`);
  await pause(460);
  // 会话每 50ms 用「视口度量」重排左侧读数；空闲时 更新滚动块() 自己量一次。
  // 两套量法必须一致，否则一进会话红箭头就跳一下（用户报的那个抖动）：
  // 取会话写下的实际位移，再用空闲量法对同一 scrollTop 重算一遍，比对字符串。
  const 读数对照 = await 求值(`
    const c = document.querySelector('#滚动容器');
    const 读数 = document.querySelector('#滚动进度');
    const 读数位移 = () => new DOMMatrix(getComputedStyle(读数).transform).f;
    const 实际 = 读数位移();
    const { 更新滚动块位置 } = await import('./js/滚动条.js');
    更新滚动块位置(null, c.scrollTop);
    return { 实际, 应有: 读数位移(), 滚动: Math.round(c.scrollTop) };
  `);
  assert.ok(
    读数对照.实际 > 0.5,
    `读数还贴在轨道顶端（被夹取），这一档测不出两套量法的差别：${读数对照.实际}`,
  );
  assert.ok(
    Math.abs(读数对照.实际 - 读数对照.应有) < 0.5,
    `会话量法与空闲量法不一致 → 红箭头会跳（scrollTop ${读数对照.滚动}）：会话 ${读数对照.实际.toFixed(2)} vs 空闲 ${读数对照.应有.toFixed(2)}`,
  );
  console.log(
    `会话中读数位移 ${读数对照.实际.toFixed(2)}px 与空闲重算 ${读数对照.应有.toFixed(2)}px 一致（scrollTop ${读数对照.滚动}）`,
  );
  // 反向对照：把「轨道按正文可视高」这套旧量法再算一遍，必须与现量法不同 ——
  // 否则上面那条一致断言就是恒真的，抓不住红箭头跳动这个 bug。
  const 差别 = await 求值(`
    const c = document.querySelector('#滚动容器');
    const 读数 = document.querySelector('#滚动进度');
    const { 更新滚动块位置 } = await import('./js/滚动条.js');
    const { 正文可视高 } = await import('./js/白线.js');
    const 可视 = 正文可视高();
    更新滚动块位置(
      { 轨道高度: 可视, 容器高度: 可视, 滚动高度: c.scrollHeight },
      c.scrollTop,
    );
    const 读数位移 = () =>
      new DOMMatrix(getComputedStyle(读数).transform).f;
    const 旧量法 = 读数位移();
    更新滚动块位置(null, c.scrollTop);
    return { 旧量法, 现量法: 读数位移() };
  `);
  assert.notEqual(
    差别.旧量法.toFixed(2),
    差别.现量法.toFixed(2),
    '轨道按可视高与按整窗高算出的读数位置相同 → 这条回归没有牙，测试位置选得太靠边',
  );
  console.log(
    `反向对照：轨道按可视高会把读数放在 ${差别.旧量法.toFixed(1)}px，按整窗高是 ${差别.现量法.toFixed(1)}px —— 一进会话红箭头就跳 ${Math.abs(差别.旧量法 - 差别.现量法).toFixed(1)}px`,
  );
  const 会话中 = await 量();
  assert.ok(
    会话中.顶 <= 1.01 && 会话中.底 <= 1.01,
    `自动滚动中两条线应收到 1px，实际 ${会话中.顶} / ${会话中.底}`,
  );
  assert.ok(
    Math.abs(会话中.可视高 - 收紧前.可视高) < 0.01 &&
      Math.abs(会话中.容器高 - 收紧前.容器高) < 0.01,
    `自动滚动会话不该改布局量：可视高 ${收紧前.可视高}→${会话中.可视高}，容器 ${收紧前.容器高}→${会话中.容器高}`,
  );
  // 鼠标一动 = 交还控制权 = 自动滚动停止 —— 这一步白线必须**保持** 1px：
  // 停在半行上却把两条厚白边还回去，就是用户报的「滚动过程中鼠标移动，白边又扩展」。
  await 移动鼠标();
  await pause(200);
  assert.equal(
    await 求值(`return document.body.classList.contains('自动滚动中');`),
    false,
    '鼠标移动应已停止自动滚动（这一步没停成功，后面量的就不是停止后的状态）',
  );
  const 停后 = await 量();
  assert.ok(
    停后.顶 <= 1.01 && 停后.底 <= 1.01,
    `鼠标移动停止自动滚动后两条线仍应是 1px，实际 ${停后.顶} / ${停后.底}`,
  );
  assert.ok(
    await 求值(`return document.body.classList.contains('白线收紧');`),
    '停止自动滚动不许解收紧：body.白线收紧 应还在（只有翻页整屏才解）',
  );
  assert.ok(
    Math.abs(停后.可视高 - 会话中.可视高) < 0.01 &&
      Math.abs(停后.容器高 - 会话中.容器高) < 0.01 &&
      Math.abs(停后.画布高 - 会话中.画布高) < 0.01,
    `停止后布局量不该动：可视 ${会话中.可视高}→${停后.可视高}，容器 ${会话中.容器高}→${停后.容器高}，画布 ${会话中.画布高}→${停后.画布高}`,
  );
  console.log(
    `鼠标移动停止: 自动滚动已停，线仍 ${停后.顶}/${停后.底}（解收紧不再挂在停止路径上），可视 ${停后.可视高} = ${Math.round(停后.可视高 / 停后.行高)} 行`,
  );
  // 只有按空格整屏翻页才把均分值还回来，且这一屏落回整行
  await 按空格();
  const 停止后放开采样 = [];
  for (let i = 0; i < 6; i++) {
    停止后放开采样.push((await 量()).底);
    await pause(35);
  }
  assert.ok(
    停止后放开采样.some((值) => 值 > 1.05 && 值 < 收紧前.底 - 0.05),
    `按空格后应有介于 1px 与均分值之间的中间态（证明在过渡），实际 ${停止后放开采样.join(' / ')}（原 ${收紧前.底}）`,
  );
  const 恢复后 = await 等稳定();
  断言整行(恢复后, '停止自动滚动后按空格');
  assert.ok(
    Math.abs(恢复后.底 - 收紧前.底) < 1.01 &&
      Math.abs(恢复后.顶 - 收紧前.顶) < 1.01,
    `按空格应回到均分值 ${收紧前.顶}/${收紧前.底}，实际 ${恢复后.顶}/${恢复后.底}`,
  );
  assert.equal(恢复后.半行, 0, `按空格后可视区内有 ${恢复后.半行} 个半行`);
  console.log(
    `按空格: 线 ${停止后放开采样.map((v) => v.toFixed(1)).join('→')} 回到 ${恢复后.顶}/${恢复后.底}，半行 0`,
  );

  // ⑨ 鼠标滚轮滚动：上下白边同样收到 1px，按空格整屏翻页才滑回自适应均分值。
  //    走真实 wheel 事件（app.js 处理手动滚动 → js/白线.js 设置白线收紧），
  //    先确认收线过程在过渡、再确认布局量一个都没动（收线不许让正文跳）。
  await 求值(`document.querySelector('#滚动容器').scrollTop = 0;`);
  const 滚前 = await 等稳定();
  assert.ok(滚前.底 >= 6, `这一档白线应当有厚度可看，实际 ${滚前.顶}/${滚前.底}`);
  await 滚轮(240);
  const 收线采样 = [];
  for (let i = 0; i < 6; i++) {
    收线采样.push((await 量()).底);
    await pause(35);
  }
  const 滚后 = await 等稳定();
  assert.ok(
    滚后.顶 <= 1.01 && 滚后.底 <= 1.01,
    `滚轮滚动后上下白边应收到 1px，实际 ${滚后.顶} / ${滚后.底}`,
  );
  assert.ok(
    收线采样.some((值) => 值 > 1.05 && 值 < 滚前.底 - 0.05),
    `采样里应有介于 1px 与均分值之间的中间态（证明在过渡），实际 ${收线采样.join(' / ')}（原 ${滚前.底}）`,
  );
  assert.ok(
    await 求值(`return document.body.classList.contains('白线收紧');`),
    '滚轮滚动应挂上 body.白线收紧 这个纯绘制类',
  );
  assert.ok(滚后.滚动 > 100, `滚轮应真的滚动了页面，实际 scrollTop ${滚后.滚动}`);
  for (const 字段 of [
    '容器高',
    '可视高',
    '布局顶',
    '布局底',
    '画布高',
    '量程',
    '轨道顶',
    '轨道高',
  ]) {
    assert.ok(
      Math.abs(滚后[字段] - 滚前[字段]) < 0.01,
      `滚轮收白线不许动 ${字段}（动了就是正文在跳）：${滚前[字段]} → ${滚后[字段]}`,
    );
  }
  // 正文只应随 scrollTop 平移：首行顶 + scrollTop 是布局量，滚前滚后必须相等
  assert.ok(
    Math.abs(滚后.首行顶 + 滚后.滚动 - (滚前.首行顶 + 滚前.滚动)) < 0.6,
    `滚轮滚动后正文应只随 scrollTop 平移：首行顶 ${滚前.首行顶}→${滚后.首行顶}，scrollTop ${滚前.滚动}→${滚后.滚动}`,
  );
  console.log(
    `滚轮 ${滚前.顶}/${滚前.底} → ${滚后.顶}/${滚后.底}（过渡 ${收线采样.map((v) => v.toFixed(1)).join('→')}），scrollTop ${滚前.滚动}→${滚后.滚动}，布局量与正文位置逐项不变`,
  );
  const 滚轮截图 = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(
    join(项目根, 'tmp', '整行视口-滚轮收线.png'),
    Buffer.from(滚轮截图.data, 'base64'),
  );

  // 按空格：白边滑回均分值（采中间态），且这一屏仍落在行界上
  await 按空格();
  const 放开采样 = [];
  for (let i = 0; i < 6; i++) {
    放开采样.push((await 量()).底);
    await pause(35);
  }
  assert.ok(
    放开采样.some(
      (值) => 值 > 1.05 && 值 < 滚前.底 - 0.05,
    ),
    `按空格后应有介于 1px 与均分值之间的中间态（证明在过渡），实际 ${放开采样.join(' / ')}（原 ${滚前.底}）`,
  );
  const 空格后 = await 等稳定();
  断言整行(空格后, '滚轮滚动后按空格');
  assert.ok(
    Math.abs(空格后.底 - 滚前.底) < 1.01 &&
      Math.abs(空格后.顶 - 滚前.顶) < 1.01,
    `按空格后白边应回到均分值 ${滚前.顶}/${滚前.底}，实际 ${空格后.顶}/${空格后.底}`,
  );
  assert.ok(
    偏移(空格后.滚动, 空格后.行高) < 0.6,
    `按空格后 scrollTop ${空格后.滚动} 应贴回行高 ${空格后.行高} 的整数倍`,
  );
  assert.equal(空格后.半行, 0, `按空格后可视区内有 ${空格后.半行} 个半行`);
  console.log(
    `按空格: 线 ${放开采样.map((v) => v.toFixed(1)).join('→')} 回到 ${空格后.顶}/${空格后.底}，scrollTop ${空格后.滚动.toFixed(1)} = ${Math.round(空格后.滚动 / 空格后.行高)} 行，半行 0`,
  );

  // 轮 → 空格 → 再轮：收紧可反复挂卸（不是一次性的）
  await 滚轮(-180);
  await pause(420);
  const 再滚 = await 量();
  assert.ok(
    再滚.顶 <= 1.01 && 再滚.底 <= 1.01,
    `再次滚轮滚动应重新收到 1px，实际 ${再滚.顶} / ${再滚.底}`,
  );
  await 按Shift空格();
  const 回退后 = await 等稳定();
  断言整行(回退后, '再次滚轮后按 Shift + 空格');
  console.log(
    `再滚 ${再滚.顶}/${再滚.底} → Shift+空格 回到 ${回退后.顶}/${回退后.底}，scrollTop ${回退后.滚动.toFixed(1)}`,
  );

  // ⑩ 收敛：白线值不再变化
  const 序列 = [];
  for (let i = 0; i < 3; i++) {
    const g = await 量();
    序列.push(`${g.顶}/${g.底}`);
    await pause(250);
  }
  assert.equal(new Set(序列).size, 1, `白线应收敛为定值，实际 ${序列.join(' / ')}`);

  await 发送('Emulation.clearDeviceMetricsOverride');
  await pause(400);
  const 最后 = await 等稳定();
  断言整行(最后, '清掉视口覆盖后');
  const 截图 = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(
    join(项目根, 'tmp', '整行视口-浮层.png'),
    Buffer.from(截图.data, 'base64'),
  );
  console.log(
    '\nOK：白线是浮层（容器高恒定），可视高恒为整数行，翻页无半行，滚到底末行不被盖，收放有过渡；滚轮滚动与自动滚动收到 1px，鼠标移动停机不放线、按空格才回到均分值',
  );
  console.log(
    '页面日志尾部:\n' +
      页面日志.filter((l) => l.includes('白线')).slice(-3).join('\n'),
  );
  ws.close();
} finally {
  await 收尾();
}
