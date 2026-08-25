import { 字素分段器, 词组分段器 } from './常量.js';
import { 按需让出主线程 } from './调度.js';
import { 元素, 状态, 查找关键词, 获取静止滚动位置 } from './状态.js';
import { 查找偏移所在行 } from './排版引擎.js';
import { 渲染可见行 } from './虚拟渲染.js';
import { 创建关键词标记, 查找关键词命中 } from './关键词.js';
import { 更新关键词指示器 } from './指示器.js';
import { 动画滚动到 } from './跳转动画.js';
import { 读取阅读位置 } from './持久化.js';

// 查找弹窗 + 词组搭配分析：从 app.js 绑定事件() 闭包拆出。
// 执行实时查找 内联调用 处理词组分析，两簇共享查找输入框与取消逻辑，必须同模块
// （若拆开会造成双向依赖，破坏无环依赖图）。
// 闭包私有状态降为模块级 let；竞态机制原样保留：
// 词组搭配用「序号令牌」（词组分析序号），实时查找用 250ms 防抖计时器。

let 查找临时状态 = null;
let 实时查找计时器 = 0;
let 词组分析序号 = 0;
let 分析结果视图 = null;
const 每批分析结果数 = 200;
const 实时查找延迟 = 250; // 输入停止后延时触发实时查找，避免每个按键都全文扫描

export function 打开查找弹窗() {
  if (!元素.查找弹窗.open) {
    元素.查找弹窗.showModal();
  }
  清除查找错误();
  requestAnimationFrame(function 聚焦查找输入框() {
    元素.查找输入框.focus();
    元素.查找输入框.select();
  });
}

export function 关闭查找弹窗() {
  if (!元素.查找弹窗.open) {
    return;
  }
  window.clearTimeout(实时查找计时器);
  实时查找计时器 = 0;
  元素.查找弹窗.close();
  元素.滚动容器.focus({ preventScroll: true });
}

export function 处理查找弹窗关闭() {
  if (!查找临时状态) {
    return;
  }
  const 原状态 = 查找临时状态;
  查找临时状态 = null;
  移除临时查找关键词();
  状态.当前关键词id = 原状态.当前关键词id;
  const 原关键词 = 查找关键词(原状态.当前关键词id);
  if (原关键词 && 原状态.当前命中idx >= 0) {
    原关键词.当前命中idx = Math.min(
      原状态.当前命中idx,
      原关键词.命中位置.length - 1,
    );
  }
  状态.悬停关键词id = 原状态.悬停关键词id;
  状态.悬停命中idx = 原状态.悬停命中idx;
  渲染可见行(true);
  更新关键词指示器();
  动画滚动到(原状态.滚动位置);
  console.info('[阅读器] 查找临时定位已恢复', {
    阅读偏移: 原状态.阅读位置.阅读偏移,
  });
}

export function 处理查找弹窗点击(事件) {
  if (事件.target === 元素.查找弹窗) {
    关闭查找弹窗();
  }
}

// 中文输入法组词过程中不触发实时查找
export function 标记合成开始() {
  元素.查找输入框.dataset.合成中 = '1';
  window.clearTimeout(实时查找计时器);
}

// 组词结束后主动提交一次：部分输入法上屏后的最终 input 事件不会到达或先于本事件，
// 仅依赖 input 会漏掉最后一次更新，导致实时查询不触发（表现为上一个/下一个一直禁用）。
export function 合成结束提交() {
  delete 元素.查找输入框.dataset.合成中;
  window.clearTimeout(实时查找计时器);
  实时查找计时器 = window.setTimeout(执行实时查找, 实时查找延迟);
}

export function 处理查找提交(事件) {
  // 输入框已无独立按钮，回车仅用于跳过防抖立即查询
  事件.preventDefault();
  window.clearTimeout(实时查找计时器);
  实时查找计时器 = 0;
  执行实时查找();
}

function 执行实时查找() {
  实时查找计时器 = 0;
  const 查询 = 解析查找查询(元素.查找输入框.value.trim());
  if (查询.错误 || !查询.目标) {
    // 输入为空或不完整时静默清除旧结果
    清除查找错误();
    取消词组分析();
    清空分析结果();
    if (查找临时状态) {
      状态.悬停关键词id = 查找临时状态.悬停关键词id;
      状态.悬停命中idx = 查找临时状态.悬停命中idx;
      移除临时查找关键词();
      渲染可见行(true);
      更新关键词指示器();
    }
    return;
  }
  if (!状态.文件名) {
    显示查找错误('正文尚未载入');
    return;
  }

  const 命中位置 = 查找带排除前缀的命中(查询.目标, 查询.排除前缀);
  if (!命中位置.length) {
    显示查找错误('未找到该关键词');
    更新查找导航状态(null);
    清空分析结果();
    console.info('[阅读器] 查找无匹配', { 查询 });
    return;
  }

  const 关键词 = 创建临时查找关键词(
    元素.查找输入框.value.trim(),
    查询,
    命中位置,
  );
  查找临时状态.命中idx = 0;
  更新查找导航状态(关键词);
  临时跳到查找命中(0);
  // 实时刷新下方搭配分析面板
  处理词组分析();
}

