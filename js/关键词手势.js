import { 关键词拖拽死区, 命中长按毫秒, 命中长按屏蔽毫秒 } from './常量.js';
import { 状态, 查找关键词 } from './状态.js';
import { 执行导航跳转 } from './键盘控制.js';
import { 打开查找弹窗 } from './查找弹窗.js';

// 「关键词手势」：从 app.js 绑定事件() 闭包拆出。
// 单击命中词 → 跳到该词的下一个出现；双击 → 跳到该词的上一个出现；
// 向上拖拽 → 跳到该词的第一个出现；向下拖拽 → 跳到该词的最后一个出现
// 按住不放满 命中长按毫秒 → 打开该词的查找窗口（同 Ctrl + F），结果停在按住的那一处，正文不滚动
// （普通前进不回绕，到首/末个即停；上下拖拽直达首/末个）。
// 单击/双击本体仍由 app 的 click/dblclick 处理；本模块只负责拖拽与长按判定、点击抑制。
// 拖拽期间通过 CSS（body.关键词手势中 的 user-select:none）+
// 阻止 touchmove/pointermove 默认行为 + 阻止 selectstart，确保绝不选中文字。

let 关键词手势 = null; // { 关键词, 命中idx, 起点Y, 起点X, pointerId, 指针类型, 方向: null|'上'|'下', 长按计时器, 长按已触发 }
let 点击抑制 = false; // 拖拽手势触发后抑制紧随的 click，避免重复跳转
let 松手屏蔽计时器 = 0; // 长按松手后短暂吞掉 click 的解除计时器

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
  const 手势 = {
    关键词: 查找关键词(Number(字元素.dataset.keywordId)),
    命中idx: Number(字元素.dataset.hitIndex),
    起点Y: 事件.clientY,
    起点X: 事件.clientX,
    pointerId: 事件.pointerId ?? null,
    指针类型: 事件.pointerType ?? 'mouse',
    方向: null, // null=尚未拖动；'上'=第一个；'下'=最后一个
    长按计时器: 0,
    长按已触发: false,
  };
  关键词手势 = 手势;
  手势.长按计时器 = setTimeout(function 判定长按() {
    触发命中长按(手势);
  }, 命中长按毫秒);
  return true;
}

export function 处理关键词手势移动(事件) {
  if (
    !是当前关键词手势指针(事件) ||
    关键词手势.方向 ||
    关键词手势.长按已触发
  ) {
    return;
  }
  const 偏移Y = 事件.clientY - 关键词手势.起点Y;
  const 偏移X = 事件.clientX - 关键词手势.起点X;
  // 任一方向越过死区即放弃长按判定：那是拖选文字或滚动，不是按住
  if (Math.abs(偏移X) > 关键词拖拽死区 || Math.abs(偏移Y) > 关键词拖拽死区) {
    取消命中长按(关键词手势);
  }
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
  取消命中长按(手势);
  关键词手势 = null;
  document.body.classList.remove('关键词手势中');
  if (手势.长按已触发) {
    window.getSelection()?.removeAllRanges();
    状态.拖选状态 = null;
    // 只有触摸松手会补发命中弹窗的兼容 click（鼠标按下/抬起分属两棵树，本就不派发 click）
    if (手势.指针类型 !== 'mouse') {
      屏蔽松手点击();
    }
    return true;
  }
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
  取消命中长按(关键词手势);
  关键词手势 = null;
  document.body.classList.remove('关键词手势中');
  return true;
}

// 手指/笔按住命中词未松手：触摸长按会被系统派发为 contextmenu，据此压掉原生选择菜单。
// 只认触摸类指针，鼠标按住期间仍保留原生右键菜单（如左键拖选后右键复制）。
export function 触摸按住命中词中() {
  return Boolean(关键词手势) && 关键词手势.指针类型 !== 'mouse';
}

function 触发命中长按(手势) {
  手势.长按计时器 = 0;
  if (关键词手势 !== 手势 || 手势.方向) {
    return; // 已被拖拽/松手接管
  }
  手势.长按已触发 = true;
  const 关键词 = 手势.关键词;
  if (!关键词?.命中位置.length) {
    return;
  }
  document.body.classList.add('关键词手势中'); // 长按已生效，禁止继续拖选
  window.getSelection()?.removeAllRanges();
  状态.拖选状态 = null;
  状态.当前关键词id = 关键词.id;
  关键词.当前命中idx = Math.max(
    0,
    Math.min(手势.命中idx, 关键词.命中位置.length - 1),
  );
  打开查找弹窗(关键词, false); // 按住的词就在眼前：只展开结果，不挪动正文
  console.info('[阅读器] 长按命中词打开查找', {
    关键词: 关键词.文本,
    命中: 关键词.当前命中idx + 1,
    总命中数: 关键词.命中位置.length,
  });
}

function 取消命中长按(手势) {
  if (手势?.长按计时器) {
    clearTimeout(手势.长按计时器);
    手势.长按计时器 = 0;
  }
}

// 触摸长按松手时，浏览器会补发一对兼容 mousedown/mouseup/click，其命中点是刚弹出的
// 查找弹窗本体（target 恰为 dialog → 被「点框内关闭」逻辑当成用户主动关窗）。
// 松手后吞掉第一条 click 即解除；若这次没有 click 到达，超时自动解除，不影响后续操作。
function 屏蔽松手点击() {
  解除松手屏蔽();
  window.addEventListener('click', 吞掉松手点击, true);
  松手屏蔽计时器 = setTimeout(解除松手屏蔽, 命中长按屏蔽毫秒);
}

function 吞掉松手点击(事件) {
  事件.stopPropagation();
  解除松手屏蔽();
}

function 解除松手屏蔽() {
  clearTimeout(松手屏蔽计时器);
  松手屏蔽计时器 = 0;
  window.removeEventListener('click', 吞掉松手点击, true);
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
