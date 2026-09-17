import assert from 'node:assert/strict';
const port = process.env.CDP_PORT;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(
  (t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:15921'),
);
assert.ok(target, 'reader browser tab');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) =>
  ws.addEventListener('open', resolve, { once: true }),
);
let id = 0;
const pending = new Map();
const browserErrors = [];
let fixture = null;
ws.addEventListener('message', async (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  } else if (message.method === 'Fetch.requestPaused') {
    await send('Fetch.fulfillRequest', {
      requestId: message.params.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'Content-Type', value: 'text/plain; charset=utf-8' },
      ],
      body: Buffer.from(fixture).toString('base64'),
    });
  }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const next = ++id;
    pending.set(next, { resolve, reject });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
}
async function evaluate(code) {
  const result = await send('Runtime.evaluate', {
    expression: `(async () => { ${code} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.exception?.description ||
        JSON.stringify(result.exceptionDetails),
    );
  return result.result.value;
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready() {
  await pause(200);
  for (let n = 0; n < 150; n++) {
    try {
      if (
        await evaluate(
          'return document.querySelector("#载入状态")?.hidden && !!(await import("./js/状态.js")).状态.文件名',
        )
      )
        return;
    } catch {}
    await pause(100);
  }
  throw new Error('reader load timeout');
}
const state = 'const { 状态, 元素 } = await import("./js/状态.js");';
// 在隔离 Chrome 实例中运行：CDP_PORT=15922 node tests/search-browser.mjs
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click();`);
async function query(word) {
  await evaluate(`const input = document.querySelector('#查找输入框'); input.value = ${JSON.stringify(word)}; input.dispatchEvent(new Event('input', {bubbles: true}));`);
  await pause(500);
}
async function settled() {
  for (let n = 0; n < 100; n++) {
    if (await evaluate(`${state} return !状态.滚动动画目标`)) return;
    await pause(50);
  }
  assert.fail(JSON.stringify({
    message: 'animation timeout',
    page: await evaluate(`${state} return {url:location.href, open:元素.查找弹窗.open, temp:状态.查找临时关键词id, animation:状态.滚动动画目标, top:元素.滚动容器.scrollTop, visibility:document.visibilityState};`),
    browserErrors,
  }));
}
const open = () => evaluate(`(await import('./js/查找弹窗.js')).打开查找弹窗();`);
try {
  await send('Runtime.enable');
  await send('Page.bringToFront');
  await send('Page.reload', {ignoreCache: true});
  await ready();
  await settled();
  await evaluate(`${state}
    (await import('./js/关键词.js')).添加关键词标记('的', 状态.文本.indexOf('的'));
    状态.关键词面板展开 = false;
    (await import('./js/面板.js')).渲染关键词面板();
    元素.滚动容器.scrollTop = 1200;
  `);
  await pause(100);
  const originalTop = await evaluate(`${state} return 元素.滚动容器.scrollTop;`);
  await click('#关键词面板开关');
  await click('[data-action="上下文"]');
  assert.equal(await evaluate('return document.querySelectorAll("dialog[open]").length'), 1);
  assert.equal(await evaluate('return document.querySelector("#查找弹窗").open'), true);
  assert.equal(await evaluate('return document.querySelector("#查找输入框").value'), '的');
  assert.ok(await evaluate('return document.querySelectorAll("#查找弹窗 .上下文行").length > 0'));
  await click('#查找下一个按钮');
  assert.equal(await evaluate('return document.querySelector(".上下文行.当前").dataset.hitIndex'), '1');
  await query('的');
  await click('#搭配视图按钮');
  await pause(700);
  assert.equal(await evaluate('return document.querySelector("#上下文结果").hidden'), true);
  assert.equal(await evaluate('return document.querySelector("#分析结果").hidden'), false);
  assert.ok(await evaluate('return document.querySelectorAll("#分析结果 .分析行").length > 0'));
  const count = await evaluate(`${state} return 状态.关键词列表.find(k => k.id === 状态.查找临时关键词id).命中位置.length;`);
  assert.ok((await evaluate('return document.querySelector("#分析结果摘要").textContent')).startsWith(count.toLocaleString('zh-CN')));
  await click('#上下文视图按钮');
  // 首项向前循环到最后一项，按当前批渲染而不是创建全文 DOM。
  await click('#查找上一个按钮');
  assert.equal(await evaluate('return Number(document.querySelector(".上下文行.当前").dataset.hitIndex)'), count - 1);
  assert.ok(await evaluate('return document.querySelectorAll(".上下文行").length < 1000'));
  const beforePrepend = await evaluate(`${state}
    const list = 元素.上下文列表;
    list.scrollTop = 0;
    window.prependAnchor = list.querySelector('.上下文行');
    return {start:状态.上下文视图.起点, count:list.children.length, top:window.prependAnchor.getBoundingClientRect().top};
  `);
  assert.ok(beforePrepend.start > 0);
  await pause(300);
  const afterPrepend = await evaluate(`${state}
    const list = 元素.上下文列表;
    return {start:状态.上下文视图.起点, indices:[...list.children].map(row => Number(row.dataset.hitIndex)), top:window.prependAnchor.getBoundingClientRect().top};
  `);
  assert.equal(afterPrepend.start, Math.max(0, beforePrepend.start - 200));
  assert.equal(afterPrepend.indices.length, beforePrepend.count + beforePrepend.start - afterPrepend.start);
  assert.equal(new Set(afterPrepend.indices).size, afterPrepend.indices.length);
  assert.ok(afterPrepend.indices.every((idx, i, rows) => i === 0 || idx === rows[i-1] + 1));
  assert.ok(Math.abs(afterPrepend.top - beforePrepend.top) < 1, 'prepend preserves visible row position');
  await send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await pause(100); await settled();
  assert.equal(await evaluate(`${state} return 状态.查找临时关键词id;`), null);
  const restoredTop = await evaluate(`${state} return 元素.滚动容器.scrollTop;`);
  assert.ok(Math.abs(restoredTop - originalTop) < 1, `Esc restore: expected ${originalTop}, actual ${restoredTop}; errors ${JSON.stringify(browserErrors)}`);
  console.log('PASS panel entry, live query, view switching, shared counts, navigation, bounded batches, Esc rollback');

  await open();
  await query('绝不会存在的查询xyz123');
  assert.equal(await evaluate('return document.querySelectorAll(".上下文行").length'), 0);
  assert.equal(await evaluate('return document.querySelector("#查找下一个按钮").disabled'), true);
  await query('');
  assert.equal(await evaluate('return document.querySelector("#查找反馈").textContent'), '');
  await evaluate(`const input = document.querySelector('#查找输入框'); input.dispatchEvent(new CompositionEvent('compositionstart')); input.value = '的'; input.dispatchEvent(new Event('input'));`);
  await pause(350);
  assert.equal(await evaluate('return document.querySelectorAll(".上下文行").length'), 0);
  await evaluate(`document.querySelector('#查找输入框').dispatchEvent(new CompositionEvent('compositionend'));`);
  await pause(500);
  assert.ok(await evaluate('return document.querySelectorAll(".上下文行").length > 0'));
  await query('!他的');
  const filtered = await evaluate(`${state} const k = 状态.关键词列表.find(k => k.id === 状态.查找临时关键词id); return {count:k.命中位置.length, valid:[...k.命中位置].every(p => 状态.文本[p-1] !== '他')};`);
  assert.equal(filtered.valid, true);
  await click('#搭配视图按钮'); await pause(700);
  assert.ok((await evaluate('return document.querySelector("#分析结果摘要").textContent')).startsWith(filtered.count.toLocaleString('zh-CN')));
  await click('#上下文视图按钮');
  await query('的'); await settled();
  await click('.上下文行[data-hit-index="20"]');
  await pause(100); await settled();
  assert.equal(await evaluate('return document.querySelector("#查找弹窗").open'), false);
  assert.equal(await evaluate(`${state} return 状态.查找临时关键词id;`), null);
  assert.ok(await evaluate(`${state} return !!状态.跳转起点;`));
  const confirmed = await evaluate(`${state} return 元素.滚动容器.scrollTop;`);
  assert.ok(Math.abs(confirmed - originalTop) > 1, 'confirmed result keeps destination');
  await open();
  await evaluate(`const input=document.querySelector('#查找输入框'); input.value='的'; input.dispatchEvent(new Event('input')); document.querySelector('#关闭查找按钮').click();`);
  await pause(500); await settled();
  assert.equal(await evaluate(`${state} return 状态.查找临时关键词id;`), null);
  assert.ok(Math.abs((await evaluate(`${state} return 元素.滚动容器.scrollTop;`)) - confirmed) < 1);
  console.log('PASS empty/no match, IME, exclusion consistency, confirmed navigation, pending-input close');

  await send('Emulation.setDeviceMetricsOverride', {width:390,height:700,deviceScaleFactor:1,mobile:false});
  await pause(700); await open(); await query('的');
  assert.equal(await evaluate('const d=document.querySelector("#查找弹窗"); return d.scrollWidth <= d.clientWidth && d.getBoundingClientRect().right <= innerWidth;'), true);
  const screenshot = await send('Page.captureScreenshot', {format:'png'});
  await (await import('node:fs/promises')).writeFile('/tmp/reader-search-mobile.png', Buffer.from(screenshot.data,'base64'));
  await click('#关闭查找按钮');
  console.log('PASS narrow viewport; screenshot /tmp/reader-search-mobile.png');

  // 真实快捷键入口：文本选区 > 当前关键词 > 上次查询。
  const shortcut = async (modifiers = 2) => {
    await send('Input.dispatchKeyEvent', {type:'keyDown', key:'f', code:'KeyF', windowsVirtualKeyCode:70, modifiers});
    await send('Input.dispatchKeyEvent', {type:'keyUp', key:'f', code:'KeyF', windowsVirtualKeyCode:70, modifiers});
    await pause(100);
    await settled();
  };
  const closeSearch = async () => {
    await click('#关闭查找按钮');
    await pause(100);
    await settled();
  };
  await pause(100); await settled();
  await evaluate(`${state}
    window.getSelection().removeAllRanges();
    元素.滚动容器.focus();
    元素.查找输入框.value = '旧查询';
    const k = 状态.关键词列表.find(k => k.id === 状态.当前关键词id);
    k.当前命中idx = 2;
  `);
  await shortcut();
  assert.deepEqual(await evaluate(`${state}
    const k = 状态.关键词列表.find(k => k.id === 状态.查找临时关键词id);
    return [元素.查找输入框.value, k.当前命中idx];
  `), ['的', 2]);
  await query('他');
  await shortcut(4); // Command+F：已打开时不覆盖用户正在编辑的查询。
  assert.equal(await evaluate(`${state} return 元素.查找输入框.value;`), '他');
  await closeSearch();

  const selectedWord = await evaluate(`${state}
    元素.滚动容器.focus();
    const node = [...元素.可见内容.querySelectorAll('.字')].find(n => n.textContent.trim() && n.textContent.trim() !== '的');
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString().trim();
  `);
  assert.ok(selectedWord);
  await shortcut();
  assert.deepEqual(await evaluate(`${state}
    const k = 状态.关键词列表.find(k => k.id === 状态.查找临时关键词id);
    return [元素.查找输入框.value, k.文本, Number.isInteger(k.配色idx), document.activeElement === 元素.查找输入框];
  `), [selectedWord, selectedWord, true, true]);
  await closeSearch();
  await evaluate(`${state}
    window.getSelection().removeAllRanges();
    状态.当前关键词id = null;
    元素.查找输入框.value = '的';
  `);
  await shortcut(4);
  assert.equal(await evaluate(`${state} return 元素.查找输入框.value;`), '的');
  await closeSearch();
  assert.deepEqual(browserErrors, []);
  console.log('PASS Ctrl/Command+F selection, current keyword, previous query, repeated shortcut and preview color');
} finally {
  await send('Emulation.clearDeviceMetricsOverride');
  ws.close();
}
