import {
  当前命中位置提示时长,
  自动滚动界面间隔,
  衔接线播放时长,
  跳转迸发时长,
  迸发射程差,
  迸发尺寸差,
  迸发最小尺寸,
  迸发最短射程,
  迸发粒子数,
  迸发起跳留白,
  迸发重力位移,
} from './常量.js';
import { 元素, 状态 } from './状态.js';
import { 查找偏移所在行 } from './排版引擎.js';
import { 渲染可见行 } from './虚拟渲染.js';
import { 查找关键词 } from './关键词.js';
import { 更新关键词指示器 } from './指示器.js';
import { 更新滚动块位置, 更新滚动块文本 } from './滚动条.js';
import { 安排保存持久化状态, 读取阅读位置 } from './持久化.js';

元素.跳转迸发.append(
  ...Array.from({ length: 迸发粒子数 }, function 造火花() {
    return document.createElement('i');
  }),
);

export function 跳到命中(
  关键词,
  命中idx,
  原始行位置 = 获取当前命中行位置(关键词),
  原始边框 = 获取当前命中边框(关键词),
  最小前行距离 = 0,
) {
  const 是首次跳转 = !状态.跳转起点;
  if (是首次跳转) {
    const 原关键词 = 查找关键词(状态.当前关键词id);
    状态.跳转起点 = {
      ...读取阅读位置(),
      当前关键词id: 原关键词?.id ?? null,
      当前命中idx: 原关键词?.当前命中idx ?? -1,
    };
    console.info('[阅读器] 已记录跳转起点', {
      关键词: 原关键词?.文本 ?? null,
      当前项: (原关键词?.当前命中idx ?? -1) + 1,
      阅读偏移: 状态.跳转起点.阅读偏移,
    });
  }
  状态.当前关键词id = 关键词.id;
  关键词.当前命中idx = 命中idx;
  const 文本偏移 = 关键词.命中位置[命中idx];
  const 行idx = 查找偏移所在行(文本偏移);
  const 默认行位置 = (元素.滚动容器.clientHeight - 状态.行高) / 2;
  const 目标行位置 = Number.isFinite(原始行位置) ? 原始行位置 : 默认行位置;
  let 目标滚动位置 = 行idx * 状态.行高 - 目标行位置;
  // 仅对顺序向下跳转保留最小前行距离；首尾回绕时必须允许滚动方向反转。
  if (最小前行距离 > 0 && 目标滚动位置 >= 元素.滚动容器.scrollTop) {
    const 当前滚动位置 = 元素.滚动容器.scrollTop;
    const 最大滚动位置 = Math.max(
      0,
      元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight,
    );
    目标滚动位置 = Math.min(
      最大滚动位置,
      Math.max(目标滚动位置, 当前滚动位置 + 最小前行距离),
    );
  }
  if (!原始边框) {
    渲染可见行(true);
  }
  更新关键词指示器();
  显示当前命中位置提示();
  安排保存持久化状态();
  const 已启用边框动画 = 动画滚动到(
    目标滚动位置,
    原始边框
      ? {
          起点: 原始边框,
          关键词,
          命中idx,
        }
      : null,
  );

  console.info('[阅读器] 已跳转到命中', {
    关键词: 关键词.文本,
    当前项: 命中idx + 1,
    文本偏移,
    行idx,
    目标行位置: Math.round(目标行位置),
    是首次跳转,
    边框动画: 已启用边框动画,
  });
}

export function 显示当前命中位置提示() {
  for (const 字元素 of 元素.可见内容.querySelectorAll('.字.显示命中位置')) {
    字元素.classList.remove('显示命中位置');
  }
  window.clearTimeout(状态.当前命中位置计时器);
  状态.当前命中位置计时器 = window.setTimeout(function 隐藏当前命中位置提示() {
    状态.当前命中位置计时器 = 0;
    for (const 字元素 of 元素.可见内容.querySelectorAll('.字.显示命中位置')) {
      字元素.classList.remove('显示命中位置');
    }
  }, 当前命中位置提示时长);
  for (const 字元素 of 元素.可见内容.querySelectorAll(
    '.字.命中.当前命中[data-hit-position]',
  )) {
    字元素.classList.add('显示命中位置');
  }
}

export function 获取当前命中行位置(关键词) {
  if (关键词.当前命中idx < 0 || 关键词.id !== 状态.当前关键词id) {
    return null;
  }
  if (状态.滚动动画目标) {
    const 行位置 =
      查找偏移所在行(关键词.命中位置[关键词.当前命中idx]) * 状态.行高 -
      获取静止滚动位置();
    const 在静止视口内 =
      行位置 > -状态.行高 && 行位置 < 元素.滚动容器.clientHeight;
    return 在静止视口内 ? 行位置 : null;
  }
  const 当前元素 = 元素.可见内容.querySelector(
    `.字.当前命中[data-keyword-id="${关键词.id}"]`,
  );
  return 当前元素 ? 获取元素行位置(当前元素) : null;
}

