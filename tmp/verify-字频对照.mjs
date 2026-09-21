// 端到端回归：词频弹窗「字频对照」tab。
// 页面侧走真实入口（内容选择 → 载入正文 → 打开词频弹窗），节点侧独立复算汉字计数、
// 万分之换算与显示格式，逐字比对 DOM 上的两个数字。
// 跑法：node tmp/verify-字频对照.mjs
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { 取知乎万分率 } from '../js/知乎字频.js';

// 汉字判定与 是汉字()（js/常量.js 的 汉字模式）同源，节点侧直接复述，
// 因为 常量.js 引用 document，无法在 node 里 import。
const 是汉字 = (字) => {
  const 码点 = 字.codePointAt(0);
  return (
    (码点 >= 0x3400 && 码点 <= 0x4dbf) ||
    (码点 >= 0x4e00 && 码点 <= 0x9fff) ||
    (码点 >= 0xf900 && 码点 <= 0xfaff) ||
    (码点 > 0x7f && /\p{Script=Han}/u.test(字))
  );
};

const CDP端口 = Number(process.env.VERIFY_CDP_PORT || 9412);
const 站点端口 = Number(process.env.SITE_PORT || 15998);
const 地址 = `http://127.0.0.1:${站点端口}/`;
const 目标文本 = '成吉思汗.txt';
const 每页 = 200;

// —— 节点侧基准：自己数汉字、自己换算万分之、自己格式化 ——
function 统计基准(文本) {
  let 总数 = 0;
  const 映射 = new Map();
  for (const 字 of 文本) {
    if (!是汉字(字)) continue;
    总数 += 1;
    映射.set(字, (映射.get(字) ?? 0) + 1);
  }
  return { 汉字总数: 总数, 计数: 映射 };
}

// 显示口径：≥10 向下取整（「的」403.89 → 403），其余取 3 位有效数字，查不到为「—」
function 期望显示(值) {
  if (值 === undefined) return '—';
  if (值 === 0) return '0';
  if (值 >= 10) return String(Math.floor(值));
  return 值.toPrecision(3);
}

function 构造期望行(计数, 汉字总数) {
  const 映射 = new Map();
  for (const [字, 数量] of 计数) {
    映射.set(字, [
      期望显示(取知乎万分率(字)),
      期望显示((数量 / 汉字总数) * 10000),
    ]);
  }
  return 映射;
}

let 汉字总数 = 0;
let 计数 = new Map();
let 期望行 = new Map();

