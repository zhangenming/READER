import {
  默认关键词颜色,
  默认内置字词颜色,
  默认奇偶行颜色,
  默认引文背景色,
  默认页面背景色,
  默认纸面色,
  自动滚动默认速度,
  默认字号,
} from './常量.js';

export const 字体设置 = { 引号内: null, 引号外: null };
export const 字体粗细设置 = { 引号内: null, 引号外: null };
export const 字体颜色设置 = { 引号内: null, 引号外: null };
export const 奇偶行颜色 = { ...默认奇偶行颜色 };
export const 引文背景色 = { ...默认引文背景色 };
// 界面外观设置：关键词/字词颜色、粗细、页面与纸面背景、引文样式与排版开关；值为默认值或用户覆盖。
export const 外观 = {
  关键词颜色: 默认关键词颜色,
  内置字词颜色: 默认内置字词颜色,
  关键词粗细: null,
  页面背景色: 默认页面背景色,
  纸面色: 默认纸面色,
  引文背景色启用: true,
  引文边框启用: true,
  // 折行句竖条：同一句话折成多行时行首留白里的相连竖条
  换行标记启用: true,
  // 阶梯段落：句内停顿处断行并逐级缩进（仅排版层，不修改文本本身）
  阶梯段落启用: false,
  当前字体标签: '引号内',
};
// 自动滚动时长记账：今日总时长及按书分项按本地日期归零；每本书另存历史累计。
export const 统计 = {
  // 自动滚动时长统计：今日总时长及按书分项按本地日期归零；每本书另存历史累计。
  今日滚动日期: '',
  今日滚动毫秒: 0,
  今日书籍滚动毫秒: new Map(),
  书籍滚动毫秒: new Map(),
  未入账滚动毫秒: 0, // 滚动会话中已累计、待结转到统计的毫秒数
};

/**
 * 阅读器全局共享可变状态单例：各模块直接读写，无变更通知。
 * @typedef {Object} 阅读器状态
 *
 * ① 文本与排版数据
 * @property {string} 文本 当前载入的全文文本
 * @property {string} 文件名 当前文本文件名（空串表示未载入）
 * @property {Uint32Array} 行起点列表 每行起点文本偏移
 * @property {Uint32Array} 行终点列表 每行终点文本偏移（不含）
 * @property {Uint32Array} 行逻辑索引 每行对应的逻辑行号（跨重排稳定）
 * @property {Uint32Array} 行段落索引 每行所属段落序号
 * @property {?Uint8Array} 行阶梯索引 每行阶梯缩进层级；未启用阶梯段落为 null
 * @property {?Object} 阶梯断点 阶梯段落断点（起点列表 + 层级列表）；未启用为 null
 * @property {Uint32Array} 引文边界列表 成对引号/书名号边界偏移列表
 * @property {Set} 缩进起点集合 段落缩进起点偏移集合（spk 对话行等）
 * @property {string} 排版键 当前排版参数签名，变化即需重建行索引
 * @property {number} 行高 当前排版行高（像素）
 * @property {Uint32Array} 句段起点列表 全文「无标点连续段」起点（文本偏移，升序），用于运行时二分
 * @property {Float64Array} 句段负担前缀和 长度 = 段数 + 1；[i] = 前 i 段负担之和
 * @property {number} 句段负担总合 全部句段负担之和（= 前缀和末位），用于剩余时间语义化
 * @property {number} 全文负担密度 负担/像素 = 句段负担总合 ÷ 虚拟总高度；视口期望负担 = 密度 × 视口高度
 *
 * ② 渲染与滚动运行时
 * @property {number} 渲染起点 当前已渲染的起始行号（-1 表示未渲染）
 * @property {number} 渲染终点 当前已渲染的结束行号（-1 表示未渲染）
 * @property {number} 滚动帧 滚动事件节流帧号（requestAnimationFrame 返回值）
 * @property {number} 滚动动画帧 滚动动画帧号（0 表示无动画）
 * @property {?Object} 滚动动画目标 进行中的滚动动画目标（含终点位置）；静止为 null
 * @property {?number} 跳转起点 本轮跳转会话的起始偏移（Backspace 回跳用）；无会话为 null
 *
 * ③ 计时器与任务序号
 * @property {number} 尺寸计时器 尺寸刷新防抖计时器（setTimeout 返回值）
 * @property {number} 保存计时器 持久化保存防抖计时器（setTimeout 返回值）
 * @property {number} 迸发计时器 跳转迸发淡出清理计时器（setTimeout 返回值）
 * @property {number} 衔接线计时器 衔接线淡出计时器（setTimeout 返回值）
 * @property {number} 当前命中位置计时器 当前命中位置提示淡出计时器（setTimeout 返回值）
 * @property {number} 载入序号 文本载入任务单调递增序号，用于判定异步结果有效性
 * @property {number} 排版任务序号 排版重建任务单调递增序号，用于判定异步结果有效性
 *
 * ④ 关键词与交互
 * @property {?Object} 拖选状态 正在进行的拖选标记会话（起点/方向等）；未拖选为 null
 * @property {Array} 关键词列表 全部关键词标记对象
 * @property {?number} 当前关键词id 当前关键词 id；无为 null
 * @property {?number} 悬停关键词id 悬停中的关键词 id；无为 null
 * @property {?number} 悬停命中idx 悬停命中的序号；无为 null
 * @property {boolean} 正文悬停已暂停 正文悬停提示是否被暂停（如弹窗打开）
 * @property {number} 下一个关键词id 下一个待分配关键词 id
 * @property {?number} 查找临时关键词id 查找命中的临时关键词 id；无为 null
 * @property {?Object} 指示器缓存 关键词指示器绘制缓存；脏时为 null 待重建
 * @property {boolean} 关键词面板展开 关键词管理面板是否展开
 * @property {string} 关键词面板签名 面板渲染签名，变化即需重渲染面板行列表（含排序与当前项）
 * @property {string} 关键词排序 面板排序方式（'数量' / 首次出现 / 拼音等）
 * @property {?Object} 上下文视图 上下文弹窗状态（关键词 id 与已渲染数）；关闭为 null
 *
 * ⑤ 用户设置与分析缓存
 * @property {number} 自动滚动速度 自动滚动基准速度（用户可调）
 * @property {number} 字号 当前字号（像素）
 * @property {?Object} 词频分析 最近一次词频分析结果；未分析为 null
 * @property {Set} 全文单字 全文出现过的单字集合（词频分析用缓存）
 * @property {Array} 文本目录 ./txt/ 目录文件清单（文件名、字符数等）
 * @property {Map} 文本字数 各文本的非空白字符数缓存（文件名 → 字数）
 */
