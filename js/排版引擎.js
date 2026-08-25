import {
  不渲染引号集合,
  字素分段器,
  最大虚拟高度,
  最小行高硬下限,
  空白字符模式,
  自适应句长惩罚上限,
  自适应句长惩罚系数,
  自适应句长起点,
  默认行高,
} from './常量.js';
import { 创建Uint32Array, 创建Uint8Array, 按需让出主线程 } from './调度.js';
import {
  是安全字素码,
  是方块字素码,
  是西文范围,
  查找字素终点,
} from './文本工具.js';
import { 元素, 外观, 状态, 获取静止滚动位置 } from './状态.js';
import { 显示文本处理错误 } from './错误提示.js';

// 行高不应低于当前字号，否则相邻行字身会重叠；下限随字号联动。
export function 计算最小行高() {
  return Math.max(最小行高硬下限, Math.round(状态.字号));
}

// 字体选择：引号内（spk 内）/ 引号外（spk 外）两块独立。
// 值为 null 表示“跟随该区域 CSS 默认”，写入时清空内联变量以回退到 :root。

// 重建行索引：仅负责「异步建索引 + 提交 + 保持阅读位置」。
// 视图刷新（取消动画、隐藏衔接线、重绘可见行、更新指示器）由调用方以回调编排，
// 使本模块不依赖任何视图模块（虚拟渲染 / 指示器 / 跳转动画），保持纯计算层。
// 提交前回调（提交前）在 提交行索引 之前执行（如取消滚动动画、隐藏衔接线）；
// 完成后回调（完成后）在 scrollTop 落位后执行（如 渲染可见行(true)、更新关键词指示器）。
export function 重建行索引(排版 = 读取正文排版(), 提交前 = null, 完成后 = null) {
  const 本次任务序号 = ++状态.排版任务序号;
  const 本次文本 = 状态.文本;
  const 本次缩进起点集合 = 状态.缩进起点集合;
  const 本次阶梯断点 = 外观.阶梯段落启用 ? 状态.阶梯断点 : null;
  const 开始时间 = performance.now();
  void 执行重建().catch(显示文本处理错误);

  async function 执行重建() {
    const 行索引 = await 创建行索引(
      本次文本,
      排版,
      本次缩进起点集合,
      本次阶梯断点,
      任务仍然有效,
    );
    if (!行索引 || !任务仍然有效()) {
      return;
    }

    const 顶部行idx = Math.floor(获取静止滚动位置() / 状态.行高);
    const 顶部偏移 = 状态.行起点列表[顶部行idx] ?? 0;
    if (提交前) {
      提交前();
    }
    提交行索引(行索引);
    const 新行idx = 查找偏移所在行(顶部偏移);
    元素.滚动容器.scrollTop = 新行idx * 状态.行高;
    if (完成后) {
      完成后();
    }

    console.info('[阅读器] 虚拟布局已重建', {
      任务序号: 本次任务序号,
      正文宽度: Math.round(排版.内容宽度),
      行数: 行索引.行起点列表.length,
      总高度: 行索引.总高度,
      耗时毫秒: Math.round(performance.now() - 开始时间),
    });
  }

  function 任务仍然有效() {
    return 本次任务序号 === 状态.排版任务序号 && 本次文本 === 状态.文本;
  }
}