function 清理端口() {
  // 断言抛出时子进程不会随 node 退出而死掉，残留的旧 Chrome / 旧服务会让下一次
  // 运行连到改动前的页面上，测出假的不一致。开跑前先把这两个端口清空。
  for (const 端口 of [站点端口, CDP端口]) {
    try {
      const pid列表 = execSync(`lsof -ti :${端口}`, { encoding: 'utf8' }).trim();
      if (pid列表) execSync(`kill -9 ${pid列表.split('\n').join(' ')}`);
    } catch {}
  }
}
清理端口();

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: resolve(import.meta.dirname, '..'),
  stdio: 'ignore',
});
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-zipin-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    地址,
  ],
  { stdio: 'ignore' },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function 收尾(错误) {
  if (错误) console.error(错误);
  chrome.kill();
  服务.kill();
  process.exit(错误 ? 1 : 0);
}
process.on('unhandledRejection', (e) => 收尾(e));
process.on('uncaughtException', (e) => 收尾(e));

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
  return new Promise((resolve2, reject) => {
    const 下标 = ++序号;
    待回复.set(下标, { resolve: resolve2, reject });
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
async function 截图(名字) {
  const { data } = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(import.meta.dirname, 名字), Buffer.from(data, 'base64'));
}

await 发送('Page.enable');

for (let i = 0; i < 200; i++) {
  if (
    await 求值(
      `return !document.querySelector('#载入状态') || document.querySelector('#载入状态').hidden;`,
    )
  )
    break;
  await pause(200);
}

// —— 走真实入口载入正文 ——
await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
await pause(2000);
await 求值(`
  [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
    .find((b) => b.dataset.fileName === ${JSON.stringify(目标文本)}).click();
  return 1;
`);
for (let i = 0; i < 200; i++) {
  const 已载入 = await 求值(`
    const { 状态 } = await import('./js/状态.js');
    return 状态.文件名 === ${JSON.stringify(目标文本)} && 状态.文本.length > 10000;
  `);
  if (已载入) break;
  await pause(200);
}
// 本书词频是就 状态.文本 定义的，取回正文后在节点侧独立复算
const 正文 = await 求值(
  `const { 状态 } = await import('./js/状态.js'); return 状态.文本;`,
);
({ 汉字总数, 计数 } = 统计基准(正文));
期望行 = 构造期望行(计数, 汉字总数);
console.log(`基准：${目标文本} 正文 ${正文.length} 字，汉字 ${汉字总数} 个 / 去重 ${计数.size} 字`);

// —— 打开词频弹窗（Ctrl/Cmd+A 走同一函数），等统计完成 ——
await 求值(`(await import('./js/词频弹窗.js')).打开词频弹窗(); return 1;`);
let 分析 = null;
for (let i = 0; i < 300; i++) {
  分析 = await 求值(`
    const { 状态 } = await import('./js/状态.js');
    return 状态.词频分析
      ? { 汉字总数: 状态.词频分析.汉字总数, 去重: 状态.词频分析.去重汉字数,
          页码: document.querySelector('#词频页码').textContent }
      : null;
  `);
  if (分析) break;
  await pause(200);
}
assert.ok(分析, '词频分析应在超时前完成');
assert.equal(分析.汉字总数, 汉字总数, '汉字总数应与磁盘基准一致');
assert.equal(分析.去重, 计数.size, '去重汉字数应与磁盘基准一致');

// —— 默认视图 = 第一个 tab「字频对照」——
const 首屏 = await 求值(`
  const 标签 = [...document.querySelectorAll('.词频标签')];
  const 当前 = 标签.find((b) => b.classList.contains('当前'));
  return {
    标签顺序: 标签.map((b) => [b.dataset.视图, b.textContent.trim()]),
    当前视图: 当前.dataset.视图,
    弹窗打开: document.querySelector('#词频弹窗').open,
    对照可见: !document.querySelector('#字频对照容器').hidden,
    单字可见: !document.querySelector('#单字双列表').hidden,
    组合可见: !document.querySelector('#词频表格容器').hidden,
    摘要: document.querySelector('#词频摘要').textContent,
    行数: document.querySelectorAll('#字频对照列表 tr').length,
    首行: [...document.querySelectorAll('#字频对照列表 tr')].slice(0, 3)
      .map((tr) => [...tr.children].map((td) => td.textContent)),
    页码: document.querySelector('#词频页码').textContent,
    上一页禁用: document.querySelector('#词频上一页').disabled,
  };
`);
assert.deepEqual(
  首屏.标签顺序.map(([, 名]) => 名),
  ['字频对照', '单字', '二字', '三字', '四字', '五字', '六字'],
  '新 tab 应排在最前面，其余顺序不变',
);
assert.equal(首屏.当前视图, '对照', '第一个 tab 应为当前视图');
assert.equal(首屏.对照可见, true);
assert.equal(首屏.单字可见, false, '单字双列表应已隐藏');
assert.equal(首屏.组合可见, false);
assert.equal(首屏.行数, Math.min(每页, 计数.size), '首页行数应为每页条数');
assert.equal(首屏.上一页禁用, true, '第一页时上一页应禁用');
assert.match(首屏.摘要, /万分之/, '摘要应说明万分之口径');
assert.ok(
  首屏.摘要.includes(`${计数.size.toLocaleString('zh-CN')} 字中`),
  `摘要去重字数不对：${首屏.摘要}`,
);
assert.equal(首屏.首行[0][1], 期望显示(取知乎万分率(首屏.首行[0][0])), '首行知乎列与基准不符');

await 截图('字频对照-第1页.png');

// —— 逐页翻完，DOM 上每个数字都和独立复算对得上 ——
const 收集行 = async () =>
  await 求值(`
    return [...document.querySelectorAll('#字频对照列表 tr')].map((tr) =>
      [...tr.children].map((td) => td.textContent));
  `);
const 全部行 = [];
let 已见页码 = null;
for (let 页 = 0; 页 < 200; 页 += 1) {
  const 页码 = await 求值(`return document.querySelector('#词频页码').textContent;`);
  assert.notEqual(页码, 已见页码, `翻页没生效，仍停在 ${页码}`);
  已见页码 = 页码;
  全部行.push(...(await 收集行()));
  const 到底 = await 求值(`return document.querySelector('#词频下一页').disabled;`);
  if (到底) break;
  await 求值(`document.querySelector('#词频下一页').click(); return 1;`);
  await pause(120);
}
assert.equal(全部行.length, 计数.size, '所有页行数应等于去重汉字数');
await 截图('字频对照-末页含缺表字.png');
const 坏行 = [];
const 显示和 = { 本书: 0, 知乎: 0 };
const 缺表字数 = 全部行.filter(([, 现代]) => 现代 === '—').length;
for (const [字, 现代, 本书] of 全部行) {
  const 期望 = 期望行.get(字);
  if (!期望) {
    坏行.push(`${字}: 基准里没有这个字`);
    continue;
  }
  if (期望[0] !== 现代) 坏行.push(`${字}: 知乎列 DOM=${现代} 基准=${期望[0]}`);
  if (期望[1] !== 本书) 坏行.push(`${字}: 本书列 DOM=${本书} 基准=${期望[1]}`);
  const 数量 = 计数.get(字);
  if (数量 > 0 && 本书 === '0') 坏行.push(`${字}: 出现过却显示 0`);
  显示和.本书 += (数量 / 汉字总数) * 10000;
  const 值 = 取知乎万分率(字);
  if (值 !== undefined) 显示和.知乎 += 值;
}
assert.deepEqual(坏行.slice(0, 8), [], `DOM 与独立复算不一致（共 ${坏行.length} 处）`);
assert.ok(
  Math.abs(显示和.本书 - 10000) < 0.01,
  `本书列应自洽合计 10000‱，实得 ${显示和.本书}`,
);
assert.ok(显示和.知乎 <= 10000 && 显示和.知乎 > 9000, `知乎列合计异常：${显示和.知乎}`);
assert.ok(缺表字数 > 0, '本书应含有现代字频表未收录的字，用于验证「—」分支');
assert.ok(
  首屏.摘要.includes(
    `${(计数.size - 缺表字数).toLocaleString('zh-CN')} 字有对照值`,
  ),
  `摘要命中字数应与「—」计数自洽：${首屏.摘要} / ${缺表字数}`,
);
// 行序：按本书频次降序
let 上一次数量 = Infinity;
for (const [字] of 全部行) {
  const 数量 = 计数.get(字);
  assert.ok(数量 <= 上一次数量, `行序未按本书频次降序：${字}`);
  上一次数量 = 数量;
}

// —— tab 切换与键盘方向键 ——
const 切换后 = await 求值(`
  [...document.querySelectorAll('.词频标签')].find((b) => b.dataset.视图 === '1').click();
  return {
    对照隐藏: document.querySelector('#字频对照容器').hidden,
    单字显示: !document.querySelector('#单字双列表').hidden,
    摘要: document.querySelector('#词频摘要').textContent,
    行数: document.querySelectorAll('#单字重复列表 tr').length,
  };
`);
const 重复单字数 = [...计数.values()].filter((n) => n > 1).length;
const 一次单字数 = [...计数.values()].filter((n) => n === 1).length;
assert.deepEqual(切换后, {
  对照隐藏: true,
  单字显示: true,
  摘要: `${计数.size.toLocaleString('zh-CN')} 个汉字 · ${一次单字数.toLocaleString('zh-CN')} 个字只出现一次`,
  行数: Math.min(每页, 重复单字数),
});
const 键盘后 = await 求值(`
  const 标签们 = [...document.querySelectorAll('.词频标签')];
  const 单字 = 标签们.find((b) => b.dataset.视图 === '1');
  单字.focus();
  单字.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  return {
    当前: [...document.querySelectorAll('.词频标签')].find((b) => b.classList.contains('当前')).dataset.视图,
    组合隐藏: document.querySelector('#词频表格容器').hidden,
    对照显示: !document.querySelector('#字频对照容器').hidden,
    行数: document.querySelectorAll('#字频对照列表 tr').length,
  };
`);
assert.deepEqual(键盘后, {
  当前: '对照',
  组合隐藏: true,
  对照显示: true,
  行数: Math.min(每页, 计数.size),
}, '左方向键应从单字回到字频对照');

await 截图('字频对照-回到对照tab.png');
console.log(
  `\nOK：${目标文本} ${汉字总数.toLocaleString('zh-CN')} 汉字 / ${计数.size.toLocaleString('zh-CN')} 去重字，` +
    `逐字比对 ${全部行.length} 行两列万分之全对（缺表 ${缺表字数} 字，知乎覆盖 ${显示和.知乎.toFixed(0)}‱，本书合计 ${显示和.本书.toFixed(0)}‱）`,
);
收尾();
