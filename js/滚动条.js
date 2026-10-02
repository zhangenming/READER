import { 自动滚动最低速度 } from './常量.js';
import { 元素, 状态 } from './状态.js';
import { 二分句段起点 } from './排版引擎.js';
import { 设置属性, 设置文本 } from './虚拟渲染.js';
import { 今日本书滚动后缀, 格式化剩余滚动时间 } from './统计展示.js';
import { 更新章节进度 } from './章节目录.js';

// 拖拽中断钩子：由 app 注入 取消滚动动画 / 结束跳转会话。
// 断环：跳转动画 → 本模块（更新滚动块），故本模块不能反向 import 跳转动画。
let 拖拽中断 = { 取消滚动动画: () => {}, 结束跳转会话: () => {} };

export function 初始化滚动条拖拽(钩子) {
  拖拽中断 = 钩子;
}

// —— 滚动进度读数的拖拽、滚轮与键盘导航 ——
// 右侧轨道已删除，左缘那枚读数就是滚动条本体（role=scrollbar、可聚焦、可拖）。
// 轨道是满量程线性的：滚动位置 0 → 指针线在视口顶边，滚到底 → 指针线在视口底边，
// 两端不留空隙（见 读取滚动条度量）。数字整枚待在线的一侧，随轨道夹取。

let 滚动进度拖动状态 = null;

export function 重置滚动条拖拽() {
  滚动进度拖动状态 = null;
  元素.滚动进度.classList.remove('拖动中');
}

export function 处理滚动进度按下(事件) {
  if (事件.button !== 0) {
    return;
  }
  事件.preventDefault();
  拖拽中断.取消滚动动画();
  拖拽中断.结束跳转会话('拖动进度');

  滚动进度拖动状态 = {
    pointerId: 事件.pointerId,
    // 按住点相对**指针线**的偏移：线才是被拖的那个东西，数字只是挂在它一侧的标签。
    线偏移: 事件.clientY - 当前指针线位置(),
  };
  元素.滚动进度.setPointerCapture(事件.pointerId);
  元素.滚动进度.classList.add('拖动中');
  根据指针滚动(事件.clientY);
}

export function 处理滚动进度拖动(事件) {
  if (滚动进度拖动状态?.pointerId !== 事件.pointerId) {
    return;
  }
  事件.preventDefault();
  根据指针滚动(事件.clientY);
}

export function 结束滚动进度拖动(事件) {
  if (滚动进度拖动状态?.pointerId !== 事件.pointerId) {
    return;
  }
  滚动进度拖动状态 = null;
  元素.滚动进度.classList.remove('拖动中');
  if (元素.滚动进度.hasPointerCapture(事件.pointerId)) {
    元素.滚动进度.releasePointerCapture(事件.pointerId);
  }
}

export function 处理滚动条滚轮(事件) {
  事件.preventDefault();
  拖拽中断.取消滚动动画();
  拖拽中断.结束跳转会话('滚轮滚动');
  const 滚动单位 =
    事件.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 状态.行高
      : 事件.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? 元素.滚动容器.clientHeight
        : 1;
  元素.滚动容器.scrollTop += 事件.deltaY * 滚动单位;
}

export function 处理滚动条键盘(事件) {
  const 最大滚动位置 =
    元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight;
  // ArrowUp / ArrowDown 不在此按行滚动：它们已全局接管为整屏翻页（等同 Space / Shift+Space），
  // 事件会冒泡到 window 的键盘处理统一执行
  const 键盘滚动表 = {
    PageUp: -元素.滚动容器.clientHeight,
    PageDown: 元素.滚动容器.clientHeight,
    Home: -Infinity,
    End: Infinity,
  };
  const 滚动量 = 键盘滚动表[事件.key];
  if (滚动量 === undefined) {
    return;
  }
  事件.preventDefault();
  拖拽中断.取消滚动动画();
  拖拽中断.结束跳转会话('滚动条键盘滚动');
  元素.滚动容器.scrollTop =
    滚动量 === -Infinity
      ? 0
      : 滚动量 === Infinity
        ? 最大滚动位置
        : 元素.滚动容器.scrollTop + 滚动量;
}

