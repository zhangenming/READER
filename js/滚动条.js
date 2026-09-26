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
// 右侧轨道已删除，左缘那枚竖排读数就是滚动条本体（role=scrollbar、可聚焦、可拖）。
// 「滚动块」在这里只剩一层几何含义：与视口成比例的窗口在轨道上的高度与行程，
// 用来把滚动位置换算成读数的落点并夹在视口内，页面上已无对应 DOM。

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

  const 进度边框 = 元素.滚动进度.getBoundingClientRect();
  滚动进度拖动状态 = {
    pointerId: 事件.pointerId,
    块内偏移: 事件.clientY - 进度边框.top,
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
  const 块内偏移 = 滚动进度拖动状态?.块内偏移 ?? 0;
  const 容器高度 = 元素.滚动容器.clientHeight;
  const 滚动条度量 = 读取滚动条度量(
    容器高度,
    容器高度,
    元素.滚动容器.scrollHeight,
  );
  if (滚动条度量.滚动块行程 <= 0 || 滚动条度量.最大滚动位置 <= 0) {
    return;
  }
  // 轨道原先 fixed 满高、顶边即视口顶，故指针 Y 可直接当轨道内坐标用
  const 滚动块中心 = 指针Y - 块内偏移 + 滚动条度量.滚动块高度 / 2;
  元素.滚动容器.scrollTop = 轨道中心转滚动位置(滚动块中心, 滚动条度量);
}

export function 更新滚动块(度量 = null) {
  const 滚动块状态 = 更新滚动块位置(度量);
  if (滚动块状态) {
    更新滚动块文本(滚动块状态);
  }
}

export function 读取滚动条度量(轨道高度, 容器高度, 滚动高度) {
  const 最大滚动位置 = 滚动高度 - 容器高度;
  const 滚动块高度 = Math.min(
    轨道高度,
    Math.max(32, (容器高度 / 滚动高度) * 轨道高度),
  );
  return {
    最大滚动位置,
    滚动块高度,
    滚动块行程: 轨道高度 - 滚动块高度,
  };
}

export function 滚动位置转轨道中心(滚动位置, 度量) {
  const 进度 = Math.min(1, Math.max(0, 滚动位置 / 度量.最大滚动位置));
  return 度量.滚动块高度 / 2 + 进度 * 度量.滚动块行程;
}

export function 轨道中心转滚动位置(轨道位置, 度量) {
  const 进度 = Math.min(
    1,
    Math.max(0, (轨道位置 - 度量.滚动块高度 / 2) / 度量.滚动块行程),
  );
  return 进度 * 度量.最大滚动位置;
}

export function 更新滚动块位置(度量 = null, 滚动位置 = null) {
  const 读数 = 元素.滚动进度;
  元素.章节轨道.hidden = false;
  读数.hidden = false;
  const 轨道高度 = 度量?.轨道高度 ?? 元素.滚动容器.clientHeight;
  const 容器高度 = 度量?.容器高度 ?? 元素.滚动容器.clientHeight;
  const 滚动高度 = 度量?.滚动高度 ?? 元素.滚动容器.scrollHeight;
  const 滚动条度量 = 读取滚动条度量(轨道高度, 容器高度, 滚动高度);
  const { 最大滚动位置, 滚动块高度 } = 滚动条度量;
  const 当前滚动位置 = 滚动位置 ?? 元素.滚动容器.scrollTop;
  更新章节进度(当前滚动位置, 最大滚动位置);
  if (轨道高度 <= 0 || 最大滚动位置 <= 0) {
    元素.章节轨道.hidden = true;
    读数.hidden = true;
    return null;
  }

  const 进度 = Math.min(1, Math.max(0, 当前滚动位置 / 最大滚动位置));
  const 滚动块偏移 =
    滚动位置转轨道中心(当前滚动位置, 滚动条度量) - 滚动块高度 / 2;

  const 读数中心 = 滚动块偏移 + 滚动块高度 / 2;
  放置读数(读数中心, 轨道高度);
  return {
    轨道: 读数,
    最大滚动位置,
    进度,
    读数中心,
    轨道高度,
  };
}

/* 读数盒子定高（横向一行 + 底边到红线的留白，见 styles.css .滚动进度），整枚夹在轨道高度内：
   读数比最小滚动窗口高，书首书尾不夹就会被视口裁掉。
   盒底边就是红线（位置指针）所在，因此夹的是底边而不是盒中心——
   数字排在红线之上，指针偏离真实位置最多一枚读数的高度（约 20px）。 */
function 放置读数(读数中心, 轨道高度) {
  // 盒高由 CSS 定死、不随文本变，这里只量一次；首帧元素还 hidden 时读到 0，下一帧自纠。
  const 读数高度 =
    状态.进度读数高度 || (状态.进度读数高度 = 元素.滚动进度.offsetHeight);
  const 夹后底边 = Math.min(轨道高度, Math.max(读数高度, 读数中心));
  元素.滚动进度.style.transform = `translateY(${夹后底边 - 读数高度}px)`;
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