function 解析查找查询(查询文本) {
  const 字素 = Array.from(查询文本);
  let idx = 0;
  const 排除列表 = [];
  while (字素[idx] === '!') {
    if (!字素[idx + 1]) {
      return { 目标: '', 排除前缀: '', 错误: '排除符号后需要一个字符' };
    }
    排除列表.push(字素[idx + 1]);
    idx += 2;
  }
  return {
    目标: 字素.slice(idx).join(''),
    排除前缀: 排除列表.join(''),
  };
}

function 查找带排除前缀的命中(关键词文本, 排除前缀) {
  const 命中数组 = [];
  const 文本字素列表 = 字素分段器.segment(状态.文本);
  let 搜索位置 = 0;
  while (搜索位置 <= 状态.文本.length - 关键词文本.length) {
    const 命中位置 = 状态.文本.indexOf(关键词文本, 搜索位置);
    if (命中位置 === -1) {
      break;
    }
    const 起点在字素边界 =
      文本字素列表.containing(命中位置)?.index === 命中位置;
    const 命中终点 = 命中位置 + 关键词文本.length;
    const 终点在字素边界 =
      命中终点 === 状态.文本.length ||
      文本字素列表.containing(命中终点)?.index === 命中终点;
    const 前缀匹配 =
      排除前缀 &&
      状态.文本.slice(Math.max(0, 命中位置 - 排除前缀.length), 命中位置) ===
        排除前缀;
    if (起点在字素边界 && 终点在字素边界 && !前缀匹配) {
      命中数组.push(命中位置);
    }
    搜索位置 = 命中位置 + Math.max(1, 关键词文本.length);
  }
  return Uint32Array.from(命中数组);
}

function 创建临时查找关键词(原查询, 查询, 命中位置) {
  移除临时查找关键词();
  const 关键词 = 创建关键词标记(查询.目标, 命中位置);
  关键词.临时 = true;
  状态.查找临时关键词id = 关键词.id;
  if (!查找临时状态) {
    查找临时状态 = {
      阅读位置: 读取阅读位置(),
      滚动位置: 获取静止滚动位置(),
      当前关键词id: 状态.当前关键词id,
      当前命中idx: 查找关键词(状态.当前关键词id)?.当前命中idx ?? -1,
      悬停关键词id: 状态.悬停关键词id,
      悬停命中idx: 状态.悬停命中idx,
    };
  }
  查找临时状态.原查询 = 原查询;
  查找临时状态.查询 = 查询;
  查找临时状态.关键词id = 关键词.id;
  状态.悬停关键词id = 关键词.id;
  状态.悬停命中idx = 0;
  return 关键词;
}

function 移除临时查找关键词() {
  if (状态.查找临时关键词id === null) {
    return;
  }
  const idx = 状态.关键词列表.findIndex(function 找到临时关键词(关键词) {
    return 关键词.id === 状态.查找临时关键词id;
  });
  if (idx >= 0) {
    状态.关键词列表.splice(idx, 1);
  }
  状态.查找临时关键词id = null;
  状态.指示器缓存 = null;
  更新查找导航状态(null);
}

function 临时跳到查找命中(命中idx) {
  const 关键词 = 查找关键词(状态.查找临时关键词id);
  if (!关键词 || !查找临时状态) {
    return;
  }
  查找临时状态.命中idx = Math.max(
    0,
    Math.min(命中idx, 关键词.命中位置.length - 1),
  );
  状态.悬停关键词id = 关键词.id;
  状态.悬停命中idx = 查找临时状态.命中idx;
  渲染可见行(true);
  更新关键词指示器();
  const 行idx = 查找偏移所在行(关键词.命中位置[查找临时状态.命中idx]);
  const 目标位置 =
    行idx * 状态.行高 - (元素.滚动容器.clientHeight - 状态.行高) / 2;
  更新查找导航状态(关键词);
  动画滚动到(目标位置);
}