function 根据指针滚动(指针Y) {
  const 度量 = 读取滚动条度量(
    元素.滚动容器.clientHeight,
    元素.滚动容器.clientHeight,
    元素.滚动容器.scrollHeight,
  );
  if (度量.轨道高度 <= 0 || 度量.最大滚动位置 <= 0) {
    return;
  }
  // 轨道 fixed 满高、顶边即视口顶（不随白线收放），故指针 Y 可直接当轨道内坐标用
  const 线位置 = 指针Y - (滚动进度拖动状态?.线偏移 ?? 0);
  元素.滚动容器.scrollTop = 轨道中心转滚动位置(线位置, 度量);
}

export function 更新滚动块(度量 = null) {
  const 滚动块状态 = 更新滚动块位置(度量);
  if (滚动块状态) {
    更新滚动块文本(滚动块状态);
  }
}

/* 轨道度量：只剩「轨道有多高」和「还能滚多少」两个量。
   旧版在这里还按视口/全文比例算一枚「滚动块高度」，指针线两端各让出半个块
   （最少 32px 的块 → 16px），书首书尾就各留一道空隙。现在滚动块已无对应 DOM，
   指针线本身就是进度，直接把整条轨道用满。 */
export function 读取滚动条度量(轨道高度, 容器高度, 滚动高度) {
  return {
    轨道高度,
    容器高度,
    最大滚动位置: 滚动高度 - 容器高度,
  };
}

/* 滚动位置 ↔ 轨道 Y 的满量程线性双射：0% 钉在轨道顶边、100% 钉在底边。
   指针线、关键词刻度、章节刻度三处共用这一对函数，刻度才会与线指在同一行。 */

export function 滚动位置转轨道中心(滚动位置, 度量) {
  if (!(度量.最大滚动位置 > 0)) {
    return 0;
  }
  return Math.min(1, Math.max(0, 滚动位置 / 度量.最大滚动位置)) * 度量.轨道高度;
}

export function 轨道中心转滚动位置(轨道位置, 度量) {
  if (!(度量.轨道高度 > 0)) {
    return 0;
  }
  return (
    Math.min(1, Math.max(0, 轨道位置 / 度量.轨道高度)) * 度量.最大滚动位置
  );
}

// 当前 scrollTop 对应的指针线轨道 Y —— 拖拽按下时以它为原点记偏移。
function 当前指针线位置() {
  const 轨道高度 = 元素.滚动容器.clientHeight;
  return 滚动位置转轨道中心(元素.滚动容器.scrollTop, {
    轨道高度,
    最大滚动位置: 元素.滚动容器.scrollHeight - 轨道高度,
  });
}

export function 更新滚动块位置(度量 = null, 滚动位置 = null) {
  const 读数 = 元素.滚动进度;
  元素.章节轨道.hidden = false;
  读数.hidden = false;
  const 轨道高度 = 度量?.轨道高度 ?? 元素.滚动容器.clientHeight;
  const 容器高度 = 度量?.容器高度 ?? 元素.滚动容器.clientHeight;
  const 滚动高度 = 度量?.滚动高度 ?? 元素.滚动容器.scrollHeight;
  const 滚动条度量 = 读取滚动条度量(轨道高度, 容器高度, 滚动高度);
  const { 最大滚动位置 } = 滚动条度量;
  const 当前滚动位置 = 滚动位置 ?? 元素.滚动容器.scrollTop;
  更新章节进度(当前滚动位置, 最大滚动位置, 容器高度);
  if (轨道高度 <= 0 || 最大滚动位置 <= 0) {
    元素.章节轨道.hidden = true;
    读数.hidden = true;
    return null;
  }

  const 进度 = Math.min(1, Math.max(0, 当前滚动位置 / 最大滚动位置));
  const 线位置 = 进度 * 轨道高度;

  放置读数(线位置, 轨道高度);
  return {
    轨道: 读数,
    最大滚动位置,
    进度,
    线位置,
    轨道高度,
  };
}

