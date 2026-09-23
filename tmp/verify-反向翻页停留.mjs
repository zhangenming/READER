// 一次性验证脚本：自动滚动中按 ← 回退翻屏的「停留时长 5s」与「距离比例 0.75」。
// 自启 server.mjs + headless Chrome，用真实按键（CDP Input）观测 scrollTop 轨迹：
//   1) 回退位移 ≈ 视口高度 × 0.75；
//   2) 到位后静止满 4s（旧值 1s 早已恢复滚动）；
//   3) 之后恢复向下滚动，停留总时长 ≈ 5s。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const 站点端口 = await 取空闲端口();
const CDP端口 = await 取空闲端口();
const 地址 = `http://127.0.0.1:${站点端口}/`;
console.log('地址:', 地址, 'CDP:', CDP端口);

const 服务 = spawn('node', ['server.mjs', String(站点端口)], {
  cwd: 项目根,
  stdio: 'ignore',
});
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-reverse-page-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    地址,
  ],
  { stdio: 'ignore' },
);
const 收尾 = () => {
  chrome.kill();
  服务.kill();
};
process.on('exit', 收尾);

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
const 视口高度 = () =>
  求值(`return document.querySelector('#滚动容器').clientHeight;`);

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

for (let i = 0; i < 200; i++) {
  const 行数 = await 求值(`return document.querySelectorAll('.正文行').length;`);
  if (行数 > 20) break;
  await pause(200);
}
assert.ok(
  (await 求值(`return document.querySelectorAll('.正文行').length;`)) > 20,
  '正文应已载入',
);

// ① 启动自动滚动
await 按键('d', 'KeyD', 68, 2); // Ctrl+D
const 起点 = await 滚动位置();
for (let i = 0; i < 25 && (await 滚动位置()) === 起点; i++) await pause(120);
assert.ok((await 滚动位置()) > 起点, '自动滚动应已启动');

// ② 先向右翻几屏，滚到文档中段（否则 ← 会被顶部截断，量不到真实距离）
for (let i = 0; i < 5; i++) {
  await 按键('ArrowRight', 'ArrowRight', 39);
  await pause(1000); // 前进快速滚动 + 700ms 停留
}
const 视口 = await 视口高度();
assert.ok(视口 > 300, `视口高度应有效：${视口}`);
const 高度 = await 求值(
  `const c=document.querySelector('#滚动容器'); return c.scrollHeight - c.clientHeight;`,
);
const 按下前位置 = await 滚动位置();
assert.ok(
  按下前位置 > 视口,
  `应先滚到中段再回退，当前 ${Math.round(按下前位置)} / 最大 ${Math.round(高度)}`,
);

// ③ 按 ← 并采样 1.6s（远小于 5s 停留，窗口内最低点即回退终点）
const 采样 = [];
const 按键墙钟 = Date.now();
await 按键('ArrowLeft', 'ArrowLeft', 37);
while (Date.now() - 按键墙钟 < 1600) {
  采样.push([Date.now() - 按键墙钟, await 滚动位置()]);
  await pause(40);
}
const 最小值 = Math.min(...采样.map((s) => s[1]));
const 到位相对 = 采样.find((s) => s[1] <= 最小值 + 0.5)[0];
const 到位墙钟 = 按键墙钟 + 到位相对;
const 静止基准 = 最小值;
const 期望 = 按下前位置 - 视口 * 0.75;
console.log(
  {
    视口高度: Math.round(视口),
    按下前位置: Math.round(按下前位置),
    回退到: Math.round(最小值),
    期望目标: Math.round(期望),
    实测位移: Math.round(按下前位置 - 最小值),
    旧值零点七应为: Math.round(按下前位置 - 视口 * 0.7),
    到位时刻ms: 到位相对,
  },
  null,
);
assert.ok(
  Math.abs(最小值 - 期望) < 视口 * 0.03,
  `回退目标应约为 0.75 视口：实测 ${Math.round(最小值)}，期望 ${Math.round(期望)}`,
);

// ④ 到位后满 4.8s 仍应基本静止（旧值 1000ms 早已恢复滚动）
const 还需 = 到位墙钟 + 4800 - Date.now();
if (还需 > 0) await pause(还需);
const 四点八秒后 = await 滚动位置();
console.log(
  '4.8s 后位置:',
  Math.round(四点八秒后),
  '基准:',
  Math.round(静止基准),
  '偏移:',
  Math.round(四点八秒后 - 静止基准),
);
assert.ok(
  Math.abs(四点八秒后 - 静止基准) < 4,
  `停留应持续满 4.8s，实际偏移 ${Math.round(四点八秒后 - 静止基准)}px`,
);

// ⑤ 之后应恢复向下滚动，据此量出停留总时长
let 已恢复 = false;
while (Date.now() - 到位墙钟 < 8000) {
  if ((await 滚动位置()) - 静止基准 > 10) {
    已恢复 = true;
    break;
  }
  await pause(50);
}
assert.ok(已恢复, '停留结束后应恢复自动滚动');
const 停留实测 = Date.now() - 到位墙钟;
console.log('停留实测ms:', 停留实测);
assert.ok(
  停留实测 > 4200 && 停留实测 < 6200,
  `停留时长应约为 5s，实测 ${停留实测}ms`,
);

console.log('\nOK：← 回退距离 ≈ 0.75 视口，到位后停留 ≈ 5s 再恢复滚动');
ws.close();
收尾();
process.exit(0);
