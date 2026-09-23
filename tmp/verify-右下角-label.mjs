// 一次性验证脚本：右下角四枚读数的 label 与「剩余 / 总和」换位。
// 自启 server.mjs + headless Chrome，注入样例数值后量真实几何：
//   1) 每枚数字前各有一个 label，顺序为 当前 / 今日 / 总和 / 剩余；
//   2) 同列竖着右对齐；
//   3) 时间块变宽后不与右下按钮组重叠；
//   4) 出图供肉眼复核。
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const 站点端口 = Number(process.env.SITE_PORT || 16113);
const CDP端口 = Number(process.env.VERIFY_CDP_PORT || 9513);
const 地址 = `http://127.0.0.1:${站点端口}/`;
const 项目根 = new URL('..', import.meta.url).pathname;

const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

const 服务 = spawn('node', ['server.mjs', String(站点端口)], {
  cwd: 项目根,
  stdio: 'ignore',
});
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-label-verify-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    '--force-color-profile=srgb',
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
    待回复.set(下标, { resolve, reject });
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

for (let i = 0; i < 200; i++) {
  const 行数 = await 求值(`return document.querySelectorAll('.正文行').length;`);
  if (行数 > 20) break;
  await pause(200);
}

// 真跑一遍自动滚动（Ctrl+D），不注入文本——顺带验证 label 与去括号后的
// 真实格式化输出（今日滚动后缀 / 今日本书滚动后缀）。
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
await 按键('d', 'KeyD', 68, 2); // Ctrl+D 启动
await pause(2500);

const 文本 = await 求值(`
  return {
    滚动中: document.querySelector('#自动滚动按钮').getAttribute('aria-pressed') === 'true',
    当前: document.querySelector('#已滚动时间').textContent,
    今日: document.querySelector('#今日滚动时间').textContent,
    总和: document.querySelector('#本书滚动时间').textContent,
    剩余: document.querySelector('#剩余滚动时间').textContent,
    第一行隐藏: document.querySelector('#已滚动时间行').hidden,
    第二行隐藏: document.querySelector('#剩余滚动时间行').hidden,
  };
`);
console.log('真实滚动读数:', JSON.stringify(文本));
await 按键('d', 'KeyD', 68, 2); // 停住，别继续滚
await pause(300);
// 停滚后两行会 hidden；截图要的是「滚动中」那一屏，所以再把显示态钉回来
await 求值(`
  document.querySelector('#已滚动时间行').hidden = false;
  document.querySelector('#剩余滚动时间行').hidden = false;
  document.body.classList.add('右下控件显示');
  return true;
`);
await pause(400);

const 几何 = await 求值(`
  const 框 = (el) => { const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), r: +r.right.toFixed(1), t: +r.top.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1) }; };
  const 行 = document.querySelector('#已滚动时间行').parentElement;
  const 标签 = [...document.querySelectorAll('.时间标签')];
  return {
    块: 框(行),
    标签: 标签.map((el) => ({ 文本: el.textContent, ...框(el) })),
    数字: {
      当前: 框(document.querySelector('#已滚动时间')),
      今日: 框(document.querySelector('#今日滚动时间')),
      总和: 框(document.querySelector('#本书滚动时间')),
      剩余: 框(document.querySelector('#剩余滚动时间')),
    },
    时钟: 框(document.querySelector('#当前时间')),
    按钮组: 框(document.querySelector('#右下按钮组') || document.querySelector('.右下按钮组')),
  };
`);

const 序 = 几何.标签.map((x) => x.文本).join(' ');
console.log('label 顺序:', 序);
console.log(
  '第一行 当前/今日 右缘:',
  几何.数字.当前.r,
  几何.数字.今日.r,
  '第二行 总和/剩余 右缘:',
  几何.数字.总和.r,
  几何.数字.剩余.r,
);
console.log(
  '时间块:',
  `left=${几何.块.l} right=${几何.块.r}`,
  '| 按钮组 right=',
  几何.按钮组.r,
  '| 时钟 right=',
  几何.时钟.r,
);

const 失败 = [];
if (!文本.滚动中) 失败.push('Ctrl+D 没启动自动滚动，读数不是真实链路出来的');
for (const [名, 值] of [
  ['当前', 文本.当前],
  ['今日', 文本.今日],
  ['总和', 文本.总和],
  ['剩余', 文本.剩余],
]) {
  if (/[（）()]/.test(值)) 失败.push(`${名} 还带括号: ${值}`);
  if (!/\d/.test(值)) 失败.push(`${名} 没有数字: ${值}`);
}
if (文本.第一行隐藏 || 文本.第二行隐藏) 失败.push('滚动中两行读数仍是 hidden');
if (序 !== '当前 今日 总和 剩余') 失败.push(`label 顺序不对: ${序}`);
const 同列 = (a, b, 名) => {
  if (Math.abs(a.r - b.r) > 0.6) 失败.push(`${名} 右缘未对齐: ${a.r} vs ${b.r}`);
};
同列(几何.数字.当前, 几何.数字.总和, '左列数字');
同列(几何.数字.今日, 几何.数字.剩余, '右列数字');
同列(几何.标签[0], 几何.标签[2], '左列 label');
同列(几何.标签[1], 几何.标签[3], '右列 label');
// label 必须在自己的数字左边
if (!(几何.标签[0].r <= 几何.数字.当前.l + 0.6)) 失败.push('「当前」不在数字左侧');
if (!(几何.标签[1].r <= 几何.数字.今日.l + 0.6)) 失败.push('「今日」不在数字左侧');
if (!(几何.标签[2].r <= 几何.数字.总和.l + 0.6)) 失败.push('「总和」不在数字左侧');
if (!(几何.标签[3].r <= 几何.数字.剩余.l + 0.6)) 失败.push('「剩余」不在数字左侧');
// 换位：总和在左、剩余在右
if (!(几何.数字.总和.r < 几何.数字.剩余.l)) 失败.push('「总和」「剩余」没换到左右两槽');
// 不与按钮组重叠
if (几何.块.l < 几何.按钮组.r)
  失败.push(`时间块压到按钮组: 时间块 left=${几何.块.l} < 按钮组 right=${几何.按钮组.r}`);
// 时钟右缘对齐块右缘
if (Math.abs(几何.时钟.r - 几何.块.r) > 0.6)
  失败.push(`时钟右缘 ${几何.时钟.r} 与块右缘 ${几何.块.r} 不齐`);

const 截图 = await 发送('Page.captureScreenshot', {
  format: 'png',
  clip: {
    x: Math.max(0, 几何.按钮组.l - 20),
    y: 几何.块.t - 20,
    width: 1280 - Math.max(0, 几何.按钮组.l - 20),
    height: 900 - (几何.块.t - 20),
    scale: 3,
  },
});
const 出图 = join(项目根, 'tmp', '右下角-label-验证.png');
writeFileSync(出图, Buffer.from(截图.data, 'base64'));
console.log('截图:', 出图);

if (失败.length) {
  console.log('❌ 失败:');
  for (const f of 失败) console.log('  -', f);
  process.exit(1);
}
console.log('✅ 全部通过');
// WS 连接会一直吊住事件循环，必须显式收摊，否则命令永不返回。
收尾();
ws.close();
process.exit(0);