export function 获取当前命中边框(关键词) {
  if (关键词.当前命中idx < 0 || 关键词.id !== 状态.当前关键词id) {
    return null;
  }
  if (状态.滚动动画目标) {
    return 获取动画中边框(状态.滚动动画目标);
  }
  const 当前元素 = 元素.可见内容.querySelector(
    `.字.当前命中[data-keyword-id="${关键词.id}"][data-hit-index="${关键词.当前命中idx}"]`,
  );
  return 当前元素 ? 获取元素命中边框(当前元素) : null;
}

export function 获取动画中边框(动画目标) {
  const 边框动画 = 动画目标.边框动画;
  if (!边框动画) {
    return null;
  }
  const 进度 = 动画目标.缓动进度;
  return {
    左侧: 边框动画.起点.左侧 + (边框动画.终点.左侧 - 边框动画.起点.左侧) * 进度,
    顶部: 边框动画.起点.顶部,
    宽度: 边框动画.起点.宽度 + (边框动画.终点.宽度 - 边框动画.起点.宽度) * 进度,
    高度: 边框动画.起点.高度,
    颜色: 边框动画.终点.颜色,
  };
}

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

export function 获取元素命中边框(字元素) {
  const 关键词id = Number(字元素.dataset.keywordId);
  const 命中idx = Number(字元素.dataset.hitIndex);
  const 行元素 = 字元素.closest('.正文行');
  if (!Number.isInteger(关键词id) || !Number.isInteger(命中idx) || !行元素) {
    throw new TypeError('命中元素缺少有效的边框定位信息');
  }

  const 命中元素列表 = 行元素.querySelectorAll(
    `.字.命中[data-keyword-id="${关键词id}"][data-hit-index="${命中idx}"]`,
  );
  const 矩形列表 = [...命中元素列表].map(function 读取矩形(命中元素) {
    return 命中元素.getBoundingClientRect();
  });
  if (!矩形列表.length) {
    throw new Error('无法读取命中元素的边框区域');
  }

  const 左侧 = Math.min(...矩形列表.map((矩形) => 矩形.left));
  const 顶部 = Math.min(...矩形列表.map((矩形) => 矩形.top));
  const 右侧 = Math.max(...矩形列表.map((矩形) => 矩形.right));
  const 底部 = Math.max(...矩形列表.map((矩形) => 矩形.bottom));
  const 字样式 = getComputedStyle(字元素);
  return {
    左侧,
    顶部,
    宽度: 右侧 - 左侧,
    高度: 底部 - 顶部,
    颜色: 字样式.getPropertyValue('--命中背景').trim(),
  };
}

export function 获取元素行位置(字元素) {
  const 文本偏移 = Number(字元素.dataset.start);
  if (!Number.isInteger(文本偏移)) {
    throw new TypeError('命中元素缺少有效的文本偏移');
  }

  return 查找偏移所在行(文本偏移) * 状态.行高 - 元素.滚动容器.scrollTop;
}

