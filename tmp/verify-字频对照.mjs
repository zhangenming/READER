// 端到端回归：词频弹窗的三个视图都走虚拟列表（无翻页）。
// 页面侧走真实入口（内容选择 → 载入正文 → 打开词频弹窗），节点侧独立复算汉字计数、
// 万分之换算与显示格式；再按滚动位置逐段读窗口，要求「滚遍全表 = 每行都出现过且都对」，
// 同时断言任意时刻 DOM 里只有几十行（真的虚拟，而不是一次铺完）。
// 跑法：node tmp/verify-字频对照.mjs
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { 取知乎万分率 } from '../js/知乎字频.js';

const CDP端口 = Number(process.env.VERIFY_CDP_PORT || 9412);
const 站点端口 = Number(process.env.SITE_PORT || 15998);
const 地址 = `http://127.0.0.1:${站点端口}/`;
const 目标文本 = '成吉思汗.txt';
const 缓冲行数 = 8; // 与 js/常量.js 的 虚拟列表缓冲行数 一致

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

// 显示口径：≥10 向下取整（「的」403.89 → 403），其余 3 位有效数字，查不到为「—」
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
let 单字序列 = []; // 本书汉字，按本书频次降序（与页面同一顺序，用于校验窗口起点）

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
// 读一张表当前的窗口：真实行（带 data-序号）与占位行分开统计
async function 读窗口(表体选择器) {
  return 求值(`
    const 表体 = document.querySelector(${JSON.stringify(表体选择器)});
    const 容器 = 表体.closest('.词频表格容器, .单字双列表');
    const 行列表 = [...表体.children];
    const 真实行 = 行列表.filter((行) => !行.classList.contains('虚拟占位'));
    return {
      容器滚动高: 容器.scrollHeight,
      容器视口高: 容器.clientHeight,
      容器顶: 容器.scrollTop,
      表格高: 表体.closest('table').offsetHeight,
      表体高: 表体.offsetHeight,
      行高: 真实行[0]?.offsetHeight ?? 0,
      DOM行数: 真实行.length,
      占位数: 行列表.length - 真实行.length,
      序号: 真实行.map((行) => Number(行.dataset.序号)),
      行: 真实行.map((行) => [...行.children].map((格) => 格.textContent)),
    };
  `);
}
async function 滚到(容器选择器, 顶) {
  await 求值(`
    document.querySelector(${JSON.stringify(容器选择器)}).scrollTop = ${顶};
    return 1;
  `);
  await pause(90); // 等一帧 rAF 渲染
}
function 断言窗口连续(窗口, 说明) {
  const { 序号: 序号列表 } = 窗口;
  for (let i = 1; i < 序号列表.length; i += 1) {
    assert.equal(
      序号列表[i],
      序号列表[i - 1] + 1,
      `${说明}：渲染行序号不连续 ${序号列表[i - 1]} → ${序号列表[i]}`,
    );
  }
}

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
          单字数: 状态.词频分析.列表[1].length,
          二字数: 状态.词频分析.列表[2].length,
          重复数: 状态.词频分析.单字列表.重复.length,
          一次数: 状态.词频分析.单字列表.一次.length }
      : null;
  `);
  if (分析) break;
  await pause(200);
}
assert.ok(分析, '词频分析应在超时前完成');
assert.equal(分析.汉字总数, 汉字总数, '汉字总数应与磁盘基准一致');
assert.equal(分析.去重, 计数.size, '去重汉字数应与磁盘基准一致');
assert.equal(分析.重复数 + 分析.一次数, 计数.size, '重复 + 只出现一次 应等于去重数');
单字序列 = await 求值(`
  const { 状态 } = await import('./js/状态.js');
  return 状态.词频分析.列表[1].map((项) => 项.文本);
`);
assert.deepEqual(
  单字序列,
  [...计数.entries()].sort((左, 右) => 右[1] - 左[1]).map(([字]) => 字),
  '页面单字顺序应与节点基准一致',
);

// —— 翻页控件应已彻底移除 ——
const 结构 = await 求值(`
  return {
    分页节点: document.querySelector('#词频分页'),
    标签顺序: [...document.querySelectorAll('.词频标签')].map((b) => b.textContent.trim()),
    当前视图: [...document.querySelectorAll('.词频标签')].find((b) =>
      b.classList.contains('当前')).dataset.视图,
    可聚焦: ['#字频对照容器', '#单字双列表', '#词频表格容器'].map((选择) =>
      document.querySelector(选择).tabIndex),
    弹窗打开: document.querySelector('#词频弹窗').open,
    摘要: document.querySelector('#词频摘要').textContent,
  };
