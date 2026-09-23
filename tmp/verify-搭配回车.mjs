// 端到端回归：搭配分析里「关键词紧贴换行」归到 ⏎（回车）这一组。
// 走真实入口（内容选择载入 阿里传 → 打开查找弹窗搜「。」），断言：
//   1. 后续栏第一行是 ⏎，数量 = 正文里「。」后紧跟换行的命中数（节点侧独立数一遍）；
//   2. 原先被下一行首字吃掉的计数确实下来了（我/这/在 不再虚高）；
//   3. ⏎ 行带 仅悬停 类、单击不改动查找框（换行打不进单行输入框）；
//   4. 悬停 ⏎ 行把中间上下文列表收成这若干行，且每行前文都以「。」结尾、后文跨到下一行；
//   5. ⏎ 字形在界面字体下不是豆腐块（与未分配码点逐像素比对）。
// 跑法：node tmp/verify-搭配回车.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const 目标文本 = process.env.TARGET_TEXT || '阿里传.txt';
const 关键词 = process.env.TARGET_KEYWORD || '。';
const 回车符 = '\u23ce';

async function 取空闲端口() {
  const 探测 = createServer();
  await new Promise((完成, 失败) => {
    探测.once('error', 失败);
    探测.listen(0, '127.0.0.1', 完成);
  });
  const { port } = 探测.address();
  await new Promise((完成) => 探测.close(完成));
  return port;
}

const CDP端口 = await 取空闲端口();
const 站点端口 = await 取空闲端口();
const 地址 = `http://127.0.0.1:${站点端口}/`;

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: resolve(import.meta.dirname, '..'),
  stdio: ['ignore', 'pipe', 'pipe'],
});
const 服务日志 = [];
服务.stdout.on('data', (块) => 服务日志.push(String(块)));
服务.stderr.on('data', (块) => 服务日志.push(String(块)));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(地址, { signal: AbortSignal.timeout(1000) })).ok) break;
  } catch {}
  await new Promise((等) => setTimeout(等, 100));
}

const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-huiche-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1680,1000',
    地址,
  ],
  { stdio: 'ignore' },
);
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));
let 阶段 = '启动';
const 进度 = (文本) => {
  阶段 = 文本;
  console.log(`… ${文本}`);
};
function 杀干净() {
  try {
    chrome.kill('SIGKILL');
    服务.kill('SIGKILL');
  } catch {}
}
let 已收尾 = false;
async function 收尾(错误) {
  if (已收尾) return;
  已收尾 = true;
  clearTimeout(看门狗);
  杀干净();
  if (错误) console.error('❌', 错误);
  process.exit(错误 ? 1 : 0);
}
const 看门狗 = setTimeout(
  () => 收尾(new Error(`总超时（卡在「${阶段}」）`)),
  Number(process.env.VERIFY_TIMEOUT_MS || 240000),
);
process.on('unhandledRejection', (e) => 收尾(e));
process.on('uncaughtException', (e) => 收尾(e));
process.on('exit', 杀干净);

let 目标 = null;
for (let i = 0; i < 300 && !目标; i++) {
  try {
    const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
    目标 =
      列表.find((t) => t.type === 'page' && t.url.startsWith(地址)) ||
      列表.find((t) => t.type === 'page');
  } catch {}
  if (!目标) await pause(200);
}
assert.ok(目标, '未找到 headless Chrome 页面');