export function 定位查找命中(方向) {
  const 关键词 = 查找关键词(状态.查找临时关键词id);
  if (!关键词?.命中位置.length || !查找临时状态) {
    return;
  }
  const 下一个idx =
    (查找临时状态.命中idx + 方向 + 关键词.命中位置.length) %
    关键词.命中位置.length;
  临时跳到查找命中(下一个idx);
}

function 更新查找导航状态(关键词) {
  const 有效关键词 = 关键词 || 查找关键词(状态.查找临时关键词id);
  const 命中数 = 有效关键词?.命中位置.length ?? 0;
  const 当前idx = 查找临时状态?.命中idx ?? -1;
  元素.查找命中摘要.textContent = 命中数
    ? `${(当前idx + 1).toLocaleString('zh-CN')} / ${命中数.toLocaleString('zh-CN')}`
    : '';
  元素.查找上一个按钮.disabled = !命中数;
  元素.查找下一个按钮.disabled = !命中数;
}

export async function 处理词组分析() {
  const 前缀 = 元素.查找输入框.value.trim();
  if (!前缀) {
    清空分析结果();
    return;
  }
  if (!状态.文件名) {
    清空分析结果();
    显示查找错误('正文尚未载入');
    return;
  }

  清除查找错误();
  const 本次分析序号 = ++词组分析序号;
  const 本次载入序号 = 状态.载入序号;
  const 分析文本 = 状态.文本;
  await scheduler.yield();
  const 开始时间 = performance.now();
  try {
    const 命中位置 = 查找关键词命中(前缀);
    if (!分析仍然有效()) {
      return;
    }
    if (!命中位置.length) {
      清空分析结果();
      显示查找错误('未找到该关键词');
      console.info('[阅读器] 关键词分析无匹配', { 关键词: 前缀 });
      return;
    }

    // 左右两组搭配分别计数；只出现 1 次的词组属于偶发组合，不展示。
    // 两栏都只记录「接续部分」本身：左侧是前置词，右侧把关键词自身切掉。
    const 后续数量 = new Map();
    const 前置数量 = new Map();
    let 已分析命中数 = 0;
    let 时间片开始 = performance.now();
    for (const 文本偏移 of 命中位置) {
      const 后续词组 = 提取后续词组(文本偏移);
      if (后续词组 !== 前缀) {
        const 接续 = 后续词组.slice(前缀.length);
        if (接续) {
          后续数量.set(接续, (后续数量.get(接续) ?? 0) + 1);
        }
      }
      const 前置词组 = 提取前置词组(文本偏移);
      if (前置词组 && 前置词组 !== 前缀) {
        前置数量.set(前置词组, (前置数量.get(前置词组) ?? 0) + 1);
      }
      已分析命中数 += 1;
      if ((已分析命中数 & 255) === 0) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!分析仍然有效()) {
          return;
        }
      }
    }
    const 转换统计列表 = function 转换统计列表(数量表) {
      return [...数量表]
        .filter(function 过滤单次([, 数量]) {
          return 数量 > 1;
        })
        .map(function 转换统计项([词组, 数量]) {
          return { 词组, 数量 };
        })
        .sort(function 排序统计项(左项, 右项) {
          return (
            右项.数量 - 左项.数量 ||
            左项.词组.localeCompare(右项.词组, 'zh-CN')
          );
        });
    };
    const 后续列表 = 转换统计列表(后续数量);
    const 前置列表 = 转换统计列表(前置数量);
    if (!分析仍然有效()) {
      return;
    }
    渲染分析结果(后续列表, 前置列表, 命中位置.length);

    console.info('[阅读器] 关键词搭配分析完成', {
      关键词: 前缀,
      前置词组数: 前置列表.length,
      后续词组数: 后续列表.length,
      命中数: 命中位置.length,
      耗时毫秒: Math.round(performance.now() - 开始时间),
    });
  } catch (错误) {
    console.error('[阅读器] 关键词搭配分析失败', 错误);
  }

  function 提取后续词组(文本偏移) {
    const 上下文 = 状态.文本.slice(文本偏移, 文本偏移 + 前缀.length + 64);
    const 前缀终点 = 前缀.length;
    let 词组终点 = 前缀终点;
    for (const 片段 of 词组分段器.segment(上下文)) {
      const 片段终点 = 片段.index + 片段.segment.length;
      if (片段终点 <= 前缀终点) {
        continue;
      }
      if (
        片段.index < 前缀终点 ||
        (片段.index === 前缀终点 && 片段.isWordLike)
      ) {
        词组终点 = 片段终点;
      }
      break;
    }
    return 上下文.slice(0, 词组终点);
  }

  function 提取前置词组(文本偏移) {
    const 起点 = Math.max(0, 文本偏移 - 64);
    const 上下文 = 状态.文本.slice(起点, 文本偏移);
    const 片段列表 = [...词组分段器.segment(上下文)];
    let 词组起点 = 上下文.length;
    for (let idx = 片段列表.length - 1; idx >= 0; idx -= 1) {
      const 片段 = 片段列表[idx];
      const 片段终点 = 片段.index + 片段.segment.length;
      if (片段.index >= 上下文.length) {
        continue;
      }
      if (
        片段终点 > 上下文.length ||
        (片段终点 === 上下文.length && 片段.isWordLike)
      ) {
        词组起点 = 片段.index;
      }
      break;
    }
    return 上下文.slice(词组起点);
  }

  function 渲染分析结果(后续列表, 前置列表, 命中总数) {
    分析结果视图 = { 后续列表, 前置列表, 已渲染后续: 0, 已渲染前置: 0 };
    const 高频词组数 = 后续列表.length + 前置列表.length;
    元素.分析结果摘要.textContent = `${命中总数.toLocaleString('zh-CN')} 次出现 · ${高频词组数} 个高频搭配`;
    元素.前置词组列表.replaceChildren();
    元素.后续词组列表.replaceChildren();
    元素.分析分栏.scrollTop = 0;
    元素.分析分栏.scrollLeft = 0;
    追加分析结果行();
    元素.分析结果.hidden = false;
  }

  function 分析仍然有效() {
    return (
      词组分析序号 === 本次分析序号 &&
      状态.载入序号 === 本次载入序号 &&
      状态.文本 === 分析文本 &&
      元素.查找输入框.value.trim() === 前缀
    );
  }
}