export function 动画滚动到(目标位置, 边框跳转 = null) {
  取消滚动动画();
  const 视口度量 = {
    轨道高度: 元素.自定义滚动条.clientHeight,
    容器高度: 元素.滚动容器.clientHeight,
    滚动高度: 元素.滚动容器.scrollHeight,
  };
  const 最大滚动位置 = Math.max(0, 视口度量.滚动高度 - 视口度量.容器高度);
  const 终点 = Math.min(最大滚动位置, Math.max(0, 目标位置));
  const 起点 = 元素.滚动容器.scrollTop;
  const 距离 = 终点 - 起点;
  const 边框动画 = 创建边框动画();
  const 边框横向距离 = 边框动画 ? 边框动画.终点.左侧 - 边框动画.起点.左侧 : 0;
  if (Math.abs(距离) < 1 && Math.abs(边框横向距离) < 1) {
    元素.滚动容器.scrollTop = 终点;
    渲染可见行(true);
    return false;
  }

  const 时长 =
    Math.abs(距离) < 1
      ? 220
      : Math.min(720, Math.max(300, Math.sqrt(Math.abs(距离)) * 12));
  const 开始时间 = performance.now();
  let 上次文字更新时间 = 开始时间;
  const 动画目标 = { 终点, 边框动画, 缓动进度: 0 };
  状态.滚动动画目标 = 动画目标;
  if (边框动画) {
    显示跳转边框(边框动画.起点);
  }
  状态.滚动动画帧 = requestAnimationFrame(function 执行动画(当前时间) {
    const 进度 = Math.min(1, (当前时间 - 开始时间) / 时长);
    const 缓动进度 = 进度 ** 2;
    动画目标.缓动进度 = 缓动进度;
    元素.滚动容器.scrollTop = 起点 + 距离 * 缓动进度;
    渲染可见行(false, 视口度量.容器高度);
    const 滚动块状态 = 更新滚动块位置(视口度量);
    if (
      滚动块状态 &&
      (进度 === 1 || 当前时间 - 上次文字更新时间 >= 自动滚动界面间隔)
    ) {
      上次文字更新时间 = 当前时间;
      更新滚动块文本(滚动块状态);
    }
    if (边框动画) {
      更新跳转边框(边框动画, 缓动进度);
    }
    if (进度 < 1) {
      状态.滚动动画帧 = requestAnimationFrame(执行动画);
    } else {
      状态.滚动动画帧 = 0;
      状态.滚动动画目标 = null;
      元素.滚动容器.scrollTop = 终点;
      渲染可见行(false, 视口度量.容器高度);
      隐藏跳转边框();
      安排保存持久化状态();
      if (边框动画) {
        播放跳转迸发(边框动画.终点);
      }
    }
  });
  return Boolean(边框动画);

  function 创建边框动画() {
    if (!边框跳转) {
      return null;
    }

    try {
      元素.滚动容器.scrollTop = 终点;
      渲染可见行(true);
      const 目标元素 = 元素.可见内容.querySelector(
        `.字.当前命中[data-keyword-id="${边框跳转.关键词.id}"][data-hit-index="${边框跳转.命中idx}"]`,
      );
      if (!目标元素) {
        throw new Error('滚动终点缺少当前命中元素');
      }
      const 终点边框 = 获取元素命中边框(目标元素);
      const 垂直偏差 = Math.abs(终点边框.顶部 - 边框跳转.起点.顶部);
      if (垂直偏差 > 1) {
        console.info('[阅读器] 已跳过边框横移动画', {
          原因: '滚动边界使命中项未能保持原屏幕行',
          垂直偏差: Math.round(垂直偏差),
        });
        return null;
      }
      return {
        起点: 边框跳转.起点,
        终点: 终点边框,
      };
    } finally {
      元素.滚动容器.scrollTop = 起点;
      渲染可见行(false, 视口度量.容器高度);
    }
  }

  function 显示跳转边框(边框) {
    元素.跳转边框.style.width = `${边框.宽度}px`;
    元素.跳转边框.style.height = `${边框.高度}px`;
    元素.跳转边框.style.setProperty('--命中背景', 边框.颜色);
    更新跳转边框({ 起点: 边框, 终点: 边框 }, 0);
    元素.滚动容器.classList.add('边框跳转中');
    元素.跳转边框.hidden = false;
  }

  function 更新跳转边框(动画, 进度) {
    const 左侧 = 动画.起点.左侧 + (动画.终点.左侧 - 动画.起点.左侧) * 进度;
    const 横向缩放 = 1 + (动画.终点.宽度 / 动画.起点.宽度 - 1) * 进度;
    元素.跳转边框.style.transform = `translate3d(${左侧}px, ${动画.起点.顶部}px, 0) scaleX(${横向缩放})`;
  }
}

export function 取消滚动动画() {
  const 正在播放 = Boolean(状态.滚动动画帧);
  if (状态.滚动动画帧) {
    cancelAnimationFrame(状态.滚动动画帧);
    状态.滚动动画帧 = 0;
  }
  状态.滚动动画目标 = null;
  隐藏跳转边框();
  隐藏跳转迸发();
  if (正在播放) {
    console.info('[阅读器] 跳转动画已中断', {
      滚动位置: Math.round(元素.滚动容器.scrollTop),
    });
  }
}

export function 隐藏跳转边框() {
  if (元素.跳转边框.hidden) {
    return;
  }
  元素.滚动容器.classList.remove('边框跳转中');
  元素.跳转边框.hidden = true;
  元素.跳转边框.removeAttribute('style');
}

