import { 是汉字 } from './文本工具.js';
import { 让出主线程, 按需让出主线程 } from './调度.js';
import { 元素, 状态 } from './状态.js';
import { 创建虚拟列表 } from './虚拟列表.js';
import { 取知乎万分率, 知乎字频说明 } from './知乎字频.js';

// 词频弹窗：从 app.js 绑定事件() 闭包拆出。
// 簇内函数仅互相调用且只被绑定区 / Ctrl+A 键盘分支引用，无跨簇依赖，可独立成模块。
// 闭包私有状态降为模块级 let；竞态机制原样保留：
// 词频统计用「任务对象同一性判定」（词频分析任务 === 本次任务），结果仍只存 状态.词频分析。
// 视图只有一维：'对照'（知乎现代字频 vs 本书字频）或 '1'..'6'（N 字组合）。
// 所有视图共用同一套虚拟列表（js/虚拟列表.js），没有翻页：多长的列表都直接滚。

const 对照视图 = '对照';

let 当前词频视图 = 对照视图;
let 词频分析任务 = null;
let 当前分析 = null;

let 对照虚拟列表 = null;
let 单字虚拟列表 = null;
let 组合虚拟列表 = null;

function 取对照虚拟列表() {
  if (!对照虚拟列表) {
    对照虚拟列表 = 创建虚拟列表(元素.字频对照容器, [
      { 表体: 元素.字频对照列表, 列数: 3, 创建行: 创建字频对照行 },
    ]);
  }
  return 对照虚拟列表;
}

function 取单字虚拟列表() {
  if (!单字虚拟列表) {
    单字虚拟列表 = 创建虚拟列表(元素.单字双列表, [
      { 表体: 元素.单字重复列表, 列数: 3, 创建行: 创建词频行 },
      { 表体: 元素.单字一次列表, 列数: 3, 创建行: 创建词频行 },
    ]);
  }
  return 单字虚拟列表;
}

function 取组合虚拟列表() {
  if (!组合虚拟列表) {
    组合虚拟列表 = 创建虚拟列表(元素.词频表格容器, [
      { 表体: 元素.词频列表, 列数: 3, 创建行: 创建词频行 },
    ]);
  }
  return 组合虚拟列表;
}

export async function 打开词频弹窗() {
  if (!元素.词频弹窗.open) {
    元素.词频弹窗.showModal();
  }
  if (状态.词频分析) {
    渲染词频页();
    return;
  }
  if (!状态.文件名) {
    元素.词频摘要.textContent = '正文尚未载入';
    return;
  }
  if (词频分析任务) {
    return;
  }

  元素.词频摘要.textContent = '正在统计全文';
  元素.词频列表.replaceChildren();
  元素.字频对照列表.replaceChildren();
  元素.单字重复列表.replaceChildren();
  元素.单字一次列表.replaceChildren();
  const 本次任务 = {
    载入序号: 状态.载入序号,
    文本: 状态.文本,
  };
  词频分析任务 = 本次任务;
  // 让出主线程经 调度.js 统一回退，禁止裸调 scheduler.yield()（非 Chromium 会抛 ReferenceError）
  await 让出主线程();
  try {
    const 开始时间 = performance.now();
    const 分析 = await 统计全文词频(本次任务.文本, 任务仍然有效);
    if (!分析 || !任务仍然有效()) {
      return;
    }
    状态.词频分析 = 分析;
    渲染词频页();
    console.info('[阅读器] 词频分析完成', {
      汉字总数: 分析.汉字总数,
      去重汉字数: 分析.去重汉字数,
      单字种数: 分析.列表[1].length,
      二字种数: 分析.列表[2].length,
      三字种数: 分析.列表[3].length,
      四字种数: 分析.列表[4].length,
      五字种数: 分析.列表[5].length,
      六字种数: 分析.列表[6].length,
      只出现一次单字数: 分析.单字列表.一次.length,
      耗时毫秒: Math.round(performance.now() - 开始时间),
    });
  } finally {
    if (词频分析任务 === 本次任务) {
      词频分析任务 = null;
    }
  }

  function 任务仍然有效() {
    return (
      词频分析任务 === 本次任务 &&
      状态.载入序号 === 本次任务.载入序号 &&
      状态.文本 === 本次任务.文本
    );
  }
}

export function 关闭词频弹窗() {
  if (!元素.词频弹窗.open) {
    return;
  }
  元素.词频弹窗.close();
  元素.滚动容器.focus({ preventScroll: true });
}

export function 取消词频分析() {
  if (!词频分析任务) {
    return;
  }
  词频分析任务 = null;
  元素.词频摘要.textContent = '统计已取消';
}

