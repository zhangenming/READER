import { 双击判定延迟 } from './常量.js';
import { 元素, 状态, 查找关键词 } from './状态.js';
import { 读取选择关键词 } from './关键词.js';
import { 消费点击抑制 } from './关键词手势.js';
import { 执行导航跳转, 取消待定导航 } from './键盘控制.js';
import { 渲染可见行, 显示当前命中位置提示 } from './虚拟渲染.js';
import { 更新关键词指示器 } from './指示器.js';
import {
  取消滚动动画,
  结束跳转会话,
  获取元素命中边框,
  获取元素行位置,
  跳到命中,
} from './跳转动画.js';
import { 安排保存持久化状态, 读取阅读位置 } from './持久化.js';

// 正文选择与命中点击/悬停交互：从 app.js 绑定事件() 闭包拆出。
// 含拖选会话收尾（含双击放弃建词）、单击前进的延迟判定（每次单击各排一个计时器，
// 双击统一清空挂起项）、双击跳上一处 / 复制整行、同组悬停高亮与悬停暂停恢复。
// 模块级私有状态（双击待定 / 待定单击列表）语义不变；
// 事件监听仍由 app.js 组合根绑定，本模块只实现交互语义。

let 双击待定 = false;
let 待定单击列表 = []; // 每次单击各自排一个计时器；双击时统一清空，确保单击不抢先在双击前前进

export function 处理正文按下(事件) {
  取消滚动动画();
  双击待定 = 事件.detail >= 2; // 第二次按下属于双击序列，mouseup 时放弃建关键词
  const 字元素 = 事件.target.closest('.字');
  if (!字元素 || 事件.button !== 0) {
    if (事件.button === 0 && 事件.target === 元素.滚动容器) {
      结束跳转会话('拖动滚动条');
    }
    return;
  }
  if (
    字元素.classList.contains('命中') &&
    (事件.shiftKey || 事件.altKey || 事件.metaKey || 事件.ctrlKey)
  ) {
    事件.preventDefault();
    window.getSelection()?.removeAllRanges();
    return;
  }

  // 双击命中词时阻止原生整词选中：双击用于「跳到上一个」，不应选中文本。
  // 仅对第二/三次按下（detail>1）拦截默认行为，单击与拖选不受影响。
  if (字元素.classList.contains('命中') && 事件.detail > 1) {
    事件.preventDefault();
    window.getSelection()?.removeAllRanges();
  }

  状态.拖选状态 = {
    滚动位置: 元素.滚动容器.scrollTop,
    已阻止滚动: false,
  };
  if (状态.滚动帧) {
    cancelAnimationFrame(状态.滚动帧);
    状态.滚动帧 = 0;
  }
}

export function 处理鼠标选择结束() {
  const 本次拖选 = 状态.拖选状态;
  if (!本次拖选) {
    return;
  }

  window.setTimeout(function 完成鼠标选择() {
    if (状态.拖选状态 !== 本次拖选) {
      return;
    }

    if (双击待定) {
      // 双击：不把选区当作新关键词，仅清除选区并收尾
      双击待定 = false;
      window.getSelection()?.removeAllRanges();
      状态.拖选状态 = null;
      return;
    }

    读取选择关键词();
    状态.拖选状态 = null;
    if (本次拖选.已阻止滚动) {
      console.info('[阅读器] 已阻止拖选自动滚动', {
        滚动位置: Math.round(本次拖选.滚动位置),
      });
    }
  });
}

export function 处理非鼠标选择结束(事件) {
  if (事件.pointerType !== 'mouse') {
    window.setTimeout(读取选择关键词);
  }
}

export function 处理正文键盘选择(事件) {
  if (事件.key.startsWith('Arrow')) {
    读取选择关键词();
  }
}

export function 处理高亮上下文点击(事件) {
  if (事件.altKey || 事件.metaKey || 事件.ctrlKey) {
    事件.preventDefault();
    处理高亮点击(事件);
  }
}