export const 状态 = {
  文本: '',
  文件名: '',
  行起点列表: new Uint32Array(),
  行终点列表: new Uint32Array(),
  行逻辑索引: new Uint32Array(),
  行段落索引: new Uint32Array(),
  行阶梯索引: null,
  阶梯断点: null,
  引文边界列表: new Uint32Array(),
  缩进起点集合: new Set(),
  排版键: '',
  行高: 39,
  渲染起点: -1,
  渲染终点: -1,
  滚动帧: 0,
  滚动动画帧: 0,
  滚动动画目标: null,
  尺寸计时器: 0,
  保存计时器: 0,
  迸发计时器: 0,
  衔接线计时器: 0,
  载入序号: 0,
  排版任务序号: 0,
  拖选状态: null,
  关键词列表: [],
  当前关键词id: null,
  悬停关键词id: null,
  悬停命中idx: null,
  正文悬停已暂停: false,
  下一个关键词id: 1,
  跳转起点: null,
  查找临时关键词id: null,
  指示器缓存: null,
  当前命中位置计时器: 0,
  关键词面板展开: false,
  关键词面板签名: '',
  关键词排序: '数量',
  上下文视图: null,
  自动滚动速度: 自动滚动默认速度,
  句段起点列表: new Uint32Array(), // 全文「无标点连续段」起点（文本偏移，升序），用于运行时二分
  句段负担前缀和: new Float64Array(1), // 句段负担前缀和，长度 = 段数 + 1；[i] = 前 i 段负担之和
  句段负担总合: 0, // 全部句段负担之和（= 前缀和末位），用于剩余时间语义化
  全文负担密度: 0, // 负担/像素 = 句段负担总合 ÷ 虚拟总高度；视口期望负担 = 密度 × 视口高度
  字号: 默认字号,
  词频分析: null,
  全文单字: new Set(),
  文本目录: [],
  文本字数: new Map(),
};

