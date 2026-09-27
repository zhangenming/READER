// 左缘位置指示器的「满行程」不变量（headless Chrome 实测）：
//   ① 红色指针线钉在 进度 × 轨道高：0% 贴视口顶边、100% 贴底边，上下不留空隙
//   ② 数字整枚留在轨道内（不被视口裁掉），且始终待在线的一侧、不被线穿过字形
//   ③ 关键词刻度 / 章节刻度与指针线共用同一条「轨道 ↔ 滚动位置」映射
// 跑法：node tmp/verify-进度指针满行程.mjs  [BOOK=从0到1：开启商业与未来的秘密.txt]
// 按 AGENTS.md：profile 路径存下来，成功/异常/超时都走 finally 删除并确认不存在。
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const 项目根 = resolve(import.meta.dirname, '..');
const 目标文本 = process.env.BOOK || '从0到1：开启商业与未来的秘密.txt';
const 窗口 = (process.env.SIZE || '1440,1000').split(',').map(Number);

async function 取空闲端口(首选) {
  const 试 = async (端口) => {
    const 探测 = createServer();
    try {
      await new Promise((完成, 失败) => {
        探测.once('error', 失败);
        探测.listen(端口, '127.0.0.1', 完成);
      });
      return 探测.address().port;
    } catch {
      return 0;
    } finally {
      await new Promise((完成) => 探测.close(完成));
    }
  };
  return (await 试(首选)) || (await 试(0));
}

function 清理遗留profile(跳过) {
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
}

const CDP端口 = await 取空闲端口(9481);
const 站点端口 = await 取空闲端口(15981);
const 地址 = `http://127.0.0.1:${站点端口}/`;
const profile = mkdtempSync(join(tmpdir(), 'reader-pointer-travel-'));
清理遗留profile(profile);

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
    `--window-size=${窗口[0]},${窗口[1]}`,
    地址,
  ],
  { stdio: 'ignore' },
);
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));
const 控制台错误 = [];
let ws = null;
let 消息号 = 0;
const 待回复 = new Map();