export function 处理词频弹窗点击(事件) {
  if (事件.target === 元素.词频弹窗) {
    关闭词频弹窗();
  }
}

export function 处理词频标签点击(事件) {
  const 标签 = 事件.target.closest('.词频标签');
  if (!(标签 instanceof HTMLButtonElement)) {
    return;
  }
  切换词频视图(标签.dataset.视图);
}

export function 处理词频标签键盘(事件) {
  if (事件.key !== 'ArrowLeft' && 事件.key !== 'ArrowRight') {
    return;
  }
  const 标签列表 = [...元素.词频标签栏.querySelectorAll('.词频标签')];
  const 当前idx = 标签列表.indexOf(事件.target);
  if (当前idx === -1) {
    return;
  }
  事件.preventDefault();
  const 步进 = 事件.key === 'ArrowRight' ? 1 : -1;
  const 目标标签 =
    标签列表[(当前idx + 步进 + 标签列表.length) % 标签列表.length];
  切换词频视图(目标标签.dataset.视图);
  目标标签.focus();
}

function 切换词频视图(视图) {
  当前词频视图 = 视图;
  const 是单字 = 视图 === '1';
  const 是对照 = 视图 === 对照视图;
  元素.字频对照容器.hidden = !是对照;
  元素.单字双列表.hidden = !是单字;
  元素.词频表格容器.hidden = 是单字 || 是对照;
  for (const 标签 of 元素.词频标签栏.querySelectorAll('.词频标签')) {
    const 是当前 = 标签.dataset.视图 === 视图;
    标签.classList.toggle('当前', 是当前);
    标签.setAttribute('aria-selected', String(是当前));
    标签.tabIndex = 是当前 ? 0 : -1;
  }
  渲染词频页();
}

function 渲染词频页() {
  const 分析 = 状态.词频分析;
  if (!分析) {
    return;
  }
  当前分析 = 分析;
  const 去重汉字数 = 分析.去重汉字数.toLocaleString('zh-CN');
  if (当前词频视图 === 对照视图) {
    取对照虚拟列表().设置数据([分析.列表[1]]);
    元素.词频摘要.textContent =
      `${知乎字频说明} · 单位：万分之 · 本书 ${去重汉字数} 字中 ` +
      `${统计现代表命中字数(分析).toLocaleString('zh-CN')} 字有对照值`;
    return;
  }
  const 当前词频字数 = Number(当前词频视图);
  if (当前词频字数 === 1) {
    取单字虚拟列表().设置数据([分析.单字列表.重复, 分析.单字列表.一次]);
    元素.词频摘要.textContent = `${去重汉字数} 个汉字 · ${分析.单字列表.一次.length.toLocaleString('zh-CN')} 个字只出现一次`;
    return;
  }
  const 统计列表 = 分析.列表[当前词频字数];
  取组合虚拟列表().设置数据([统计列表]);
  元素.词频摘要.textContent = `${去重汉字数} 个汉字 · ${统计列表.length.toLocaleString('zh-CN')} 种${['二', '三', '四', '五', '六'][当前词频字数 - 2]}字组合`;
}

function 统计现代表命中字数(分析) {
  if (!分析.现代表命中字数) {
    分析.现代表命中字数 = 分析.列表[1].reduce(function 计数命中(累计, 项) {
      return 取知乎万分率(项.文本) === undefined ? 累计 : 累计 + 1;
    }, 0);
  }
  return 分析.现代表命中字数;
}

// 排名 / 字词 / 频次三列：单字的两张表与二至六字组合表共用同一行结构
function 创建词频行(统计项, 序号) {
  const 行 = document.createElement('tr');
  const 排名单元格 = document.createElement('td');
  const 字词单元格 = document.createElement('td');
  const 频次单元格 = document.createElement('td');
  行.dataset.序号 = 序号;
  排名单元格.textContent = (序号 + 1).toLocaleString('zh-CN');
  字词单元格.textContent = 统计项.文本;
  频次单元格.textContent = 统计项.数量.toLocaleString('zh-CN');
  行.append(排名单元格, 字词单元格, 频次单元格);
  return 行;
}

