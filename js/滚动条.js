import { 自动滚动最低速度 } from './常量.js';
import { 元素, 状态 } from './状态.js';
import { 二分句段起点 } from './排版引擎.js';
import { 设置属性, 设置文本 } from './虚拟渲染.js';
import { 今日本书滚动后缀, 格式化剩余滚动时间 } from './统计展示.js';

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
  const 轨道 = 元素.自定义滚动条;
  轨道.hidden = false;
  元素.滚动进度.hidden = false;
  const 轨道高度 = 度量?.轨道高度 ?? 轨道.clientHeight;
  const 容器高度 = 度量?.容器高度 ?? 元素.滚动容器.clientHeight;
  const 滚动高度 = 度量?.滚动高度 ?? 元素.滚动容器.scrollHeight;
  const 滚动条度量 = 读取滚动条度量(轨道高度, 容器高度, 滚动高度);
  const { 最大滚动位置, 滚动块高度 } = 滚动条度量;
  if (轨道高度 <= 0 || 最大滚动位置 <= 0) {
    轨道.hidden = true;
    元素.滚动进度.hidden = true;
    return null;
  }

  const 当前滚动位置 = 滚动位置 ?? 元素.滚动容器.scrollTop;
  const 进度 = Math.min(1, Math.max(0, 当前滚动位置 / 最大滚动位置));
  const 滚动块偏移 =
    滚动位置转轨道中心(当前滚动位置, 滚动条度量) - 滚动块高度 / 2;

  const 滚动块高度样式 = `${滚动块高度}px`;
  if (元素.滚动块.style.height !== 滚动块高度样式) {
    元素.滚动块.style.height = 滚动块高度样式;
  }
  元素.滚动块.style.transform = `translateY(${滚动块偏移}px)`;
  if (元素.滚动进度.style.height !== 滚动块高度样式) {
    元素.滚动进度.style.height = 滚动块高度样式;
  }
  元素.滚动进度.style.transform = `translateY(${滚动块偏移}px)`;
  return { 轨道, 最大滚动位置, 进度 };
}

export function 更新滚动块文本({ 轨道, 最大滚动位置, 进度 }) {
  const 百分比 = (进度 * 100).toFixed(1);
  设置文本(元素.滚动百分比, `${百分比}%`);
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
  设置属性(元素.滚动块, 'title', `阅读进度 ${百分比}%`);
  设置属性(轨道, 'aria-valuenow', 百分比);
  设置属性(轨道, 'aria-valuetext', `阅读进度 ${百分比}%`);
}
