import {
  右下热区宽度,
  右下热区高度,
  右下控件外扩,
  右下出区宽限毫秒,
  右下触摸显示时长,
} from './常量.js';

// 右下角控件显示热区：鼠标靠近 / 触摸 / 键盘聚焦 / 自动滚动强制显示。
// 从 app.js 绑定事件() 闭包拆出；显示状态为模块级私有，语义不变。
// 事件监听仍由 app.js 组合根绑定；自动滚动经 注册右下强制显示 钩子
// 调用 设置右下强制显示（断环：避免「自动滚动 → app」反向依赖）。

let 右下悬停 = false;
let 右下聚焦 = false;
let 右下强制 = false;
let 右下触摸 = false;
let 右下悬停帧 = 0;
let 右下悬停X = 0;
let 右下悬停Y = 0;
let 右下触摸计时器 = 0;
let 出区宽限计时器 = 0;
let 按钮组 = null;

function 在右下热区(x, y) {
  if (
    x > window.innerWidth - 右下热区宽度 &&
    y > window.innerHeight - 右下热区高度
  ) {
    return true;
  }
  if (!按钮组?.isConnected) {
    按钮组 = document.querySelector('.右下按钮组');
  }
  if (!按钮组) {
    return false;
  }
  const 矩形 = 按钮组.getBoundingClientRect();
  // 常量文件与模块文件是两次独立请求，任一侧留在旧缓存里都会给出 undefined，
  // 而 undefined 参与减法得到 NaN，整条矩形判定会静默失效 → 退回内置值。
  const 外扩 = Number.isFinite(右下控件外扩) ? 右下控件外扩 : 12;
  return (
    x >= 矩形.left - 外扩 &&
    x <= 矩形.right + 外扩 &&
    y >= 矩形.top - 外扩 &&
    y <= 矩形.bottom + 外扩
  );
}

function 刷新右下控件可见性() {
  document.body.classList.toggle(
    '右下控件显示',
    右下悬停 || 右下聚焦 || 右下强制 || 右下触摸,
  );
}

// 出区不立刻抽走按钮（菜单式宽限）：伸手过程中指针会掠过组外几帧，
// 热区判定与实际像素也可能差几 px；一有抖动就把指针底下的按钮抽走，就成了「点不上」。
function 应用悬停判定(在热区) {
  if (在热区) {
    if (出区宽限计时器) {
      window.clearTimeout(出区宽限计时器);
      出区宽限计时器 = 0;
    }
    右下悬停 = true;
    刷新右下控件可见性();
    return;
  }
  if (出区宽限计时器 || !右下悬停) {
    return;
  }
  出区宽限计时器 = window.setTimeout(
    function 宽限结束再隐藏() {
      出区宽限计时器 = 0;
      右下悬停 = false;
      刷新右下控件可见性();
    },
    Number.isFinite(右下出区宽限毫秒) ? 右下出区宽限毫秒 : 350,
  );
}

export function 设置右下强制显示(正在滚动) {
  右下强制 = 正在滚动;
  if (!正在滚动 && (右下悬停X || 右下悬停Y)) {
    // 停滚多半由一次鼠标移动引起，而 处理鼠标移动 比悬停判定先绑定：
    // 它把 强制 撤掉时 悬停 还是上一帧的旧值，指针正按在按钮上也会被抽走。
    // 这里用手上这对坐标就地重算一次。
    应用悬停判定(在右下热区(右下悬停X, 右下悬停Y));
  }
  刷新右下控件可见性();
}

export function 设置右下聚焦(聚焦) {
  右下聚焦 = 聚焦;
  刷新右下控件可见性();
}

// 鼠标靠近右下角热区即显示，离开则隐藏。
// 热区 = 固定的角落矩形 ∪ 按钮组实际矩形（外扩 右下控件外扩）。
// 只用角落矩形会漏：按钮组钉在 right:172px，整组左缘比 右下热区宽度 更靠左，
// 指针落在「书籍」的图标那一截就出了矩形 → 整组淡出，表现为"移上去就消失"。
// 按钮组宽度会随章节数、速度文案、白线高度变化，所以按实时矩形判定而不再调常量。
// 用 rAF 节流，避免每次 mousemove 都同步刷新。
export function 处理右下控件悬停(事件) {
  右下悬停X = 事件.clientX;
  右下悬停Y = 事件.clientY;
  if (右下悬停帧) {
    return;
  }
  右下悬停帧 = requestAnimationFrame(function 计算下方热区() {
    右下悬停帧 = 0;
    应用悬停判定(在右下热区(右下悬停X, 右下悬停Y));
  });
}

// 触摸设备无 hover：点击右下角热区后短暂显示，给触摸用户一个入口，
// 超时后自动隐藏，避免长期遮挡正文。
export function 处理右下控件触摸(事件) {
  const 触点 = 事件.touches[0];
  if (!触点) {
    return;
  }
  if (在右下热区(触点.clientX, 触点.clientY)) {
    右下触摸 = true;
    刷新右下控件可见性();
    window.clearTimeout(右下触摸计时器);
    右下触摸计时器 = window.setTimeout(function 结束触摸显示() {
      右下触摸 = false;
      刷新右下控件可见性();
    }, 右下触摸显示时长);
  }
}