// 字频对照行：本书汉字与现代（知乎语料）字频并排，两列同为万分之，可直接对读。
// 不在现代字频表里的字（扩展区、繁体、生僻字）知乎列显示「—」，不静默丢行。
function 创建字频对照行(统计项, 序号) {
  const 行 = document.createElement('tr');
  const 字单元格 = document.createElement('td');
  const 现代单元格 = document.createElement('td');
  const 本书单元格 = document.createElement('td');
  const 现代值 = 取知乎万分率(统计项.文本);
  行.dataset.序号 = 序号;
  字单元格.textContent = 统计项.文本;
  现代单元格.textContent = 格式化万分率(现代值);
  if (现代值 === undefined) {
    现代单元格.classList.add('字频缺表');
    现代单元格.title = '该字不在现代字频表（通用规范汉字表）内';
  }
  本书单元格.textContent = 格式化万分率(
    (统计项.数量 / 当前分析.汉字总数) * 10000,
  );
  行.append(字单元格, 现代单元格, 本书单元格);
  return 行;
}

// 万分之口径：≥10 向下取整（源表「的」为 403.89，显示 403），
// 1~10 与不足 1 的都取 3 位有效数字，低频字不会被抹成 0，也不会出现 0.999→「1.00」的假象。
function 格式化万分率(值) {
  if (值 === undefined) {
    return '—';
  }
  if (值 === 0) {
    return '0';
  }
  if (值 >= 10) {
    return String(Math.floor(值));
  }
  return 值.toPrecision(3);
}

async function 统计全文词频(全文, 任务仍然有效) {
  const 词频映射 = Array.from({ length: 7 }, function 创建词频映射() {
    return new Map();
  });
  const 连续汉字 = [];
  let 汉字总数 = 0;
  let 文本位置 = 0;
  let 已扫描字符数 = 0;
  let 时间片开始 = performance.now();

  for (const 字 of 全文) {
    if (!是汉字(字)) {
      连续汉字.length = 0;
      文本位置 += 字.length;
    } else {
      汉字总数 += 1;
      连续汉字.push({ 字, 位置: 文本位置 });
      if (连续汉字.length > 6) {
        连续汉字.shift();
      }
      let 字词 = '';
      for (
        let 起点 = 连续汉字.length - 1, 字数 = 1;
        起点 >= 0;
        起点 -= 1, 字数 += 1
      ) {
        字词 = 连续汉字[起点].字 + 字词;
        记录词频(词频映射[字数], 字词, 连续汉字[起点].位置);
      }
      文本位置 += 字.length;
    }
    已扫描字符数 += 1;
    if ((已扫描字符数 & 255) === 0) {
      时间片开始 = await 按需让出主线程(时间片开始);
      if (!任务仍然有效()) {
        return null;
      }
    }
  }

  const 被更长组合覆盖 = Array.from({ length: 7 }, function 创建覆盖集合() {
    return new Set();
  });
  let 已检查组合数 = 0;
  for (let 字数 = 2; 字数 <= 5; 字数 += 1) {
    for (const [更长文本, 更长统计] of 词频映射[字数 + 1]) {
      const 更长汉字 = [...更长文本];
      for (const 起点 of [0, 1]) {
        const 短文本 = 更长汉字.slice(起点, 起点 + 字数).join('');
        const 短统计 = 词频映射[字数].get(短文本);
        if (短统计.数量 === 更长统计.数量) {
          被更长组合覆盖[字数].add(短文本);
        }
      }
      已检查组合数 += 1;
      if ((已检查组合数 & 1023) === 0) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!任务仍然有效()) {
          return null;
        }
      }
    }
  }

  const 列表 = {};
  for (const 字数 of [1, 2, 3, 4, 5, 6]) {
    const 统计列表 = [];
    for (const [文本, 统计] of 词频映射[字数]) {
      if (字数 === 1 || (统计.数量 > 1 && !被更长组合覆盖[字数].has(文本))) {
        统计列表.push({ 文本, 数量: 统计.数量, 首次位置: 统计.首次位置 });
      }
      已检查组合数 += 1;
      if ((已检查组合数 & 1023) === 0) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!任务仍然有效()) {
          return null;
        }
      }
    }
    统计列表.sort(function 排序词频(左项, 右项) {
      return 右项.数量 - 左项.数量 || 左项.首次位置 - 右项.首次位置;
    });
    列表[字数] = 统计列表;
  }
  const 单字列表 = {
    重复: 列表[1].filter(function 筛选重复单字(项) {
      return 项.数量 > 1;
    }),
    一次: 列表[1].filter(function 筛选只出现一次的单字(项) {
      return 项.数量 === 1;
    }),
  };
  return {
    汉字总数,
    去重汉字数: 词频映射[1].size,
    列表,
    单字列表,
  };

  function 记录词频(映射, 字词, 首次位置) {
    const 已有统计 = 映射.get(字词);
    if (已有统计) {
      已有统计.数量 += 1;
      return;
    }
    映射.set(字词, { 数量: 1, 首次位置 });
  }
}
