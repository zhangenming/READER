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
import { 取知乎序号, 取知乎万分率 } from '../js/知乎字频.js';

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

// 排序后的完整期望序列，与页面同一套规则：现代表查不到的字永远垫底，并列按本书名次
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

let 页面就绪 = false;
for (let i = 0; i < 200; i++) {
  页面就绪 = await 求值(
    `return !!document.querySelector('#内容选择按钮') &&
        (!document.querySelector('#载入状态') || document.querySelector('#载入状态').hidden);`,
  );
  if (页面就绪) break;
  await pause(200);
}
assert.ok(
  页面就绪,
  `页面应已加载出阅读器工具条（服务端口 ${站点端口}）：${服务日志.join('').slice(0, 400)}`,
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
      对照隐藏: document.querySelector('#字频对照容器').hidden,
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
