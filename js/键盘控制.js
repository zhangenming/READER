import { shift双击中阈值 } from './常量.js';
import { 元素, 状态, 查找关键词 } from './状态.js';
import { 有弹窗打开 } from './面板.js';
import { 关闭字体弹窗, 打开字体弹窗 } from './字体设置.js';
import { 打开词频弹窗 } from './词频弹窗.js';
import { 打开查找弹窗 } from './查找弹窗.js';
import {
  自动滚动进行中,
  停止自动滚动,
  开始自动滚动,
  开始按键滚动,
  停止按键滚动,
  执行自动滚动翻页,
  获取按键滚动按键,
} from './自动滚动.js';
import { 渲染可见行, 显示当前命中位置提示 } from './虚拟渲染.js';
import { 更新关键词指示器 } from './指示器.js';
import {
  动画滚动到,
  取消滚动动画,
  结束跳转会话,
  获取当前命中边框,
  跳到命中,
} from './跳转动画.js';
import { 计算阅读位置, 安排保存持久化状态 } from './持久化.js';

// 键盘控制：从 app.js 绑定事件() 闭包拆出。
// 含 Shift 双击检测、Ctrl/Meta 导航待定状态机、整屏翻页与 Backspace 回跳；
// 单击/双击/手势等指针交互经导出的 执行导航跳转 / 取消待定导航 复用同一套跳转逻辑。
// 模块级私有状态（原闭包 let）语义不变。

let shift按住中 = false; // 当前是否处于「Shift 被按住」状态
let shift期间有其他交互 = false; // Shift 按住期间是否出现过其它按键或鼠标点击（区分单独 Shift 与组合）
let shift最后松开时间 = 0; // 最近一次「干净」Shift 松开的时间戳（performance.now），用于双击判定
let Ctrl按键状态 = null; // Ctrl 导航待执行状态；null 表示无待定导航
let 待导航参数 = null; // Ctrl 先于其它修饰键松开时，推迟到「全部松开」再跳转

// Shift 按住期间发生鼠标按下（如 Shift+点击命中词）→ 标记为组合，松开时不切换自动滚动
export function 标记shift组合() {
  if (shift按住中) {
    shift期间有其他交互 = true;
  }
}

// 清空待定导航状态（点击命中词等场景：避免延迟中的 Ctrl 导航在跳转后突然生效）
export function 取消待定导航() {
  Ctrl按键状态 = null;
  待导航参数 = null;
}

export function 重置键盘导航() {
  取消待定导航();
  shift按住中 = false;
  shift期间有其他交互 = false;
  shift最后松开时间 = 0;
}

// ===== 整屏翻页：Space / Enter / 方向键 / 语音翻页共用的翻页原语 =====
export function 翻页整屏(向上) {
  取消滚动动画();
  结束跳转会话('语音翻页');
  const 滚动行数 = Math.max(
    1,
    Math.floor(元素.滚动容器.clientHeight / 状态.行高),
  );
  const 当前行idx = Math.round(元素.滚动容器.scrollTop / 状态.行高);
  const 最大顶部行idx = Math.round(
    (元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight) / 状态.行高,
  );
  const 目标行idx = Math.min(
    最大顶部行idx,
    Math.max(0, 当前行idx + (向上 ? -滚动行数 : 滚动行数)),
  );
  元素.滚动容器.scrollTop = 目标行idx * 状态.行高;
  渲染可见行(true);
  安排保存持久化状态();
  console.info('[阅读器] 已按整页翻动', {
    指令: 向上 ? '上一页（向后翻）' : '下一页（向前翻）',
    起始行: 当前行idx,
    目标行: 目标行idx,
    滚动行数: Math.abs(目标行idx - 当前行idx),
  });
}

