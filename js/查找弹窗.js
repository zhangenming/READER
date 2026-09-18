import {
  词组分段器,
  词组上下文窗口,
  每批分析结果数,
  实时查找延迟,
  上下文滚动预载像素,
} from './常量.js';
import { 是汉字 } from './文本工具.js';
import { 让出主线程, 按需让出主线程 } from './调度.js';
import { 元素, 状态, 查找关键词, 获取静止滚动位置 } from './状态.js';
import { 查找偏移所在行 } from './排版引擎.js';
import { 渲染可见行 } from './虚拟渲染.js';
import {
  创建关键词标记,
  查找关键词命中,
  渲染查找上下文,
  渲染搭配上下文,
  追加上下文行块,
} from './关键词.js';
import { 更新关键词指示器 } from './指示器.js';
import { 动画滚动到 } from './跳转动画.js';
import { 读取阅读位置, 安排保存持久化状态 } from './持久化.js';

// 查找弹窗 + 词组搭配分析：从 app.js 绑定事件() 闭包拆出。
// 执行实时查找 内联调用 处理词组分析，两簇共享查找输入框与取消逻辑，必须同模块
// （若拆开会造成双向依赖，破坏无环依赖图）。
// 闭包私有状态降为模块级 let；竞态机制原样保留：
// 词组搭配用「序号令牌」（词组分析序号），实时查找用 250ms 防抖计时器。

let 查找临时状态 = null;
let 实时查找计时器 = 0;
let 词组分析序号 = 0;
let 分析结果视图 = null;
// 当前悬停生效的搭配统计项；null 表示上下文列表为完整分块视图
let 悬停搭配项 = null;

export function 处理搭配悬停(事件) {
  const 行 = 事件.target?.closest?.('.分析行');
  let 统计项 = null;
  if (行 && 分析结果视图) {
    const 列表 =
      行.dataset.方向 === '前'
        ? 分析结果视图.前置列表
        : 分析结果视图.后续列表;
    统计项 = 列表?.[Number(行.dataset.统计idx)] ?? null;
  }
  if (统计项 === 悬停搭配项) return;
  const 关键词 = 查找关键词(状态.查找临时关键词id);
  if (!关键词) return;
  悬停搭配项 = 统计项;
  if (统计项) {
    渲染搭配上下文(关键词, 统计项.命中idx列表);
  } else {
    渲染查找上下文(关键词, Math.max(0, 关键词.当前命中idx));
  }
}

export function 处理查找按键(事件) {
  if (事件.isComposing || 元素.查找输入框.dataset.合成中) return;
  // search 输入框的原生 Esc 只清空查询；统一为关闭并撤销预览。
  if (事件.key === 'Escape') {
    事件.preventDefault();
    事件.stopPropagation();
    关闭查找弹窗();
    return;
  }
  if (事件.key === 'ArrowUp' || 事件.key === 'ArrowDown') {
    事件.preventDefault();
    定位查找命中(事件.key === 'ArrowUp' ? -1 : 1);
  }
}

export function 处理上下文滚动() {
  const 列表 = 元素.上下文列表;
  if (!状态.上下文视图) return;
  if (列表.scrollTop < 上下文滚动预载像素 && 状态.上下文视图.起点 > 0) {
    追加上下文行块(true);
  } else if (
    列表.scrollTop + 列表.clientHeight >
    列表.scrollHeight - 上下文滚动预载像素
  ) {
    追加上下文行块();
  }
}