export async function 创建行索引(文本, 排版, 缩进起点集合, 阶梯断点, 任务仍然有效) {
  const 起点数组 = [];
  const 终点数组 = [];
  const 逻辑行数组 = [];
  const 段落索引数组 = [];
  const 阶梯数组 = [];
  const 断点起点列表 = 阶梯断点 ? 阶梯断点.起点列表 : null;
  const 断点层级列表 = 阶梯断点 ? 阶梯断点.层级列表 : null;
  let 断点游标 = 0;
  // 阶梯段落：每级缩进 2em；层级过深会挤占正文，按内容宽度封顶。
  const 阶梯步进宽 = 排版.正文字号 * 2;
  const 阶梯最大层数 = Math.max(
    1,
    Math.floor((排版.内容宽度 * 0.45) / 阶梯步进宽),
  );
  const 西文宽度缓存 = new Map();
  const 文本长度 = 文本.length;
  const 测量上下文 = document.createElement('canvas').getContext('2d');
  if (!测量上下文) {
    throw new Error('当前浏览器无法创建正文测量画布');
  }
  测量上下文.font = 排版.西文字体;
  测量上下文.fontKerning = 'normal';
  let 行起点 = 0;
  let 当前行宽度 = 0;
  let 当前行有内容 = false;
  let 物理行有内容 = false;
  let 西文片段起点 = -1;
  let 逻辑行idx = 0;
  let 段落idx = 0;
  let 当前行阶梯层 = 0;
  let 字起点 = 0;
  let 下次检查位置 = 2048;
  let 时间片开始 = performance.now();

  while (字起点 < 文本长度) {
    if (字起点 >= 下次检查位置) {
      if (!(await 让出并检查任务())) {
        return null;
      }
      下次检查位置 = 字起点 + 2048;
    }

    const 码 = 文本.charCodeAt(字起点);
    let 字终点;
    if (
      是安全字素码(码) &&
      (字起点 + 1 >= 文本长度 || 是安全字素码(文本.charCodeAt(字起点 + 1)))
    ) {
      字终点 = 字起点 + 1;
    } else {
      字终点 = 查找字素终点(文本, 字起点);
    }

    if (码 === 0x0a && 字终点 === 字起点 + 1) {
      if (西文片段起点 !== -1 && !(await 提交西文片段(字起点))) {
        return null;
      }
      if (当前行有内容) {
        添加行(行起点, 字起点);
      } else if (!物理行有内容) {
        添加行(行起点, 行起点);
      }

      行起点 = 字终点;
      当前行阶梯层 = Math.max(查找阶梯层(字终点), 0);
      // 缩进只通过 本行内容宽度 的扣减体现，当前行宽度仅累计字符宽度
      当前行宽度 = 0;
      if (缩进起点集合.has(字终点)) {
        段落idx += 1;
      }
      当前行有内容 = false;
      物理行有内容 = false;
      逻辑行idx += 1;
      字起点 = 字终点;
      continue;
    }

    if (断点起点列表 !== null) {
      const 断点层级 = 查找阶梯层(字起点);
      if (断点层级 >= 0) {
        if (西文片段起点 !== -1 && !(await 提交西文片段(字起点))) {
          return null;
        }
        if (当前行有内容) {
          完成自动行(字起点);
        }
        当前行阶梯层 = 断点层级;
        当前行宽度 = 0;
      }
    }

    if (是西文范围(文本, 字起点, 字终点)) {
      if (西文片段起点 === -1) {
        西文片段起点 = 字起点;
      }
      字起点 = 字终点;
      continue;
    }

    if (西文片段起点 !== -1 && !(await 提交西文片段(字起点))) {
      return null;
    }
    const 超长片段任务 = 添加排版片段(字起点, 字终点, false, null);
    if (超长片段任务 && !(await 超长片段任务)) {
      return null;
    }
    字起点 = 字终点;
  }
  if (西文片段起点 !== -1 && !(await 提交西文片段(文本长度))) {
    return null;
  }

  if (!任务仍然有效()) {
    return null;
  }

  if (当前行有内容 || 起点数组.length === 0) {
    添加行(行起点, 文本.length);
  } else if (文本.endsWith('\n')) {
    添加行(文本.length, 文本.length);
  }

  const 总高度 = 起点数组.length * 排版.行高;
  校验虚拟高度(总高度);
  const 行起点列表 = await 创建Uint32Array(起点数组, 任务仍然有效);
  if (!行起点列表) {
    return null;
  }
  const 行终点列表 = await 创建Uint32Array(终点数组, 任务仍然有效);
  if (!行终点列表) {
    return null;
  }
  const 行逻辑索引 = await 创建Uint32Array(逻辑行数组, 任务仍然有效);
  if (!行逻辑索引) {
    return null;
  }
  const 行段落索引 = await 创建Uint32Array(段落索引数组, 任务仍然有效);
  if (!行段落索引) {
    return null;
  }
  let 行阶梯索引 = null;
  if (断点起点列表 !== null) {
    行阶梯索引 = await 创建Uint8Array(阶梯数组, 任务仍然有效);
    if (!行阶梯索引) {
      return null;
    }
  }
  return {
    行起点列表,
    行终点列表,
    行逻辑索引,
    行段落索引,
    行阶梯索引,
    排版键: 排版.键,
    行高: 排版.行高,
    总高度,
  };

  async function 提交西文片段(片段终点) {
    let idx = 西文片段起点;
    let 西文检查位置 = idx + 2048;
    while (idx < 片段终点) {
      const 单词起点 = idx;
      while (idx < 片段终点 && 空白字符模式.test(文本[idx])) {
        idx += 1;
        if (idx >= 西文检查位置) {
          if (!(await 让出并检查任务())) {
            return false;
          }
          西文检查位置 = idx + 2048;
        }
      }
      while (idx < 片段终点 && !空白字符模式.test(文本[idx])) {
        idx += 1;
        if (idx >= 西文检查位置) {
          if (!(await 让出并检查任务())) {
            return false;
          }
          西文检查位置 = idx + 2048;
        }
      }

      const 单词文本 = 文本.slice(单词起点, idx);
      const 超长片段任务 = 添加排版片段(单词起点, idx, true, 单词文本);
      if (超长片段任务 && !(await 超长片段任务)) {
        return false;
      }
      if (idx >= 西文检查位置) {
        if (!(await 让出并检查任务())) {
          return false;
        }
        西文检查位置 = idx + 2048;
      }
    }
    西文片段起点 = -1;
    return 任务仍然有效();
  }

  function 添加排版片段(片段起点, 片段终点, 是西文, 已知文本) {
    if (是西文 && 片段终点 - 片段起点 > 2048) {
      if (当前行有内容) {
        完成自动行(片段起点);
      }
      return 添加超长片段(已知文本, 片段起点, true);
    }

    const 片段宽度 = 测量范围(片段起点, 片段终点, 是西文, 已知文本);
    const 本行内容宽度 = 排版.内容宽度 - 当前行阶梯层 * 阶梯步进宽;
    if (片段宽度 <= 本行内容宽度 + 0.01) {
      if (当前行有内容 && 当前行宽度 + 片段宽度 > 本行内容宽度 + 0.01) {
        完成自动行(片段起点);
      }
      当前行宽度 += 片段宽度;
      当前行有内容 = true;
      物理行有内容 = true;
      return null;
    }

    if (当前行有内容) {
      完成自动行(片段起点);
    }
    return 添加超长片段(
      已知文本 ?? 文本.slice(片段起点, 片段终点),
      片段起点,
      是西文,
    );
  }

  async function 添加超长片段(片段文本, 片段起点, 是西文) {
    const 字素边界 = [0];
    let 已分段字素数 = 0;
    for (const 字素信息 of 字素分段器.segment(片段文本)) {
      字素边界.push(字素信息.index + 字素信息.segment.length);
      已分段字素数 += 1;
      if ((已分段字素数 & 2047) === 0 && !(await 让出并检查任务())) {
        return false;
      }
    }

    let 起始边界idx = 0;
    let 已完成行数 = 0;
    while (起始边界idx < 字素边界.length - 1) {
      const 本行内容宽度 = 排版.内容宽度 - 当前行阶梯层 * 阶梯步进宽;
      let 左边界idx = 起始边界idx + 1;
      let 右边界idx = Math.min(起始边界idx + 2048, 字素边界.length - 1);
      let 最佳边界idx = 起始边界idx;
      while (左边界idx <= 右边界idx) {
        const 中间边界idx = (左边界idx + 右边界idx) >>> 1;
        const 候选文本 = 片段文本.slice(
          字素边界[起始边界idx],
          字素边界[中间边界idx],
        );
        if (测量片段(候选文本, 是西文) <= 本行内容宽度 + 0.01) {
          最佳边界idx = 中间边界idx;
          左边界idx = 中间边界idx + 1;
        } else {
          右边界idx = 中间边界idx - 1;
        }
      }

      if (最佳边界idx === 起始边界idx) {
        最佳边界idx += 1;
      }
      const 本行文本 = 片段文本.slice(
        字素边界[起始边界idx],
        字素边界[最佳边界idx],
      );
      const 本行终点 = 片段起点 + 字素边界[最佳边界idx];
      当前行宽度 = 测量片段(本行文本, 是西文);
      当前行有内容 = true;
      物理行有内容 = true;
      if (最佳边界idx < 字素边界.length - 1) {
        完成自动行(本行终点);
      }
      起始边界idx = 最佳边界idx;
      已完成行数 += 1;
      if ((已完成行数 & 31) === 0 && !(await 让出并检查任务())) {
        return false;
      }
    }
    return 任务仍然有效();
  }

  function 完成自动行(终点) {
    添加行(行起点, 终点);
    行起点 = 终点;
    // 阶梯段落：折行延续行保持同级缩进（块状缩进），
    // 缩进经 本行内容宽度 扣减体现，这里只清零字符宽度。
    当前行宽度 = 0;
    当前行有内容 = false;
  }

  function 测量范围(片段起点, 片段终点, 是西文, 已知文本) {
    if (!是西文) {
      if (片段终点 - 片段起点 === 1) {
        if (不渲染引号集合.has(文本[片段起点])) {
          return 0;
        }
      }
      return 排版.正文字号;
    }
    return 测量片段(已知文本 ?? 文本.slice(片段起点, 片段终点), true);
  }

  function 测量片段(片段文本, 是西文) {
    if (!是西文) {
      return 不渲染引号集合.has(片段文本) ? 0 : 排版.正文字号;
    }

    const 缓存宽度 = 西文宽度缓存.get(片段文本);
    if (缓存宽度 !== undefined) {
      return 缓存宽度;
    }
    const 宽度 = 测量上下文.measureText(片段文本).width;
    西文宽度缓存.set(片段文本, 宽度);
    return 宽度;
  }

  function 添加行(起点, 终点) {
    起点数组.push(起点);
    终点数组.push(终点);
    逻辑行数组.push(逻辑行idx);
    段落索引数组.push(段落idx);
    阶梯数组.push(当前行阶梯层);
  }

  // 断点偏移在扫描时按升序生成，行索引主循环的字符偏移也单调递增，
  // 因此游标只前进不回退，均摊 O(1)。
  // 返回 -1 表示该偏移没有断点；0 是有效层级（断行但不缩进），
  // 例如段首引文内句末复原到引文首段层级 0。
  function 查找阶梯层(偏移) {
    if (断点起点列表 === null || 断点起点列表.length === 0) {
      return -1;
    }
    while (断点游标 < 断点起点列表.length && 断点起点列表[断点游标] < 偏移) {
      断点游标 += 1;
    }
    if (断点游标 < 断点起点列表.length && 断点起点列表[断点游标] === 偏移) {
      return Math.min(断点层级列表[断点游标], 阶梯最大层数);
    }
    return -1;
  }

  async function 让出并检查任务() {
    时间片开始 = await 按需让出主线程(时间片开始);
    return 任务仍然有效();
  }
}