export function 处理键盘按下(事件) {
  if (元素.章节目录弹窗.open || 元素.阅读统计弹窗.open) return;
  // Esc 关闭字体设置弹窗（div 弹窗无原生 close，需手动处理）
  if (事件.key === 'Escape' && !元素.字体弹窗.hidden) {
    事件.preventDefault();
    关闭字体弹窗();
    return;
  }
  // Shift 仅记录"按住"状态，不在按下时判断；真正切换放到松开(keyup)时，
  // 以区分「单独 Shift（单次仅记录时间戳）」与「Shift+点击 / Shift+其它键」组合，
  // 并在 keyup 用两次「干净」松开的间隔判定双击，避免误触发自动滚动。
  if (事件.key === 'Shift' && !事件.repeat && !事件.altKey) {
    if (!shift按住中) {
      shift按住中 = true;
      shift期间有其他交互 = false;
    }
    // Shift 与 Ctrl/Meta 组合（Ctrl+Shift 跳到上一个关键词）：
    // 1) 标记「期间有其他交互」→ 松开不触发自动滚动；
    // 2) 若 Ctrl 导航已激活（Ctrl 先按），把方向改为「向上」（上一个），
    //    并在按下的这一刻就立即跳一次——连续点按 Shift 可连续向上跳；
    //    标记「已执行跳转」，之后全部修饰键松开时不再补跳。
    // 注：本机 Ctrl↔Win 对调，物理 Ctrl 以 Meta 形式送达，故同时检查 ctrlKey/metaKey。
    if (事件.ctrlKey || 事件.metaKey) {
      shift期间有其他交互 = true;
      if (Ctrl按键状态 && !Ctrl按键状态.已与其他键组合) {
        Ctrl按键状态.向上 = true;
        // Win/Alt 组合（跳到全文首/末）不走即时路径，仍等全部修饰键松开再生效。
        if (!Ctrl按键状态.Command已按下) {
          Ctrl按键状态.已执行跳转 = true;
          执行导航跳转(Ctrl按键状态);
        }
      }
    }
    return;
  }
  // Shift 按住期间出现其它按键（排除 Shift 自身的自动重复）→ 标记为组合操作，松开时不切换
  if (shift按住中 && 事件.key !== 'Shift') {
    shift期间有其他交互 = true;
  }

  const 目标 = 事件.target;
  const 是交互目标 =
    目标 instanceof HTMLElement &&
    (目标.isContentEditable ||
      目标.matches('input, textarea, button, select'));
  const 是可编辑目标 =
    目标 instanceof HTMLElement &&
    (目标.isContentEditable || 目标.matches('input, textarea'));
  const 可快速前进自动滚动 =
    !(目标 instanceof HTMLElement) ||
    目标 === 元素.自动滚动按钮 ||
    (!目标.isContentEditable &&
      !目标.matches('input, textarea, button, select'));

  const 按键滚动方向 =
    事件.key.toLowerCase() === 'z'
      ? 1
      : 事件.key.toLowerCase() === 'x'
        ? -1
        : 0;
  if (
    按键滚动方向 &&
    !事件.altKey &&
    !事件.ctrlKey &&
    !事件.metaKey &&
    !事件.shiftKey &&
    !是交互目标 &&
    !有弹窗打开() &&
    状态.行起点列表.length
  ) {
    事件.preventDefault();
    if (!事件.repeat) {
      开始按键滚动(事件.key.toLowerCase(), 按键滚动方向);
    }
    return;
  }

  if (
    事件.key.toLowerCase() === 'a' &&
    (事件.ctrlKey || 事件.metaKey) &&
    !事件.altKey &&
    !事件.shiftKey &&
    !是可编辑目标
  ) {
    事件.preventDefault();
    Ctrl按键状态 = null;
    打开词频弹窗();
    return;
  }

  if (
    事件.key.toLowerCase() === 'f' &&
    (事件.ctrlKey || 事件.metaKey || 事件.altKey) &&
    !事件.shiftKey
  ) {
    事件.preventDefault();
    // 取消可能由 Meta/OS 触发键建立的「待导航」状态，避免 Ctrl↔Win 对调环境下
    // Ctrl+F 被同时当作「Ctrl 触发键 + F」而额外跳转到下一个关键词。
    Ctrl按键状态 = null;
    打开查找弹窗();
    return;
  }

  // Ctrl + D（macOS 亦可按 Command + D）：开始 / 停止自动滚动。
  // 同时覆盖 Ctrl↔Win 对调环境（物理 Ctrl 以 Meta 送达），ctrlKey 与 metaKey 都判定。
  if (
    事件.key.toLowerCase() === 'd' &&
    (事件.ctrlKey || 事件.metaKey) &&
    !事件.altKey &&
    !事件.shiftKey
  ) {
    事件.preventDefault();
    Ctrl按键状态 = null; // 取消待导航，避免与 Ctrl 触发键组合时误跳转
    if (自动滚动进行中()) {
      停止自动滚动('Ctrl + D 切换');
    } else {
      开始自动滚动();
    }
    return;
  }

  // Ctrl + S（macOS 亦可按 Command + S）：打开字体选择（引号内 / 引号外 独立）。
  if (
    事件.key.toLowerCase() === 's' &&
    (事件.ctrlKey || 事件.metaKey) &&
    !事件.altKey &&
    !事件.shiftKey
  ) {
    事件.preventDefault();
    // 取消可能已建立的 Ctrl 导航待执行状态，避免与触发键组合时误跳转
    Ctrl按键状态 = null;
    if (!元素.字体弹窗.hidden) {
      关闭字体弹窗();
    } else {
      打开字体弹窗();
    }
    return;
  }

  // 右方向键：未在自动滚动时作为启动入口（Space / Shift+Space 整屏翻页之外的另一种启动方式）；
  // 已在自动滚动中则不在这里 return，落到下面的翻页分支，与 Space / ↓ 完全一致地快速前进。
  if (
    事件.key === 'ArrowRight' &&
    !事件.altKey &&
    !事件.ctrlKey &&
    !事件.metaKey &&
    !事件.shiftKey &&
    !是交互目标 &&
    !有弹窗打开() &&
    状态.行起点列表.length &&
    !自动滚动进行中()
  ) {
    事件.preventDefault();
    开始自动滚动();
    return;
  }

  // → / ↓ 向前翻整屏，← / ↑ 向后翻整屏，与 Space / Shift+Space 完全等价。
  const 是箭头翻页键 =
    事件.key === 'ArrowLeft' ||
    事件.key === 'ArrowUp' ||
    事件.key === 'ArrowDown' ||
    事件.key === 'ArrowRight';
  const 是翻页按键 =
    事件.code === 'Space' || 事件.key === 'Enter' || 是箭头翻页键;
  // 方向键由键自身决定方向（Shift 不反转）；Space / Enter 仍由 Shift 决定方向
  const 翻页向上 = 是箭头翻页键
    ? 事件.key === 'ArrowLeft' || 事件.key === 'ArrowUp'
    : 事件.shiftKey;
  const 翻页来源 = 是箭头翻页键
    ? 事件.key === 'ArrowLeft'
      ? '←'
      : 事件.key === 'ArrowUp'
        ? '↑'
        : 事件.key === 'ArrowRight'
          ? '→'
          : '↓'
    : 事件.shiftKey
      ? 事件.key === 'Enter'
        ? 'Shift + Enter'
        : 'Shift + Space'
      : 事件.key === 'Enter'
        ? 'Enter'
        : 'Space';

  if (
    是翻页按键 &&
    !事件.altKey &&
    !事件.ctrlKey &&
    !事件.metaKey &&
    可快速前进自动滚动 &&
    自动滚动进行中()
  ) {
    事件.preventDefault();
    if (!事件.repeat) {
      执行自动滚动翻页(翻页向上, 翻页来源);
    }
    return;
  }

  if (
    是翻页按键 &&
    !事件.altKey &&
    !事件.ctrlKey &&
    !事件.metaKey &&
    !是交互目标 &&
    !有弹窗打开() &&
    状态.行起点列表.length
  ) {
    事件.preventDefault();
    document.body.classList.add('自动滚动中');
    翻页整屏(翻页向上);
    return;
  }

  // 触发键：Meta / OS（即系统里的 Win 键）。
  // 用户系统把 Ctrl 与 Win 对调时，其物理 Ctrl 会被系统当作 Meta/OS 送达页面，
  // 因此用 Meta/OS 作为触发键才能让「Ctrl 键」生效；物理 Win 键（送达为 Control）不会触发。
  if (事件.key === 'Meta' || 事件.key === 'OS') {
    if (!事件.repeat) {
      if (shift按住中) {
        // Shift 已先按住 → 这是 Ctrl+Shift 组合，松开 Shift 时不触发自动滚动
        shift期间有其他交互 = true;
      }
      Ctrl按键状态 =
        是交互目标 || 有弹窗打开()
          ? null
          : {
              // Shift 先按（shift按住中）或后按（事件.shiftKey）都算「向上/上一个」
              向上: 事件.shiftKey || shift按住中,
              // 物理 Win(ctrlKey) 或 Alt 都作为「跳到全文首/末」组合键
              Command已按下: 事件.ctrlKey || 事件.altKey,
              已与其他键组合: false,
              // Ctrl 导航只在「当前关键词」自身的命中序列内循环跳转，
              // 不会串到其它关键词的出现处（即「跳到下一个一致的关键词」）。
              仅当前关键词: true,
            };
    }
    return;
  }

  if (Ctrl按键状态 && (事件.metaKey || 事件.ctrlKey)) {
    if (事件.key === 'Shift') {
      Ctrl按键状态.向上 = true;
    } else if (事件.key === 'Control' || 事件.key === 'OS') {
      // 物理 Win 键（对调环境下送达为 Control）作为「跳到首/末」组合
      Ctrl按键状态.Command已按下 = true;
    } else if (事件.key === 'Alt') {
      // Ctrl+Alt = 跳到全文首/末（替代别扭的物理 Win 组合）；配合 Shift 决定首/末
      Ctrl按键状态.Command已按下 = true;
    } else {
      Ctrl按键状态.已与其他键组合 = true;
    }
  }

  if (
    事件.key !== 'Backspace' ||
    事件.repeat ||
    事件.altKey ||
    事件.ctrlKey ||
    事件.metaKey ||
    事件.shiftKey ||
    是交互目标 ||
    有弹窗打开()
  ) {
    return;
  }

  const 原关键词 = 查找关键词(状态.当前关键词id);
  const 原始边框 = 原关键词 ? 获取当前命中边框(原关键词) : null;
  const 跳转起点 = 状态.跳转起点;
  if (!跳转起点) {
    return;
  }
  状态.跳转起点 = null;

  事件.preventDefault();
  const 历史关键词 = 查找关键词(跳转起点.当前关键词id);
  if (
    历史关键词 &&
    跳转起点.当前命中idx >= 0 &&
    跳转起点.当前命中idx < 历史关键词.命中位置.length
  ) {
    状态.当前关键词id = 历史关键词.id;
    历史关键词.当前命中idx = 跳转起点.当前命中idx;
  } else {
    状态.当前关键词id = null;
  }
  渲染可见行(true);
  更新关键词指示器();
  显示当前命中位置提示();
  安排保存持久化状态();
  const 已启用边框动画 = 动画滚动到(
    计算阅读位置(跳转起点),
    原始边框 && 历史关键词?.id === 状态.当前关键词id
      ? {
          起点: 原始边框,
          关键词: 历史关键词,
          命中idx: 跳转起点.当前命中idx,
        }
      : null,
  );

  console.info('[阅读器] 已回到首次跳转前', {
    关键词: 历史关键词?.文本 ?? null,
    当前项: 跳转起点.当前命中idx + 1,
    阅读偏移: 跳转起点.阅读偏移,
    边框动画: 已启用边框动画,
  });
}

