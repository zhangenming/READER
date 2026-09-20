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
const state = 'const { 状态, 元素 } = await import("./js/状态.js");';

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

// 滚动到某个字符偏移所在的行，并等待该行进入渲染窗口
async function scrollToOffset(offset) {
  const 行 = await evaluate(`${state}
    const 首 = 状态.行起点列表.findIndex((起点) => 起点 > ${offset});
    return 首 < 0 ? 状态.行起点列表.length - 1 : Math.max(0, 首 - 1);
  `);
  await evaluate(
    `${state} 元素.滚动容器.scrollTop = ${行} * 状态.行高 - 60;` +
      `(await import('./js/虚拟渲染.js')).渲染可见行(true);`,
  );
  await pause(120);
  return 行;
}

// 读取偏移处那个字素的可见字形与类名
function readChar(offset) {
  return evaluate(`${state}
    const el = document.querySelector(
      '.字[data-start="${offset}"][data-end="${offset + 1}"]',
    );
    return el
      ? { glyph: el.textContent, cls: el.className, len: 状态.文本.length }
      : null;
  `);
}

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 885,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.bringToFront');
  await send('Page.reload', { ignoreCache: true });
  await ready();
  await pause(600);

  const picks = await evaluate(`${state}
    const t = 状态.文本;
    const 代词 = new Set(['我', '你', '他']);
    const hit = { pronounMen: [], otherMen: [], solo: [] };
    for (let i = 0; i < t.length && i < 200000; i++) {
      if (t[i] !== '们') continue;
      const prev = t[i - 1];
      if (代词.has(prev)) {
        if (hit.pronounMen.length < 8) hit.pronounMen.push({ i, prev });
      } else if (hit.otherMen.length < 4) {
        hit.otherMen.push({ i, prev });
      }
    }
    for (const ch of ['我', '你', '他']) {
      const i = t.indexOf(ch);
      if (i >= 0 && hit.solo.length < 3) hit.solo.push({ i, prev: ch });
    }
    return { hit, total: t.length, file: 状态.文件名 };
  `);
  console.log('fixture:', picks.file, 'chars:', picks.total);
  console.log('picked:', JSON.stringify(picks.hit));
  assert.ok(picks.hit.pronounMen.length >= 3, '文本里要有足够的「X们」样本');

  const results = [];
  for (const { i, prev } of picks.hit.pronounMen) {
    await scrollToOffset(i - 1);
    const prevChar = await readChar(i - 1);
    const men = await readChar(i);
    results.push({ offset: i, prev, prevChar, men });
    const expected = { 我: 'W', 你: 'N', 他: 'T' }[prev];
    assert.ok(prevChar, `前字 ${i - 1} 未渲染`);
    assert.equal(prevChar.glyph, expected, `「${prev}」应为 ${expected}`);
    assert.ok(men, `「们」${i} 未渲染`);
    assert.equal(men.glyph, 'M', `「${prev}们」的「们」应渲染为 M，实际 ${men.glyph}`);
    assert.ok(men.cls.includes('代词字母'), 'M 需要 .代词字母 以便在字格内居中');
    assert.ok(men.cls.includes('人称代词'), 'M 需要保留 .人称代词 配色');
  }
  for (const { i, prev } of picks.hit.otherMen) {
    await scrollToOffset(i - 1);
    const men = await readChar(i);
    if (!men) continue;
    assert.equal(
      men.glyph,
      '们',
      `「${prev}们」不是人称复数，应保持汉字（实际 ${men.glyph}）`,
    );
    assert.ok(!men.cls.includes('代词字母'), '非人称的「们」不应带 .代词字母');
  }
  for (const { i } of picks.hit.solo) {
    await scrollToOffset(i);
    const ch = await readChar(i);
    if (ch) assert.ok('WNT'.includes(ch.glyph), `单独人称字仍应为字母，实际 ${ch.glyph}`);
  }

  // 底层文本不受影响：搜索/统计仍按原文取字
  const intact = await evaluate(`${state}
    return {
      menCount: (状态.文本.match(/们/g) || []).length,
      sample: 状态.文本.slice(${picks.hit.pronounMen[0].i - 4}, ${picks.hit.pronounMen[0].i + 1}),
    };
  `);
  assert.ok(intact.sample.includes('们'), '状态.文本 必须保持原文');
  console.log('原文未被改写:', intact.sample, '们 总数:', intact.menCount);
  console.log('样本:', results.map((r) => `${r.prev} -> ${r.prevChar.glyph}${r.men.glyph}`).join(' '));

  await scrollToOffset(picks.hit.pronounMen[0].i - 1);
  await pause(250);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const dir = process.env.SCREENSHOT_DIR || 'tmp';
  const fs = await import('node:fs');
  fs.writeFileSync(
    `${dir}/pronoun-m-${picks.hit.pronounMen[0].i}.png`,
    Buffer.from(shot.data, 'base64'),
  );

  assert.deepEqual(browserErrors, [], '浏览器运行时报错');
  console.log('PASS: 人称代词「们」渲染为 M');
} finally {
  ws.close();
}