export function 处理高亮点击(事件) {
  // 拖拽手势已触发跳转，抑制随后派发的 click，避免再前进一格
  if (消费点击抑制()) {
    return;
  }
  const 字元素 = 事件.target.closest('.字.命中');
  const 选择 = window.getSelection();
  if (!字元素 || (选择 && !选择.isCollapsed)) {
    return;
  }
  状态.拖选状态 = null;

  const 关键词 = 查找关键词(Number(字元素.dataset.keywordId));
  if (!关键词?.命中位置.length) {
    return;
  }

  const 点击命中idx = Number(字元素.dataset.hitIndex);
  const 原始行位置 = 获取元素行位置(字元素);
  if (事件.ctrlKey || 事件.metaKey) {
    取消待定导航();
  }
  const 原始边框 = 安全获取命中边框(字元素);

  // 修饰键行为保持即时，不参与单击/双击判定
  if (事件.altKey || 事件.metaKey || 事件.ctrlKey || 事件.shiftKey) {
    const 是Ctrl点击 = 事件.ctrlKey || 事件.metaKey;
    let 目标命中idx;
    if (事件.altKey || 是Ctrl点击) {
      目标命中idx = 事件.shiftKey ? 关键词.命中位置.length - 1 : 0;
    } else {
      目标命中idx =
        (点击命中idx - 1 + 关键词.命中位置.length) % 关键词.命中位置.length;
    }
    状态.当前关键词id = 关键词.id;
    关键词.当前命中idx = 点击命中idx;
    if (目标命中idx === 点击命中idx) {
      渲染可见行(true);
      更新关键词指示器();
      安排保存持久化状态();
      return;
    }
    跳到命中(关键词, 目标命中idx, 原始行位置, 原始边框);
    return;
  }

  // 双击的第二次点击：浏览器已选中整词，detail>=2，这里直接放弃，
  // 不排计时器，留待 dblclick 统一跳到首/末项并清空挂起项。
  if (事件.detail >= 2) {
    return;
  }

  // 纯单击：延迟 双击判定延迟 执行，每次单击各自排一个计时器（连点不吞）。
  // 若在延迟内被判定为双击，dblclick 会统一清空挂起项，单击不会抢先前进一格。
  const 待定数据 = {
    关键词id: 关键词.id,
    点击命中idx,
    原始行位置,
    原始边框,
  };
  const 本项 = {
    计时器: window.setTimeout(function 执行待定单击() {
      待定单击列表 = 待定单击列表.filter((项) => 项 !== 本项);
      执行单击前进(待定数据);
    }, 双击判定延迟),
  };
  待定单击列表.push(本项);
}

/* 清空所有挂起的单击计时器（双击判定成功时调用），避免单击抢先前进。 */
function 清空待定单击() {
  for (const 项 of 待定单击列表) {
    window.clearTimeout(项.计时器);
  }
  待定单击列表 = [];
}

/* 单击延迟到期后的前进逻辑：以被点击的词为基准，跳到该关键词命中序列中的下一个出现并循环。 */
function 执行单击前进(数据) {
  const 关键词 = 查找关键词(数据.关键词id);
  if (!关键词?.命中位置.length) {
    console.info('[阅读器] 单击前进：关键词无效或无命中', {
      关键词id: 数据.关键词id,
    });
    return;
  }
  const 目标命中idx = Math.max(
    0,
    Math.min(数据.点击命中idx, 关键词.命中位置.length - 1),
  );
  const 当前命中未变化 =
    状态.当前关键词id === 关键词.id && 关键词.当前命中idx === 目标命中idx;
  状态.当前关键词id = 关键词.id;
  关键词.当前命中idx = 目标命中idx;
  console.info('[阅读器] 单击前进', {
    关键词: 关键词.文本,
    点击命中: 数据.点击命中idx + 1,
    当前命中: 关键词.当前命中idx + 1,
    总命中数: 关键词.命中位置.length,
  });
  if (关键词.命中位置.length === 1) {
    // 唯一命中没有下一处可跳转，点击只更新当前状态，不改变阅读位置。
    const 原滚动位置 = 元素.滚动容器.scrollTop;
    if (!当前命中未变化) {
      渲染可见行(true);
      元素.滚动容器.scrollTop = 原滚动位置;
    }
    更新关键词指示器();
    显示当前命中位置提示();
    安排保存持久化状态();
    console.info('[阅读器] 单击前进：唯一命中保持阅读位置', {
      关键词: 关键词.文本,
      阅读偏移: 读取阅读位置().阅读偏移,
    });
    return;
  }
  // 透传被点击词的真实视口位置，保证下一个命中锚定到同一相对高度，
  // 滚动距离即为「两个词之间的距离」（符合需求）；不传则落到旧当前命中位置。
  执行导航跳转(
    { 向上: false, Command已按下: false, 仅当前关键词: true },
    {
      最小前行距离: 状态.行高,
      原始行位置: 数据.原始行位置,
      原始边框: 数据.原始边框,
    },
  );
}

/* 命中边框计算针对「当前命中」元素，点到非当前命中项时会取不到，
   这里兜底为 null，保证单击导航不被异常中断（边框动画退化为无横向位移）。 */
function 安全获取命中边框(字元素) {
  try {
    return 获取元素命中边框(字元素);
  } catch {
    return null;
  }
}

/* 双击跳转：以被双击的词为基准，跳到该关键词命中序列中的上一个出现（到开头则回到末个，循环）。
   注意：因单击已延迟执行，双击判定期间挂起的单击会被 清空待定单击 取消，
   此处直接以双击位置为基准重设当前命中，无需撤销单击的前进。 */
function 处理双击跳转(关键词, 命中idx) {
  状态.当前关键词id = 关键词.id;
  关键词.当前命中idx = Math.max(
    0,
    Math.min(命中idx, 关键词.命中位置.length - 1),
  );
  执行导航跳转({ 向上: true, Command已按下: false, 仅当前关键词: true });
}

/* 双击：命中词 → 跳到上一个；未命中词但在正文行内 → 选中整行并复制到剪贴板。
   清理选区与拖选状态，确保绝不触发新建关键词（见 处理鼠标选择结束 的拦截）。 */
