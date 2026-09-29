import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// 批量导入关键词的浏览器实测：面板右上角入口 → 弹窗一行一个 → 导入后的账。
// 由 tmp/跑-浏览器回归.mjs 拉起（独立 profile，已载入一本书）后运行。
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
    throw new Error(
      result.exceptionDetails.exception?.description ||
        JSON.stringify(result.exceptionDetails),
    );
  return result.result.value;
}
async function mouse(类型, x, y) {
  await send('Input.dispatchMouseEvent', {
    type: 类型,
    x,
    y,
    button: 'left',
    clickCount: 1,
    buttons: 类型 === 'mouseMoved' ? 0 : 1,
  });
}
async function screenshot(路径) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(路径, Buffer.from(data, 'base64'));
}
const pause = (毫秒) => new Promise((resolve) => setTimeout(resolve, 毫秒));

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.reload', { ignoreCache: true });
  let ready = false;
  for (let n = 0; n < 200; n++) {
    await pause(100);
    ready = await evaluate(
      'return document.querySelector("#载入状态")?.hidden === true',
    );
    if (ready) break;
  }
  assert.ok(ready, 'reader loaded');

  // 干净起点：清空关键词面板，验证「面板未展开时没有入口」这一既有可见性规则。
  await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    状态.关键词列表 = [];
    状态.当前关键词id = null;
    状态.关键词面板展开 = true;
    const { 渲染关键词面板 } = await import('./js/面板.js');
    渲染关键词面板();
    return 1;
  `);
  const 零关键词面板 = await evaluate(
    'return [document.querySelector("#关键词面板").hidden, document.querySelectorAll(".关键词批量钮").length]',
  );
  assert.equal(
    零关键词面板.join(','),
    'true,0',
    '零关键词时面板整体隐藏，入口也随面板不出现',
  );

  // 启动器载入的书不固定，先从真实正文里挑两个本书出现的词。
  const 测试词 = await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    const { 查找关键词命中 } = await import('./js/关键词.js');
    const 已见 = new Set();
    const 候选 = [];
    for (const 词 of 状态.文本.match(/[\\u4e00-\\u9fff]{2}/g) ?? []) {
      if (已见.has(词)) continue;
      已见.add(词);
      if (查找关键词命中(词).length >= 2) {
        候选.push(词);
        if (候选.length === 2) break;
      }
    }
    return 候选;
  `);
  assert.equal(测试词.length, 2, '从当前正文里取到两个测试词');
  const [种子词, 新词] = 测试词;
  const 未出现词 = 'zzz不存在的词zzz';

  // 正文选词建第一个标记 → 面板出现 → 排序栏右端应有「批量」。
  await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    const { 添加关键词标记 } = await import('./js/关键词.js');
    添加关键词标记(${JSON.stringify(种子词)}, 状态.文本.indexOf(${JSON.stringify(种子词)}));
    return 状态.关键词列表.length;
  `);
  await pause(200);
  assert.equal(
    await evaluate('return document.querySelectorAll(".关键词批量钮").length'),
    1,
    '面板展开后排序栏右端有批量入口',
  );
  assert.equal(
    await evaluate(
      'return document.querySelector(".关键词批量钮").closest(".关键词排序栏").lastElementChild.className',
    ),
    '关键词排序钮 关键词批量钮',
    '批量钮排在排序栏末尾（右端）',
  );

  await evaluate('document.querySelector(".关键词批量钮").click()');
  await pause(150);
  assert.equal(
    await evaluate(
      'return [document.querySelector("#批量导入弹窗").open, document.activeElement?.id].join(",")',
    ),
    'true,批量导入输入框',
    '点击批量打开弹窗并聚焦输入框',
  );
  assert.equal(
    await evaluate(
      'return document.querySelector("#批量导入确认按钮").disabled',
    ),
    true,
    '空输入时导入按钮不可用',
  );

  // 一行一个：混合 已存在 / 待导入 / 空行 / 本次重复 / 本书未出现
  const 输入文本 = [种子词, 新词, '', 新词, 未出现词].join('\n');
  await evaluate(`
    const 框 = document.querySelector('#批量导入输入框');
    框.value = ${JSON.stringify(输入文本)};
    框.dispatchEvent(new Event('input', { bubbles: true }));
    return 框.value.split('\\n').length;
  `);
  await pause(300);
  assert.equal(
    await evaluate(
      'return document.querySelector("#批量导入反馈").textContent',
    ),
    '共 5 行 · 待导入 2 · 已存在 1 · 本次重复 1 · 空行 1',
    '实时计数把四类账分开且对得上总行数',
  );
  assert.equal(
    await evaluate(
      'return document.querySelector("#批量导入确认按钮").disabled',
    ),
    false,
    '有待导入词时按钮可用',
  );
  await screenshot(
    fileURLToPath(new URL('../tmp/批量导入-弹窗.png', import.meta.url)),
  );

  await evaluate('document.querySelector("#批量导入确认按钮").click()');
  await pause(300);
  const 关键词文本 = await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    return 状态.关键词列表.filter((k) => !k.临时).map((k) => k.文本).join(',');
  `);
  assert.equal(
    关键词文本,
    [种子词, 新词].join(','),
    '只导入本书有的词，未出现的不建标记',
  );
  assert.equal(
    await evaluate(`
      const { 状态 } = await import('./js/状态.js');
      const 导入的新词 = 状态.关键词列表.find((k) => k.文本 === ${JSON.stringify(新词)});
      return [状态.当前关键词id === 导入的新词.id, 导入的新词.当前命中idx, 导入的新词.命中位置.length > 0].join(',');
    `),
    'true,0,true',
    '第一个新词被选中并落在首个命中',
  );
  assert.equal(
    await evaluate(
      'return document.querySelector("#批量导入结果").textContent',
    ),
    `已导入 1 · 本书未出现 1：「${未出现词}」`,
    '结果行把待导入拆成已导入与未出现',
  );
  assert.equal(
    await evaluate(
      'return document.querySelector("#批量导入反馈").textContent',
    ),
    '共 5 行 · 待导入 1 · 已存在 2 · 本次重复 1 · 空行 1',
    '导入后重算：已导入的词转为已存在',
  );
  // 「导入」按钮在面板之外，按既有规则点它会收起面板；重新展开再数行。
  const 面板计数 = await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    const { 渲染关键词面板 } = await import('./js/面板.js');
    状态.关键词面板展开 = true;
    渲染关键词面板();
    return [document.querySelectorAll(".关键词项").length, document.querySelector("#关键词面板开关").textContent];
  `);
  assert.equal(面板计数.join('|'), '2|关键词 2', '面板与胶囊计数同步');
  const 当前项文字 = await evaluate(
    'return document.querySelector(".关键词项.当前 .关键词文字")?.textContent',
  );
  assert.equal(当前项文字, 新词, '面板高亮当前关键词');
  await screenshot(
    fileURLToPath(new URL('../tmp/批量导入-导入后.png', import.meta.url)),
  );

  // 点遮罩（弹窗矩形之外）关闭：真实坐标事件，不派发自定义 click。
  await mouse('mouseMoved', 20, 20);
  await mouse('mousePressed', 20, 20);
  await mouse('mouseReleased', 20, 20);
  await pause(200);
  assert.equal(
    await evaluate('return document.querySelector("#批量导入弹窗").open'),
    false,
    '点击遮罩关闭弹窗',
  );

  // 弹窗打开时键盘翻页应被拦下（有弹窗打开 已登记本弹窗）
  const 弹窗内按键 = await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    const { 有弹窗打开, 渲染关键词面板 } = await import('./js/面板.js');
    状态.关键词面板展开 = true;
    渲染关键词面板();
    document.querySelector('.关键词批量钮').click();
    const 打开中 = 有弹窗打开();
    document.querySelector('#批量导入弹窗').close();
    return 打开中;
  `);
  assert.equal(弹窗内按键, true, '批量弹窗计入「有弹窗打开」');

  // 面板与入口的视觉留档：右下角按钮组常驻显形，鼠标不在角落也要可见。
  await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    状态.关键词面板展开 = true;
    const { 渲染关键词面板 } = await import('./js/面板.js');
    渲染关键词面板();
    return 1;
  `);
  await pause(300);
  await screenshot(
    fileURLToPath(new URL('../tmp/批量导入-面板入口.png', import.meta.url)),
  );
  assert.equal(
    await evaluate(`
      return getComputedStyle(document.querySelector('#关键词面板开关')).opacity;
    `),
    '1',
    '右下角控件常驻显形，无需悬停（截图可用）',
  );

  // 刷新后仍在：批量导入的词与正文选词走同一份持久化关键词列表（防抖 120ms，已等过）。
  await send('Page.reload', { ignoreCache: true });
  let 再次就绪 = false;
  for (let n = 0; n < 200; n++) {
    await pause(100);
    再次就绪 = await evaluate(
      'return document.querySelector("#载入状态")?.hidden === true',
    );
    if (再次就绪) break;
  }
  assert.ok(再次就绪, '刷新后正文重新载入');
  const 刷新后关键词 = await evaluate(`
    const { 状态 } = await import('./js/状态.js');
    return 状态.关键词列表.filter((k) => !k.临时).map((k) => k.文本).join(',');
  `);
  assert.equal(
    刷新后关键词,
    [种子词, 新词].join(','),
    '刷新后批量导入的关键词仍在面板上',
  );
} finally {
  ws.close();
}