export function 处理上下文行点击(事件) {
  const 行 = 事件.target.closest('.上下文行');
  const 关键词 = 查找关键词(状态.查找临时关键词id);
  if (!行 || !关键词 || !查找临时状态) return;
  const idx = Number(行.dataset.hitIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= 关键词.命中位置.length)
    return;
  临时跳到查找命中(idx);
  // 确认进入正文：恢复原关键词状态，但不撤销这次定位，也不保存临时标记。
  const 原状态 = 查找临时状态;
  const 已有关键词 = 查找关键词(原状态.来源关键词id);
  状态.跳转起点 ??= {
    ...原状态.阅读位置,
    当前关键词id: 原状态.当前关键词id,
    当前命中idx: 原状态.当前命中idx,
  };
  查找临时状态 = null;
  移除临时查找关键词();
  状态.当前关键词id = 已有关键词?.id ?? 原状态.当前关键词id;
  状态.悬停关键词id = null;
  状态.悬停命中idx = -1;
  if (已有关键词) 已有关键词.当前命中idx = idx;
  安排保存持久化状态();
  渲染可见行(true);
  更新关键词指示器();
  关闭查找弹窗();
}

// —— 搭配分析的词组提取（纯函数，供本模块与 tmp/verify-collocations.mjs 共享）——
// 从全文的 文本偏移 处（关键词起点），向后取「关键词 + 紧随其后的邻接词」。
// 邻接标点不做特殊处理：按自身归类，只取紧贴关键词的那一个字符；
// 空白/换行属于排版而非内容，跳过。汉字则取整个词，由 邻接字 归组。

export function 提取后续词组自文本(全文, 文本偏移, 前缀长度) {
  const 上下文 = 全文.slice(文本偏移, 文本偏移 + 前缀长度 + 词组上下文窗口);
  const 前缀终点 = 前缀长度;
  let 词部分 = '';
  for (const 片段 of 词组分段器.segment(上下文)) {
    const 片段终点 = 片段.index + 片段.segment.length;
    if (片段终点 <= 前缀终点) {
      continue;
    }
    if (片段.index < 前缀终点) {
      // 跨界片段：整段余下部分并入（不拆词）
      词部分 = 上下文.slice(前缀终点, 片段终点);
      break;
    }
    if (!片段.segment.trim()) {
      continue; // 空白/换行跳过，取下一个可见片段
    }
    词部分 = 片段.isWordLike
      ? 片段.segment
      : 邻接字(片段.segment, true); // 标点组：紧贴关键词的单字
    break;
  }
  return 上下文.slice(0, 前缀终点) + 词部分;
}

export function 提取前置词组自文本(全文, 文本偏移) {
  const 起点 = Math.max(0, 文本偏移 - 词组上下文窗口);
  const 上下文 = 全文.slice(起点, 文本偏移);
  const 片段列表 = [...词组分段器.segment(上下文)];
  for (let idx = 片段列表.length - 1; idx >= 0; idx -= 1) {
    const 片段 = 片段列表[idx];
    if (片段.index >= 上下文.length) {
      continue;
    }
    if (!片段.segment.trim()) {
      continue; // 空白/换行跳过，向前找上一个可见片段
    }
    // 标点组：只取紧贴关键词的那一个字符
    return 片段.isWordLike ? 片段.segment : 邻接字(片段.segment, false);
  }
  return '';
}

// 取词组紧邻关键词一侧的汉字：后续接续取首字、前置词组取尾字。
// 分段器会把 玉杵/玉佩 切成不同词，按整词分组导致同邻字的搭配被拆散；
// 先归到邻接字，再由 扩展唯一汉字接续 在全组一致时并回更完整词组。
export function 邻接字(词组, 向后) {
  if (!词组) return '';
  if (向后) return String.fromCodePoint(词组.codePointAt(0));
  const 尾码 = 词组.charCodeAt(词组.length - 1);
  const 是高代理 = 尾码 >= 0xd800 && 尾码 <= 0xdbff;
  return 是高代理 ? 词组.slice(-2) : 词组.slice(-1);
}

