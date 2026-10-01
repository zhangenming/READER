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
let fixture = null;
ws.addEventListener('message', async (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
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
const index = 'const { 读取当前章节 } = await import("./js/章节目录.js");';
await send('Page.enable');
const original = await evaluate(
  'return localStorage.getItem("原文阅读器:阅读状态:v2")',
);
async function click(selector) {
  await evaluate(
    `document.querySelector(${JSON.stringify(selector)}).click();`,
  );
}
async function openToc() {
  await click('#章节目录按钮');
}
async function jump(idx) {
  await click(`[data-chapter-index="${idx}"]`);
  for (let n = 0; n < 100; n++) {
    if (await evaluate(`${state} return !状态.滚动动画目标`)) return;
    await pause(50);
  }
  throw new Error('chapter animation timeout');
}
async function resetReload(value = null) {
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source:
      value === null
        ? 'localStorage.removeItem("原文阅读器:阅读状态:v2")'
        : `localStorage.setItem("原文阅读器:阅读状态:v2", ${JSON.stringify(value)})`,
  });
  await send('Page.reload', { ignoreCache: true });
  await ready();
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
}
try {
  await resetReload();
  await openToc();
  assert.equal(
    await evaluate('return document.querySelector("#章节目录弹窗").open'),
    true,
  );
  // 虚拟列表：DOM 只挂可见窗口的行，条目完整性看内容层占位总高度（19 × 48px）
  assert.equal(
    await evaluate(
      'return document.querySelector("#章节目录内容").style.height',
    ),
    `${19 * 48}px`,
  );
  const 首屏行数 = await evaluate(
    'return document.querySelectorAll("#章节目录列表 button").length',
  );
  assert.ok(首屏行数 >= 1 && 首屏行数 <= 19, `windowed rows: ${首屏行数}`);
  await jump(2);
  assert.equal(
    await evaluate(`${state} ${index} return 读取当前章节().索引`),
    2,
  );
  assert.equal(
    await evaluate(
      `${state} return Math.abs(元素.滚动容器.scrollTop - (await import("./js/排版引擎.js")).查找偏移所在行(状态.章节列表[2].偏移) * 状态.行高) < 1`,
    ),
    true,
  );
  assert.equal(await evaluate('return document.activeElement.id'), '滚动容器');
  console.log(
    'PASS chapter navigation, current chapter, exact virtual row and focus',
  );

  const 首章刻度 = await evaluate(`${state}
    const { 读取滚动条度量, 滚动位置转轨道中心 } = await import('./js/滚动条.js');
    const { 查找偏移所在行 } = await import('./js/排版引擎.js');
    const 轨道高度 = 元素.滚动容器.clientHeight;
    const 度量 = 读取滚动条度量(轨道高度, 元素.滚动容器.clientHeight, 元素.滚动容器.scrollHeight);
    const 章节 = 状态.章节列表[1];
    const 滚动位置 = Math.max(0, 查找偏移所在行(章节.偏移) * 状态.行高 + 状态.行高 / 2 - 元素.滚动容器.clientHeight / 2);
    return { 偏移: 章节.偏移, 期望中心: 滚动位置转轨道中心(滚动位置, 度量), 章节数: 状态.章节列表.length, 轨道高度 };
  `);
  // 章节刻度已从白轴撤下（左缘只剩关键词刻度一列），这里只保住「章节偏移 → 轨道中心」
  // 这条坐标映射：它与关键词刻度、进度数字共用，映射错了三处一起偏。
  assert.ok(首章刻度.章节数 > 1);
  assert.ok(
    首章刻度.期望中心 > 0 && 首章刻度.期望中心 < 首章刻度.轨道高度,
    `chapter maps onto the track: ${首章刻度.期望中心} of ${首章刻度.轨道高度}`,
  );
  console.log('PASS chapter offset maps onto scrollbar track center');

  await openToc();
  await evaluate(
    'const input = document.querySelector("#章节搜索框"); input.value="不存在的章节"; input.dispatchEvent(new Event("input", {bubbles:true}));',
  );
  await pause(220);
  assert.equal(
    await evaluate(
      'return document.querySelectorAll("#章节目录列表 button").length',
    ),
    0,
  );
  assert.ok(
    (
      await evaluate(
        'return document.querySelector("#章节目录列表").textContent',
      )
    ).includes('没有匹配'),
  );
  await click('#定位当前章节按钮');
  assert.equal(
    await evaluate(
      'return document.querySelector("[aria-current=location]").dataset.chapterIndex',
    ),
    '2',
  );
  const oldTop = await evaluate(`${state} return 元素.滚动容器.scrollTop`);
  await evaluate(
    'window.dispatchEvent(new KeyboardEvent("keydown",{key:"d",ctrlKey:true,bubbles:true})); window.dispatchEvent(new CustomEvent("语音翻页",{detail:{指令:"下一页"}}));',
  );
  await pause(250);
  assert.equal(
    await evaluate(`${state} return 元素.滚动容器.scrollTop`),
    oldTop,
  );
  console.log(
    'PASS title search, empty result, current reset and modal navigation isolation',
  );
  await click('#关闭章节目录按钮');
  await pause(160);
  await send('Page.reload', { ignoreCache: true });
  await ready();
  assert.equal(await evaluate(`${index} return 读取当前章节().索引`), 2);
  const enlargedLineHeight = await evaluate(`${state} return 状态.行高 + 6`);
  await evaluate(
    `const { 调整字号 } = await import("./js/字体设置.js"); 调整字号(${enlargedLineHeight});`,
  );
  await pause(1200);
  assert.equal(await evaluate(`${state} return 状态.行高`), enlargedLineHeight);
  assert.equal(
    await evaluate(
      'return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--行高"))',
    ),
    enlargedLineHeight,
  );
  assert.equal(
    await evaluate(
      `${state} return 状态.排版键 === (await import("./js/排版引擎.js")).读取正文排版().键`,
    ),
    true,
  );
  assert.equal(await evaluate(`${index} return 读取当前章节().索引`), 2);
  await openToc();
  await jump(3);
  assert.equal(
    await evaluate(
      `${state} return Math.abs(元素.滚动容器.scrollTop - (await import("./js/排版引擎.js")).查找偏移所在行(状态.章节列表[3].偏移) * 状态.行高) < 1`,
    ),
    true,
  );
  console.log(
    'PASS reload persistence and correct chapter navigation after font reflow',
  );

  await openToc();
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
    await evaluate('return document.querySelector("#章节目录弹窗").open'),
    false,
  );
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await pause(150);
  await openToc();
  await click('[data-chapter-index="1"]');
  assert.equal(await evaluate(`${state} return 状态.滚动动画目标`), null);
  assert.equal(await evaluate(`${index} return 读取当前章节().索引`), 1);
  await send('Emulation.setEmulatedMedia', { features: [] });
  console.log('PASS Escape dismissal and reduced-motion instant navigation');

  const 右下三钮 = await evaluate(
    'const r = ["内容选择按钮", "章节目录按钮", "阅读统计按钮"].map(id => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return { id, left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), display: s.display, visibility: s.visibility }; }); return { r, innerWidth };',
  );
  assert.ok(
    右下三钮.r.every((x) => x.left >= 0 && x.right <= 右下三钮.innerWidth) &&
      右下三钮.r[0].right <= 右下三钮.r[1].left &&
      右下三钮.r[1].right <= 右下三钮.r[2].left,
    `右下三钮要左右有序且不越界：${JSON.stringify(右下三钮)}`,
  );
  await click('#阅读统计按钮');
  assert.equal(
    await evaluate('return document.querySelector("#阅读统计弹窗").open'),
    true,
  );
  assert.ok(
    (
      await evaluate(
        'return document.querySelector("#阅读统计内容").textContent',
      )
    ).includes('书籍明细'),
  );
  const statsTop = await evaluate(`${state} return 元素.滚动容器.scrollTop`);
  await evaluate(
    'window.dispatchEvent(new KeyboardEvent("keydown", {key:"d",ctrlKey:true})); window.dispatchEvent(new CustomEvent("语音翻页", {detail:{指令:"下一页"}}));',
  );
  await pause(200);
  assert.equal(
    await evaluate(`${state} return 元素.滚动容器.scrollTop`),
    statsTop,
  );
  await evaluate(
    'document.querySelector("#阅读统计弹窗").dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, clientX: 4, clientY: 4}));',
  );
  console.log(
    'PASS merged content, chapter and statistics controls remain usable without overlap',
  );

  await click('#内容选择按钮');
  await pause(900);
  assert.ok(
    await evaluate(
      'return !!document.querySelector(\'[data-file-name="笑傲江湖.txt"]\')',
    ),
  );
  await click('[data-file-name="香农传.txt"]');
  await ready();
  assert.equal(
    await evaluate(
      `${state} return 状态.章节列表.filter(c=>c.类型==="章节").length`,
    ),
    32,
  );
  await evaluate('(await import("./js/自动滚动.js")).开始自动滚动();');
  await pause(300);
  await openToc();
  assert.equal(
    await evaluate(
      'return (await import("./js/自动滚动.js")).自动滚动进行中()',
    ),
    false,
  );
  const firstIndex = await evaluate(
    `${state} return 状态.章节列表.findIndex(c=>c.标题.startsWith("第1章 "))`,
  );
  await jump(firstIndex);
  assert.equal(
    await evaluate(`${index} return 读取当前章节().索引`),
    firstIndex,
  );
  console.log(
    'PASS book switching, body-only chapters in repeated contents, auto-scroll pause',
  );

  fixture = Array.from(
    { length: 1001 },
    (_, i) => `第${i + 1}章 测试标题\n${'这是正文。'.repeat(40)}\n`,
  ).join('');
  await send('Fetch.enable', {
    patterns: [{ urlPattern: '*txt/*.txt', requestStage: 'Request' }],
  });
  await resetReload();
  assert.equal(await evaluate(`${state} return 状态.章节列表.length`), 1001);
  await openToc();
  // 虚拟列表：DOM 行数与总章数解耦（这里必须远小于 1001），
  // 完整性由内容层占位高度 1001 × 48px 表达。
  assert.ok(
    await evaluate(
      'return document.querySelectorAll("#章节目录列表 button").length < 100',
    ),
  );
  assert.equal(
    await evaluate(
      'return document.querySelector("#章节目录内容").style.height',
    ),
    `${1001 * 48}px`,
  );
  // 滚到底：末章进入渲染窗口；滚回顶：首章回到窗口首行
  await evaluate(
    'const 列表 = document.querySelector("#章节目录列表"); 列表.scrollTop = 列表.scrollHeight;',
  );
  await pause(120);
  assert.equal(
    await evaluate(
      'return Math.max(...[...document.querySelectorAll("#章节目录列表 button")].map((b) => Number(b.dataset.chapterIndex)))',
    ),
    1000,
  );
  await evaluate(
    'const 列表 = document.querySelector("#章节目录列表"); 列表.scrollTop = 0;',
  );
  await pause(120);
  assert.equal(
    await evaluate(
      'return document.querySelector("#章节目录列表 button").dataset.chapterIndex',
    ),
    '0',
  );
  await evaluate(
    'const input=document.querySelector("#章节搜索框");input.value="第999章";input.dispatchEvent(new Event("input",{bubbles:true}));',
  );
  await pause(220);
  assert.equal(
    await evaluate(
      'return document.querySelectorAll("#章节目录列表 button").length',
    ),
    1,
  );
  await jump(998);
  await openToc();
  assert.equal(
    await evaluate(
      'return document.querySelector("[aria-current=location]").dataset.chapterIndex',
    ),
    '998',
  );
  assert.ok(
    await evaluate(
      'const list=document.querySelector("#章节目录列表"); const item=list.querySelector("[aria-current=location]"); return item.getBoundingClientRect().top >= list.getBoundingClientRect().top && item.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom;',
    ),
  );
  assert.ok(
    await evaluate(`${state} return 元素.可见内容.children.length < 100`),
  );
  console.log(
    'PASS 1001-chapter virtual list: bounded DOM, window follows scroll, filtered jump and centered current restore',
  );

  await click('#关闭章节目录按钮');
  await pause(160);
  // 正文标题行点击跳章：与关键词命中跳转同款落点——目标章标题落回被点标题
  // 的同一屏幕高度，不再顶成第一行；目录跳转（上方用例）仍走置顶，两条路径在此分野。
  const 标题落点 = await evaluate(`${state}
    const { 查找偏移所在行 } = await import("./js/排版引擎.js");
    const 行idx = 查找偏移所在行(状态.章节列表[500].偏移);
    元素.滚动容器.scrollTop = 行idx * 状态.行高 - 状态.行高 * 2;
    return 行idx;
  `);
  await pause(250);
  const 被点标题位置 = await evaluate(`${state}
    const 行元素 = 元素.可见内容.querySelector(
      '.正文行.章节标题行[data-chapter-index="500"]',
    );
    if (!行元素) return null;
    return (
      行元素.getBoundingClientRect().top -
      元素.滚动容器.getBoundingClientRect().top
    );
  `);
  assert.ok(被点标题位置 !== null, 'rendered title row of chapter 500');
  await evaluate(
    `${state}
      元素.可见内容
        .querySelector('.正文行.章节标题行[data-chapter-index="500"]')
        .click();`,
  );
  let 下一标题位置 = null;
  for (let n = 0; n < 100 && 下一标题位置 === null; n++) {
    await pause(50);
    下一标题位置 = await evaluate(`${state}
      if (状态.滚动动画目标) return null;
      const 行元素 = 元素.可见内容.querySelector(
        '.正文行.章节标题行[data-chapter-index="501"]',
      );
      if (!行元素) return null;
      return (
        行元素.getBoundingClientRect().top -
        元素.滚动容器.getBoundingClientRect().top
      );
    `);
  }
  assert.ok(下一标题位置 !== null, 'next chapter title rendered after click');
  assert.ok(
    Math.abs(下一标题位置 - 被点标题位置) < 2,
    `下一章标题要落回被点标题的屏幕位置：${下一标题位置} vs ${被点标题位置}`,
  );
  assert.ok(
    await evaluate(`${state}
      const { 查找偏移所在行 } = await import("./js/排版引擎.js");
      const 期望 = 查找偏移所在行(状态.章节列表[501].偏移) * 状态.行高 - 状态.行高 * 2;
      return Math.abs(元素.滚动容器.scrollTop - 期望) < 1;
    `),
    'scrollTop anchors the next title two rows below the viewport top',
  );
  console.log(
    'PASS in-text title click keeps the clicked screen row for the next chapter',
  );
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 667,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await pause(350);
  await openToc();
  assert.ok(
    await evaluate(
      'const r=document.querySelector("#章节目录弹窗").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;',
    ),
  );
  console.log('PASS narrow-screen dialog fits viewport');
  await click('#关闭章节目录按钮');
  // 无章节文本：章节列表为空，定位按钮禁用（章节刻度已随左缘那一列撤下）
  fixture = '没有章节的短文本。\n普通正文内容。';
  await resetReload();
  await evaluate(`(await import('./js/指示器.js')).更新关键词指示器();`);
  await openToc();
  assert.equal(await evaluate(`${state} return 状态.章节列表.length`), 0);
  assert.equal(
    await evaluate(
      'return document.querySelector("#定位当前章节按钮").disabled',
    ),
    true,
  );
  assert.ok(
    (
      await evaluate(
        'return document.querySelector("#章节目录列表").textContent',
      )
    ).includes('未识别到章节'),
  );
  assert.equal(
    await evaluate(
      'return document.querySelector("#章节目录内容").children.length',
    ),
    1,
  );
  console.log('PASS no-chapter empty state on a one-screen book');

  fixture = `第一章\n${'正文。'.repeat(100)}\n第二章\n最后一段。`;
  await resetReload();
  await openToc();
  await jump(1);
  assert.equal(await evaluate(`${index} return 读取当前章节().索引`), 1);
  await evaluate(
    `${state} 元素.滚动容器.scrollTop = 元素.滚动容器.scrollHeight;`,
  );
  assert.equal(await evaluate(`${index} return 读取当前章节().进度`), 1);
  console.log('PASS final short chapter and end-of-book progress');
} finally {
  await evaluate(
    'if(document.querySelector("#章节目录弹窗").open)document.querySelector("#章节目录弹窗").close();',
  );
  await pause(180);
  await send('Fetch.disable');
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await resetReload(original);
  ws.close();
}