export function 提交行索引(行索引) {
  状态.行起点列表 = 行索引.行起点列表;
  状态.行终点列表 = 行索引.行终点列表;
  状态.行逻辑索引 = 行索引.行逻辑索引;
  状态.行段落索引 = 行索引.行段落索引;
  状态.行阶梯索引 = 行索引.行阶梯索引 ?? null;
  状态.排版键 = 行索引.排版键;
  状态.行高 = 行索引.行高;
  状态.渲染起点 = -1;
  状态.渲染终点 = -1;
  设置画布高度(行索引.总高度);
  重算全文负担密度();
}

// 密度的分母是像素总高度（行数 × 行高）：行距调整不重建行索引，
// 但必须重算密度，否则自适应调速与剩余时长会按旧密度失真（见 调整行高）。
export function 重算全文负担密度() {
  const 总高度 = 状态.行起点列表.length * 状态.行高;
  状态.全文负担密度 = 总高度 > 0 ? 状态.句段负担总合 / 总高度 : 0;
}

// 段负担 = 段长 × 句长惩罚：超过 自适应句长起点 的连续无标点段，每多一个「起点」区间
// 加成 自适应句长惩罚系数（封顶 自适应句长惩罚上限）。短段（对话、短语）无惩罚。
export function 计算句段负担(段长度) {
  if (段长度 <= 自适应句长起点) {
    return 段长度;
  }
  const 惩罚 =
    1 + 自适应句长惩罚系数 * ((段长度 - 自适应句长起点) / 自适应句长起点);
  return 段长度 * Math.min(自适应句长惩罚上限, 惩罚);
}