export function 处理键盘松开(事件) {
  if (元素.章节目录弹窗.open || 元素.阅读统计弹窗.open) return;
  if (事件.key.toLowerCase() === 获取按键滚动按键()) {
    事件.preventDefault();
    停止按键滚动('按键松开');
    return;
  }

  // 若上一轮 Ctrl 已先松开、当前正松开的是最后一个修饰键，则此刻才真正跳转
  尝试执行待导航(事件);

  // 双击 Shift（两次连续、各自「干净」的按下-松开，间隔在窗口内）→ 切换自动滚动。
  // 单次 Shift 松开只记录时间戳，不触发，避免误触；第二次在阈值内松开才启动/停止。
  if (事件.key === 'Shift' && !事件.altKey) {
    if (shift按住中 && !shift期间有其他交互) {
      const 现在 = performance.now();
      if (现在 - shift最后松开时间 <= shift双击中阈值) {
        if (自动滚动进行中()) {
          停止自动滚动('双击 Shift 切换');
        } else {
          开始自动滚动();
        }
        shift最后松开时间 = 0; // 复位，避免三连击误判为新的双击
      } else {
        shift最后松开时间 = 现在;
      }
    }
    shift按住中 = false;
    shift期间有其他交互 = false;
    return;
  }

  if (事件.key !== 'Meta' && 事件.key !== 'OS') {
    return;
  }

  const 本次按键状态 = Ctrl按键状态;
  Ctrl按键状态 = null;
  if (!本次按键状态 || 本次按键状态.已与其他键组合) {
    return;
  }
  // Shift+Ctrl 组合已在每次按下 Shift 的那一刻即时跳转（连点 Shift 连跳），
  // 这里见到「已执行跳转」标记就不再补跳，避免松开时多跳一格。
  if (本次按键状态.已执行跳转) {
    待导航参数 = null;
    return;
  }

  // 若松开 Ctrl 时仍有其它修饰键（Shift / 物理 Win / Alt）按住，
  // 暂不跳转，等「全部松开」的那一刻再生效（避免先放开 Ctrl 就提前跳）。
  if (事件.shiftKey || 事件.ctrlKey || 事件.altKey) {
    待导航参数 = 本次按键状态;
    return;
  }

  执行导航跳转(本次按键状态);
}