// DOM 元素引用表：模块加载时一次性 querySelector 缓存，运行期不再查找。
export const 元素 = {
  滚动容器: document.querySelector('#滚动容器'),
  虚拟画布: document.querySelector('#虚拟画布'),
  可见内容: document.querySelector('#可见内容'),
  载入状态: document.querySelector('#载入状态'),
  跳转边框: document.querySelector('#跳转边框'),
  跳转迸发: document.querySelector('#跳转迸发'),
  衔接线: document.querySelector('#衔接线'),
  查找弹窗: document.querySelector('#查找弹窗'),
  查找表单: document.querySelector('#查找表单'),
  查找输入框: document.querySelector('#查找输入框'),
  查找反馈: document.querySelector('#查找反馈'),
  查找命中摘要: document.querySelector('#查找命中摘要'),
  查找上一个按钮: document.querySelector('#查找上一个按钮'),
  查找下一个按钮: document.querySelector('#查找下一个按钮'),
  分析结果: document.querySelector('#分析结果'),
  分析结果摘要: document.querySelector('#分析结果摘要'),
  分析分栏: document.querySelector('.分析分栏'),
  前置词组列表: document.querySelector('#前置词组列表'),
  后续词组列表: document.querySelector('#后续词组列表'),
  关闭查找按钮: document.querySelector('#关闭查找按钮'),
  自定义滚动条: document.querySelector('#自定义滚动条'),
  滚动块: document.querySelector('#滚动块'),
  滚动进度: document.querySelector('#滚动进度'),
  滚动百分比: document.querySelector('#滚动百分比'),
  剩余滚动时间行: document.querySelector('#剩余滚动时间行'),
  剩余滚动时间: document.querySelector('#剩余滚动时间'),
  本书滚动时间: document.querySelector('#本书滚动时间'),
  已滚动时间行: document.querySelector('#已滚动时间行'),
  已滚动时间: document.querySelector('#已滚动时间'),
  今日滚动时间: document.querySelector('#今日滚动时间'),
  基础速度显示: document.querySelector('#基础速度显示'),
  实际速度显示: document.querySelector('#实际速度显示'),
  关键词指示器: document.querySelector('#关键词指示器'),
  悬停关键词指示器: document.querySelector('#悬停关键词指示器'),
  自动滚动按钮: document.querySelector('#自动滚动按钮'),
  当前时间: document.querySelector('#当前时间'),
  字号控制: document.querySelector('#字号控制'),
  字号值: document.querySelector('#字号值'),
  行距控制: document.querySelector('#行距控制'),
  行距值: document.querySelector('#行距值'),
  内容选择按钮: document.querySelector('#内容选择按钮'),
  内容选择弹窗: document.querySelector('#内容选择弹窗'),
  内容选择摘要: document.querySelector('#内容选择摘要'),
  内容选择列表: document.querySelector('#内容选择列表'),
  关闭内容选择按钮: document.querySelector('#关闭内容选择按钮'),
  关键词面板: document.querySelector('#关键词面板'),
  关键词面板开关: document.querySelector('#关键词面板开关'),
  关键词列表容器: document.querySelector('#关键词列表容器'),
  上下文弹窗: document.querySelector('#上下文弹窗'),
  上下文标题: document.querySelector('#上下文标题'),
  上下文列表: document.querySelector('#上下文列表'),
  关闭上下文按钮: document.querySelector('#关闭上下文按钮'),
  词频弹窗: document.querySelector('#词频弹窗'),
  词频摘要: document.querySelector('#词频摘要'),
  词频标签栏: document.querySelector('#词频标签栏'),
  单字双列表: document.querySelector('#单字双列表'),
  单字重复列表: document.querySelector('#单字重复列表'),
  单字一次列表: document.querySelector('#单字一次列表'),
  词频表格容器: document.querySelector('#词频表格容器'),
  词频列表: document.querySelector('#词频列表'),
  词频分页: document.querySelector('#词频分页'),
  词频上一页: document.querySelector('#词频上一页'),
  词频页码: document.querySelector('#词频页码'),
  词频下一页: document.querySelector('#词频下一页'),
  关闭词频按钮: document.querySelector('#关闭词频按钮'),
  字体弹窗: document.querySelector('#字体弹窗'),
  字体遮罩: document.querySelector('#字体遮罩'),
  关闭字体按钮: document.querySelector('#关闭字体按钮'),
  字体重置按钮: document.querySelector('#字体重置按钮'),
  字体关闭底部按钮: document.querySelector('#字体关闭底部按钮'),
  字体标签引号内: document.querySelector('#字体标签引号内'),
  字体标签引号外: document.querySelector('#字体标签引号外'),
  字体标签全部: document.querySelector('#字体标签全部'),
  字体标签关键词: document.querySelector('#字体标签关键词'),
  字体标签背景: document.querySelector('#字体标签背景'),
  引文背景色选项: document.querySelector('#引文背景色选项'),
  引文背景色开关: document.querySelector('#引文背景色开关'),
  奇数引文颜色选择器: document.querySelector('#奇数引文颜色选择器'),
  偶数引文颜色选择器: document.querySelector('#偶数引文颜色选择器'),
  引文边框选项: document.querySelector('#引文边框选项'),
  引文边框开关: document.querySelector('#引文边框开关'),
  阶梯段落选项: document.querySelector('#阶梯段落选项'),
  阶梯段落开关: document.querySelector('#阶梯段落开关'),
  换行标记选项: document.querySelector('#换行标记选项'),
  换行标记开关: document.querySelector('#换行标记开关'),
  关键词颜色选项: document.querySelector('#关键词颜色选项'),
  关键词颜色选择器: document.querySelector('#关键词颜色选择器'),
  字体颜色选项: document.querySelector('#字体颜色选项'),
  字体颜色选择器: document.querySelector('#字体颜色选择器'),
  内置字词颜色选项: document.querySelector('#内置字词颜色选项'),
  内置字词颜色选择器: document.querySelector('#内置字词颜色选择器'),
  奇偶行颜色选项: document.querySelector('#奇偶行颜色选项'),
  奇数行颜色选择器: document.querySelector('#奇数行颜色选择器'),
  偶数行颜色选择器: document.querySelector('#偶数行颜色选择器'),
  背景颜色选项: document.querySelector('#背景颜色选项'),
  背景色选择器: document.querySelector('#背景色选择器'),
  字体粗细按钮: document.querySelector('#字体粗细按钮'),
  字体选项列表: document.querySelector('#字体选项列表'),
};