function 发送(方法, 参数 = {}) {
  return new Promise((解决, 拒绝) => {
    const 下标 = ++消息号;
    const 计时器 = setTimeout(() => {
      待回复.delete(下标);
      拒绝(new Error(`CDP 超时: ${方法}`));
    }, 30_000);
    待回复.set(下标, {
      resolve: (v) => (clearTimeout(计时器), 解决(v)),
      reject: (e) => (clearTimeout(计时器), 拒绝(e)),
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
  for (let i = 0; i < 300; i++) {
    try {
      const 列表 = await (
        await fetch(`http://127.0.0.1:${CDP端口}/json`)
      ).json();
      const 目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
      if (!目标) {
        await pause(200);
        continue;
      }
      ws = new WebSocket(目标.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener('open', r, { once: true }));
      ws.addEventListener('message', (事件) => {
        const 消息 = JSON.parse(事件.data);
        if (
          消息.method === 'Runtime.consoleAPICalled' &&
          消息.params.type === 'error'
        )
          控制台错误.push(
            消息.params.args.map((a) => a.value ?? a.description).join(' '),
          );
        if (消息.method === 'Log.entryAdded' && 消息.params.entry.level === 'error')
          控制台错误.push(消息.params.entry.text);
        if (!消息.id) return;
        const 请求 = 待回复.get(消息.id);
        待回复.delete(消息.id);
        if (!请求) return;
        if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
        else 请求.resolve(消息.result);
      });
      await 发送('Runtime.enable');
      await 发送('Log.enable');
      return;
    } catch {
      await pause(200);
    }
  }
  throw new Error('headless Chrome 页面未就绪');
}

async function 载入一本书() {
  for (let i = 0; i < 300; i++) {
    if (
      await 求值(`
        return !!document.querySelector('#内容选择按钮') &&
          (document.querySelector('#载入状态')?.hidden ?? true);`)
    )
      break;
    await pause(200);
  }
  await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
  for (let i = 0; i < 200; i++) {
    if (
      await 求值(`
        return [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
          .some((b) => b.dataset.fileName === ${JSON.stringify(目标文本)});`)
    )
      break;
    await pause(200);
  }
  await 求值(`
    [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
      .find((b) => b.dataset.fileName === ${JSON.stringify(目标文本)}).click();
    return 1;`);
  for (let i = 0; i < 900; i++) {
    if (
      await 求值(`
        const { 状态 } = await import('./js/状态.js');
        return 状态.文件名 === ${JSON.stringify(目标文本)} && 状态.行起点列表.length > 100;`)
    )
      return;
    await pause(200);
  }
  throw new Error(`未能载入 ${目标文本}`);
}

// 一次量全：指针线的实际落点（盒底边 = 线，或 .读数在下 时盒顶边 = 线）、数字盒、
// 期望落点（进度 × 轨道高）、轨道高、以及刻度与指针共用的那条映射函数。
const 量指针 = () =>
  求值(`
    const { 状态, 元素 } = await import('./js/状态.js');
    const { 更新滚动块位置, 读取滚动条度量, 滚动位置转轨道中心 } =
      await import('./js/滚动条.js');
    const 块 = 更新滚动块位置();
    const 容器 = 元素.滚动容器;
    const 轨道高度 = 容器.clientHeight;
    const 盒 = 元素.滚动进度.getBoundingClientRect();
    const 字 = 元素.滚动百分比.getBoundingClientRect();
    const 在下 = 元素.滚动进度.classList.contains('读数在下');
    const 度量 = 读取滚动条度量(
      轨道高度, 容器.clientHeight, 容器.scrollHeight);
    return {
      文本: 元素.滚动百分比.textContent,
      进度: 块?.进度 ?? null,
      线位置: 在下 ? 盒.top : 盒.bottom,
      在下,
      盒上: 盒.top, 盒下: 盒.bottom, 盒高: 盒.height,
      字上: 字.top, 字下: 字.bottom,
      指针间距: parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--进度指针间距')),
      轨道高度,
      期望: 滚动位置转轨道中心(容器.scrollTop, 度量),
      端点: { 首: 滚动位置转轨道中心(0, 度量), 尾: 滚动位置转轨道中心(度量.最大滚动位置, 度量) },
    };`);

async function 滚到(比例) {
  await 求值(`
    const { 元素 } = await import('./js/状态.js');
    const 容器 = 元素.滚动容器;
    容器.scrollTop = (容器.scrollHeight - 容器.clientHeight) * ${比例};
    return 容器.scrollTop;`);
  await pause(500);
}

function 判(名, 量) {
  console.log(
    `${名.padEnd(6)} 「${量.文本}」 线在 ${量.线位置.toFixed(1)} / 期望 ${量.期望.toFixed(1)}` +
      ` (轨道高 ${量.轨道高度})  数字[${量.字上.toFixed(1)}→${量.字下.toFixed(1)}]` +
      ` 盒[${量.盒上.toFixed(1)}→${量.盒下.toFixed(1)}] ${量.在下 ? '在线下方' : '在线上方'}`,
  );
  assert.ok(量.进度 !== null, `${名}：量不到读数状态`);
  // ① 线钉在 进度 × 轨道高
  assert.ok(
    Math.abs(量.线位置 - 量.期望) <= 1,
    `${名}：指针线偏离 进度×轨道高：${量.线位置.toFixed(1)} vs ${量.期望.toFixed(1)}`,
  );
  assert.ok(
    Math.abs(量.期望 - 量.进度 * 量.轨道高度) <= 1,
    `${名}：映射不是满量程线性：${量.期望.toFixed(1)} vs ${(量.进度 * 量.轨道高度).toFixed(1)}`,
  );
  // ③ 端点：0% 在顶、100% 在底，不留空隙
  assert.ok(Math.abs(量.端点.首) <= 0.5, `${名}：0% 没贴顶边：${量.端点.首}`);
  assert.ok(
    Math.abs(量.端点.尾 - 量.轨道高度) <= 0.5,
    `${名}：100% 没贴底边：${量.端点.尾} vs ${量.轨道高度}`,
  );
  // ② 数字整枚在轨道内、且不被线穿过
  assert.ok(量.盒上 >= -0.5, `${名}：读数越出顶边：${量.盒上.toFixed(1)}`);
  assert.ok(
    量.盒下 <= 量.轨道高度 + 0.5,
    `${名}：读数越出底边：${量.盒下.toFixed(1)} vs ${量.轨道高度}`,
  );
  const 不穿 =
    量.字下 <= 量.线位置 + 0.5 || 量.字上 >= 量.线位置 - 0.5;
  assert.ok(不穿, `${名}：指针线穿过数字：线 ${量.线位置.toFixed(1)} 数字[${量.字上.toFixed(1)}→${量.字下.toFixed(1)}]`);
  // 在线之上时保留 6px 留白；翻到线下方时同样留白
  const 留白 = 量.在下 ? 量.字上 - 量.线位置 : 量.线位置 - 量.字下;
  assert.ok(
    留白 >= 量.指针间距 / 2,
    `${名}：数字与指针线贴在一起：留白 ${留白.toFixed(1)} vs 设计 ${量.指针间距}`,
  );
}

async function 截(名字, y, 高度, 宽度 = 120, scale = 4) {
  const { data } = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y, width: 宽度, height: 高度, scale },
  });
  writeFileSync(resolve(import.meta.dirname, 名字), Buffer.from(data, 'base64'));
}

let 失败 = null;
try {
  await 连接页面();
  await 载入一本书();
  await pause(600);

  for (const [比例, 名] of [
    [0, '0%'],
    [0.02, '2%'],
    [0.5, '50%'],
    [0.98, '98%'],
    [1, '100%'],
  ]) {
    await 滚到(比例);
    判(名, await 量指针());
  }

  // 迟滞：数字刚翻到线下方时，跨过盒高那一档不许立刻翻回来（来回闪）
  const 轨道 = (await 量指针()).轨道高度;
  const 走到 = async (线) => {
    await 滚到(线 / 轨道);
    return 量指针();
  };
  await 走到(0);
  const 迟1 = await 走到(21);
  const 迟2 = await 走到(30);
  const 迟3 = await 走到(21);
  console.log(
    `迟滞：线 21(自下而上)=${迟1.在下 ? '下挂' : '上挂'} → 30=${迟2.在下 ? '下挂' : '上挂'} → 回到 21=${迟3.在下 ? '下挂' : '上挂'}`,
  );
  assert.ok(迟1.在下, '线在 21px（刚从下方上来）不该立刻翻回上方');
  assert.ok(!迟2.在下, '线到 30px 应挂回上方');
  assert.ok(!迟3.在下, '从上方回到 21px 保持上方（迟滞只挡来回翻）');

  await 滚到(0);
  const 首 = await 量指针();
  await 截('进度指针-0%-贴顶.png', 0, 120, 首.盒高 + 60);
  await 滚到(1);
  const 尾 = await 量指针();
  await 截(
    '进度指针-100%-贴底.png',
    Math.max(0, 尾.轨道高度 - 120),
    120,
    尾.盒高 + 60,
  );

  // 拖拽：从 50% 按住数字往下拖 200px，指针线应跟着走同样的像素
  await 滚到(0.5);
  const 起点 = await 量指针();
  const 按下Y = 起点.盒上 + 起点.盒高 / 2;
  const 目标Y = 按下Y + 200;
  await 求值(`
    const { 元素 } = await import('./js/状态.js');
    const 盒 = 元素.滚动进度.getBoundingClientRect();
    const 造 = (类型, y) => 元素.滚动进度.dispatchEvent(new PointerEvent(类型, {
      bubbles: true, cancelable: true, pointerId: 7, isPrimary: true,
      clientX: 盒.left + 盒.width / 2, clientY: y,
    }));
    造('pointerdown', ${按下Y.toFixed(1)});
    造('pointermove', ${目标Y.toFixed(1)});
    造('pointerup', ${目标Y.toFixed(1)});
    return 1;`);
  await pause(500);
  const 拖后 = await 量指针();
  console.log(
    `拖拽 200px：线 ${起点.线位置.toFixed(1)} → ${拖后.线位置.toFixed(1)}（${起点.文本} → ${拖后.文本}）`,
  );
  assert.ok(
    Math.abs(拖后.线位置 - 起点.线位置 - 200) <= 2,
    `拖拽要 1:1 带着指针线走：${起点.线位置.toFixed(1)} → ${拖后.线位置.toFixed(1)}`,
  );
  assert.ok(
    parseFloat(拖后.文本) > parseFloat(起点.文本) + 5,
    `拖拽后进度读数没涨：${起点.文本} → ${拖后.文本}`,
  );

  const 噪音 = (条) => /wss:\/\/localhost:15941|ERR_CERT_AUTHORITY_INVALID/.test(条);
  const 真错误 = 控制台错误.filter((条) => !噪音(条));
  assert.deepEqual(真错误, [], `控制台不应报错：${真错误.join(' | ')}`);
  console.log('\n全部通过：指针线满行程贴顶贴底、数字不被裁也不被线穿过、拖拽 1:1');
} catch (错误) {
  失败 = 错误;
  console.error(错误.message || 错误);
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  服务.kill();
  await Promise.race([
    Promise.all([
      new Promise((r) => chrome.on('exit', r)),
      new Promise((r) => 服务.on('exit', r)),
    ]),
    pause(4000),
  ]);
  chrome.kill('SIGKILL');
  服务.kill('SIGKILL');
  await pause(500);
  rmSync(profile, { recursive: true, force: true });
  if (existsSync(profile)) {
    console.error('profile 清理失败，目录仍存在:', profile);
    失败 ??= new Error('profile 未清理');
  } else {
    console.log('profile 已清理:', profile);
  }
  清理遗留profile(null);
}
process.exitCode = 失败 ? 1 : 0;