export function 执行导航跳转(按键状态, 选项 = {}) {
  const 当前词 = 查找关键词(状态.当前关键词id);

  // 「仅当前关键词」导航：在当前关键词自身命中序列内循环前进。
  // 显式首/末个（Win/Alt 组合、或上下拖拽手势）仍允许直达极端位置。
  // 当尚无当前关键词（或当前关键词无命中）时，落到下面的全局逻辑。
  if (按键状态.仅当前关键词 && 当前词?.命中位置.length) {
    const 命中数 = 当前词.命中位置.length;
    let 目标idx;
    if (当前词.当前命中idx < 0) {
      // 尚无有效当前命中（如首次）：直接落到序列首/末
      目标idx = 按键状态.向上 ? 命中数 - 1 : 0;
    } else if (按键状态.Command已按下) {
      // 显式首/末个：允许直达极端
      目标idx = 按键状态.向上 ? 0 : 命中数 - 1;
    } else {
      // 普通下一个 / 上一个：沿当前关键词的命中序列循环前进
      const 方向 = 按键状态.向上 ? -1 : 1;
      目标idx = (当前词.当前命中idx + 方向 + 命中数) % 命中数;
    }
    // 选项.原始行位置 / 原始边框 来自「被点击的词的真实视口位置」；
    // 必须透传，不能用 获取当前命中行位置 兜底——此时 DOM 尚未重绘，
    // 兜底会取到「旧当前命中」的位置，导致下一个命中落到错误的视口高度。
    跳到命中(
      当前词,
      目标idx,
      选项.原始行位置,
      选项.原始边框,
      选项.最小前行距离,
    );
    return;
  }

  // 全局阅读顺序跳转（兜底）：收集全文所有关键词的命中，按全局偏移排序后跨关键词循环。
  // 仅当「仅当前关键词」为真、但当前关键词尚无有效命中（例如 Ctrl 导航尚未选中任何关键词）时落在这里；
  // 单击 / 双击 / 上下拖拽手势现在都按「该关键词自身的命中序列」循环（见上方 仅当前关键词 分支）。
  const 全部命中 = [];
  for (const k of 状态.关键词列表) {
    for (let i = 0; i < k.命中位置.length; i++) {
      全部命中.push({ 关键词: k, 命中idx: i, 偏移: k.命中位置[i] });
    }
  }
  if (!全部命中.length) {
    return; // 全文没有任何关键词命中可跳转
  }
  全部命中.sort((甲, 乙) => 甲.偏移 - 乙.偏移);

  // 当前所在命中序号（无则视为「尚未选中」）
  let 当前序号 = -1;
  if (
    当前词 &&
    当前词.当前命中idx >= 0 &&
    当前词.当前命中idx < 当前词.命中位置.length
  ) {
    当前序号 = 全部命中.findIndex(
      (h) => h.关键词.id === 当前词.id && h.命中idx === 当前词.当前命中idx,
    );
  }

  let 目标序号;
  if (当前序号 < 0) {
    // 尚未选中任何命中：向前→第一个，向后→最后一个
    目标序号 = 按键状态.向上 ? 全部命中.length - 1 : 0;
  } else if (按键状态.Command已按下) {
    // ⌘/Ctrl 组合：直接跳到全文首/末个命中
    目标序号 = 按键状态.向上 ? 0 : 全部命中.length - 1;
  } else {
    const 方向 = 按键状态.向上 ? -1 : 1;
    目标序号 = (当前序号 + 方向 + 全部命中.length) % 全部命中.length;
  }

  const 目标命中 = 全部命中[目标序号];
  if (!目标命中 || (目标序号 === 当前序号 && 全部命中.length === 1)) {
    console.info('[阅读器] 当前命中无需跳转', {
      关键词: 目标命中?.关键词.文本 ?? null,
    });
    return;
  }

  跳到命中(目标命中.关键词, 目标命中.命中idx);
}

// 当「全部修饰键都已松开」时，执行此前暂存的 Ctrl 导航（Ctrl 先于其它键松开的情况）
function 尝试执行待导航(事件) {
  if (!待导航参数) {
    return;
  }
  // 被松开的那个键自身在事件中已为 false，故只需检查其余修饰键是否还有按住
  if (事件.shiftKey || 事件.ctrlKey || 事件.altKey || 事件.metaKey) {
    return;
  }
  执行导航跳转(待导航参数);
  待导航参数 = null;
}