// 二分：返回 句段起点列表 中第一个 ≥ 目标 的下标（0..长度）。列表升序，全扫描一次即可。
export function 二分句段起点(目标) {
  const 列表 = 状态.句段起点列表;
  let 低 = 0;
  let 高 = 列表.length;
  while (低 < 高) {
    const 中 = (低 + 高) >>> 1;
    if (列表[中] < 目标) {
      低 = 中 + 1;
    } else {
      高 = 中;
    }
  }
  return 低;
}

export function 刷新画布尺寸(排版) {
  const 顶部行idx = Math.floor(元素.滚动容器.scrollTop / 状态.行高);
  const 顶部偏移 = 状态.行起点列表[顶部行idx] ?? 0;
  const 总高度 = 状态.行起点列表.length * 排版.行高;
  校验虚拟高度(总高度);
  状态.排版键 = 排版.键;
  状态.行高 = 排版.行高;
  状态.渲染起点 = -1;
  状态.渲染终点 = -1;
  设置画布高度(总高度);
  元素.滚动容器.scrollTop = 查找偏移所在行(顶部偏移) * 排版.行高;
}

export function 校验虚拟高度(总高度) {
  if (总高度 > 最大虚拟高度) {
    throw new RangeError(`文本虚拟高度 ${总高度}px 超出 Chrome 单元素安全范围`);
  }
}

