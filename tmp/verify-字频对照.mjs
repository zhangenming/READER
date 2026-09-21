// 端到端回归：词频弹窗的三个视图都走虚拟列表（无翻页），且字频对照五列可点排序、表头与数字右对齐。
// 页面侧走真实入口（内容选择 → 载入正文 → 打开词频弹窗 → 点表头），节点侧独立复算
// 汉字计数、万分之换算、两侧名次与排序结果；再按滚动位置读窗口，要求
// 「滚遍全表 = 每行都出现过且都对」，同时断言任意时刻 DOM 里只有几十行（真的虚拟）。
// 跑法：node tmp/verify-字频对照.mjs
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  取知乎序号,
  取知乎万分率,
  知乎语料汉字总数,
} from '../js/知乎字频.js';

function 杀掉端口(端口) {
  // 上一轮断言抛出时子进程不会随 node 退出而死掉，残留的旧 Chrome / 旧服务
  // 会让下一次运行连到改动前的页面上，测出假的不一致。
  try {
    const pid列表 = execSync(`lsof -ti :${端口}`, { encoding: 'utf8' }).trim();
    if (pid列表) execSync(`kill -9 ${pid列表.split('\n').join(' ')}`);
  } catch {}
}
杀掉端口(Number(process.env.VERIFY_CDP_PORT || 9412));
杀掉端口(Number(process.env.SITE_PORT || 15998));

async function 取空闲端口(首选) {
  // 上一轮残留进程可能还占着固定端口，服务 bind 失败是静默的（stdio 被忽略），
  // 表现就是 Chrome 拿到错误页、回归以「页面没加载」失败。这里先探一次，占用就换随机端口。
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
  return (await 试(首选)) || 试(0);
}

const CDP端口 = await 取空闲端口(Number(process.env.VERIFY_CDP_PORT || 9412));
const 站点端口 = await 取空闲端口(Number(process.env.SITE_PORT || 15998));
const 地址 = `http://127.0.0.1:${站点端口}/`;
// 榜单内容断言（倍数区分度等）是按《成吉思汗》的数据校准的，换书只适合量布局；
// 想压括号宽度和行高，用 tmp/量-差异榜列宽.mjs（BOOK=白鹿原.txt）。
const 目标文本 = process.env.TARGET_TEXT || '成吉思汗.txt';
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

// —— 节点侧基准：自己数汉字、自己换算万分之、自己排名次、自己排序 ——
function 统计基准(文本) {
  let 总数 = 0;
  const 计数 = new Map();
  const 首次位置 = new Map();
  let 位置 = 0;
  for (const 字 of 文本) {
    if (是汉字(字)) {
      总数 += 1;
      计数.set(字, (计数.get(字) ?? 0) + 1);
      if (!首次位置.has(字)) {
        首次位置.set(字, 位置);
      }
    }
    位置 += 1;
  }
  const 名次 = new Map();
  [...计数.keys()]
    .sort(
      (左, 右) =>
        计数.get(右) - 计数.get(左) || 首次位置.get(左) - 首次位置.get(右),
    )
    .forEach(function 记名次(字, 序) {
      名次.set(字, 序 + 1);
    });
  return { 汉字总数: 总数, 计数, 名次 };
}

