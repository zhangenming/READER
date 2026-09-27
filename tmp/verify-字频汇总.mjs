// 端到端回归：字频差异榜顶部的「语域偏离 / 主题偏离 / 与知乎字频重合」三个汇总数。
// 页面侧走真实入口（内容选择 → 载入正文 → 打开词频弹窗 → 切到字频对照），
// 节点侧从页面正文独立复算同一套公式（含 格式化倍数 的第二实现），要求 DOM 上
// 显示的字符串逐字相等；再断言合计夹在两段之间（分段接线是否对）、语域段覆盖篇幅
// 在合理区间、表外字为 0 时不写「0.00% 篇幅」，最后量一遍布局。
// 跑法：node tmp/verify-字频汇总.mjs            （默认 成吉思汗.txt，表外字非空）
//       TARGET_TEXT=未来简史.txt node tmp/verify-字频汇总.mjs   （表外近乎为 0 的分支）
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { 取知乎序号, 取知乎万分率 } from '../js/知乎字频.js';

const 目标文本 = process.env.TARGET_TEXT || '成吉思汗.txt';
const CDP首选 = Number(process.env.VERIFY_CDP_PORT || 9417);
const 站点首选 = Number(process.env.SITE_PORT || 15993);

function 杀掉端口(端口) {
  // 残留的旧 Chrome / 旧服务会让这一轮连到改动前的页面上，测出假的不一致。
  try {
    const pid列表 = execSync(`lsof -ti :${端口}`, { encoding: 'utf8' }).trim();
    if (pid列表) execSync(`kill -9 ${pid列表.split('\n').join(' ')}`);
  } catch {}
}
杀掉端口(CDP首选);
杀掉端口(站点首选);

const 是汉字 = (字) => {
  const 码 = 字.codePointAt(0);
  return (
    (码 >= 0x3400 && 码 <= 0x4dbf) ||
    (码 >= 0x4e00 && 码 <= 0x9fff) ||
    (码 >= 0xf900 && 码 <= 0xfaff) ||
    (码 > 0x7f && /^\p{Script=Han}$/u.test(字))
  );
};

/** 节点侧独立复算：与 js/字频差异.js 的 汇总偏度 同一公式，但数据取自磁盘 */
function 复算汇总(正文) {
  const 计数 = new Map();
  let 汉字总数 = 0;
  for (const 字 of 正文) {
    if (!是汉字(字)) continue;
    计数.set(字, (计数.get(字) ?? 0) + 1);
    汉字总数 += 1;
  }
  let 语域和 = 0;
  let 语域字数 = 0;
  let 主题和 = 0;
  let 主题字数 = 0;
  let 计入字数 = 0;
  let 重合万分之 = 0;
  for (const [字, 次数] of 计数) {
    const 知乎 = 取知乎万分率(字) ?? 0;
    重合万分之 += Math.min((次数 / 汉字总数) * 10000, 知乎);
    if (知乎 <= 0) continue;
    const 加重对数差 =
      次数 * Math.abs(Math.log2(次数 / 汉字总数 / (知乎 / 10000)));
    // 与 js/字频差异.js 的 语域段名次 同一门槛
    if ((取知乎序号(字) ?? Infinity) <= 100) {
      语域和 += 加重对数差;
      语域字数 += 次数;
    } else {
      主题和 += 加重对数差;
      主题字数 += 次数;
    }
    计入字数 += 次数;
  }
  return {
    汉字总数,
    字种数: 计数.size,
    语域偏离: 2 ** (语域和 / 语域字数),
    主题偏离: 2 ** (主题和 / 主题字数),
    总偏离: 2 ** ((语域和 + 主题和) / 计入字数),
    语域篇幅: 语域字数 / 汉字总数,
    重合度: 重合万分之 / 10000,
    未计入篇幅: 1 - 计入字数 / 汉字总数,
  };
}

/** 与 js/万分率.js 的 格式化倍数 一致（独立实现，不复用，才叫交叉验证） */
function 期望倍数(比值) {
  const 前缀 = 比值 >= 1 ? '×' : '÷';
  const 倍数 = 比值 >= 1 ? 比值 : 1 / 比值;
  if (倍数 >= 10000) return `${前缀}${(Math.round(倍数 / 1000) / 10).toFixed(1)}万`;
  if (倍数 >= 100) return `${前缀}${Math.round(倍数).toLocaleString('en-US')}`;
  const 位数 = 倍数 >= 10 ? 1 : 2;
  return `${前缀}${(Math.round(倍数 * 10 ** 位数) / 10 ** 位数).toFixed(位数)}`;
}

const 磁盘正文 = readFileSync(
  join(resolve(import.meta.dirname, '..'), 'txt', 目标文本),
  'utf8',
);
const 磁盘汉字数 = [...磁盘正文].filter(是汉字).length;
console.log(`磁盘：${目标文本} 共 ${磁盘正文.length} 字符 / 汉字 ${磁盘汉字数.toLocaleString('en-US')} 个`);