`);
assert.equal(结构.分页节点, null, '翻页控件应已删除');
assert.deepEqual(结构.标签顺序, ['字频对照', '单字', '二字', '三字', '四字', '五字', '六字']);
assert.equal(结构.当前视图, '对照', '默认停在第一个 tab');
assert.deepEqual(结构.可聚焦, [0, 0, 0], '列表容器应可聚焦以便键盘滚动');
assert.match(结构.摘要, /万分之/);
assert.ok(
  结构.摘要.includes(`${计数.size.toLocaleString('zh-CN')} 字中`),
  `摘要去重字数不对：${结构.摘要}`,
);

// —— 对照视图：DOM 只有窗口内的行，总高度按全量撑起 ——
const 首屏 = await 读窗口('#字频对照列表');
断言窗口连续(首屏, '字频对照首屏');
assert.equal(首屏.序号[0], 0, '首屏第一行应是全书最高频字');
assert.ok(首屏.DOM行数 < 分析.单字数 / 4, `DOM 行数没体现虚拟：${首屏.DOM行数}`);
assert.ok(首屏.DOM行数 >= 首屏.容器视口高 / 首屏.行高, '视口内应有足够行，不能裁切');
assert.ok(
  Math.abs(首屏.表体高 - 分析.单字数 * 首屏.行高) <= 首屏.行高,
  `占位行撑出的表体高应≈全量行高：${首屏.表体高} vs ${分析.单字数 * 首屏.行高}`,
);
assert.equal(首屏.行[0][0], 单字序列[0]);
assert.equal(首屏.行[0][1], 期望显示(取知乎万分率(单字序列[0])));
await 截图('字频对照-顶部.png');

// —— 滚遍全表：每行都出现过、每行两列都对、窗口起点始终跟滚动位置对得上 ——
const 见过 = new Map();
const 步长 = Math.max(首屏.行高, 首屏.容器视口高 - 缓冲行数 * 首屏.行高);
for (let 顶 = 0; 顶 <= 首屏.容器滚动高; 顶 += 步长) {
  await 滚到('#字频对照容器', 顶);
  const 窗口 = await 读窗口('#字频对照列表');
  断言窗口连续(窗口, `对照 scrollTop=${顶}`);
  assert.equal(
    窗口.序号[0],
    // 用容器实际的 scrollTop 判断：超出最大滚动距离时浏览器会夹取，请求值可能更大
    Math.max(0, Math.floor(窗口.容器顶 / 窗口.行高) - 缓冲行数),
    `对照窗口起点与 scrollTop 不符（scrollTop=${窗口.容器顶}，请求 ${顶}）`,
  );
  assert.ok(
    窗口.DOM行数 <= Math.ceil(窗口.容器视口高 / 窗口.行高) + 2 * 缓冲行数 + 2,
    `对照窗口行数超上限：${窗口.DOM行数}`,
  );
  窗口.序号.forEach((行序号, i) => {
    const 字 = 窗口.行[i][0];
    assert.equal(字, 单字序列[行序号], `第 ${行序号} 行字不对：DOM=${字}`);
    const 基准 = 期望行.get(字);
    if (
      见过.has(行序号) &&
      (见过.get(行序号)[1] !== 基准[0] || 见过.get(行序号)[2] !== 基准[1])
    ) {
      throw new Error(`${字} 两列值前后不一致：${见过.get(行序号)} vs ${窗口.行[i]}`);
    }
    见过.set(行序号, [字, 窗口.行[i][1], 窗口.行[i][2]]);
  });
}
assert.equal(见过.size, 分析.单字数, '滚遍全表应覆盖每一个汉字');
assert.deepEqual(
  [...见过.keys()],
  [...见过.keys()].sort((左, 右) => 左 - 右),
  '覆盖顺序应单调递增',
);
for (const [行序号, [字, 现代, 本书]] of 见过) {
  const 基准 = 期望行.get(字);
  assert.equal(现代, 基准[0], `${字} 知乎列 DOM=${现代} 基准=${基准[0]}`);
  assert.equal(本书, 基准[1], `${字} 本书列 DOM=${本书} 基准=${基准[1]}`);
  if (计数.get(字) > 0 && 本书 === '0') {
    throw new Error(`${字} 出现过却显示 0`);
  }
  assert.equal(行序号, 单字序列.indexOf(字), `${字} 行序与列表不一致`);
}
const 缺表字数 = [...见过.values()].filter(([, 现代]) => 现代 === '—').length;
assert.ok(缺表字数 > 0, '本书应含有现代字频表未收录的字，用于验证「—」分支');
assert.ok(
  结构.摘要.includes(
    `${(计数.size - 缺表字数).toLocaleString('zh-CN')} 字有对照值`,
  ),
  `摘要命中字数应与「—」计数自洽：${结构.摘要} / ${缺表字数}`,
);
const 本书列合计 = [...计数.values()].reduce(
  (累计, 数量) => 累计 + (数量 / 汉字总数) * 10000,
  0,
);
assert.ok(Math.abs(本书列合计 - 10000) < 0.01, `本书列应合计 10000‱：${本书列合计}`);

// —— 滚到底：最后一行是全表末位，且不再有多余 DOM ——
await 滚到('#字频对照容器', 首屏.容器滚动高);
const 末页 = await 读窗口('#字频对照列表');
assert.equal(末页.序号[末页.序号.length - 1], 分析.单字数 - 1, '末行应为最后一个汉字');
assert.equal(末页.占位数 >= 1, true, '底部窗口上方应有占位行');
await 截图('字频对照-底部.png');

// —— 单字视图：两张表共用一个滚动容器，各自按自己的行数撑高 ——
await 求值(`
  [...document.querySelectorAll('.词频标签')].find((b) => b.dataset.视图 === '1').click();
  return 1;
