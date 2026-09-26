// 一次性验证脚本：上下两条白线是「障眼法」浮层（body::before / body::after），
// 不参与正文布局；它们均分掉「视口高 ÷ 行高」的余数，使正文可视高恰好是整数个
// 行高 —— 空格翻页每屏都是整行，首行末行都不会被切成半截（js/白线.js）。
// 断言：
//  ① 容器高恒等于 innerHeight：白线怎么变都不碰布局（浮层相对边框方案的全部意义）
//  ② 任意窗口高 × 任意行距：可视高 % 行高 ≈ 0，两条线相等（整数像素最多差 1px）
//     且各在 [1px, 1+半行高)，顶 + 底 + 可视高 = 容器高
//  ③ 翻页后可视区内没有任何「半行」正文行；滚到量程底时末行贴在可视区底边之上
//  ④ 三下三上回到原点；从非行界位置翻页也收敛回行界
//  ⑤ 左缘轨道与可视区同顶同底；衔接线的画布坐标跟着顶线一起下移
//  ⑥ 自动滚动会话中两条线动画收到 1px（采到中间态 = 确实在过渡），停止后动画回到
//     均分值；整个过程中容器高一次都没变过
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
      可视高: c.clientHeight - 顶 - 底,
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
      Math.abs(g.顶 + g.底 + g.可视高 - g.容器高) < 1.01,
      `${说明}：顶 ${g.顶} + 底 ${g.底} + 可视高 ${g.可视高} 应等于容器高 ${g.容器高}`,
    );
    if (g.轨道高 != null && g.轨道顶 != null) {
      assert.ok(
        Math.abs(g.轨道高 - g.可视高) < 1.2 && Math.abs(g.轨道顶 - g.顶) < 1.2,
        `${说明}：轨道 ${g.轨道顶}+${g.轨道高} 应与可视区 ${g.顶}+${g.可视高} 同顶同底`,
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

  // ⑧ 自动滚动：两条线动画收到 1px，容器高一次都不变；停止后动画回到均分
  await 求值(`document.querySelector('#滚动容器').scrollTop = 0;`);
  const 收紧前 = await 等稳定();
  const 过渡 = await 求值(
    `const s = getComputedStyle(document.body, '::before');
     return s.transitionProperty + ' ' + s.transitionDuration + ' ' + s.position;`,
  );
  assert.ok(
    过渡.includes('height') && 过渡.includes('fixed'),
    `白线应是带 height 过渡的固定浮层，实际 ${过渡}`,
  );
  await 求值(`(await import('./js/自动滚动.js')).开始自动滚动(); return 1;`);
  const 采样 = [];
  const 容器高序列 = [];
  for (let i = 0; i < 6; i++) {
    const g = await 量();
    采样.push(g.底);
    容器高序列.push(g.容器高);
    await pause(35);
  }
  const 收紧时 = await 量();
  assert.ok(
    收紧时.顶 <= 1.01 && 收紧时.底 <= 1.01,
    `自动滚动中两条线应收到 1px，实际 ${收紧时.顶} / ${收紧时.底}`,
  );
  assert.ok(
    采样.some((值) => 值 > 1.05 && 值 < 收紧前.底 - 0.05),
    `采样里应有介于 1px 与均分值之间的中间态（证明在过渡），实际 ${采样.join(' / ')}（原 ${收紧前.底}）`,
  );
  assert.equal(
    new Set(容器高序列).size,
    1,
    `白线收放不该动正文布局，容器高却变了：${容器高序列.join(' / ')}`,
  );
  assert.ok(
    收紧时.可视高 >= 收紧前.可视高 + 1,
    `收紧后可视区应多出一截，实际 ${收紧前.可视高} → ${收紧时.可视高}`,
  );
  console.log(
    `自动滚动中: 线 ${收紧前.顶}/${收紧前.底} → ${采样.map((v) => v.toFixed(1)).join('→')}，可视 ${收紧前.可视高} → ${收紧时.可视高}，容器高恒为 ${容器高序列[0]}`,
  );
  await 求值(
    `(await import('./js/自动滚动.js')).停止自动滚动('整行视口验证'); return 1;`,
  );
  const 恢复后 = await 等稳定();
  断言整行(恢复后, '停止自动滚动后');
  assert.ok(
    Math.abs(恢复后.底 - 收紧前.底) < 1.01 &&
      Math.abs(恢复后.顶 - 收紧前.顶) < 1.01,
    `停止后应回到均分值 ${收紧前.顶}/${收紧前.底}，实际 ${恢复后.顶}/${恢复后.底}`,
  );
  assert.ok(
    恢复后.容器高 === 收紧前.容器高,
    `整段会话容器高都不该变，实际 ${收紧前.容器高} → ${恢复后.容器高}`,
  );
  console.log(
    `停止自动滚动: 线回到 ${恢复后.顶}/${恢复后.底}，可视 ${恢复后.可视高} = ${Math.round(恢复后.可视高 / 恢复后.行高)} 行`,
  );

  // ⑨ 收敛：白线值不再变化
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
    '\nOK：白线是浮层（容器高恒定），可视高恒为整数行，翻页无半行，滚到底末行不被盖，收放有过渡',
  );
  console.log(
    '页面日志尾部:\n' +
      页面日志.filter((l) => l.includes('白线')).slice(-3).join('\n'),
  );
  ws.close();
} finally {
  await 收尾();
}