async function 取空闲端口(首选) {
  const 试 = async (端口) => {
    const 探测 = createServer();
    try {
      await new Promise((完成, 失败) => {
        探测.once('error', 失败);
        探测.listen(端口, '127.0.0.1', 完成);
      });
      return 探测.address().port;
    } catch {
      return 0;
    } finally {
      await new Promise((完成) => 探测.close(完成));
    }
  };
  return (await 试(首选)) || (await 试(0));
}
// 端口一律让 OS 随机分配。用固定首选端口时，上一轮断言抛出后没死干净的
// Chrome 会占着同一个 CDP 端口，这一轮连上去 /json 永远是空列表，
// 报出来的「未找到页面」看着像代码坏了，其实是连到了僵尸进程。
const CDP端口 = await 取空闲端口(0);
const 站点端口 = await 取空闲端口(0);
const 地址 = `http://127.0.0.1:${站点端口}/`;

await new Promise((等) => setTimeout(等, 500));
const 服务日志 = [];
const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: resolve(import.meta.dirname, '..'),
  stdio: ['ignore', 'pipe', 'pipe'],
});
// 两条流都要读走：管道缓冲区写满会把服务自己堵死，表现就是页面永远拿不到响应。
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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'reader-huizong-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1680,1000',
    地址,
  ],
  { stdio: 'ignore' },
);
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));
// 卡住时看得出现在走到哪一步：CDP 的 await 没有超时，Chrome 半路死掉的话
// 待回复里的 promise 永远不会 settle，整只脚本会静默挂死而不是报错退出。
let 阶段 = '启动';
const 进度 = (文本) => {
  阶段 = 文本;
  console.log(`… ${文本}`);
};
function 杀干净() {
  // 默认 SIGTERM 对 headless Chrome 常常不生效，僵尸进程会一直占着临时
  // user-data-dir 和端口，下一轮就连到改动前的页面上了。
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
  if (错误) console.error('❌', 错误);
  杀干净();
  process.exit(错误 ? 1 : 0);
}
const 看门狗 = setTimeout(
  () => 收尾(new Error(`总超时（卡在「${阶段}」）`)),
  Number(process.env.VERIFY_TIMEOUT_MS || 420000),
);
process.on('unhandledRejection', (e) => 收尾(e));
process.on('uncaughtException', (e) => 收尾(e));
process.on('exit', 杀干净);

let 目标 = null;
let 最后列表 = [];
for (let i = 0; i < 300 && !目标; i++) {
  try {
    最后列表 = await (
      await fetch(`http://127.0.0.1:${CDP端口}/json`)
    ).json();
    // 先挑已经在本地的，没有就接住任何一个 page 标签（about:blank 也算），
    // 随后用 Page.navigate 把它带过来——命令行 URL 偶尔不生效。
    目标 =
      最后列表.find((t) => t.type === 'page' && t.url.startsWith(地址)) ||
      最后列表.find((t) => t.type === 'page');
  } catch {}
  if (!目标) await pause(200);
}
assert.ok(
  目标,
  `未找到 headless Chrome 页面（地址 ${地址}，CDP ${CDP端口}，现有标签 ` +
    `${JSON.stringify(最后列表.map((t) => `${t.type}:${t.url}`))}）`,
);