export function 设置画布高度(总高度) {
  const 容器高度 = 元素.滚动容器.clientHeight;
  const 底部留白 = 总高度 > 容器高度 ? 容器高度 % 状态.行高 : 0;
  let 末段顶部所需高度 = 0;
  let 最后内容行idx = 状态.行起点列表.length - 1;
  while (
    最后内容行idx >= 0 &&
    状态.行起点列表[最后内容行idx] === 状态.行终点列表[最后内容行idx]
  ) {
    最后内容行idx -= 1;
  }
  if (最后内容行idx >= 0) {
    const 末段起始偏移 =
      状态.文本.lastIndexOf('\n', 状态.行起点列表[最后内容行idx] - 1) + 1;
    const 末段起始行idx = 查找偏移所在行(末段起始偏移);
    末段顶部所需高度 = 末段起始行idx * 状态.行高 + 容器高度;
  }

  const 画布高度 = Math.max(总高度 + 底部留白, 容器高度, 末段顶部所需高度);
  校验虚拟高度(画布高度);
  元素.虚拟画布.style.height = `${画布高度}px`;
}

export function 读取正文排版() {
  const 画布宽度 =
    元素.虚拟画布.clientWidth || Math.min(940, window.innerWidth);
  const 根样式 = getComputedStyle(document.documentElement);

  // 取 CSS 变量，解析失败或无效时回退到默认值，避免样式表加载异常导致整个应用崩溃
  const 读取数字变量 = (变量名, 默认值) => {
    const 原始值 = 根样式.getPropertyValue(变量名);
    const 数值 = Number.parseFloat(原始值);
    return Number.isFinite(数值) && 数值 > 0 ? 数值 : 默认值;
  };
  const 读取字体变量 = (变量名, 默认值) => {
    const 原始值 = 根样式.getPropertyValue(变量名).trim();
    return 原始值 || 默认值;
  };

  const 默认正文字号 = 30;
  const 默认西文字号比例 = 0.96;
  const 默认正文字体 = "'Songti SC', 'STSong', 'Noto Serif CJK SC', serif";
  const 默认西文字体 = "'Iowan Old Style', 'Times New Roman', serif";

  const 正文字号 = 读取数字变量('--正文字号', 默认正文字号);
  const 行高 = 读取数字变量('--行高', 默认行高);
  const 西文字号比例 = 读取数字变量('--西文字号', 默认西文字号比例);
  const 正文字体 = 读取字体变量('--正文字体', 默认正文字体);
  const 西文字体 = 读取字体变量('--西文字体', 默认西文字体);
  const 正文粗细 = 读取数字变量('--正文粗细', 100);
  const 引文粗细 = 读取数字变量('--引文粗细', 900);

  const css回退 =
    正文字号 === 默认正文字号 ||
    行高 === 默认行高 ||
    西文字号比例 === 默认西文字号比例 ||
    正文字体 === 默认正文字体 ||
    西文字体 === 默认西文字体;
  if (css回退) {
    console.warn('[阅读器] 部分正文排版 CSS 变量未生效，已使用默认值', {
      正文字号,
      行高,
      西文字号比例,
      正文字体,
      西文字体,
      正文粗细,
      引文粗细,
    });
  }

  // 两侧留白分别容纳折行句竖条与末次出现标记；排版内容宽度必须同步折减，
  // 避免末字或位于行尾的标记被 overflow: hidden 裁掉。
  const 左留白 = 读取数字变量('--正文左留白', 0);
  const 右留白 = 正文字号 * 读取数字变量('--末处标记留白比例', 0);
  const 内容宽度 = Math.max(正文字号, 画布宽度 - 左留白 - 右留白);
  return {
    键: [
      内容宽度.toFixed(2),
      正文字号,
      行高,
      正文字体,
      西文字体,
      西文字号比例,
      正文粗细,
      引文粗细,
    ].join('|'),
    内容宽度,
    正文字号,
    行高,
    西文字体: `${正文粗细} ${正文字号 * 西文字号比例}px ${西文字体}`,
  };
}

