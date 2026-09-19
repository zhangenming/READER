// 长按正文命中词 → 打开该词的查找窗口（同 Ctrl + F）。
// 在隔离 Chrome 实例中运行：CDP_PORT=15922 node tests/keyword-longpress-browser.mjs
import assert from 'node:assert/strict';
const port = process.env.CDP_PORT;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(
  (t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:15921'),
);
assert.ok(target, 'reader browser tab');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const browserErrors = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    browserErrors.push(
      message.params.exceptionDetails.exception?.description ||
        message.params.exceptionDetails.text,
    );
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
const mouse = (type, x, y, buttons) =>
  send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: 'left',
    clickCount: 1,
    buttons,
  });
async function pressedHit() {
  return evaluate(`${state}
    元素.滚动容器.scrollTop = 1200;
    (await import('./js/虚拟渲染.js')).渲染可见行(true);
    await new Promise((r) => setTimeout(r, 150));
    const 节点 = [...元素.可见内容.querySelectorAll('.字.命中')].find((node) => {
      const r = node.getBoundingClientRect();
      return r.top > 40 && r.bottom < innerHeight - 40 && r.right < innerWidth - 60;
    });
    const rect = 节点.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      命中idx: Number(节点.dataset.hitIndex),
      关键词id: Number(节点.dataset.keywordId),
    };
  `);
}
async function popupState() {
  return evaluate(`${state} return {
    open: 元素.查找弹窗.open,
    查询: 元素.查找输入框.value,
    当前关键词id: 状态.当前关键词id,
    源命中idx: 状态.关键词列表.find((k) => k.id === 状态.当前关键词id)?.当前命中idx,
    临时命中idx: 状态.关键词列表.find((k) => k.id === 状态.查找临时关键词id)?.当前命中idx,
    上下文行数: document.querySelectorAll('.上下文行').length,
  };`);
}
async function settled() {
  for (let n = 0; n < 100; n++) {
    if (await evaluate(`${state} return !状态.滚动动画目标`)) return;
    await pause(50);
  }
  assert.fail('scroll animation timeout');
}