export function 播放跳转迸发(边框) {
  隐藏跳转迸发();
  元素.跳转迸发.style.left = `${边框.左侧 + 边框.宽度 / 2}px`;
  元素.跳转迸发.style.top = `${边框.顶部 + 边框.高度 / 2}px`;
  布置迸发粒子(边框.宽度 / 2, 边框.高度 / 2);
  元素.跳转迸发.hidden = false;
  void 元素.跳转迸发.offsetWidth; // 连续跳转时强制回流，让同名动画能重新起播
  元素.跳转迸发.classList.add('跳转迸发播放中');
  元素.跳转迸发.addEventListener('animationend', 隐藏跳转迸发, { once: true });
  // 页面切到后台时 CSS 动画会冻结，animationend 迟迟不来，用计时器兜底收走火花
  状态.迸发计时器 = window.setTimeout(隐藏跳转迸发, 跳转迸发时长 + 80);

  function 布置迸发粒子(字体半宽, 字体半高) {
    for (const 粒子 of 元素.跳转迸发.children) {
      const 弧度 = Math.random() * Math.PI * 2;
      const 水平分量 = Math.cos(弧度);
      const 竖直分量 = Math.sin(弧度);
      const 粒子尺寸 = 迸发最小尺寸 + Math.random() * 迸发尺寸差;
      const 起跳半宽 = 字体半宽 + 迸发起跳留白 + 粒子尺寸 / 2;
      const 起跳半高 = 字体半高 + 迸发起跳留白 + 粒子尺寸 / 2;
      const 起跳距离 = Math.min(
        起跳半宽 / Math.abs(水平分量),
        起跳半高 / Math.abs(竖直分量),
      );
      const 起x = 水平分量 * 起跳距离;
      const 起y = 竖直分量 * 起跳距离;
      const 射程 = 迸发最短射程 + Math.random() * 迸发射程差;
      const 水平位移 = 水平分量 * 射程;
      const 竖直位移 = 竖直分量 * 射程;
      // 该二次曲线等价于匀速横移叠加垂直重力加速度
      粒子.style.offsetPath = `path("M ${起x.toFixed(1)} ${起y.toFixed(1)} Q ${(起x + 水平位移 / 2).toFixed(1)} ${(起y + 竖直位移 / 2).toFixed(1)} ${(起x + 水平位移).toFixed(1)} ${(起y + 竖直位移 + 迸发重力位移).toFixed(1)}")`;
      粒子.style.setProperty('--粒子尺寸', `${粒子尺寸.toFixed(1)}px`);
    }
  }
}

export function 隐藏跳转迸发() {
  if (元素.跳转迸发.hidden && !状态.迸发计时器) {
    return;
  }
  window.clearTimeout(状态.迸发计时器);
  状态.迸发计时器 = 0;
  元素.跳转迸发.removeEventListener('animationend', 隐藏跳转迸发);
  元素.跳转迸发.classList.remove('跳转迸发播放中');
  元素.跳转迸发.hidden = true;
  元素.跳转迸发.style.removeProperty('left');
  元素.跳转迸发.style.removeProperty('top');
}

/* 快速翻页开始时，在原视口的翻页方向边界画一条线，随内容滚动扫过视口，
   标明新旧内容衔接位置；停留结束后再淡出。
   衔接线位于虚拟画布内（文档坐标），随内容滚动，天然落在新旧内容交界处。 */

export function 显示衔接线(滚动位置) {
  取消衔接线淡出();
  if (!状态.行高) {
    return;
  }
  const 行对齐位置 = Math.round(滚动位置 / 状态.行高) * 状态.行高;
  元素.衔接线.style.top = `${行对齐位置}px`;
  元素.衔接线.hidden = false;
}

export function 隐藏衔接线() {
  if (元素.衔接线.hidden) {
    return;
  }
  元素.衔接线.classList.add('播放中'); // 播放 衔接线淡出（opacity 1 → 0）
  元素.衔接线.addEventListener('animationend', 收起衔接线, { once: true });
  状态.衔接线计时器 = window.setTimeout(收起衔接线, 衔接线播放时长 + 80);
}

export function 取消衔接线淡出() {
  window.clearTimeout(状态.衔接线计时器);
  元素.衔接线.classList.remove('播放中');
  元素.衔接线.removeEventListener('animationend', 收起衔接线);
}

export function 收起衔接线() {
  元素.衔接线.hidden = true;
  取消衔接线淡出();
}

export function 查找首个相交命中(关键词, 文本偏移) {
  let 左边界 = 0;
  let 右边界 = 关键词.命中位置.length;
  while (左边界 < 右边界) {
    const idx = (左边界 + 右边界) >>> 1;
    if (关键词.命中位置[idx] + 关键词.文本.length <= 文本偏移) {
      左边界 = idx + 1;
    } else {
      右边界 = idx;
    }
  }
  return 左边界;
}

export function 查找首个不小于的命中(关键词, 文本偏移) {
  let 左边界 = 0;
  let 右边界 = 关键词.命中位置.length;
  while (左边界 < 右边界) {
    const idx = (左边界 + 右边界) >>> 1;
    if (关键词.命中位置[idx] < 文本偏移) {
      左边界 = idx + 1;
    } else {
      右边界 = idx;
    }
  }
  return 左边界;
}

export function 二分查找精确命中(关键词, 文本偏移) {
  const idx = 查找首个不小于的命中(关键词, 文本偏移);
  return 关键词.命中位置[idx] === 文本偏移 ? idx : -1;
}
