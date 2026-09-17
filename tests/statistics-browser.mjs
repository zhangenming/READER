import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// 使用独立浏览器配置运行，避免修改日常阅读状态。
const port = process.env.CDP_PORT;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(
  (t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:15921/'),
);
assert.ok(target, 'reader tab');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) =>
  ws.addEventListener('open', resolve, { once: true }),
);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(code) {
  const result = await send('Runtime.evaluate', {
    expression: `(async () => { ${code} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description);
  return result.result.value;
}
try {
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  let ready = false;
  for (let n = 0; n < 200; n++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    ready = await evaluate(
      'return document.querySelector("#载入状态")?.hidden === true',
    );
    if (ready) break;
  }
  assert.ok(ready, 'reader loaded');
  // 实际 app 事件接线及持久化：手动停留、隐藏暂停、恢复、pagehide/pageshow。
  await evaluate(`window.前台测试快照 = async () => {
    const { 保存持久化状态 } = await import('./js/持久化.js');
    const { 获取书籍前台毫秒 } = await import('./js/前台停留.js');
    const { 状态 } = await import('./js/状态.js');
    保存持久化状态();
    return 获取书籍前台毫秒(状态.文件名);
  };`);
  const before = await evaluate('return await window.前台测试快照()');
  await new Promise(resolve => setTimeout(resolve, 1100));
  const after = await evaluate('return await window.前台测试快照()');
  assert.ok(after - before >= 1000, 'manual reading counts');
  await evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));`);
  const hidden = await evaluate('return await window.前台测试快照()');
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(await evaluate('return await window.前台测试快照()'), hidden);
  await evaluate(`delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'));`);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.ok(await evaluate('return await window.前台测试快照()') >= hidden + 1000);
  await evaluate(`window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));`);
  const left = await evaluate('return await window.前台测试快照()');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(await evaluate('return await window.前台测试快照()'), left);
  await evaluate(`window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));`);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.ok(await evaluate('return await window.前台测试快照()') > left);
  const saved = await evaluate(`const { 持久化键 } = await import('./js/常量.js');
    return JSON.parse(localStorage.getItem(持久化键)).前台停留统计;`);
  assert.ok(Object.keys(saved.每日书籍毫秒).length > 0, 'foreground persisted');
  await evaluate('document.querySelector("#阅读统计按钮").click()');
  assert.ok(
    await evaluate('return document.querySelector("#阅读统计弹窗").open'),
  );
  assert.equal(
    await evaluate('return document.querySelectorAll(".统计卡片").length'),
    5,
  );
  assert.ok(await evaluate('return !!document.querySelector(".统计每日表")'));
  // 深色正文不能污染弹窗主题。
  await evaluate(
    'document.documentElement.style.setProperty("--背景色", "#000"); document.documentElement.style.setProperty("--纸张色", "#000");',
  );
  assert.deepEqual(
    await evaluate(
      'const s = getComputedStyle(document.querySelector("#阅读统计弹窗")); return [s.backgroundColor, s.color]',
    ),
    ['rgb(255, 255, 255)', 'rgb(0, 0, 0)'],
  );
  // 无脚本的特殊字符书名也必须保持纯文本，不创建标签。
  await evaluate(`const { 创建阅读统计内容 } = await import('./js/阅读统计.js');
    const 长名 = '很长的书名'.repeat(16) + '<b>特别版</b>.txt';
    document.querySelector('#阅读统计内容').replaceChildren(创建阅读统计内容({
      今日: 45000, 今日前台: 180000, 文件名: '当前书.txt', 进度: 2.9, 今天: '2026-09-17',
      书籍: [['当前书.txt', {总滚动毫秒: 11820000, 总前台毫秒: 180000}], [长名, {总滚动毫秒: 2700000, 阅读偏移: 50, 文本长度: 100}]],
      每日前台: { '当前书.txt': [['2026-09-17', 120000], ['2026-09-15', 60000]] },
      每日: {
        '当前书.txt': [['2026-09-17', 45000], ['2026-09-16', 11820000]],
        [长名]: [['2026-09-10', 2700000]],
      },
    }));`);
  assert.equal(
    await evaluate(
      'return document.querySelectorAll("#阅读统计内容 b").length',
    ),
    0,
  );
  assert.ok(
    await evaluate(
      'return document.querySelector("#阅读统计内容").textContent.includes("约 50.0%")',
    ),
  );
  assert.equal(
    await evaluate('return document.querySelector(".统计卡片 dd").textContent'),
    '不足 1 分钟',
  );
  assert.ok(
    await evaluate(
      'return document.querySelector(".统计每日 caption").textContent.includes("当前书.txt")',
    ),
  );
  assert.ok(
    await evaluate(
      'return document.querySelector(".统计每日").textContent.includes("今天")',
    ),
  );
  assert.ok(
    await evaluate(
      'return document.querySelector(".统计每日").textContent.includes("9月16日")',
    ),
  );
  assert.deepEqual(await evaluate(`return [...document.querySelectorAll('.统计每日 tbody tr')]
    .map(row => [...row.cells].map(cell => cell.textContent))`), [
    ['今天', '不足 1 分钟', '2 分钟'],
    ['9月16日', '3 小时 17 分钟', '0 分钟'],
    ['9月15日', '0 分钟', '1 分钟'],
  ]);
  await evaluate(
    'document.querySelector("#阅读统计内容 tr.统计可点:not(.统计选中书)").click()',
  );
  assert.ok(
    await evaluate(
      'return document.querySelector(".统计每日 caption").textContent.includes("特别版")',
    ),
  );
  assert.ok(
    await evaluate(
      'return document.querySelector(".统计每日").textContent.includes("9月10日")',
    ),
  );
  assert.equal(
    await evaluate(
      'return document.querySelectorAll("#阅读统计内容 b").length',
    ),
    0,
  );
  for (const width of [885, 375]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 650,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.ok(
      await evaluate(
        'const d = document.querySelector("#阅读统计弹窗"); const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && d.scrollWidth <= d.clientWidth;',
      ),
      `no overflow at ${width}px: ${JSON.stringify(await evaluate('const d = document.querySelector("#阅读统计弹窗"); const r = d.getBoundingClientRect(); const t = document.querySelector(".统计每日表"); return {left:r.left,right:r.right,width:innerWidth,scroll:d.scrollWidth,client:d.clientWidth,caption:t?.caption?.textContent,tableScroll:t?.scrollWidth,th:t?[...t.querySelectorAll("th")].map(h=>h.clientWidth):null};'))}`,
    );
    const columns = await evaluate(
      'return getComputedStyle(document.querySelector(".统计摘要")).gridTemplateColumns.split(" ").length',
    );
    assert.equal(columns, width === 885 ? 3 : 1);
    if (process.env.SCREENSHOT_DIR) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(
        `${process.env.SCREENSHOT_DIR}/reader-stats-${width}.png`,
        Buffer.from(data, 'base64'),
      );
    }
  }
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  assert.equal(
    await evaluate('return document.querySelector("#阅读统计弹窗").open'),
    false,
  );
  console.log(
    'PASS statistics dialog: live entry, opaque theme, paired cards, text-only names, progress, responsive layout and Escape',
  );
} finally {
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Page.reload', { ignoreCache: true });
  ws.close();
}
