import { 是汉字 } from './文本工具.js';
import { 按需让出主线程 } from './调度.js';
import { 元素, 状态 } from './状态.js';

// 词频弹窗：从 app.js 绑定事件() 闭包拆出。
// 簇内函数仅互相调用且只被绑定区 / Ctrl+A 键盘分支引用，无跨簇依赖，可独立成模块。
// 闭包私有状态降为模块级 let；竞态机制原样保留：
// 词频统计用「任务对象同一性判定」（词频分析任务 === 本次任务），结果仍只存 状态.词频分析。

let 当前词频字数 = 1;
let 当前词频页码 = 1;
const 每页词频数 = 200;
let 词频分析任务 = null;

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
  元素.单字重复列表.replaceChildren();
  元素.单字一次列表.replaceChildren();
  元素.词频分页.hidden = true;
  const 本次任务 = {
    载入序号: 状态.载入序号,
    文本: 状态.文本,
  };
  词频分析任务 = 本次任务;
  await scheduler.yield();
  try {
    const 开始时间 = performance.now();
    const 分析 = await 统计全文词频(本次任务.文本, 任务仍然有效);
    if (!分析 || !任务仍然有效()) {
      return;
    }
    状态.词频分析 = 分析;
    当前词频页码 = 1;
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
  切换词频字数(Number(标签.dataset.字数));
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
  切换词频字数(Number(目标标签.dataset.字数));
  目标标签.focus();
}

export function 翻词频页(方向) {
  当前词频页码 += 方向;
  渲染词频页();
}

function 切换词频字数(字数) {
  当前词频字数 = 字数;
  当前词频页码 = 1;
  元素.单字双列表.hidden = 字数 !== 1;
  元素.词频表格容器.hidden = 字数 === 1;
  for (const 标签 of 元素.词频标签栏.querySelectorAll('.词频标签')) {
    const 是当前 = Number(标签.dataset.字数) === 字数;
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
  const 是单字 = 当前词频字数 === 1;
  const 统计列表 = 是单字 ? 分析.单字列表.重复 : 分析.列表[当前词频字数];
  const 最长列表数 = 是单字
    ? Math.max(统计列表.length, 分析.单字列表.一次.length)
    : 统计列表.length;
  const 总页数 = Math.max(1, Math.ceil(最长列表数 / 每页词频数));
  当前词频页码 = Math.min(总页数, Math.max(1, 当前词频页码));
  const 起点 = (当前词频页码 - 1) * 每页词频数;
  if (是单字) {
    元素.单字重复列表.replaceChildren(创建词频表格片段(统计列表, 起点));
    元素.单字一次列表.replaceChildren(
      创建词频表格片段(分析.单字列表.一次, 起点),
    );
  } else {
    元素.词频列表.replaceChildren(创建词频表格片段(统计列表, 起点));
  }

  const 统计说明 = 是单字
    ? `${分析.单字列表.一次.length.toLocaleString('zh-CN')} 个字只出现一次`
    : `${统计列表.length.toLocaleString('zh-CN')} 种${['二', '三', '四', '五', '六'][当前词频字数 - 2]}字组合`;
  元素.词频摘要.textContent = `${分析.去重汉字数.toLocaleString('zh-CN')} 个汉字 · ${统计说明}`;
  元素.词频页码.textContent = `${当前词频页码.toLocaleString('zh-CN')} / ${总页数.toLocaleString('zh-CN')}`;
  元素.词频上一页.disabled = 当前词频页码 === 1;
  元素.词频下一页.disabled = 当前词频页码 === 总页数;
  元素.词频分页.hidden = 总页数 === 1;
  (是单字 ? 元素.单字双列表 : 元素.词频表格容器).scrollTop = 0;

  function 创建词频表格片段(列表, 起点) {
    const 表格片段 = document.createDocumentFragment();
    const 本页列表 = 列表.slice(起点, 起点 + 每页词频数);
    for (const [idx, 统计项] of 本页列表.entries()) {
      const 行 = document.createElement('tr');
      const 排名单元格 = document.createElement('td');
      const 字词单元格 = document.createElement('td');
      const 频次单元格 = document.createElement('td');
      排名单元格.textContent = (起点 + idx + 1).toLocaleString('zh-CN');
      字词单元格.textContent = 统计项.文本;
      频次单元格.textContent = 统计项.数量.toLocaleString('zh-CN');
      行.append(排名单元格, 字词单元格, 频次单元格);
      表格片段.append(行);
    }
    return 表格片段;
  }
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
