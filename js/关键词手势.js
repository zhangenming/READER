import { 关键词拖拽死区 } from './常量.js';
import { 状态, 查找关键词 } from './状态.js';
import { 执行导航跳转 } from './键盘控制.js';

// 「关键词手势」：从 app.js 绑定事件() 闭包拆出。
// 单击命中词 → 跳到该词的下一个出现；双击 → 跳到该词的上一个出现；
// 向上拖拽 → 跳到该词的第一个出现；向下拖拽 → 跳到该词的最后一个出现
// （普通前进不回绕，到首/末个即停；上下拖拽直达首/末个）。
// 单击/双击本体仍由 app 的 click/dblclick 处理；本模块只负责拖拽判定与点击抑制。
// 拖拽期间通过 CSS（body.关键词手势中 的 user-select:none）+
// 阻止 touchmove/pointermove 默认行为 + 阻止 selectstart，确保绝不选中文字。

let 关键词手势 = null; // { 关键词, 命中idx, 起点Y, 起点X, pointerId, 方向: null|'上'|'下' }
let 点击抑制 = false; // 拖拽手势触发后抑制紧随的 click，避免重复跳转

// 手势触发跳转后，紧随的 click 会带抑制标记到达；消费一次即复位
export function 消费点击抑制() {
  if (!点击抑制) {
    return false;
  }
  点击抑制 = false;
  return true;
}

export function 处理关键词手势开始(事件) {
  if (事件.button !== 0 || 事件.isPrimary === false || 关键词手势) {
    return false;
  }
  document.body.classList.remove('关键词手势中');
  const 字元素 = 事件.target.closest?.('.字');
  if (!字元素 || !字元素.classList.contains('命中')) {
    return false;
  }
  if (事件.shiftKey || 事件.altKey || 事件.metaKey || 事件.ctrlKey) {
    return false; // 修饰键组合交给既有逻辑，不介入
  }
  点击抑制 = false;
  关键词手势 = {
    关键词: 查找关键词(Number(字元素.dataset.keywordId)),
    命中idx: Number(字元素.dataset.hitIndex),
    起点Y: 事件.clientY,
    起点X: 事件.clientX,
    pointerId: 事件.pointerId ?? null,
    方向: null, // null=尚未拖动；'上'=第一个；'下'=最后一个
  };
  return true;
}

export function 处理关键词手势移动(事件) {
  if (!是当前关键词手势指针(事件) || 关键词手势.方向) {
    return;
  }
  const 偏移Y = 事件.clientY - 关键词手势.起点Y;
  const 偏移X = 事件.clientX - 关键词手势.起点X;
  // 横向拖动或位移过小 → 视为普通点击/双击，不进入手势
  if (Math.abs(偏移X) > Math.abs(偏移Y) || Math.abs(偏移Y) < 关键词拖拽死区) {
    return;
  }
  关键词手势.方向 = 偏移Y < 0 ? '上' : '下';
  document.body.classList.add('关键词手势中');
  window.getSelection()?.removeAllRanges();
  if (事件.cancelable) {
    事件.preventDefault(); // 阻止滚动与文本选择
  }
  状态.拖选状态 = null; // 避免与向下拖选的滚动钉死逻辑竞争
}

export function 处理关键词触摸移动(事件) {
  // 触摸场景下仅手势进行中阻止滚动/选择（不影响正常触摸滚动）
  if (关键词手势?.方向 && 事件.cancelable) {
    事件.preventDefault();
  }
}

export function 处理关键词选择阻止(事件) {
  if (关键词手势?.方向 && 事件.cancelable) {
    事件.preventDefault();
  }
}

export function 处理关键词手势松开(事件) {
  if (!是当前关键词手势指针(事件)) {
    return false;
  }
  const 手势 = 关键词手势;
  关键词手势 = null;
  document.body.classList.remove('关键词手势中');
  if (!手势.方向 || !手势.关键词?.命中位置.length) {
    return true; // 无方向 = 普通点击/双击，交还给 click/dblclick 处理
  }
  // 抑制紧随的 click（避免 处理高亮点击 再前进一格），并清掉选区
  点击抑制 = true;
  setTimeout(function 解除点击抑制() {
    点击抑制 = false;
  }, 0);
  window.getSelection()?.removeAllRanges();
  状态.拖选状态 = null;
  if (事件.cancelable) {
    事件.preventDefault();
  }
  // 向下拖 → 全文最后一个；向上拖 → 全文第一个
  状态.当前关键词id = 手势.关键词.id;
  手势.关键词.当前命中idx = Math.max(
    0,
    Math.min(手势.命中idx, 手势.关键词.命中位置.length - 1),
  );
  执行导航跳转({
    向上: 手势.方向 === '上',
    Command已按下: true,
    仅当前关键词: true,
  });
  return true;
}

export function 处理关键词手势取消(事件) {
  if (!是当前关键词手势指针(事件)) {
    return false;
  }
  关键词手势 = null;
  document.body.classList.remove('关键词手势中');
  return true;
}

function 是当前关键词手势指针(事件) {
  if (!关键词手势) {
    return false;
  }
  if (!事件) {
    return true;
  }
  if (事件.isPrimary === false) {
    return false;
  }
  return 事件.pointerId === 关键词手势.pointerId;
}