export function 处理查找输入() {
  取消词组分析();
  清除查找错误();
  清空分析结果();
  if (!元素.查找输入框.dataset.合成中) {
    window.clearTimeout(实时查找计时器);
    实时查找计时器 = window.setTimeout(执行实时查找, 实时查找延迟);
  }
  if (查找临时状态) {
    状态.悬停关键词id = 查找临时状态.悬停关键词id;
    状态.悬停命中idx = 查找临时状态.悬停命中idx;
    移除临时查找关键词();
    渲染可见行(true);
    更新关键词指示器();
  }
}

export function 处理分析结果滚动() {
  if (
    分析结果视图 &&
    (分析结果视图.已渲染后续 < 分析结果视图.后续列表.length ||
      分析结果视图.已渲染前置 < 分析结果视图.前置列表.length) &&
    元素.分析分栏.scrollTop + 元素.分析分栏.clientHeight >
      元素.分析分栏.scrollHeight - 200
  ) {
    追加分析结果行();
  }
}

function 追加分析结果行() {
  if (!分析结果视图) {
    return;
  }
  let 剩余额度 = 每批分析结果数;
  for (const 区间 of [
    {
      列表: 分析结果视图.后续列表,
      进度键: '已渲染后续',
      目标: 元素.后续词组列表,
    },
    {
      列表: 分析结果视图.前置列表,
      进度键: '已渲染前置',
      目标: 元素.前置词组列表,
    },
  ]) {
    const 起点 = 分析结果视图[区间.进度键];
    if (起点 >= 区间.列表.length || 剩余额度 <= 0) {
      continue;
    }
    const 终点 = Math.min(区间.列表.length, 起点 + 剩余额度);
    const 行片段 = document.createDocumentFragment();
    for (let idx = 起点; idx < 终点; idx += 1) {
      const 统计项 = 区间.列表[idx];
      const 行 = document.createElement('li');
      行.className = '分析行';
      const 词组单元格 = document.createElement('span');
      const 数量单元格 = document.createElement('span');
      词组单元格.textContent = 统计项.词组;
      数量单元格.textContent = 统计项.数量.toLocaleString('zh-CN');
      行.append(词组单元格, 数量单元格);
      行片段.append(行);
    }
    区间.目标.append(行片段);
    分析结果视图[区间.进度键] = 终点;
    剩余额度 -= 终点 - 起点;
  }
}

export function 取消词组分析() {
  词组分析序号 += 1;
}

function 显示查找错误(文字) {
  元素.查找反馈.textContent = 文字;
  元素.查找输入框.setAttribute('aria-invalid', 'true');
  元素.查找输入框.focus();
}

function 清空分析结果() {
  分析结果视图 = null;
  元素.分析结果.hidden = true;
  元素.分析结果摘要.textContent = '';
  元素.前置词组列表.replaceChildren();
  元素.后续词组列表.replaceChildren();
}

function 清除查找错误() {
  元素.查找反馈.textContent = '';
  元素.查找输入框.removeAttribute('aria-invalid');
}