`);
await pause(150);
const 重复窗 = await 读窗口('#单字重复列表');
const 一次窗 = await 读窗口('#单字一次列表');
断言窗口连续(重复窗, '单字重复');
断言窗口连续(一次窗, '单字一次');
assert.equal(重复窗.序号[0], 0);
assert.equal(一次窗.序号[0], 0);
assert.ok(重复窗.DOM行数 < 分析.重复数 / 4, '重复表也应虚拟');
assert.ok(
  Math.abs(重复窗.表体高 - 分析.重复数 * 重复窗.行高) <= 重复窗.行高,
  `重复表表体高应≈自己的行数：${重复窗.表体高} vs ${分析.重复数 * 重复窗.行高}`,
);
assert.ok(
  Math.abs(一次窗.表体高 - 分析.一次数 * 一次窗.行高) <= 一次窗.行高,
  `一次表表体高应≈自己的行数：表体高=${一次窗.表体高} 行数=${分析.一次数} 行高=${一次窗.行高} ` +
    `DOM行数=${一次窗.DOM行数} 占位数=${一次窗.占位数} 序号=${一次窗.序号.slice(0, 2)}~${一次窗.序号.slice(-1)}`,
);
assert.ok(
  重复窗.容器滚动高 >= Math.max(分析.重复数, 分析.一次数) * 重复窗.行高 &&
    重复窗.容器滚动高 <=
      Math.max(分析.重复数, 分析.一次数) * 重复窗.行高 + 3 * 重复窗.行高,
  `容器总高应由较长的那张表决定：${重复窗.容器滚动高}`,
);
assert.equal(
  重复窗.行[0][2],
  计数.get(重复窗.行[0][1]).toLocaleString('zh-CN'),
  '重复表首行频次应与节点计数一致',
);
await 截图('单字双列表-两张表各自撑高.png');
// 滚到较短那张表已耗尽、较长那张仍有内容的区间：读完的表只剩占位行，不留残缺
if (分析.一次数 < 分析.重复数 - 20) {
  await 滚到('#单字双列表', 一次窗.表体高 + 重复窗.行高 * 30);
  const 后段 = {
    重复: await 读窗口('#单字重复列表'),
    一次: await 读窗口('#单字一次列表'),
  };
  assert.equal(后段.一次.DOM行数, 0, '一次表读完后不应再渲染真实行');
  assert.ok(后段.一次.占位数 === 1, '一次表读完后应只剩一条底部占位行');
  assert.ok(后段.重复.DOM行数 > 0 && 后段.重复.序号[0] > 0, '重复表应继续渲染中段');
  断言窗口连续(后段.重复, '单字重复后段');
} else {
  console.log(`（一次表 ${分析.一次数} 行不比重复表短，跳过「读完只剩占位」分支）`);
}

// —— 二字视图：同样虚拟，且排名与频次正确 ——
await 求值(`
  [...document.querySelectorAll('.词频标签')].find((b) => b.dataset.视图 === '2').click();
  return 1;