// —— 状态查询（叶子层，供各模块共享，避免「持久化 ↔ 跳转动画」「关键词 ↔ 跳转动画」互相依赖）——

export function 查找关键词(关键词id) {
  return 状态.关键词列表.find(function 找到关键词(关键词) {
    return 关键词.id === 关键词id;
  });
}

// 当前实际滚动位置：滚动动画进行中取动画终点（静止视口位置），否则读容器 scrollTop。
export function 获取静止滚动位置() {
  if (!状态.滚动动画目标) {
    return 元素.滚动容器.scrollTop;
  }
  const 最大滚动位置 = Math.max(
    0,
    元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight,
  );
  return Math.min(最大滚动位置, 状态.滚动动画目标.终点);
}

export function 本地日期串(日期) {
  const 补零 = (值) => String(值).padStart(2, '0');
  return `${日期.getFullYear()}-${补零(日期.getMonth() + 1)}-${补零(
    日期.getDate(),
  )}`;
}

export function 确保今日滚动统计() {
  const 今天 = 本地日期串(new Date());
  if (统计.今日滚动日期 === 今天) {
    return;
  }
  if (状态.文件名 && 统计.未入账滚动毫秒 > 0) {
    统计.书籍滚动毫秒.set(
      状态.文件名,
      (统计.书籍滚动毫秒.get(状态.文件名) ?? 0) + 统计.未入账滚动毫秒,
    );
  }
  const 上一日期 = 统计.今日滚动日期;
  统计.今日滚动日期 = 今天;
  统计.今日滚动毫秒 = 0;
  统计.今日书籍滚动毫秒.clear();
  统计.未入账滚动毫秒 = 0;
  console.info('[阅读器] 自动滚动今日统计已重置', { 上一日期, 当前日期: 今天 });
}

// 把滚动会话中累计的未入账时长结转到今日总计、今日当前书与本书历史累计
export function 结转未入账滚动毫秒() {
  if (!状态.文件名 || 统计.未入账滚动毫秒 <= 0) {
    return;
  }
  确保今日滚动统计();
  if (统计.未入账滚动毫秒 <= 0) {
    return;
  }
  统计.今日滚动毫秒 += 统计.未入账滚动毫秒;
  统计.今日书籍滚动毫秒.set(
    状态.文件名,
    (统计.今日书籍滚动毫秒.get(状态.文件名) ?? 0) + 统计.未入账滚动毫秒,
  );
  统计.书籍滚动毫秒.set(
    状态.文件名,
    (统计.书籍滚动毫秒.get(状态.文件名) ?? 0) + 统计.未入账滚动毫秒,
  );
  统计.未入账滚动毫秒 = 0;
}
