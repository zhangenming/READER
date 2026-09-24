// 一次性验证：阅读统计弹窗去掉顶部标题栏后，弹窗内容、关闭路径仍然正常。
const port = process.env.CDP_PORT;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(
  (t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:15921'),
);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
async function evaluate(code) {
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${code} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description);
  return r.result.value;
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
import assert from 'node:assert/strict';

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.reload', { ignoreCache: true });
for (let n = 0; n < 200; n++) {
  await pause(100);
  if (await evaluate('return document.querySelector("#载入状态")?.hidden === true'))
    break;
}

// 1. 标题栏彻底移除
assert.equal(
  await evaluate(
    'return document.querySelectorAll("#阅读统计弹窗 .上下文标题栏, #阅读统计弹窗 .上下文标题, #关闭阅读统计按钮").length',
  ),
  0,
);
assert.equal(
  await evaluate(
    'return document.querySelector("#阅读统计弹窗")?.firstElementChild?.id',
  ),
  '阅读统计内容',
);

// 2. 打开弹窗：内容仍在、顶部留白来自弹窗 padding
await evaluate('document.querySelector("#阅读统计按钮").click()');
await pause(300);
assert.ok(await evaluate('return document.querySelector("#阅读统计弹窗").open'));
const 几何 = await evaluate(`const d = document.querySelector('#阅读统计弹窗');
  const dr = d.getBoundingClientRect(), cr = document.querySelector('#阅读统计内容').getBoundingClientRect();
  return { open: d.open, 距顶: Math.round(cr.top - dr.top), 高: Math.round(dr.height), 宽: Math.round(dr.width),
    有内容: cr.height > 100, 可访问名: d.getAttribute('aria-label'), 溢出: d.scrollWidth - d.clientWidth };`);
console.log('几何', 几何);
assert.ok(几何.距顶 >= 16 && 几何.距顶 <= 24, '内容距弹窗顶部应为弹窗 padding');
assert.ok(几何.有内容);
assert.ok(几何.溢出 <= 0, '弹窗不应横向溢出');

// 3. 点击弹窗外关闭
await evaluate(
  'document.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, clientX: 6, clientY: 450}));',
);
await pause(200);
assert.equal(
  await evaluate('return document.querySelector("#阅读统计弹窗").open'),
  false,
  '点击遮罩应关闭',
);

// 4. Esc 关闭
await evaluate('document.querySelector("#阅读统计按钮").click()');
await pause(300);
await send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'Escape',
  code: 'Escape',
  windowsVirtualKeyCode: 27,
  nativeVirtualKeyCode: 27,
});
await send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: 'Escape',
  code: 'Escape',
  windowsVirtualKeyCode: 27,
  nativeVirtualKeyCode: 27,
});
await pause(200);
assert.equal(
  await evaluate('return document.querySelector("#阅读统计弹窗").open'),
  false,
  'Esc 应关闭',
);

// 5. 截图留档
await evaluate('document.querySelector("#阅读统计按钮").click()');
await pause(400);
const { data } = await send('Page.captureScreenshot', { format: 'png' });
const { writeFile } = await import('node:fs/promises');
await writeFile('tmp/verify-统计弹窗-无标题栏.png', Buffer.from(data, 'base64'));
console.log('PASS 无标题栏、内容正常、遮罩点击与 Esc 均可关闭');
ws.close();
process.exit(0);