export function 处理高亮双击(事件) {
  双击待定 = false;
  清空待定单击(); // 取消可能挂起的单击前进，保证干净跳到上一个
  状态.拖选状态 = null;

  const 字元素 = 事件.target.closest('.字.命中');
  const 行元素 = !字元素 && 事件.target.closest('.正文行');
  if (行元素) {
    事件.preventDefault();
    选中并复制行(行元素);
    return;
  }

  window.getSelection()?.removeAllRanges();

  if (!字元素) {
    return;
  }
  const 关键词 = 查找关键词(Number(字元素.dataset.keywordId));
  if (!关键词?.命中位置.length) {
    return;
  }
  处理双击跳转(关键词, Number(字元素.dataset.hitIndex));
}

function 选中并复制行(行元素) {
  const 行起点 = Number(行元素.dataset.start);
  const 行终点 = Number(行元素.dataset.end);
  const 行文本 = 状态.文本.slice(行起点, 行终点);
  if (!行文本) {
    return;
  }

  const 选择 = window.getSelection();
  if (选择) {
    const range = document.createRange();
    range.selectNodeContents(行元素);
    选择.removeAllRanges();
    选择.addRange(range);
  }

  navigator.clipboard.writeText(行文本).catch((错误) => {
    console.warn('[阅读器] 复制行到剪贴板失败', 错误);
  });
}

export function 处理高亮移入(事件) {
  if (状态.正文悬停已暂停) {
    return;
  }
  const 字元素 = 事件.target.closest('.字.命中');
  if (!字元素 || !元素.滚动容器.contains(字元素)) {
    return;
  }

  const 关键词id = Number(字元素.dataset.keywordId);
  const 命中idx = Number(字元素.dataset.hitIndex);
  if (关键词id === 状态.悬停关键词id && 命中idx === 状态.悬停命中idx) {
    return;
  }

  切换同组高亮(关键词id, 命中idx);
}

export function 处理高亮移出(事件) {
  if (状态.正文悬停已暂停) {
    return;
  }
  const 字元素 = 事件.target.closest('.字.命中');
  if (
    !字元素 ||
    Number(字元素.dataset.keywordId) !== 状态.悬停关键词id ||
    Number(字元素.dataset.hitIndex) !== 状态.悬停命中idx
  ) {
    return;
  }

  const 新字元素 = 事件.relatedTarget?.closest?.('.字.命中');
  if (新字元素) {
    const 新关键词id = Number(新字元素.dataset.keywordId);
    const 新命中idx = Number(新字元素.dataset.hitIndex);
    if (新关键词id !== 状态.悬停关键词id || 新命中idx !== 状态.悬停命中idx) {
      切换同组高亮(新关键词id, 新命中idx);
    }
  } else {
    切换同组高亮(null, null);
  }
}

export function 切换同组高亮(关键词id, 命中idx) {
  const 旧悬停id = 状态.悬停关键词id;
  状态.悬停关键词id = 关键词id;
  状态.悬停命中idx = 命中idx;
  // 与完整重绘一致：查找临时高亮不撤掉原当前关键词标记。
  const 是查找预览 = 状态.查找临时关键词id !== null &&
    关键词id === 状态.查找临时关键词id;
  for (const 行元素 of 元素.可见内容.querySelectorAll('.正文行.含悬停命中')) {
    行元素.classList.remove('含悬停命中');
  }
  for (const 命中元素 of 元素.可见内容.querySelectorAll('.字.命中')) {
    const 是悬停关键词 = Number(命中元素.dataset.keywordId) === 关键词id;
    const 是悬停命中 =
      是悬停关键词 && Number(命中元素.dataset.hitIndex) === 命中idx;
    命中元素.classList.toggle('同组悬停', 是悬停关键词);
    命中元素.classList.toggle('悬停命中', 是悬停命中);
    命中元素.classList.toggle(
      '悬停让位',
      !是查找预览 && 关键词id !== null &&
        命中元素.classList.contains('当前关键词组') &&
        !是悬停关键词,
    );
    命中元素.classList.toggle(
      '悬停隐藏当前框',
      !是查找预览 && 关键词id !== null && 命中元素.classList.contains('当前命中'),
    );
    if (是悬停命中) {
      命中元素.closest('.正文行').classList.add('含悬停命中');
    }
  }
  // 关键词指示器的悬停列只在该关键词“非当前关键词”时才出现：
  // 悬停当前关键词或移出命中都不改变指示器，无需重绘，跳过冗余的画布与面板刷新。
  if (
    悬停影响指示器(旧悬停id) !== 悬停影响指示器(关键词id) ||
    (悬停影响指示器(旧悬停id) &&
      悬停影响指示器(关键词id) &&
      旧悬停id !== 关键词id)
  ) {
    更新关键词指示器();
  }
}

export function 处理正文指针移动(事件) {
  if (!状态.正文悬停已暂停 || 事件.pointerType === 'touch') {
    return;
  }
  状态.正文悬停已暂停 = false;
  处理高亮移入(事件);
}

function 悬停影响指示器(悬停id) {
  return 悬停id !== null && 悬停id !== 状态.当前关键词id;
}
