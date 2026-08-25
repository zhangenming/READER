import { 元素 } from './状态.js';

export function 显示文本处理错误(错误) {
  const 文字 =
    错误 instanceof RangeError
      ? '文本过大，当前窗口宽度下超出了 Chrome 的安全滚动高度。'
      : '文本处理失败，请查看控制台错误信息。';
  显示错误(文字, 错误);
}

export function 显示错误(文字, 错误) {
  元素.载入状态.classList.add('错误');
  元素.载入状态.querySelector('.载入线').hidden = true;
  元素.载入状态.querySelector('p').textContent = 文字;
  元素.载入状态.hidden = false;
  console.error('[阅读器] 操作失败', 错误);
}