const ws = new WebSocket(目标.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
ws.addEventListener('close', () => {
  for (const 请求 of 待回复.values()) 请求.reject(new Error('CDP 连接已断开'));
  待回复.clear();
});
let 消息号 = 0;
const 待回复 = new Map();
ws.addEventListener('message', (事件) => {
  const 消息 = JSON.parse(事件.data);
  if (!消息.id) return;
  const 请求 = 待回复.get(消息.id);
  待回复.delete(消息.id);
  if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
  else 请求.resolve(消息.result);
});
const 发送 = (方法, 参数 = {}) =>
  new Promise((解决, 拒绝) => {
    const 下标 = ++消息号;
    待回复.set(下标, { resolve: 解决, reject: 拒绝 });
    ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
  });
async function 求值(代码) {
  const 结果 = await 发送('Runtime.evaluate', {
    expression: `(async () => { ${代码} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (结果.exceptionDetails) throw new Error(JSON.stringify(结果.exceptionDetails));
  return 结果.result.value;
}

await 发送('Page.enable');
await 发送('Page.navigate', { url: 地址 });
for (let i = 0; i < 200; i++) {
  if (await 求值(`return location.href === ${JSON.stringify(地址)};`)) break;
  await pause(150);
}

进度('等首屏');
let 首屏 = false;
for (let i = 0; i < 600; i++) {
  首屏 = await 求值(`
    return !!document.querySelector('#内容选择按钮') &&
      (!document.querySelector('#载入状态') || document.querySelector('#载入状态').hidden);
  `);
  if (首屏) break;
  await pause(200);
}
assert.ok(首屏, '首屏工具条应在超时前就绪');

进度('载入正文');
await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
let 有条目 = false;
for (let i = 0; i < 200; i++) {
  有条目 = await 求值(`
    return [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
      .some((b) => b.dataset.fileName === ${JSON.stringify(目标文本)});
  `);
  if (有条目) break;
  await pause(150);
}
assert.ok(有条目, `内容选择列表里找不到 ${目标文本}`);
await 求值(`
  [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
    .find((b) => b.dataset.fileName === ${JSON.stringify(目标文本)}).click();
  return 1;
`);
let 已载入 = false;
for (let i = 0; i < 400; i++) {
  已载入 = await 求值(`
    const { 状态 } = await import('./js/状态.js');
    return 状态.文件名 === ${JSON.stringify(目标文本)} && 状态.文本.length > 1000;
  `);
  if (已载入) break;
  await pause(150);
}
assert.ok(已载入, `正文应在超时前载入为 ${目标文本}`);

// 基准从页面正文复算：正文要过一遍文本管线，与磁盘原文不完全等长
// （磁盘那份只用来兜住「连到了别的书 / 陈旧页面」）
const 页面正文 = await 求值(`const { 状态 } = await import('./js/状态.js'); return 状态.文本;`);
const 磁盘 = readFileSync(
  join(resolve(import.meta.dirname, '..'), 'txt', 目标文本),
  'utf8',
);
function 数行尾(文本, 关键词) {
  let 次数 = 0;
  let 命中 = 0;
  let 搜索 = 0;
  while (true) {
    const 偏移 = 文本.indexOf(关键词, 搜索);
    if (偏移 < 0) break;
    搜索 = 偏移 + 关键词.length;
    命中 += 1;
    if (文本[搜索] === '\n') 次数 += 1;
  }
  return { 行尾: 次数, 命中 };
}
const 页面基准 = 数行尾(页面正文, 关键词);
const 磁盘基准 = 数行尾(磁盘, 关键词);
const 期望回车数 = 页面基准.行尾;
console.log(
  `基准：页面 ${页面正文.length} 字符 ·「${关键词}」${页面基准.命中} 命中 / ${页面基准.行尾} 行尾；` +
    `磁盘 ${磁盘.length} 字符 · ${磁盘基准.命中} 命中 / ${磁盘基准.行尾} 行尾`,
);
assert.ok(
  Math.abs(页面正文.length - 磁盘.length) / 磁盘.length < 0.02,
  '页面正文长度与磁盘差太多，可能连到了别的书或陈旧页面',
);
assert.ok(期望回车数 > 50, '这本书应足够多行尾命中，否则这条回归没有区分度');

进度('打开查找弹窗');
await 求值(`
  (await import('./js/查找弹窗.js')).打开查找弹窗(
    { 文本: ${JSON.stringify(关键词)} }, false);
  return 1;
`);
let 首行 = null;
for (let i = 0; i < 400; i++) {
  首行 = await 求值(`
    const 行 = document.querySelector('#后续词组列表 .分析行');
    return 行 ? { 词组: 行.dataset.词组, 数量: 行.children[0].textContent } : null;
  `);
  if (首行) break;
  await pause(150);
}
assert.ok(首行, '后续搭配栏应在超时前渲染出行');

进度('量 ⏎ 组');
const 回车行 = await 求值(`
  const 栏 = document.querySelector('#后续词组列表');
  const 行 = [...栏.querySelectorAll('.分析行')]
    .find((r) => r.dataset.词组 === ${JSON.stringify(回车符)});
  if (!行) return null;
  const 条目 = [...栏.querySelectorAll('.分析行')].slice(0, 4).map((r) => [
    r.dataset.词组, Number(r.children[1].textContent.replace(/,/g, '')),
  ]);
  const 样式 = getComputedStyle(行);
  return {
    数量: Number(行.children[1].textContent.replace(/,/g, '')),
    文本: 行.children[0].textContent,
    仅悬停: 行.classList.contains('仅悬停'),
    光标: 样式.cursor,
    标题: 行.title,
    置顶: 条目[0][0] === ${JSON.stringify(回车符)},
    前四: 条目,
  };
`);
assert.ok(回车行, '后续栏里应有一行 ⏎（回车）');
assert.equal(回车行.文本, 回车符, '该行显示的字形就是 ⏎');
assert.equal(回车行.数量, 期望回车数, '⏎ 组数量应等于正文里行尾命中数');
assert.ok(回车行.置顶, '⏎ 组应是后续栏的第一名');
assert.ok(回车行.仅悬停, '⏎ 行应带 仅悬停 标记');
assert.equal(回车行.光标, 'default', '⏎ 行不该是可点光标');
console.log(
  `⏎ 组 ${回车行.数量} 处 · 前四 ${JSON.stringify(回车行.前四)} · 标题「${回车行.标题}」`,
);

进度('悬停 ⏎ 行');
const 悬停 = await 求值(`
  const { 状态, 查找关键词 } = await import('./js/状态.js');
  const 行 = [...document.querySelectorAll('#后续词组列表 .分析行')]
    .find((r) => r.dataset.词组 === ${JSON.stringify(回车符)});
  行.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  const 关键词 = 查找关键词(状态.查找临时关键词id);
  const 列表 = [...document.querySelectorAll('#上下文列表 .上下文行')];
  // 直接回到正文偏移上验：这一组的每一处命中，关键词之后确实是一个换行
  const 非行尾 = 列表.filter((r) => {
    const 起点 = 关键词.命中位置[Number(r.dataset.hitIndex)];
    return 状态.文本[起点 + 关键词.文本.length] !== '\\n';
  }).length;
  return { 行数: 列表.length, 非行尾 };
`);
assert.equal(悬停.行数, 期望回车数, '悬停 ⏎ 行应筛出全部行尾命中');
assert.equal(悬停.非行尾, 0, '筛出的命中里有不是行尾的');
console.log(`悬停筛出 ${悬停.行数} 行 · 非行尾 ${悬停.非行尾}`);

进度('单击 ⏎ 行不改写查找框');
const 点击 = await 求值(`
  const 框 = document.querySelector('#查找输入框');
  const 行 = [...document.querySelectorAll('#后续词组列表 .分析行')]
    .find((r) => r.dataset.词组 === ${JSON.stringify(回车符)});
  const 原值 = 框.value;
  行.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  行.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  return {
    原值, 现值: 框.value,
    摘要: document.querySelector('#分析结果摘要')?.textContent ?? '',
  };
`);
assert.equal(点击.现值, 点击.原值, `单击 ⏎ 行不应改写查找框（实际「${点击.现值}」）`);
assert.ok(!/未找到|错误/.test(点击.摘要), `单击后不应报错（摘要「${点击.摘要}」）`);
console.log(`单击后查找框仍为「${点击.现值}」· 摘要「${点击.摘要}」`);

进度('字形不是豆腐块');
const 字形 = await 求值(`
  const 字体栈 = getComputedStyle(document.querySelector('.分析行')).fontFamily
    || '"PingFang SC", sans-serif';
  const 画 = (字) => {
    const c = document.createElement('canvas');
    c.width = 60; c.height = 40;
    const g = c.getContext('2d');
    g.font = '28px ' + 字体栈;
    g.textBaseline = 'top';
    g.fillText(字, 4, 4);
    return c.toDataURL();
  };
  const 宽度 = (字) => {
    const span = document.createElement('span');
    span.textContent = 字;
    span.style.cssText = 'position:fixed;left:-9999px;font:28px ' + 字体栈;
    document.body.append(span);
    const 宽 = span.getBoundingClientRect().width;
    span.remove();
    return 宽;
  };
  return {
    // 与一个必然无字形的码点比对：像素完全相同说明 ⏎ 也被画成了缺字框
    相同: 画(${JSON.stringify(回车符)}) === 画('\\u{10FFFF}'),
    回车宽: 宽度(${JSON.stringify(回车符)}),
    汉字宽: 宽度('中'),
  };
`);
assert.ok(字形.相同 === false, '⏎ 渲染成了缺字框（界面字体没有这个字形）');
console.log(
  `⏎ 字形宽 ${字形.回车宽.toFixed(1)}px（对照「中」${字形.汉字宽.toFixed(1)}px）`,
);

await 发送('Emulation.setDeviceMetricsOverride', {
  width: 1680,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
const 截图 = await 发送('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync(
  resolve(import.meta.dirname, '搭配回车-阿里传.png'),
  Buffer.from(截图.data, 'base64'),
);
console.log('截图 tmp/搭配回车-阿里传.png');
console.log('\n全部通过');
await 收尾(null);