export function 是混合盒命中(命中起点, 命中终点) {
  let 有西文 = false;
  let 有方块 = false;
  for (let idx = 命中起点; idx < 命中终点; idx += 1) {
    const 码 = 状态.文本.charCodeAt(idx);
    if (码 === 0x201c || 码 === 0x201d) {
      return true;
    }
    if (是西文范围(状态.文本, idx, idx + 1)) {
      有西文 = true;
    } else if (是方块字素码(码)) {
      有方块 = true;
    } else {
      return true;
    }
    if (有西文 && 有方块) {
      return true;
    }
  }
  return false;
}

export function 查找偏移所在行(文本偏移) {
  let 左边界 = 0;
  let 右边界 = 状态.行起点列表.length - 1;

  while (左边界 <= 右边界) {
    const idx = (左边界 + 右边界) >>> 1;
    if (状态.行起点列表[idx] <= 文本偏移) {
      左边界 = idx + 1;
    } else {
      右边界 = idx - 1;
    }
  }

  const idx = Math.max(0, 右边界);
  if (状态.行起点列表[idx] === 文本偏移 && 状态.行终点列表[idx] === 文本偏移) {
    return idx;
  }
  if (状态.行终点列表[idx] <= 文本偏移 && idx + 1 < 状态.行起点列表.length) {
    return idx + 1;
  }
  return idx;
}