// 显示口径：≥10 向下取整（「的」403.89 → 403），其余 3 位有效数字，查不到为「—」
function 期望显示(值) {
  if (值 === undefined) return '—';
  if (值 === 0) return '0';
  if (值 >= 10) return String(Math.floor(值));
  return 值.toPrecision(3);
}
const 显示名次 = (值) => (值 === undefined ? '—' : 值.toLocaleString('zh-CN'));
function 期望倍数(比值) {
  if (!Number.isFinite(比值) || 比值 <= 0) return '—';
  const 前缀 = 比值 >= 1 ? '×' : '÷';
  const 倍数 = 比值 >= 1 ? 比值 : 1 / 比值;
  let 数值;
  if (倍数 >= 10000) {
    数值 =
      (Math.round(倍数 / 1000) / 10).toLocaleString('zh-CN', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + '万';
  } else if (倍数 >= 100) {
    数值 = Math.round(倍数).toLocaleString('zh-CN');
  } else {
    const 位数 = 倍数 >= 10 ? 1 : 2;
    数值 = (
      Math.round(倍数 * 10 ** 位数) / 10 ** 位数
    ).toLocaleString('zh-CN', {
      minimumFractionDigits: 位数,
      maximumFractionDigits: 位数,
    });
  }
  return `${前缀}${数值}`;
}

// 本书括号里的出现次数：与 js/万分率.js 的 格式化次数 同一口径（过万折成「1.9万」）
function 期望次数(次数) {
  if (!Number.isFinite(次数)) return '—';
  if (次数 >= 10000) {
    return (
      (Math.round(次数 / 1000) / 10).toLocaleString('zh-CN', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + '万'
    );
  }
  return 次数.toLocaleString('zh-CN');
}

// 右侧差异榜：本书每个汉字都参与，但知乎必须有数（计 0 次或未收录的属于无数据，排除）
function 计算榜行列表() {
  const 行列表 = [];
  const 无数据 = [];
  for (const [字, 数量] of 计数) {
    const 现代显示 = 取知乎万分率(字);
    const 现代 = 现代显示 ?? 0;
    if (现代 <= 0) {
      无数据.push(字);
      continue;
    }
    const 本书 = (数量 / 汉字总数) * 10000;
    const 比值 = 本书 / 现代;
    行列表.push({
      字,
      现代显示,
      现代,
      本书,
      比值,
      对数差: Math.abs(Math.log2(比值)),
      数量,
    });
  }
  return { 行列表, 无数据 };
}

function 排榜(行列表入, 取最大) {
  const 行列表 = 行列表入.slice();
  return 行列表.sort((左, 右) => {
    const 差 = 取最大 ? 右.对数差 - 左.对数差 : 左.对数差 - 右.对数差;
    if (差 !== 0) return 差;
    return (
      右.现代 - 左.现代 ||
      右.数量 - 左.数量 ||
      左.字.localeCompare(右.字, 'zh-CN')
    );
  });
}

function 期望榜(哪一列) {
  let 行列表 = 计算榜行列表().行列表;
  if (哪一列 === '偏多') 行列表 = 行列表.filter((行) => 行.比值 > 1);
  if (哪一列 === '偏少') 行列表 = 行列表.filter((行) => 行.比值 < 1);
  行列表 = 排榜(行列表, 哪一列 !== '最小');
  return 行列表.slice(0, 30).map((行) => [
    行.字,
    期望显示(行.现代显示),
    `${期望显示(行.本书)} (${期望次数(行.数量)})`,
    期望倍数(行.比值),
  ]);
}

// 期望的一行六格：汉字 | 知乎万分之 | 知乎序号 | 本书万分之 | 本书序号 | 字符个数
function 期望行(字) {
  return [
    字,
    期望显示(取知乎万分率(字)),
    显示名次(取知乎序号(字)),
    期望显示((计数.get(字) / 汉字总数) * 10000),
    显示名次(本书名次.get(字)),
    计数.get(字).toLocaleString('zh-CN'),
  ];
}

// 主表某一列排序后的完整期望序列（现代表查不到的字恒垫底，并列按本书名次）
function 期望序列(键, 方向) {
  const 符号 = 方向 === '降' ? -1 : 1;
  const 取现代 = 键 === '现代序号' ? 取知乎序号 : 取知乎万分率;
  const 看现代 = 键 === '现代万分之' || 键 === '现代序号';
  return [...计数.keys()].sort(function 比较(左, 右) {
    const 左名 = 本书名次.get(左);
    const 右名 = 本书名次.get(右);
    if (看现代) {
      const 左值 = 取现代(左);
      const 右值 = 取现代(右);
      if (左值 === undefined || 右值 === undefined) {
        if (左值 === 右值) return 左名 - 右名;
        return 左值 === undefined ? 1 : -1;
      }
      if (左值 !== 右值) return (左值 - 右值) * 符号;
    } else {
      const 左值 = 键 === '本书序号' ? 左名 : 计数.get(左);
      const 右值 = 键 === '本书序号' ? 右名 : 计数.get(右);
      if (左值 !== 右值) return (左值 - 右值) * 符号;
    }
    return 左名 - 右名;
  });
}

let 汉字总数 = 0;
let 计数 = new Map();
let 本书名次 = new Map();

await new Promise((等) => setTimeout(等, 600)); // 给被杀的进程一点时间释放端口
const 服务日志 = [];
const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: resolve(import.meta.dirname, '..'),
  stdio: ['ignore', 'pipe', 'pipe'],
});
服务.stderr.on('data', (块) => 服务日志.push(String(块)));
服务.stdout.on('data', (块) => 服务日志.push(String(块)));
// 等服务真的能接受连接，否则 Chrome 可能拿到 ERR_CONNECTION_REFUSED 的错误页
for (let i = 0; i < 50; i++) {
  try {
    const 响应 = await fetch(地址, { signal: AbortSignal.timeout(1000) });
    if (响应.ok) break;
  } catch {}
  await new Promise((等) => setTimeout(等, 100));
}

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
  for (let i = 0; i < 300; i++) {
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
function 发送(方法, 参数 = {}) {
  return new Promise((resolve2, reject) => {
    const 下标 = ++消息号;
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
async function 点表头(键) {
  await 求值(`
    document.querySelector('.字频排序列[data-排序=${JSON.stringify(键)}]')
      .querySelector('.字频排序按钮').click();
    return 1;
  `);
  await pause(160);
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
// 窗口内每一行都要等于节点侧期望序列的对应片段
function 断言窗口内容(窗口, 期望顺序, 说明) {
  窗口.序号.forEach((行序号, i) => {
    assert.deepEqual(
      窗口.行[i],
      期望行(期望顺序[行序号]),
      `${说明} 第 ${行序号} 行不符：DOM=${窗口.行[i]}`,
    );
  });
}

async function 等待首屏(轮数) {
  let 状态文本 = '';
  for (let i = 0; i < 轮数; i++) {
    // 首屏会自动恢复上次的书，新书（几十万字）排版可能要几十秒
    状态文本 = await 求值(`
    return JSON.stringify({
      有工具条: !!document.querySelector('#内容选择按钮'),
      载入中: document.querySelector('#载入状态') &&
        !document.querySelector('#载入状态').hidden
          ? (document.querySelector('#载入状态').textContent || '').trim().slice(0, 60)
          : '',
    });
  `);
    const { 有工具条, 载入中 } = JSON.parse(状态文本);
    if (有工具条 && !载入中) {
      return { 就绪: true, 状态: 状态文本 };
    }
    await pause(200);
  }
  return { 就绪: false, 状态: 状态文本 };
}
let 首屏结果 = await 等待首屏(600);
if (!首屏结果.就绪) {
  // 偶发：Chrome 首帧导航没拿到响应（服务刚起），重导一次再等
  console.log(`首屏未就绪（${首屏结果.状态}），重新导航再试`);
  await 发送('Page.navigate', { url: 地址 });
  首屏结果 = await 等待首屏(600);
}
assert.ok(
  首屏结果.就绪,
  `页面应加载完首屏（服务端口 ${站点端口}，状态 ${首屏结果.状态}）：${服务日志.join('').slice(0, 300)}`,
);

// —— 走真实入口载入正文 ——
await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
let 有条目 = false;
for (let i = 0; i < 150; i++) {
  有条目 = await 求值(`
    return [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
      .some((b) => b.dataset.fileName === ${JSON.stringify(目标文本)});
  `);
  if (有条目) break;
  await pause(200);
}
assert.ok(有条目, `内容选择列表里找不到 ${目标文本}`);
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
({ 汉字总数, 计数, 名次: 本书名次 } = 统计基准(正文));
console.log(
  `基准：${目标文本} 正文 ${正文.length} 字，汉字 ${汉字总数} 个 / 去重 ${计数.size} 字`,
);

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
const 单字序列 = await 求值(`
  const { 状态 } = await import('./js/状态.js');
  return 状态.词频分析.列表[1].map((项) => 项.文本);
`);
assert.deepEqual(
  单字序列,
  期望序列('本书序号', '升'),
  '页面单字顺序应与节点侧名次排序一致',
);

// —— 翻页控件应已彻底移除，表头四列可排序 ——
const 结构 = await 求值(`
  return {
    分页节点: document.querySelector('#词频分页'),
    标签顺序: [...document.querySelectorAll('.词频标签')].map((b) => b.textContent.trim()),
    当前视图: [...document.querySelectorAll('.词频标签')].find((b) =>
      b.classList.contains('当前')).dataset.视图,
    可聚焦: ['#字频对照容器', '#单字双列表', '#词频表格容器'].map((选择) =>
      document.querySelector(选择).tabIndex),
    表头: [...document.querySelectorAll('#字频对照容器 thead th')].map((格) => [
      格.textContent.trim(), 格.dataset.排序 ?? '', 格.getAttribute('aria-sort') ?? '',
    ]),
    摘要: document.querySelector('#词频摘要').textContent,
  };
`);
assert.equal(结构.分页节点, null, '翻页控件应已删除');
assert.deepEqual(结构.标签顺序, ['字频对照', '单字', '二字', '三字', '四字', '五字', '六字']);
assert.equal(结构.当前视图, '对照', '默认停在第一个 tab');
assert.deepEqual(结构.可聚焦, [0, 0, 0], '列表容器应可聚焦以便键盘滚动');
assert.deepEqual(
  结构.表头.map(([名, 键, 排序]) => [名, 键, 排序]),
  [
    ['汉字', '', ''],
    ['知乎万分之', '现代万分之', 'none'],
    ['序号', '现代序号', 'none'],
    ['本书万分之', '本书万分之', 'descending'],
    ['序号', '本书序号', 'none'],
    ['字符个数', '本书个数', 'none'],
  ],
  '表头应为六列、五列可排序，默认按本书万分之降序',
);
assert.match(结构.摘要, /万分之/);
assert.ok(
  结构.摘要.includes(`${计数.size.toLocaleString('zh-CN')} 字中`),
  `摘要去重字数不对：${结构.摘要}`,
);
assert.ok(结构.摘要.includes('按本书万分之降序'), `摘要应说明当前排序：${结构.摘要}`);

// —— 对齐：表头文字与数字右边缘齐平（排序箭头挂在标签左侧，不占右侧空间）——
async function 量对齐(说明) {
  const 测量 = await 求值(`
    const 取文本节点 = (格) => {
      const 直接 = [...格.childNodes].find((n) =>
        n.nodeType === 3 && n.textContent.trim());
      if (直接) return 直接;
      for (const 子 of 格.querySelectorAll('*')) {
        const 命中 = [...子.childNodes].find((n) =>
          n.nodeType === 3 && n.textContent.trim());
        if (命中) return 命中;
      }
      return null;
    };
    const 右边缘 = (格) => {
      const 节点 = 取文本节点(格);
      const 域 = document.createRange();
      域.selectNodeContents(节点);
      const 盒 = 域.getBoundingClientRect();
      const 格盒 = 格.getBoundingClientRect();
      return {
        右: Math.round(盒.right * 10) / 10,
        中: Math.round((盒.left + 盒.right) * 5) / 10,
        文: JSON.stringify(节点.textContent.slice(0, 24)),
        格右: Math.round(格盒.right * 10) / 10,
        格内右: Math.round((格盒.right - parseFloat(getComputedStyle(格).paddingRight)) * 10) / 10,
      };
    };
    const 表头格 = [...document.querySelectorAll('#字频对照容器 thead th')];
    const 首行 = document.querySelector('#字频对照列表 tr:not(.虚拟占位)');
    const 数据格 = [...首行.children];
    const 伪元素 = (格) => getComputedStyle(格.querySelector('.字频排序按钮') ?? 格, '::after').content;
    return 表头格.map((格, i) => [
      右边缘(格), 右边缘(数据格[i]), 格.getAttribute('aria-sort') ?? '', 伪元素(格),
    ]);
  `);
  assert.equal(测量.length, 6, `${说明}：应量到六列`);
  测量.forEach(([表头, 数据, 排序, 伪元素], i) => {
    if (i === 0) {
      assert.ok(
        Math.abs(表头.中 - 数据.中) <= 1,
        `${说明}：汉字列应居中对齐，表头${表头.中} vs 数据${数据.中}`,
      );
      return;
    }
    assert.ok(
      Math.abs(表头.右 - 数据.右) <= 1,
      `${说明}：第 ${i + 1} 列表头右边缘应与数字齐平（表头 ${JSON.stringify(表头)} vs 数据 ${JSON.stringify(数据)}，排序=${排序}）`,
    );
    if (排序 !== 'none') {
      assert.equal(
        伪元素,
        'none',
        `${说明}：第 ${i + 1} 列的箭头不应占用标签右侧空间（::after=${伪元素}）`,
      );
    }
  });
}
await 量对齐('默认序');

// —— 默认排序（本书万分之降）：滚遍全表，逐行与节点侧期望完全一致 ——
const 首屏 = await 读窗口('#字频对照列表');
断言窗口连续(首屏, '字频对照首屏');
断言窗口内容(首屏, 单字序列, '默认序首屏');
assert.equal(首屏.序号[0], 0, '首屏第一行应是全书最高频字');
assert.equal(首屏.行[0].length, 6, '每行应为六格');
assert.ok(首屏.DOM行数 < 分析.单字数 / 4, `DOM 行数没体现虚拟：${首屏.DOM行数}`);
assert.ok(
  Math.abs(首屏.表体高 - 分析.单字数 * 首屏.行高) <= 首屏.行高,
  `占位行撑出的表体高应≈全量行高：${首屏.表体高} vs ${分析.单字数 * 首屏.行高}`,
);
await 截图('字频对照-六列默认序.png');

const 见过 = new Map();
const 步长 = Math.max(首屏.行高, 首屏.容器视口高 - 缓冲行数 * 首屏.行高);
for (let 顶 = 0; 顶 <= 首屏.容器滚动高; 顶 += 步长) {
  await 滚到('#字频对照容器', 顶);
  const 窗口 = await 读窗口('#字频对照列表');
  断言窗口连续(窗口, `默认序 scrollTop=${顶}`);
  assert.equal(
    窗口.序号[0],
    // 用容器实际的 scrollTop 判断：超出最大滚动距离时浏览器会夹取，请求值可能更大
    Math.max(0, Math.floor(窗口.容器顶 / 窗口.行高) - 缓冲行数),
    `窗口起点与 scrollTop 不符（scrollTop=${窗口.容器顶}，请求 ${顶}）`,
  );
  assert.ok(
    窗口.DOM行数 <= Math.ceil(窗口.容器视口高 / 窗口.行高) + 2 * 缓冲行数 + 2,
    `窗口行数超上限：${窗口.DOM行数}`,
  );
  断言窗口内容(窗口, 单字序列, `默认序 scrollTop=${顶}`);
  窗口.序号.forEach((行序号, i) => 见过.set(行序号, 窗口.行[i]));
}
assert.equal(见过.size, 分析.单字数, '滚遍全表应覆盖每一个汉字');
const 缺表字数 = [...见过.values()].filter(([, 现代]) => 现代 === '—').length;
assert.ok(缺表字数 > 0, '本书应含有现代字频表未收录的字，用于验证「—」分支');
assert.ok(
  结构.摘要.includes(`${(计数.size - 缺表字数).toLocaleString('zh-CN')} 字有对照值`),
  `摘要命中字数应与「—」计数自洽：${结构.摘要} / ${缺表字数}`,
);
const 本书列合计 = [...计数.values()].reduce(
  (累计, 数量) => 累计 + (数量 / 汉字总数) * 10000,
  0,
);
assert.ok(Math.abs(本书列合计 - 10000) < 0.01, `本书列应合计 10000‱：${本书列合计}`);
// 名次列自洽：本书序号应恰为 1..N 各出现一次；知乎序号缺表字数与「—」一致
assert.deepEqual(
  [...new Set([...见过.values()].map((行) => 行[4]))].sort((左, 右) => 左 - 右),
  [...见过.keys()].map((序) => (序 + 1).toLocaleString('zh-CN')),
  '本书序号列应为 1..N 且不重不漏',
);
assert.equal(
  [...见过.values()].filter((行) => 行[2] === '—').length,
  缺表字数,
  '知乎序号列的「—」应与知乎万分之列一致',
);

// —— 右侧差异榜：三列各 30 行，完全独立于主表的虚拟滚动 ——
async function 读榜() {
  return 求值(`
    const 读栏 = (键) => {
      const 表体 = document.querySelector('#字频差异' + 键 + '列表');
      const 滚动 = document.querySelector('#字频差异' + 键 + '滚动');
      return {
        行数: 表体.children.length,
        行: [...表体.children].map((行) => [...行.children].map((格) => 格.textContent)),
        占位数: 表体.querySelectorAll('.虚拟占位').length,
        标题: document.querySelector('#字频差异' + 键 + '标题').textContent,
        滚动高: 滚动.scrollHeight,
        视口高: 滚动.clientHeight,
        顶: 滚动.scrollTop,
      };
    };
    return {
      弹窗加宽: document.querySelector('#词频弹窗').classList.contains('宽对照'),
      模块隐藏: document.querySelector('#字频差异模块').closest('[hidden]') !== null,
      说明: document.querySelector('#字频差异说明').textContent,
      栏数: document.querySelectorAll('#字频差异模块 .字频差异栏').length,
      偏多: 读栏('偏多'),
      偏少: 读栏('偏少'),
      最小: 读栏('最小'),
      主表顶: document.querySelector('#字频对照容器').scrollTop,
    };
  `);
}
const 榜 = await 读榜();
assert.equal(榜.弹窗加宽, true, '对照视图下弹窗应加宽放下右侧模块');
assert.equal(榜.模块隐藏, false, '对照视图下差异榜应可见');
assert.equal(榜.栏数, 3, '差异榜应为三列：偏本书 / 偏知乎 / 差异最小');
for (const 列名 of ['偏多', '偏少', '最小']) {
  assert.equal(榜[列名].行数, 30, `${列名} 榜应为 30 行`);
  assert.equal(榜[列名].占位数, 0, `${列名} 榜不走虚拟列表，不该有占位行`);
  assert.ok(榜[列名].滚动高 > 榜[列名].视口高, `${列名} 榜应有自己的滚动条`);
  assert.deepEqual(榜[列名].行, 期望榜(列名), `${列名} 榜与节点侧独立计算不一致`);
}
assert.equal(榜.偏多.标题, '偏本书 ×30');
assert.equal(榜.偏少.标题, '偏知乎 ÷30');
assert.equal(榜.最小.标题, '差异最小 30');
const { 无数据: 无现代数据字数 } = 计算榜行列表(); // 数组：被排除的字
assert.ok(
  榜.说明.includes(`${计数.size.toLocaleString('zh-CN')} 字中`),
  `说明应写明候选全集：${榜.说明}`,
);
assert.ok(
  榜.说明.includes(
    `知乎计 0 次或未收录的 ${无现代数据字数.length.toLocaleString('zh-CN')} 字无数据、不入榜`,
  ),
  `说明应报出被排除的无数据字数：${榜.说明}`,
);
assert.ok(榜.说明.includes('三列'), `说明应写明三列：${榜.说明}`);
assert.ok(
  榜.说明.includes('本书列括号内为出现次数'),
  `说明应解释本书列括号里的数：${榜.说明}`,
);
assert.ok(!/≥\s*5 次/.test(榜.说明), `说明里不该再有次数门槛：${榜.说明}`);
assert.ok(
  无现代数据字数.length > 0 && 无现代数据字数.length < 计数.size,
  `本书里应有若干字在知乎无数据，实得 ${无现代数据字数.length}/${计数.size}`,
);
// 两列方向必须纯净：偏多全是 ×、偏少全是 ÷
assert.ok(
  榜.偏多.行.every((行) => 行[3].startsWith('×')),
  `偏本书列混进了非 × 倍数：${榜.偏多.行.filter((行) => !行[3].startsWith('×')).map((行) => 行[0] + 行[3]).join(' ')}`,
);
assert.ok(
  榜.偏少.行.every((行) => 行[3].startsWith('÷')),
  `偏知乎列混进了非 ÷ 倍数：${榜.偏少.行.filter((行) => !行[3].startsWith('÷')).map((行) => 行[0] + 行[3]).join(' ')}`,
);
// 知乎无数据（计 0 或未收录）的字一律不入榜，也不该靠折算混进榜首
for (const 列名 of ['偏多', '偏少', '最小']) {
  const 漏网 = 榜[列名].行.filter((行) => 行[1] === '—' || 行[1] === '0');
  assert.deepEqual(
    漏网,
    [],
    `${列名} 列混进了知乎无数据的字：${漏网.map((行) => 行[0]).join(' ')}`,
  );
}
// 被排除的那些字（知乎计 0 / 未收录）一个都不许出现在三列里
const 无数据字集合 = new Set(无现代数据字数);
for (const 列名 of ['偏多', '偏少', '最小']) {
  const 混入 = 榜[列名].行.filter((行) => 无数据字集合.has(行[0]));
  assert.deepEqual(混入, [], `${列名} 列混入了无数据的字：${混入.map((行) => 行[0]).join(' ')}`);
}
assert.ok(
  榜.偏多.行.length === 30 && 无现代数据字数.length < 计数.size,
  '三列应各排满 30 行',
);
const 读倍数 = (文本) => {
  const 万 = 文本.includes('万');
  return Number(文本.replace(/[×÷,万]/g, '')) * (万 ? 10000 : 1);
};
for (const 列名 of ['偏多', '偏少']) {
  const 序列 = 榜[列名].行.map((行) => 读倍数(行[3]));
  assert.ok(
    序列.every((值, i) => i === 0 || 值 <= 序列[i - 1] * 1.02 + 1),
    `${列名} 列倍数应递减：${序列.join(' ')}`,
  );
  assert.ok(序列[0] >= 序列[序列.length - 1], `${列名} 列首行应是最大倍数`);
}
// 差异最小列：倍数必须真的贴近 1，且区分度够
assert.ok(
  new Set(榜.最小.行.map((行) => 行[3])).size >= 5,
  `差异最小榜的倍数区分度不够：${[...new Set(榜.最小.行.map((行) => 行[3]))].join(' ')}`,
);
const 最小榜末位 = 排榜(计算榜行列表().行列表, false).slice(0, 30).at(-1);
assert.ok(
  最小榜末位.对数差 < 0.5,
  `差异最小第 30 名应很接近 1 倍，实得 |log2|=${最小榜末位.对数差.toFixed(3)}`,
);
for (const 列名 of ['偏多', '偏少', '最小']) {
  for (const 行 of 榜[列名].行) {
    const 次数 = 计数.get(行[0]);
    assert.ok(次数 > 0, `${行[0]} 不在本书正文里，不该入榜`);
    assert.notEqual(取知乎万分率(行[0]), undefined, `${行[0]} 知乎未收录，不该入榜`);
    const 基准 = 期望行(行[0]);
    // 榜里的本书格 = 「主表本书万分之 (主表字符个数)」：两段都要能从主表复算出来
    const 格 = /^(\S+) \((.+)\)$/.exec(行[2]);
    assert.ok(格, `${行[0]} 本书格应为「万分之 (次数)」，实得「${行[2]}」`);
    assert.deepEqual(
      [行[1], 格[1], 格[2]],
      [基准[1], 基准[3], 期望次数(Number(基准[5].replace(/,/g, '')))],
      `${行[0]} 榜内数值应与主表同字的两列一致`,
    );
    assert.equal(行[0], 基准[0]);
  }
}
// 三列与主表、以及三列彼此之间滚动互不影响
await 滚到('#字频对照容器', 12345);
await 求值(`
  document.querySelector('#字频差异偏多滚动').scrollTop = 200;
  document.querySelector('#字频差异偏少滚动').scrollTop = 300;
  document.querySelector('#字频差异最小滚动').scrollTop = 400;
  return 1;
`);
await pause(120);
const 榜滚后 = await 读榜();
assert.equal(榜滚后.主表顶, 12345, '滚动差异榜不应带动主表');
assert.equal(榜滚后.偏多.顶, 200, '偏本书列应保留自己的滚动位置');
assert.equal(榜滚后.偏少.顶, 300, '偏知乎列应保留自己的滚动位置');
assert.equal(榜滚后.最小.顶, 400, '差异最小列应保留自己的滚动位置');
for (const 列名 of ['偏多', '偏少', '最小']) {
  assert.equal(榜滚后[列名].行数, 30, `${列名}：滚动后行数不变（不是虚拟窗口）`);
  assert.deepEqual(榜滚后[列名].行, 榜[列名].行, `${列名}：滚动不应改变榜单内容`);
}
// 主表六列不能被右侧模块挤到横向滚动（数字被裁就白加了列）
const 主表尺寸 = await 求值(`
  const 容器 = document.querySelector('#字频对照容器');
  const 表 = 容器.querySelector('table');
  return {
    容器宽: 容器.clientWidth,
    容器可用: 容器.clientWidth - parseFloat(getComputedStyle(容器).paddingLeft),
    表宽: Math.round(表.getBoundingClientRect().width),
    滚动宽: 容器.scrollWidth,
    模块宽: Math.round(document.querySelector('#字频差异模块').getBoundingClientRect().width),
    弹窗宽: Math.round(document.querySelector('#词频弹窗').getBoundingClientRect().width),
  };
`);
assert.ok(
  主表尺寸.滚动宽 <= 主表尺寸.容器宽 + 1,
  `主表不该横向滚动：${JSON.stringify(主表尺寸)}`,
);
// 本书列加了括号：行高不能被撑开、文字不能溢出压到倍数列、括号右边要留得住边距
const 榜布局 = await 求值(`
  const 量 = (键) => {
    const 表体 = document.querySelector('#字频差异' + 键 + '列表');
    const 行列表 = [...表体.children];
    let 最小余量 = Infinity;
    let 最宽文本 = '';
    let 压列 = 0;
    let 溢出 = 0;
    const 高 = [];
    for (const 行 of 行列表) {
      const 格 = 行.children[2];
      const 格框 = 格.getBoundingClientRect();
      const 个数框 = 格.querySelector('.本书个数').getBoundingClientRect();
      const 余量 = 格框.right - 个数框.right;
      if (余量 < 最小余量) {
        最小余量 = 余量;
        最宽文本 = 格.textContent;
      }
      if (个数框.right > 行.children[3].getBoundingClientRect().left + 0.5) 压列++;
      if (格.scrollWidth > 格.clientWidth + 1) 溢出++;
      高.push(Math.round(行.getBoundingClientRect().height));
    }
    return {
      行高: Math.max(...高),
      行高种类: [...new Set(高)],
      最小余量: Math.round(最小余量 * 10) / 10,
      最宽单元格: 最宽文本,
      压列行数: 压列,
      溢出行数: 溢出,
    };
  };
  // 把括号藏起来量一遍：行高应当一模一样，否则说明 11px 的 span 把行盒顶高了
  const 样式 = document.createElement('style');
  样式.textContent = '.本书个数{display:none}';
  document.head.append(样式);
  const 基线行高 = Math.round(
    document.querySelector('#字频差异偏多列表 tr').getBoundingClientRect().height,
  );
  样式.remove();
  return {
    基线行高,
    偏多: 量('偏多'),
    偏少: 量('偏少'),
    最小: 量('最小'),
    栏宽: Math.round(document.querySelector('.字频差异栏').getBoundingClientRect().width),
    模块宽: Math.round(document.querySelector('#字频差异模块').getBoundingClientRect().width),
    横向溢出: ['偏多', '偏少', '最小'].map((键) => {
      const 滚动 = document.querySelector('#字频差异' + 键 + '滚动');
      return 滚动.scrollWidth - 滚动.clientWidth;
    }),
    说明行数: Math.round(
      document.querySelector('#字频差异说明').getBoundingClientRect().height / 15,
    ),
  };
`);
console.log('差异榜布局:', JSON.stringify(榜布局));
assert.equal(榜布局.模块宽, 榜布局.栏宽 * 3, '模块宽应等于三栏：说明那行不许把模块撑开');
// 四列宽之和要留出竖向滚动条的 11px，否则榜单自己会横向滚，倍数列右边缘被滚动条盖住
assert.deepEqual(榜布局.横向溢出, [0, 0, 0], `差异榜出现了横向滚动：${榜布局.横向溢出}`);
for (const 列名 of ['偏多', '偏少', '最小']) {
  const 项 = 榜布局[列名];
  assert.equal(项.行高种类.length, 1, `${列名}：行高被括号撑得不一致：${项.行高种类}`);
  assert.equal(项.行高, 榜布局.基线行高, `${列名}：括号不该把行高顶离无括号时的 ${榜布局.基线行高}px`);
  assert.equal(项.压列行数, 0, `${列名}：本书列括号溢出压到了倍数列`);
  assert.equal(项.溢出行数, 0, `${列名}：本书列内容超出格子宽度`);
  assert.ok(
    项.最小余量 >= 4,
    `${列名}：本书列右边距不足 ${项.最小余量}px（最宽「${项.最宽单元格}」）`,
  );
}
await 截图('字频对照-含差异榜.png');

// —— 四个可排序列：点一次自然序、再点反向；缺表字始终垫底；窗口仍虚拟 ——
async function 验证排序(键, 方向, 说明) {
  const 期望顺序 = 期望序列(键, 方向);
  assert.equal(期望顺序.length, 分析.单字数, `${说明}：期望序列长度不对`);
  const 顶 = await 读窗口('#字频对照列表');
  断言窗口连续(顶, 说明);
  断言窗口内容(顶, 期望顺序, `${说明} 顶部`);
  assert.equal(顶.序号[0], 0, `${说明}：排序后应回到顶部`);
  assert.ok(顶.DOM行数 < 分析.单字数 / 4, `${说明}：排序后仍需虚拟`);
  assert.ok(
    Math.abs(顶.表体高 - 分析.单字数 * 顶.行高) <= 顶.行高,
    `${说明}：排序后总高不变`,
  );
  await 滚到('#字频对照容器', 顶.容器滚动高);
  const 底 = await 读窗口('#字频对照列表');
  断言窗口内容(底, 期望顺序, `${说明} 底部`);
  assert.deepEqual(
    底.行[底.行.length - 1],
    期望行(期望顺序[期望顺序.length - 1]),
    `${说明}：末行应为排序后的最后一个字`,
  );
  await 量对齐(说明);
  const 摘要 = await 求值(`return document.querySelector('#词频摘要').textContent;`);
  assert.ok(
    摘要.includes(`按${说明}`),
    `摘要未反映排序（说明=${说明}，期望顺序首字=${期望顺序[0]}，DOM 首行=${JSON.stringify(顶.行[0])}）：${摘要}`,
  );
}
const 排序列名 = {
  现代万分之: '知乎万分之',
  现代序号: '知乎序号',
  本书万分之: '本书万分之',
  本书序号: '本书序号',
  本书个数: '字符个数',
};
for (const 键 of ['现代万分之', '现代序号', '本书万分之', '本书序号', '本书个数']) {
  await 点表头(键);
  const 自然方向 = ['现代万分之', '本书万分之', '本书个数'].includes(键) ? '降' : '升';
  await 验证排序(键, 自然方向, `${排序列名[键]}${自然方向 === '降' ? '降序' : '升序'}`);
  const aria = await 求值(`
    return document.querySelector('.字频排序列[data-排序=${JSON.stringify(键)}]')
      .getAttribute('aria-sort');
  `);
  assert.equal(aria, 自然方向 === '降' ? 'descending' : 'ascending', `${键} aria-sort 不对`);
  await 点表头(键);
  await 验证排序(键, 自然方向 === '降' ? '升' : '降', `${排序列名[键]}${自然方向 === '降' ? '升序' : '降序'}`);
  const aria2 = await 求值(`
    return document.querySelector('.字频排序列[data-排序=${JSON.stringify(键)}]')
      .getAttribute('aria-sort');
  `);
  assert.equal(aria2, 自然方向 === '降' ? 'ascending' : 'descending', `${键} 二次点击未反向`);
}
// 知乎万分之升序时，查不到的字仍在最后（不跟着方向跳到最前）
await 点表头('现代万分之');
await 点表头('现代万分之');
const 升序顶部 = await 读窗口('#字频对照列表');
断言窗口内容(升序顶部, 期望序列('现代万分之', '升'), '知乎万分之升序 顶部');
await 滚到('#字频对照容器', 升序顶部.容器滚动高);
const 升序底部 = await 读窗口('#字频对照列表');
assert.equal(
  升序底部.行[升序底部.行.length - 1][1],
  '—',
  '知乎万分之升序时缺表字仍应排在最后',
);
await 截图('字频对照-知乎万分之升序.png');

const 榜排序后 = await 读榜();
for (const 列名 of ['偏多', '偏少', '最小']) {
  assert.deepEqual(榜排序后[列名].行, 榜[列名].行, `主表排序不应影响${列名}榜`);
}

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
  `一次表表体高应≈自己的行数：${一次窗.表体高} vs ${分析.一次数 * 一次窗.行高}`,
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
if (分析.一次数 < 分析.重复数 - 20) {
  await 滚到('#单字双列表', 一次窗.表体高 + 重复窗.行高 * 30);
  const 后段 = {
    重复: await 读窗口('#单字重复列表'),
    一次: await 读窗口('#单字一次列表'),
  };
  assert.equal(后段.一次.DOM行数, 0, '一次表读完后不应再渲染真实行');
  assert.equal(后段.一次.占位数, 1, '一次表读完后应只剩一条底部占位行');
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

// —— 方向键切 tab；回到对照后保留上次排序并从顶部重新渲染 ——
await 求值(`
  [...document.querySelectorAll('.词频标签')].find((b) => b.dataset.视图 === '对照').click();
  document.querySelector('#字频对照容器').scrollTop = 5000;
  return 1;
`);
await pause(120);
const 回对照前摘要 = await 求值(`return document.querySelector('#词频摘要').textContent;`);
await 求值(`
  const 对照 = [...document.querySelectorAll('.词频标签')].find((b) => b.dataset.视图 === '对照');
  对照.focus();
  对照.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  return 1;
`);
await pause(150);
assert.deepEqual(
  await 求值(`
    return {
      当前: [...document.querySelectorAll('.词频标签')].find((b) => b.classList.contains('当前')).dataset.视图,
      对照隐藏: document.querySelector('#字频对照视图').hidden,
      单字显示: !document.querySelector('#单字双列表').hidden,
    };
  `),
  { 当前: '1', 对照隐藏: true, 单字显示: true },
);
await 求值(`
  const 单字 = [...document.querySelectorAll('.词频标签')].find((b) => b.dataset.视图 === '1');
  单字.focus();
  单字.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  return 1;
`);
await pause(150);
const 回对照 = await 读窗口('#字频对照列表');
assert.equal(回对照.容器顶, 0, '切回对照应回到列表顶部');
assert.equal(回对照.序号[0], 0);
const 回对照摘要 = await 求值(`return document.querySelector('#词频摘要').textContent;`);
assert.equal(回对照摘要, 回对照前摘要, '切 tab 不应丢掉当前排序');
断言窗口内容(回对照, 期望序列('现代万分之', '升'), '回对照沿用升序');

console.log(
  `\nOK：${目标文本} ${汉字总数.toLocaleString('zh-CN')} 汉字 / ${分析.单字数.toLocaleString('zh-CN')} 去重字；` +
    `默认序滚遍全表逐行比对六格全对（缺表 ${缺表字数} 字，本书列合计 ${本书列合计.toFixed(0)}‱），` +
    `五列点击排序 + 反向全对且缺表字恒垫底；三视图均虚拟（对照 ${首屏.DOM行数} 行 / 单字 ${重复窗.DOM行数}+${一次窗.DOM行数} 行 / 二字 ${二字窗.DOM行数} 行，` +
    `全量 ${分析.单字数} / ${分析.重复数}+${分析.一次数} / ${分析.二字数}），翻页控件已移除`,
);
收尾();
