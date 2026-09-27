// 一次性验证脚本：打开「阅读内容」弹窗时，列表应自动滚到当前在读的那本书。
// 1) 载入一本排在中间的书 → 重开弹窗 → 当前项应出现在列表视口里（居中）
// 2) 字数统计完成后的第二次渲染，不应把用户手动滚走的位置拽回去
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CDP端口 = Number(process.env.VERIFY_CDP_PORT || 9417);
const 站点端口 = Number(process.env.SITE_PORT || 15999);
const 地址 = `http://127.0.0.1:${站点端口}/`;

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: join(import.meta.dirname, '..'),
  stdio: 'ignore',
});
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-verify-current-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=375,812',
    地址,
  ],
  { cwd: join(import.meta.dirname, '..'), stdio: 'ignore' },
);

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('exit', () => {
  chrome.kill();
  服务.kill();
});

async function 等待目标() {
  for (let i = 0; i < 100; i++) {
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

await 发送('Page.enable');
await 发送('Emulation.setDeviceMetricsOverride', {
  width: 375,
  height: 812,
  deviceScaleFactor: 2,
  mobile: true,
});

for (let i = 0; i < 150; i++) {
  const 已载入 = await 求值(
    `return !document.querySelector('#载入状态') || document.querySelector('#载入状态').hidden;`,
  );
  if (已载入) break;
  await pause(200);
}

async function 列表快照() {
  return 求值(`
    const 列表 = document.querySelector('#内容选择列表');
    const 当前 = 列表.querySelector('.内容行.当前');
    const 列表框 = 列表.getBoundingClientRect();
    const 当前框 = 当前?.getBoundingClientRect();
    return {
      弹窗打开: document.querySelector('#内容选择弹窗').open,
      scrollTop: 列表.scrollTop,
      可滚动高度: 列表.scrollHeight,
      视口高度: 列表.clientHeight,
      条目数: 列表.querySelectorAll('[data-file-name]').length,
      当前书名: 当前?.dataset.fileName ?? null,
      当前序号: 当前
        ? [...列表.querySelectorAll('[data-file-name]')].indexOf(当前)
        : null,
      在视口内: 当前框
        ? 当前框.bottom > 列表框.top + 1 && 当前框.top < 列表框.bottom - 1
        : null,
      居中偏差: 当前框
        ? Math.round(
            当前框.top + 当前框.height / 2 - (列表框.top + 列表框.height / 2),
          )
        : null,
      字数文字: 当前?.querySelector('td:nth-child(2)').textContent ?? null,
    };
  `);
}

// 先载入一本排在列表中间偏后的书（这样「滚到当前」必须真的滚动才看得到）
await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
await pause(1200);
const 书名列表 = await 求值(
  `return [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
    .map((b) => b.dataset.fileName);`,
);
assert.ok(书名列表.length > 10, `目录条目过少：${书名列表.length}`);
const 目标序号 = Math.floor(书名列表.length * 0.6);
const 目标书名 = 书名列表[目标序号];
console.log(`目标：第 ${目标序号 + 1}/${书名列表.length} 项 ${目标书名}`);
await 求值(
  `
  [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
    .find((b) => b.dataset.fileName === ${JSON.stringify(目标书名)}).click();
  return 1;
`,
);
for (let i = 0; i < 200; i++) {
  const 状态 = await 求值(
    `const { 状态 } = await import('./js/状态.js'); return { n: 状态.文件名, l: 状态.文本?.length ?? 0 };`,
  );
  if (状态.n === 目标书名 && 状态.l > 0) break;
  await pause(200);
}
assert.equal(
  (
    await 求值(
      `const { 状态 } = await import('./js/状态.js'); return 状态.文件名;`,
    )
  ),
  目标书名,
  '前置条件：应已载入目标书名',
);

// 关掉弹窗，把列表滚回顶部，模拟「上次看到别处」的残留位置
await 求值(`
  document.querySelector('#内容选择弹窗').close();
  document.querySelector('#内容选择列表').scrollTop = 0;
  return 1;
`);
await pause(200);

await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
await pause(900);
const 首次 = await 列表快照();
console.log('首次渲染:', 首次);
assert.equal(首次.弹窗打开, true, '弹窗应已打开');
assert.equal(首次.当前书名, 目标书名, '应标记出当前在读的书');
assert.ok(首次.条目数 > 10, `条目太少无法验证滚动：${首次.条目数}`);
assert.equal(首次.当前序号, 目标序号, '当前书应排在列表中间偏后，验证不到滚动说明选样失败');
assert.ok(首次.scrollTop > 100, `列表应已向下滚动，实际 scrollTop=${首次.scrollTop}`);
assert.ok(首次.在视口内, `当前书应出现在列表视口内，scrollTop=${首次.scrollTop}`);
assert.ok(
  Math.abs(首次.居中偏差) <= 12 ||
    首次.scrollTop === 0 ||
    首次.scrollTop >= 首次.可滚动高度 - 首次.视口高度 - 1,
  `当前书应大致居中，偏差 ${首次.居中偏差}px`,
);

// 第二次渲染（字数统计回来）后，用户手动滚动的位置不该被拽回去
await 求值(`document.querySelector('#内容选择列表').scrollTop = 300; return 1;`);
for (let i = 0; i < 200; i++) {
  const 快照 = await 列表快照();
  if (快照.字数文字 && 快照.字数文字 !== '…') break;
  await pause(200);
}
await pause(400);
const 二次 = await 列表快照();
console.log('字数回来后:', 二次);
assert.notEqual(二次.字数文字, '…', '字数应已统计完成并重渲染');
assert.equal(二次.scrollTop, 300, '重渲染后应保留用户手动滚动的位置');

// 冷启动一遍：字数表是空的，弹窗会先渲染「…」再渲染真实字数。
// 第一次渲染（此刻还没有任何字数）就应当已经把当前书居中。
await 发送('Page.reload');
for (let i = 0; i < 150; i++) {
  await pause(200);
  const 已就绪 = await 求值(`
    const { 状态 } = await import('./js/状态.js');
    const 载入 = document.querySelector('#载入状态');
    return {
      就绪: (!载入 || 载入.hidden) && !!状态.文本,
      文件名: 状态.文件名,
      字数表大小: 状态.文本字数?.size ?? -1,
    };
  `);
  if (已就绪.就绪 && 已就绪.文件名 === 目标书名 && 已就绪.字数表大小 === 0) break;
}
await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
await pause(120);
const 冷启动 = await 列表快照();
console.log('冷启动首次渲染:', 冷启动);
assert.equal(冷启动.字数文字, '…', '应抓到字数未回的首次渲染');
assert.equal(冷启动.当前书名, 目标书名, '冷启动后仍应认得当前书');
assert.ok(冷启动.在视口内, `首次渲染就应把当前书滚进视口，scrollTop=${冷启动.scrollTop}`);
assert.ok(
  Math.abs(冷启动.居中偏差) <= 12,
  `首次渲染应居中，偏差 ${冷启动.居中偏差}px`,
);
const 冷启动位置 = 冷启动.scrollTop;
for (let i = 0; i < 200; i++) {
  const 快照 = await 列表快照();
  if (快照.字数文字 && 快照.字数文字 !== '…') break;
  await pause(200);
}
await pause(300);
const 冷启动二次 = await 列表快照();
console.log('冷启动字数回来后:', 冷启动二次);
assert.notEqual(冷启动二次.字数文字, '…', '字数应已回填并重渲染');
assert.equal(
  冷启动二次.scrollTop,
  冷启动位置,
  '回填字数重渲染时行高变了会破坏居中，scrollTop 应保持不变',
);
assert.ok(
  Math.abs(冷启动二次.居中偏差) <= 12,
  `重渲染后当前书仍应居中，偏差 ${冷启动二次.居中偏差}px`,
);

const 截图 = await 发送('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync(
  join(import.meta.dirname, '内容选择-滚到当前书.png'),
  Buffer.from(截图.data, 'base64'),
);

console.log(
  `\nOK：打开弹窗已滚到「${首次.当前书名}」（第 ${首次.当前序号 + 1} 项，居中偏差 ${首次.居中偏差}px），重渲染保留手动滚动位置`,
);
process.exit(0);