try {
  await send('Runtime.enable');
  await send('Page.bringToFront');
  await send('Page.reload', { ignoreCache: true });
  await ready();
  await settled();
  await evaluate(`${state}
    (await import('./js/关键词.js')).添加关键词标记('的', 状态.文本.indexOf('的'));
    状态.关键词面板展开 = false;
    (await import('./js/面板.js')).渲染关键词面板();
  `);

  // 长按命中词：弹窗填入该词，并定位到按住的那一处
  const hit = await pressedHit();
  await mouse('mousePressed', hit.x, hit.y, 1);
  await pause(120);
  assert.equal((await popupState()).open, false, '未到长按阈值不得打开');
  await pause(650);
  const 长按结果 = await popupState();
  assert.equal(长按结果.open, true, '长按打开了查找窗口');
  assert.equal(长按结果.查询, '的');
  assert.equal(长按结果.当前关键词id, hit.关键词id, '按住的词成为当前关键词');
  assert.equal(长按结果.源命中idx, hit.命中idx, '定位到按住的那一处命中');
  assert.equal(长按结果.临时命中idx, hit.命中idx, '查找窗口停在同一处');
  assert.ok(长按结果.上下文行数 > 0, '上下文列表已渲染');
  await mouse('mouseReleased', hit.x, hit.y, 0);
  await pause(300);
  assert.equal((await popupState()).open, true, '松手后弹窗保持打开');
  assert.equal(
    (await popupState()).临时命中idx,
    hit.命中idx,
    '松手的 click 没有再前进一格',
  );
  const 截图 = await send('Page.captureScreenshot', { format: 'png' });
  await (await import('node:fs/promises')).writeFile(
    '/tmp/reader-keyword-longpress.png',
    Buffer.from(截图.data, 'base64'),
  );
  await evaluate(`document.querySelector('#关闭查找按钮').click();`);
  await pause(200);
  await settled();
  assert.equal((await popupState()).open, false);
  console.log('PASS 长按命中词打开查找窗口并定位该处，松手不前进，截图 /tmp/reader-keyword-longpress.png');

  // 短按（< 长按阈值）仍是原来的单击前进，不打开弹窗
  const hit2 = await pressedHit();
  await mouse('mousePressed', hit2.x, hit2.y, 1);
  await pause(60);
  await mouse('mouseReleased', hit2.x, hit2.y, 0);
  await pause(600);
  await settled();
  const 短按结果 = await popupState();
  assert.equal(短按结果.open, false, '短按不打开查找窗口');
  assert.equal(短按结果.临时命中idx, undefined, '短按没有创建查找临时关键词');
  assert.equal(短按结果.当前关键词id, hit2.关键词id, '短按仍走单击前进');
  assert.ok(短按结果.源命中idx >= hit2.命中idx);
  console.log('PASS 短按保持单击前进', {
    点击命中: hit2.命中idx,
    前进到: 短按结果.源命中idx,
  });

  // 按住后拖动：越出死区即放弃长按判定，走原来的上下拖拽直达首/末个
  const hit3 = await pressedHit();
  await mouse('mousePressed', hit3.x, hit3.y, 1);
  await mouse('mouseMoved', hit3.x, hit3.y - 60, 1);
  await pause(700);
  assert.equal((await popupState()).open, false, '拖拽期间不触发长按');
  await mouse('mouseReleased', hit3.x, hit3.y - 60, 0);
  await pause(300);
  await settled();
  assert.equal((await popupState()).open, false);
  assert.equal(
    await evaluate(`${state} return 状态.关键词列表.find((k) => k.id === 状态.当前关键词id)?.当前命中idx;`),
    0,
    '向上拖拽直达第一个命中',
  );
  console.log('PASS 拖拽取消长按判定，上下拖拽语义不变');

  // 触摸长按：同一判定路径，原生 contextmenu 被压掉，松手也不会误建关键词
  const 持久词数 = await evaluate(`${state} return 状态.关键词列表.length;`);
  const hit4 = await pressedHit();
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: hit4.x, y: hit4.y }],
  });
  await pause(700);
  const 触摸结果 = await popupState();
  assert.equal(触摸结果.open, true, '触摸长按打开查找窗口');
  assert.equal(触摸结果.临时命中idx, hit4.命中idx);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause(400);
  assert.equal((await popupState()).open, true, '触摸松手后弹窗保持打开');
  assert.equal((await popupState()).临时命中idx, hit4.命中idx, '触摸松手不前进');
  await evaluate(`document.querySelector('#关闭查找按钮').click();`);
  await pause(200);
  await settled();
  assert.equal(
    await evaluate(`${state} return 状态.关键词列表.length;`),
    持久词数,
    '长按没有将选区建成新关键词',
  );
  console.log('PASS 触摸长按打开查找窗口，不选字、不建词');

  // 手机视口：弹窗几乎铺满屏幕，松手点正落在弹窗本体上，最容易被「点框内关闭」误伤
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 700,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await pause(700);
  const hit5 = await pressedHit();
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: hit5.x, y: hit5.y }],
  });
  await pause(700);
  assert.equal((await popupState()).open, true, '窄屏触摸长按打开查找窗口');
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause(400);
  assert.equal((await popupState()).open, true, '窄屏松手后弹窗保持打开');
  const 窄屏截图 = await send('Page.captureScreenshot', { format: 'png' });
  await (await import('node:fs/promises')).writeFile(
    '/tmp/reader-keyword-longpress-mobile.png',
    Buffer.from(窄屏截图.data, 'base64'),
  );
  await evaluate(`document.querySelector('#关闭查找按钮').click();`);
  await pause(200);
  await settled();
  assert.equal((await popupState()).open, false);
  console.log(
    'PASS 窄屏触摸长按保持打开，截图 /tmp/reader-keyword-longpress-mobile.png',
  );
  assert.deepEqual(browserErrors, []);
} finally {
  await send('Emulation.clearDeviceMetricsOverride');
  ws.close();
}