const ws = new WebSocket(目标.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
ws.addEventListener('close', () => {
  // 连接断了就把所有在途请求一起拒掉，否则调用方会永远 await 下去
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
  if (结果.exceptionDetails) {
    throw new Error(JSON.stringify(结果.exceptionDetails));
  }
  return 结果.result.value;
}

// 不靠 Chrome 命令行里那个 URL 参数导航：headless 下它偶尔不生效，
// 连上的标签停在 about:blank 上，然后整轮回归都在等一个永远不会出现的工具条。
// 这里显式导航一次，并等 document 真的就绪。
await 发送('Page.enable');
await 发送('Page.navigate', { url: 地址 });
let 已导航 = false;
for (let i = 0; i < 200; i++) {
  已导航 = await 求值(`return location.href === ${JSON.stringify(地址)};`);
  if (已导航) break;
  await pause(150);
}
assert.ok(已导航, `标签页应导航到 ${地址}，实际停在 ${await 求值('return location.href;')}`);

// —— 等首屏就绪（工具条出现且不在载入态），否则 #内容选择按钮 还是 null ——
进度('等首屏');
let 首屏 = false;
let 首屏状态 = null;
for (let i = 0; i < 600; i++) {
  首屏状态 = await 求值(`
    return {
      有工具条: !!document.querySelector('#内容选择按钮'),
      载入文本: document.querySelector('#载入状态') &&
        !document.querySelector('#载入状态').hidden
          ? (document.querySelector('#载入状态').textContent || '').trim().slice(0, 60)
          : '',
      地址: location.href,
      标题: document.title,
    };
  `);
  首屏 = 首屏状态.有工具条 && !首屏状态.载入文本;
  if (首屏) break;
  await pause(200);
}
assert.ok(首屏, `首屏工具条应在超时前就绪（${JSON.stringify(首屏状态)}）`);

// —— 载入正文 ——
进度('载入正文');
await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
let 有条目 = false;
for (let i = 0; i < 200; i++) {
  有条目 = await 求值(`
    return [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
      .some((b) => b.dataset.fileName === ${JSON.stringify(目标文本)});
  `);
  if (有条目) break;
  await pause(150);
}
assert.ok(有条目, `内容选择列表里找不到 ${目标文本}`);
await 求值(`
  [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
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
// 词频是就 状态.文本 定义的（正文要过一遍文本管线，与磁盘原文不完全等长），
// 所以基准从页面正文复算；磁盘那份只用来兜住「连到了别的书 / 陈旧页面」。
const 页面正文 = await 求值(`
  const { 状态 } = await import('./js/状态.js'); return 状态.文本;
`);
const 基准 = 复算汇总(页面正文);
assert.ok(
  Math.abs(基准.汉字总数 - 磁盘汉字数) / 磁盘汉字数 < 0.05,
  `页面汉字数 ${基准.汉字总数} 与磁盘 ${磁盘汉字数} 差太多，页面可能不是这本书`,
);
console.log(
  `基准：页面正文 ${页面正文.length} 字符 · 汉字 ${基准.汉字总数.toLocaleString('en-US')} 个 / ` +
    `${基准.字种数.toLocaleString('en-US')} 字种 · 语域 ${期望倍数(基准.语域偏离)}（占 ${(基准.语域篇幅 * 100).toFixed(0)}% 篇幅）` +
    `· 主题 ${期望倍数(基准.主题偏离)} · 合计 ${期望倍数(基准.总偏离)} · ` +
    `重合 ${(基准.重合度 * 100).toFixed(1)}% · 表外篇幅 ${(基准.未计入篇幅 * 100).toFixed(3)}%`,
);

// —— 打开词频弹窗（默认就在「字频对照」视图，这里再点一次走真实入口）——
进度('词频分析');
await 求值(`(await import('./js/词频弹窗.js')).打开词频弹窗(); return 1;`);
let 分析 = null;
// 63 万字的书要跑满 2~6 字组合的统计，时间片轮转下要一两分钟
for (let i = 0; i < 1500; i++) {
  分析 = await 求值(`
    const { 状态 } = await import('./js/状态.js');
    return 状态.词频分析
      ? { 汉字总数: 状态.词频分析.汉字总数, 去重: 状态.词频分析.去重汉字数 }
      : null;
  `);
  if (分析) break;
  await pause(150);
}
assert.ok(分析, '词频分析应在超时前完成');
assert.equal(分析.汉字总数, 基准.汉字总数, '汉字总数应与磁盘基准一致');
assert.equal(分析.去重, 基准.字种数, '去重汉字数应与磁盘基准一致');

await 求值(`
  [...document.querySelectorAll('.词频标签')]
    .find((b) => b.getAttribute('data-视图') === '对照').click();
  return 1;
`);
await pause(400);

const 页面 = await 求值(`
  const 取 = (选择器) => document.querySelector(选择器);
  const 模块 = 取('#字频差异模块');
  const 汇总 = 取('#字频差异汇总');
  const 计算 = (节点) => {
    if (!节点) return null;
    const 框 = 节点.getBoundingClientRect();
    return { 宽: Math.round(框.width), 高: Math.round(框.height), 滚动宽: 节点.scrollWidth };
  };
  return {
    语域偏离: 取('#字频差异语域偏离')?.textContent ?? null,
    主题偏离: 取('#字频差异主题偏离')?.textContent ?? null,
    重合度: 取('#字频差异重合度')?.textContent ?? null,
    汇总提示: 取('#字频差异汇总')?.title ?? null,
    说明: 取('#字频差异说明')?.textContent ?? null,
    偏多标题: 取('#字频差异偏多标题')?.textContent ?? null,
    偏少标题: 取('#字频差异偏少标题')?.textContent ?? null,
    最小标题: 取('#字频差异最小标题')?.textContent ?? null,
    模块: 计算(模块),
    汇总框: 计算(汇总),
    偏多行数: 取('#字频差异偏多列表')?.children.length ?? -1,
    偏少行数: 取('#字频差异偏少列表')?.children.length ?? -1,
    最小行数: 取('#字频差异最小列表')?.children.length ?? -1,
  };
`);

// 留一张图给人眼看版式：汇总行的字号、间距、有没有把模块撑宽，
// 断言只能量到宽高，看不出「挤不挤」。
const { data: 截图数据 } = await 发送('Page.captureScreenshot', { format: 'png' });
writeFileSync(
  resolve(import.meta.dirname, '字频对照-全书汇总.png'),
  Buffer.from(截图数据, 'base64'),
);

console.log('页面：', JSON.stringify(页面, null, 2).slice(0, 1400));

// —— 1. 三个汇总数与节点基准逐字相等 ——
assert.equal(
  页面.语域偏离,
  期望倍数(基准.语域偏离),
  `语域偏离应显示 ${期望倍数(基准.语域偏离)}，实际「${页面.语域偏离}」`,
);
assert.equal(
  页面.主题偏离,
  期望倍数(基准.主题偏离),
  `主题偏离应显示 ${期望倍数(基准.主题偏离)}，实际「${页面.主题偏离}」`,
);
assert.equal(
  页面.重合度,
  `${(基准.重合度 * 100).toFixed(1)}%`,
  `重合度应显示 ${(基准.重合度 * 100).toFixed(1)}%，实际「${页面.重合度}」`,
);

// —— 2. 分段自相一致：合计是两段按字数加权的几何平均，必须夹在两段中间。
// 这条能抓住「门槛写反」「某段漏了字」这类接线错误，而单看两段各自的值抓不住。
assert.ok(
  Math.min(基准.语域偏离, 基准.主题偏离) <= 基准.总偏离 + 1e-9 &&
    基准.总偏离 <= Math.max(基准.语域偏离, 基准.主题偏离) + 1e-9,
  `合计 ${基准.总偏离.toFixed(2)} 应夹在语域 ${基准.语域偏离.toFixed(2)} 与主题 ${基准.主题偏离.toFixed(2)} 之间`,
);
assert.ok(
  基准.语域篇幅 > 0.15 && 基准.语域篇幅 < 0.7,
  `语域段（前 100 常用字）覆盖 ${(基准.语域篇幅 * 100).toFixed(0)}% 篇幅，超出合理区间`,
);
assert.ok(
  基准.重合度 > 0 && 基准.重合度 <= 1,
  '重合度应落在 (0,1]',
);

// —— 3. 表外字为 0 的书不写「0.00% 篇幅」这种杂讯 ——
const 应报篇幅 = 基准.未计入篇幅 > 0;
assert.equal(
  页面.说明.includes('篇幅'),
  应报篇幅,
  应报篇幅
    ? '有表外字时说明行应报出它占的篇幅'
    : '表外字为 0 时说明行不该出现「0.00% 篇幅」',
);
if (应报篇幅) {
  const 文字 = 基准.未计入篇幅 < 0.0001 ? '<0.01%' : `${(基准.未计入篇幅 * 100).toFixed(2)}%`;
  assert.ok(
    页面.说明.includes(`占全书 ${文字} 篇幅`),
    `说明行应含「占全书 ${文字} 篇幅」，实际「${页面.说明}」`,
  );
}

// —— 4. 布局：模块仍是 3 栏 720px，汇总行不换行、不溢出 ——
assert.equal(页面.模块.宽, 720, '模块宽度应仍为 240×3=720px');
assert.ok(
  页面.汇总框.滚动宽 <= 页面.汇总框.宽,
  `汇总行溢出（scrollWidth ${页面.汇总框.滚动宽} > ${页面.汇总框.宽}）`,
);
assert.ok(
  页面.汇总框.高 <= 34,
  `汇总行应为单行（实测高 ${页面.汇总框.高}px）`,
);

// —— 5. 老功能没被挤坏：三列榜单照旧 ——
assert.equal(页面.偏多行数, 30, '偏本书应仍渲染 30 行');
assert.equal(页面.偏少行数, 30, '偏知乎应仍渲染 30 行');
assert.equal(页面.最小行数, 30, '差异最小应仍渲染 30 行');
assert.ok(/^本书多$/.test(页面.偏多标题), `偏多标题异常「${页面.偏多标题}」`);
assert.ok(/^本书少$/.test(页面.偏少标题), `偏少标题异常「${页面.偏少标题}」`);
assert.ok(
  页面.汇总提示.includes('语域偏离') && 页面.汇总提示.includes('主题偏离'),
  '汇总行悬停说明应分别交代两段的口径',
);
assert.ok(
  页面.汇总提示.includes('前 100 常用字'),
  '说明应写明语域段的门槛，否则「语域」无从核对',
);

console.log(
  `✅ ${目标文本}：语域 ${页面.语域偏离} / 主题 ${页面.主题偏离} / 重合 ${页面.重合度} ` +
    `与节点复算一致，合计夹在两段之间，汇总行单行不溢出，三列榜单未受影响`,
);
await 收尾(null);