// 同一组搭配若每一次再往前/后都是同一个汉字，则并入该字，直到不再 100% 相同。
// 只出现 1 次时「全部相同」没有对比意义，保持原词组；碰到非汉字或超出窗口则停止。
export function 扩展唯一汉字接续(全文, 锚点列表, 已有接续, 向后) {
  if (锚点列表.length <= 1) return 已有接续;
  // 标点组保持自身：「那里。杨金水」归「。」，不并回相邻汉字
  if (!是汉字(已有接续)) return 已有接续;
  let 接续 = 已有接续;
  while (接续.length < 词组上下文窗口) {
    let 下一字 = '';
    for (const 锚点 of 锚点列表) {
      const 字 = 向后
        ? 取后一汉字(全文, 锚点 + 接续.length)
        : 取前一汉字(全文, 锚点 - 接续.length);
      if (!字 || (下一字 && 字 !== 下一字)) return 接续;
      下一字 = 字;
    }
    if (!下一字) return 接续;
    接续 = 向后 ? 接续 + 下一字 : 下一字 + 接续;
  }
  return 接续;

  function 取前一汉字(文本, 偏移) {
    if (偏移 <= 0) return '';
    const 尾码 = 文本.charCodeAt(偏移 - 1);
    const 是低代理 = 尾码 >= 0xdc00 && 尾码 <= 0xdfff;
    const 起点 = 是低代理 && 偏移 >= 2 ? 偏移 - 2 : 偏移 - 1;
    const 字 = 文本.slice(起点, 偏移);
    return 是汉字(字) ? 字 : '';
  }

  function 取后一汉字(文本, 偏移) {
    if (偏移 < 0 || 偏移 >= 文本.length) return '';
    const 字 = String.fromCodePoint(文本.codePointAt(偏移));
    return 是汉字(字) ? 字 : '';
  }
}