/* 读数盒定高（横向一行 + 到红色指针线的留白，见 styles.css .滚动进度）。
   指针线始终钉在真实进度上（0% 顶边 / 100% 底边，上下不留空隙），数字整枚挂在
   线的一侧：默认在上方（盒底边 = 线，数字不被线穿过）；线离顶边不足一枚盒高时
   翻到下方（盒顶边 = 线，见 .读数在下），两头都不留空隙、数字也不会被视口裁掉。
   来回翻会闪，所以给一条 8px 迟滞：已经挂在下方的，要多走一枚留白才翻回上方。 */
const 翻转迟滞 = 8;

function 放置读数(线位置, 轨道高度) {
  // 盒高由 CSS 定死、不随文本变，这里只量一次；首帧元素还 hidden 时读到 0，下一帧自纠。
  const 读数高度 =
    状态.进度读数高度 || (状态.进度读数高度 = 元素.滚动进度.offsetHeight);
  const 原本在下 = 元素.滚动进度.classList.contains('读数在下');
  const 在上方 = 线位置 >= 读数高度 + (原本在下 ? 翻转迟滞 : 0);
  元素.滚动进度.classList.toggle('读数在下', !在上方);
  const 盒顶 = Math.max(
    0,
    Math.min(
      在上方 ? 线位置 - 读数高度 : 线位置,
      Math.max(0, 轨道高度 - 读数高度),
    ),
  );
  元素.滚动进度.style.transform = `translateY(${盒顶}px)`;
}

export function 更新滚动块文本({ 轨道, 最大滚动位置, 进度 }) {
  const 百分数 = 进度 * 100;
  const 百分比 = `${百分数.toFixed(1)}%`; // 一位小数 + 百分号：整数一位一跳太糙
  if (元素.滚动百分比.textContent !== 百分比) {
    // 盒高由 CSS 定死（横向一行），文本变长变短都不改它，这里只写文本、不再量高度
    设置文本(元素.滚动百分比, 百分比);
  }
  // 剩余时间 = 剩余句段负担 ÷ 基准节奏折算的负担/秒，让「剩余滚动时间」真正表示
  // 「按当前设定节奏的预计剩余阅读时长」：节奏（负担/秒）= 基准速度(px/s)
  // × 全文负担密度(负担/px)。密度自适应只改变瞬时像素速度，不改变总阅读负担，
  // 因此该估算稳定且随用户调快/调慢基准速度而增减，与自适应本身解耦。
  const 剩余距离 = Math.max(0, 最大滚动位置 - 元素.滚动容器.scrollTop);
  const 行数 = 状态.行起点列表.length;
  const 顶部行idx =
    行数 > 0
      ? Math.max(
          0,
          Math.min(行数 - 1, Math.floor(元素.滚动容器.scrollTop / 状态.行高)),
        )
      : 0;
  const 剩余负担 =
    行数 > 0
      ? 状态.句段负担总合 -
        状态.句段负担前缀和[二分句段起点(状态.行起点列表[顶部行idx])]
      : 0;
  const 基准负担每秒 = 状态.自动滚动速度 * 状态.全文负担密度;
  const 剩余秒数 =
    基准负担每秒 > 0
      ? 剩余负担 / 基准负担每秒
      : 剩余距离 / Math.max(自动滚动最低速度, 状态.自动滚动速度);
  设置文本(元素.剩余滚动时间, 格式化剩余滚动时间(剩余秒数));
  设置文本(元素.本书滚动时间, 今日本书滚动后缀());
  设置属性(轨道, 'title', `阅读进度 ${百分比}`);
  设置属性(轨道, 'aria-valuenow', 百分数.toFixed(1));
  设置属性(轨道, 'aria-valuetext', `阅读进度 ${百分比}`);
}
