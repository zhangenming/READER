import { 是汉字 } from './文本工具.js';
import { 让出主线程, 按需让出主线程 } from './调度.js';
import { 元素, 状态 } from './状态.js';
import { 创建虚拟列表 } from './虚拟列表.js';
import { 取知乎万分率, 取知乎序号, 知乎字频说明 } from './知乎字频.js';

// 词频弹窗：从 app.js 绑定事件() 闭包拆出。
// 簇内函数仅互相调用且只被绑定区 / Ctrl+A 键盘分支引用，无跨簇依赖，可独立成模块。
// 闭包私有状态降为模块级 let；竞态机制原样保留：
// 词频统计用「任务对象同一性判定」（词频分析任务 === 本次任务），结果仍只存 状态.词频分析。
// 视图只有一维：'对照'（知乎现代字频 vs 本书字频）或 '1'..'6'（N 字组合）。
// 所有视图共用同一套虚拟列表（js/虚拟列表.js），没有翻页：多长的列表都直接滚。

const 对照视图 = '对照';

// 字频对照的五个可排序列：两组万分之、两组名次、外加本书字符个数。
// 点一次给该列的「自然序」（数值列从大到小、名次列从小到大=第 1 名在前），再点切换方向。
const 对照排序列 = {
  现代万分之: { 自然方向: '降', 名: '知乎万分之' },
  现代序号: { 自然方向: '升', 名: '知乎序号' },
  本书万分之: { 自然方向: '降', 名: '本书万分之' },
  本书序号: { 自然方向: '升', 名: '本书序号' },
  本书个数: { 自然方向: '降', 名: '字符个数' },
};

let 当前词频视图 = 对照视图;
let 词频分析任务 = null;
let 当前分析 = null;
let 对照排序 = { 键: '本书万分之', 方向: '降' };

let 对照虚拟列表 = null;
let 单字虚拟列表 = null;
let 组合虚拟列表 = null;

function 取对照虚拟列表() {
  if (!对照虚拟列表) {
    对照虚拟列表 = 创建虚拟列表(元素.字频对照容器, [
      { 表体: 元素.字频对照列表, 列数: 6, 创建行: 创建字频对照行 },
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

// 字频对照表头：四列（两组万分之 / 序号）点一次排该列的自然序，再点切换方向
export function 处理字频排序点击(事件) {
  const 表头 = 事件.target.closest('.字频排序列');
  if (!(表头 instanceof HTMLTableCellElement)) {
    return;
  }
  const 键 = 表头.dataset.排序;
  if (!(键 in 对照排序列)) {
    return;
  }
  对照排序 =
    对照排序.键 === 键
      ? { 键, 方向: 对照排序.方向 === '降' ? '升' : '降' }
      : { 键, 方向: 对照排序列[键].自然方向 };
  渲染词频页();
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
    取对照虚拟列表().设置数据([排序对照行(分析)]);
    更新对照表头排序标记();
    元素.词频摘要.textContent =
      `${知乎字频说明} · 单位：万分之 · 本书 ${去重汉字数} 字中 ` +
      `${统计现代表命中字数(分析).toLocaleString('zh-CN')} 字有对照值 · ` +
      `按${对照排序列[对照排序.键].名}${对照排序.方向 === '降' ? '降序' : '升序'}`;
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

// 本书名次：按本书频次降序的名次（并列按全文首次出现顺序），与显示顺序无关，
// 所以排到知乎那一侧时「本书序号」仍然是它在本书里的第几名。
function 取本书序号映射(分析) {
  if (!分析.本书序号映射) {
    分析.本书序号映射 = new Map(
      分析.列表[1].map(function 记名次(项, 序) {
        return [项.文本, 序 + 1];
      }),
    );
  }
  return 分析.本书序号映射;
}

function 排序对照行(分析) {
  const 本书序号映射 = 取本书序号映射(分析);
  const 键 = 对照排序.键;
  const 符号 = 对照排序.方向 === '降' ? -1 : 1;
  const 取现代值 = 键 === '现代序号' ? 取知乎序号 : 取知乎万分率;
  const 看现代 = 键 === '现代万分之' || 键 === '现代序号';
  return 分析.列表[1].slice().sort(function 比较对照行(左, 右) {
    const 左名次 = 本书序号映射.get(左.文本);
    const 右名次 = 本书序号映射.get(右.文本);
    if (看现代) {
      // 现代表里查不到的字（扩展区、繁体、生僻字）永远排在尾部，不随方向跳到最前
      const 左值 = 取现代值(左.文本);
      const 右值 = 取现代值(右.文本);
      if (左值 === undefined || 右值 === undefined) {
        if (左值 === 右值) {
          return 左名次 - 右名次;
        }
        return 左值 === undefined ? 1 : -1;
      }
      if (左值 !== 右值) {
        return (左值 - 右值) * 符号;
      }
    } else {
      const 左值 = 键 === '本书序号' ? 左名次 : 左.数量;
      const 右值 = 键 === '本书序号' ? 右名次 : 右.数量;
      if (左值 !== 右值) {
        return (左值 - 右值) * 符号;
      }
    }
    return 左名次 - 右名次;
  });
}

function 更新对照表头排序标记() {
  for (const 表头 of 元素.字频对照容器.querySelectorAll('.字频排序列')) {
    const 是当前列 = 表头.dataset.排序 === 对照排序.键;
    表头.setAttribute(
      'aria-sort',
      !是当前列
        ? 'none'
        : 对照排序.方向 === '降'
          ? 'descending'
          : 'ascending',
    );
  }
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

// 字频对照行：汉字 | 知乎万分之 | 序号 | 本书万分之 | 序号 | 字符个数。
// 数值与名次可分别排序；不在现代字频表里的字（扩展区、繁体、生僻字）知乎那一组
// 两格都显示「—」，不静默丢行。
function 创建字频对照行(统计项, 序号) {
  const 行 = document.createElement('tr');
  const 字单元格 = document.createElement('td');
  const 现代单元格 = document.createElement('td');
  const 现代名次单元格 = document.createElement('td');
  const 本书单元格 = document.createElement('td');
  const 本书名次单元格 = document.createElement('td');
  const 本书个数单元格 = document.createElement('td');
  const 现代值 = 取知乎万分率(统计项.文本);
  const 现代名次 = 取知乎序号(统计项.文本);
  行.dataset.序号 = 序号;
  字单元格.textContent = 统计项.文本;
  现代单元格.textContent = 格式化万分率(现代值);
  现代名次单元格.textContent = 显示名次(现代名次);
  if (现代值 === undefined) {
    现代单元格.classList.add('字频缺表');
    现代名次单元格.classList.add('字频缺表');
    现代单元格.title = '该字不在现代字频表（通用规范汉字表）内';
    现代名次单元格.title = 现代单元格.title;
  }
  本书单元格.textContent = 格式化万分率(
    (统计项.数量 / 当前分析.汉字总数) * 10000,
  );
  本书名次单元格.textContent = 显示名次(
    取本书序号映射(当前分析).get(统计项.文本),
  );
  本书个数单元格.textContent = 统计项.数量.toLocaleString('zh-CN');
  行.append(
    字单元格,
    现代单元格,
    现代名次单元格,
    本书单元格,
    本书名次单元格,
    本书个数单元格,
  );
  return 行;
}

function 显示名次(值) {
  return 值 === undefined ? '—' : 值.toLocaleString('zh-CN');
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