// 打开查找弹窗。传 关键词（面板“≡”等入口）时直接填入该关键词；
// 未传时（Ctrl + F）：优先用当前文本选区，其次用当前关键词，否则保留上次查询。
export function 打开查找弹窗(关键词 = null) {
  const 新打开 = !元素.查找弹窗.open;
  // 快捷键只展开结果；面板显式传入关键词时才立即定位正文。
  const 定位正文 = 关键词 !== null;
  if (新打开 && !关键词) {
    // showModal 会转移焦点，必须先读取选区；正文拖选结束后则使用当前标记。
    const 选中文字 = window.getSelection()?.toString().trim();
    关键词 = 选中文字 ? { 文本: 选中文字 } : 查找关键词(状态.当前关键词id);
  }
  if (新打开) 元素.查找弹窗.showModal();
  if (关键词) {
    元素.查找输入框.value = 关键词.文本;
    执行实时查找(关键词, 定位正文);
  } else if (新打开) {
    执行实时查找(null, 定位正文);
  }
  requestAnimationFrame(function 聚焦查找输入框() {
    if (!元素.查找弹窗.open) return;
    元素.查找输入框.focus({ preventScroll: true });
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
  处理查找弹窗关闭();
  元素.滚动容器.focus({ preventScroll: true });
}

export function 处理查找弹窗关闭() {
  // close 事件异步派发；如果已重新打开，不清理新会话。
  if (元素.查找弹窗.open) return;
  window.clearTimeout(实时查找计时器);
  实时查找计时器 = 0;
  取消词组分析();
  清空分析结果();
  状态.上下文视图 = null;
  元素.上下文列表.replaceChildren();
  delete 元素.查找输入框.dataset.合成中;
  元素.滚动容器.focus({ preventScroll: true });
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
  事件.preventDefault();
  if (事件.isComposing || 元素.查找输入框.dataset.合成中) return;
  if (
    查找临时状态?.原查询 === 元素.查找输入框.value.trim() &&
    状态.查找临时关键词id !== null
  ) {
    定位查找命中(1);
    return;
  }
  window.clearTimeout(实时查找计时器);
  实时查找计时器 = 0;
  执行实时查找();
}

function 执行实时查找(来源关键词 = null, 定位正文 = true) {
  window.clearTimeout(实时查找计时器);
  实时查找计时器 = 0;
  if (!元素.查找弹窗.open || 元素.查找输入框.dataset.合成中) return;
  清除查找错误();
  取消词组分析();
  清空分析结果();
  移除临时查找关键词();
  const 查询 = 来源关键词
    ? { 目标: 来源关键词.文本, 排除前缀: '' }
    : 解析查找查询(元素.查找输入框.value.trim());
  if (查询.错误 || !查询.目标) {
    // 输入为空或不完整时静默清除旧结果
    清除查找错误();
    元素.上下文列表.textContent = 查询.错误 || '输入关键词，查看每一处上下文';
    取消词组分析();
    清空分析结果();
    渲染可见行(true);
    更新关键词指示器();
    return;
  }
  if (!状态.文件名) {
    显示查找错误('正文尚未载入');
    return;
  }

  const 命中位置 =
    来源关键词?.命中位置 ?? 查找带排除前缀的命中(查询.目标, 查询.排除前缀);
  if (!命中位置.length) {
    显示查找错误('未找到该关键词');
    元素.上下文列表.textContent = '没有匹配的上下文';
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
  查找临时状态.来源关键词id = 来源关键词?.id ?? null;
  if (来源关键词?.配色idx !== undefined) 关键词.配色idx = 来源关键词.配色idx;
  临时跳到查找命中(Math.max(0, 来源关键词?.当前命中idx ?? 0), 定位正文);
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
  const 命中位置 = 查找关键词命中(关键词文本);
  if (!排除前缀) return 命中位置;
  return 命中位置.filter(
    (偏移) =>
      状态.文本.slice(Math.max(0, 偏移 - 排除前缀.length), 偏移) !== 排除前缀,
  );
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
  状态.上下文视图 = null;
  元素.上下文列表.replaceChildren();
  if (查找临时状态) {
    状态.悬停关键词id = 查找临时状态.悬停关键词id;
    状态.悬停命中idx = 查找临时状态.悬停命中idx;
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

function 临时跳到查找命中(命中idx, 定位正文 = true) {
  const 关键词 = 查找关键词(状态.查找临时关键词id);
  if (!关键词 || !查找临时状态) {
    return;
  }
  查找临时状态.命中idx = Math.max(
    0,
    Math.min(命中idx, 关键词.命中位置.length - 1),
  );
  关键词.当前命中idx = 查找临时状态.命中idx;
  const 视图 = 状态.上下文视图;
  if (
    !视图 ||
    视图.关键词id !== 关键词.id ||
    命中idx < 视图.起点 ||
    命中idx >= 视图.已渲染数
  ) {
    渲染查找上下文(关键词, 关键词.当前命中idx);
  }
  for (const 行 of 元素.上下文列表.querySelectorAll('.上下文行')) {
    const 是当前 = Number(行.dataset.hitIndex) === 关键词.当前命中idx;
    行.classList.toggle('当前', 是当前);
    if (是当前) 行.setAttribute('aria-current', 'location');
    else 行.removeAttribute('aria-current');
  }
  元素.上下文列表.querySelector('.当前')?.scrollIntoView({ block: 'nearest' });
  状态.悬停关键词id = 关键词.id;
  状态.悬停命中idx = 查找临时状态.命中idx;
  渲染可见行(true);
  更新关键词指示器();
  const 行idx = 查找偏移所在行(关键词.命中位置[查找临时状态.命中idx]);
  const 目标位置 =
    行idx * 状态.行高 - (元素.滚动容器.clientHeight - 状态.行高) / 2;
  更新查找导航状态(关键词);
  if (定位正文) 动画滚动到(目标位置);
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
    : '0 处';
  元素.查找上一个按钮.disabled = !命中数;
  元素.查找下一个按钮.disabled = !命中数;
}

export async function 处理词组分析() {
  const 分析关键词 = 查找关键词(状态.查找临时关键词id);
  const 原查询 = 元素.查找输入框.value.trim();
  const 前缀 = 分析关键词?.文本;
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
  // 让出主线程经 调度.js 统一回退，禁止裸调 scheduler.yield()（非 Chromium 会抛 ReferenceError）
  await 让出主线程();
  const 开始时间 = performance.now();
  try {
    const 命中位置 = 分析关键词.命中位置;
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
    // 分组键是紧邻关键词的汉字（玉杵/玉佩 都归到 玉），避免分段词形拆散计数。
    // 若某组每一次出现再往前/后都是同一个汉字，并入更完整搭配后再计数。
    const 后续分组 = new Map();
    const 前置分组 = new Map();
    let 已分析命中数 = 0;
    let 时间片开始 = performance.now();
    for (const [命中idx, 文本偏移] of 命中位置.entries()) {
      const 后续词组 = 提取后续词组(文本偏移);
      if (后续词组 !== 前缀) {
        const 接续 = 后续词组.slice(前缀.length);
        if (接续)
          记入分组(
            后续分组,
            邻接字(接续, true),
            后续锚点(接续, 文本偏移 + 前缀.length),
            命中idx,
          );
      }
      const 前置词组 = 提取前置词组(文本偏移);
      if (前置词组 && 前置词组 !== 前缀) {
        记入分组(
          前置分组,
          邻接字(前置词组, false),
          前置锚点(前置词组, 文本偏移),
          命中idx,
        );
      }
      已分析命中数 += 1;
      if ((已分析命中数 & 255) === 0) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!分析仍然有效()) {
          return;
        }
      }
    }
    const 后续数量 = 统计扩展搭配(后续分组, true);
    const 前置数量 = 统计扩展搭配(前置分组, false);
    const 转换统计列表 = function 转换统计列表(数量表) {
      return [...数量表.values()]
        .filter(function 过滤单次(统计项) {
          return 统计项.数量 > 1;
        })
        .sort(function 排序统计项(左项, 右项) {
          return (
            右项.数量 - 左项.数量 || 左项.词组.localeCompare(右项.词组, 'zh-CN')
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
    return 提取后续词组自文本(状态.文本, 文本偏移, 前缀.length);
  }

  function 提取前置词组(文本偏移) {
    return 提取前置词组自文本(状态.文本, 文本偏移);
  }

  // 邻接词可能跨过标点被找到，与关键词并不粘连；锚点取词组实际起/终点，
  // 否则 扩展唯一汉字接续 会把它自己当成前一汉字重复并入。
  function 后续锚点(接续, 起点) {
    const 实际 = 分析文本.indexOf(接续, 起点);
    return 实际 >= 0 ? 实际 : 起点;
  }

  function 前置锚点(词组, 终点上限) {
    const 实际 = 分析文本.lastIndexOf(词组, 终点上限 - 词组.length);
    return 实际 >= 0 ? 实际 + 词组.length : 终点上限;
  }

  function 记入分组(分组, 词组, 锚点, 命中idx) {
    const 组 = 分组.get(词组);
    if (组) {
      组.锚点列表.push(锚点);
      组.命中列表.push(命中idx);
    } else {
      分组.set(词组, { 锚点列表: [锚点], 命中列表: [命中idx] });
    }
  }

  function 统计扩展搭配(分组, 向后) {
    const 数量表 = new Map();
    for (const [词组, 组] of 分组) {
      if (组.锚点列表.length <= 1) continue;
      const 完整词组 = 扩展唯一汉字接续(分析文本, 组.锚点列表, 词组, 向后);
      const 统计项 = 数量表.get(完整词组);
      if (统计项) {
        统计项.数量 += 组.锚点列表.length;
        统计项.命中idx列表.push(...组.命中列表);
      } else {
        数量表.set(完整词组, {
          词组: 完整词组,
          数量: 组.锚点列表.length,
          命中idx列表: [...组.命中列表],
        });
      }
    }
    return 数量表;
  }

  function 渲染分析结果(后续列表, 前置列表, 命中总数) {
    悬停搭配项 = null;
    分析结果视图 = {
      关键词: 前缀,
      后续列表,
      前置列表,
      已渲染后续: 0,
      已渲染前置: 0,
    };
    const 高频词组数 = 后续列表.length + 前置列表.length;
    元素.分析结果摘要.textContent = `${命中总数.toLocaleString('zh-CN')} 次出现 · ${高频词组数} 个高频搭配`;
    元素.前置词组列表.replaceChildren();
    元素.后续词组列表.replaceChildren();
    元素.前置分析栏.scrollTop = 0;
    元素.后续分析栏.scrollTop = 0;
    追加分析结果行();
  }

  function 分析仍然有效() {
    return (
      元素.查找弹窗.open &&
      状态.查找临时关键词id === 分析关键词.id &&
      词组分析序号 === 本次分析序号 &&
      状态.载入序号 === 本次载入序号 &&
      状态.文本 === 分析文本 &&
      元素.查找输入框.value.trim() === 原查询
    );
  }
}

export function 处理查找输入() {
  取消词组分析();
  清除查找错误();
  清空分析结果();
  移除临时查找关键词();
  渲染可见行(true);
  更新关键词指示器();
  if (!元素.查找输入框.dataset.合成中) {
    window.clearTimeout(实时查找计时器);
    实时查找计时器 = window.setTimeout(执行实时查找, 实时查找延迟);
  }
}

export function 处理搭配点击(事件) {
  const 行 = 事件.target.closest('.分析行');
  if (!行 || !分析结果视图?.关键词) return;
  const 词组 = 行.dataset.词组;
  const 方向 = 行.dataset.方向;
  const 关键词 = 分析结果视图.关键词;
  if (!词组 || (方向 !== '前' && 方向 !== '后')) return;
  元素.查找输入框.value = 方向 === '前' ? 词组 + 关键词 : 关键词 + 词组;
  执行实时查找();
}

export function 处理分析结果滚动() {
  if (!分析结果视图) {
    return;
  }
  const 有待渲染 =
    分析结果视图.已渲染后续 < 分析结果视图.后续列表.length ||
    分析结果视图.已渲染前置 < 分析结果视图.前置列表.length;
  if (!有待渲染) {
    return;
  }
  const 接近底部 = function 接近底部(栏) {
    return (
      栏.scrollTop + 栏.clientHeight > 栏.scrollHeight - 200
    );
  };
  if (
    接近底部(元素.前置分析栏) ||
    接近底部(元素.后续分析栏)
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
      方向: '后',
    },
    {
      列表: 分析结果视图.前置列表,
      进度键: '已渲染前置',
      目标: 元素.前置词组列表,
      方向: '前',
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
      const 项 = document.createElement('li');
      const 行 = document.createElement('button');
      行.type = 'button';
      行.className = '分析行';
      行.dataset.词组 = 统计项.词组;
      行.dataset.方向 = 区间.方向;
      行.dataset.统计idx = String(idx);
      const 完整词组 =
        区间.方向 === '前'
          ? 统计项.词组 + 分析结果视图.关键词
          : 分析结果视图.关键词 + 统计项.词组;
      行.title = `查找 ${完整词组}`;
      行.setAttribute('aria-label', `查找 ${完整词组}`);
      const 词组单元格 = document.createElement('span');
      const 数量单元格 = document.createElement('span');
      词组单元格.textContent = 统计项.词组;
      数量单元格.textContent = 统计项.数量.toLocaleString('zh-CN');
      行.append(词组单元格, 数量单元格);
      项.append(行);
      行片段.append(项);
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
  悬停搭配项 = null;
  分析结果视图 = null;
  元素.分析结果摘要.textContent = '查找后显示高频搭配';
  元素.前置词组列表.replaceChildren();
  元素.后续词组列表.replaceChildren();
}

function 清除查找错误() {
  元素.查找反馈.textContent = '';
  元素.查找输入框.removeAttribute('aria-invalid');
}
