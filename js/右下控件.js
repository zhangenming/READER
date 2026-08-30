import {
  右下热区宽度,
  右下热区高度,
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

function 刷新右下控件可见性() {
  document.body.classList.toggle(
    '右下控件显示',
    右下悬停 || 右下聚焦 || 右下强制 || 右下触摸,
  );
}

export function 设置右下强制显示(正在滚动) {
  右下强制 = 正在滚动;
  刷新右下控件可见性();
}

export function 设置右下聚焦(聚焦) {
  右下聚焦 = 聚焦;
  刷新右下控件可见性();
}

// 鼠标靠近右下角热区（右 380px / 底 130px 以内）即显示，离开则隐藏。
// 用 rAF 节流，避免每次 mousemove 都同步刷新。
export function 处理右下控件悬停(事件) {
  右下悬停X = 事件.clientX;
  右下悬停Y = 事件.clientY;
  if (右下悬停帧) {
    return;
  }
  右下悬停帧 = requestAnimationFrame(function 计算下方热区() {
    右下悬停帧 = 0;
    const 在热区 =
      右下悬停X > window.innerWidth - 右下热区宽度 &&
      右下悬停Y > window.innerHeight - 右下热区高度;
    右下悬停 = 在热区;
    刷新右下控件可见性();
  });
}

// 触摸设备无 hover：点击右下角热区后短暂显示，给触摸用户一个入口，
// 超时后自动隐藏，避免长期遮挡正文。
export function 处理右下控件触摸(事件) {
  const 触点 = 事件.touches[0];
  if (!触点) {
    return;
  }
  if (
    触点.clientX > window.innerWidth - 右下热区宽度 &&
    触点.clientY > window.innerHeight - 右下热区高度
  ) {
    右下触摸 = true;
    刷新右下控件可见性();
    window.clearTimeout(右下触摸计时器);
    右下触摸计时器 = window.setTimeout(function 结束触摸显示() {
      右下触摸 = false;
      刷新右下控件可见性();
    }, 右下触摸显示时长);
  }
}