`);
await pause(150);
const 二字窗 = await 读窗口('#词频列表');
断言窗口连续(二字窗, '二字');
assert.equal(二字窗.序号[0], 0);
assert.equal(二字窗.行[0][0], '1', '首行排名应为 1');
assert.ok(二字窗.DOM行数 < 分析.二字数 / 4, `二字表也应虚拟：${二字窗.DOM行数}`);
assert.ok(
  Math.abs(二字窗.表体高 - 分析.二字数 * 二字窗.行高) <= 二字窗.行高,
  '二字表体高应按全量行数撑开',
);
const 二字首行 = await 求值(`
  const { 状态 } = await import('./js/状态.js');
  const 项 = 状态.词频分析.列表[2][0];
  return [项.文本, 项.数量.toLocaleString('zh-CN')];
`);
assert.deepEqual(
  [二字窗.行[0][1], 二字窗.行[0][2]],
  二字首行,
  '二字首行应与分析结果一致',
);
await 滚到('#词频表格容器', 二字窗.容器滚动高);
const 二字末窗 = await 读窗口('#词频列表');
assert.equal(二字末窗.序号[二字末窗.序号.length - 1], 分析.二字数 - 1, '二字应能滚到最后一行');

// —— 方向键在标签间循环，回到对照后重新从顶部渲染 ——
await 求值(`
  [...document.querySelectorAll('.词频标签')].find((b) => b.dataset.视图 === '对照').click();
  document.querySelector('#字频对照容器').scrollTop = 5000;
  return 1;
`);
await pause(120);
await 求值(`
  const 标签们 = [...document.querySelectorAll('.词频标签')];
  const 对照 = 标签们.find((b) => b.dataset.视图 === '对照');
  对照.focus();
  对照.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  return 1;
`);
await pause(150);
const 切换后 = await 求值(`
  return {
    当前: [...document.querySelectorAll('.词频标签')].find((b) => b.classList.contains('当前')).dataset.视图,
    对照隐藏: document.querySelector('#字频对照容器').hidden,
    单字显示: !document.querySelector('#单字双列表').hidden,
  };
`);
assert.deepEqual(切换后, { 当前: '1', 对照隐藏: true, 单字显示: true });
await 求值(`
  const 单字 = [...document.querySelectorAll('.词频标签')].find((b) => b.dataset.视图 === '1');
  单字.focus();
  单字.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  return 1;
`);
await pause(150);
const 回对照 = await 读窗口('#字频对照列表');
assert.equal(回对照.序号[0], 0, '切回对照应回到列表顶部');
assert.equal(回对照.容器顶, 0);

console.log(
  `\nOK：${目标文本} ${汉字总数.toLocaleString('zh-CN')} 汉字 / ${分析.单字数.toLocaleString('zh-CN')} 去重字；` +
    `对照逐行比对 ${见过.size} 行两列万分之全对（缺表 ${缺表字数} 字，本书列合计 ${本书列合计.toFixed(0)}‱）；` +
    `三个视图均虚拟（对照窗口 ${首屏.DOM行数} 行 / 单字 ${重复窗.DOM行数}+${一次窗.DOM行数} 行 / 二字 ${二字窗.DOM行数} 行，` +
    `全量 ${分析.单字数} / ${分析.重复数}+${分析.一次数} / ${分析.二字数}），翻页控件已移除`,
);
收尾();
