import { 元素, 状态 } from './状态.js';
import { 计算章节进度 } from './章节索引.js';

const 每页章节数 = 100;
let 回调 = null;
let 搜索计时器 = 0;
let 匹配章节 = [];
let 当前页 = 0;
// 标题起点偏移 → 章节索引。偏移是文本坐标，字号/行高重排只改变显示行数、
// 不改变偏移，因此本表不随行索引重建；仅在换书（数组身份变化）后惰性重建一次。
let 偏移表来源 = null;
let 章节偏移表 = null;

function 读取章节偏移表() {
  if (章节偏移表 === null || 偏移表来源 !== 状态.章节列表) {
    偏移表来源 = 状态.章节列表;
    章节偏移表 = new Map();
    for (let 索引 = 0; 索引 < 状态.章节列表.length; 索引 += 1) {
      // 同一偏移只可能来自重复标题，保留首个，保证正文点击与目录跳转落到同一章。
      const 偏移 = 状态.章节列表[索引].偏移;
      if (!章节偏移表.has(偏移)) {
        章节偏移表.set(偏移, 索引);
      }
    }
  }
  return 章节偏移表;
}

/* 该行起点是否正好是某一章的标题；不是标题返回 -1。 */
export function 查找行首章节索引(偏移) {
  if (!Number.isInteger(偏移) || 偏移 < 0) {
    return -1;
  }
  return 读取章节偏移表().get(偏移) ?? -1;
}

/* 按索引跳到某章：与目录点击同一条路径（app.js 注入的 跳到章节 回调）。
   锚点行位置可选：正文标题行点击传入被点行的行位置，目标章标题落回同一屏幕高度。 */
export function 跳到章节索引(索引, 锚点行位置) {
  const 章节 = 状态.章节列表[索引];
  if (!章节 || !回调) {
    return false;
  }
  回调.跳到章节(章节.偏移, 锚点行位置);
  return true;
}

export function 初始化章节目录(导航回调) {
  回调 = 导航回调;
  元素.章节目录按钮.addEventListener('click', 打开章节目录);
  元素.关闭章节目录按钮.addEventListener('click', 关闭章节目录);
  元素.章节目录弹窗.addEventListener('click', (事件) => {
    if (事件.target === 元素.章节目录弹窗) 关闭章节目录();
  });
  元素.章节目录弹窗.addEventListener('close', () => {
    if (元素.章节目录弹窗.open) return;
    window.clearTimeout(搜索计时器);
    匹配章节 = [];
    元素.章节目录列表.replaceChildren();
  });
  元素.章节搜索框.addEventListener('input', (事件) => {
    window.clearTimeout(搜索计时器);
    if (!事件.isComposing) 搜索计时器 = window.setTimeout(搜索章节, 150);
  });
  元素.章节搜索框.addEventListener('compositionend', () => {
    window.clearTimeout(搜索计时器);
    搜索计时器 = window.setTimeout(搜索章节, 150);
  });
  元素.定位当前章节按钮.addEventListener('click', 定位当前章节);
  元素.章节上一页.addEventListener('click', () => 翻目录页(-1));
  元素.章节下一页.addEventListener('click', () => 翻目录页(1));
  元素.章节目录列表.addEventListener('click', (事件) => {
    const 按钮 = 事件.target.closest('button[data-chapter-index]');
    if (!按钮) return;
    const 章节 = 状态.章节列表[Number(按钮.dataset.chapterIndex)];
    if (!章节) return;
    关闭章节目录();
    回调.跳到章节(章节.偏移);
  });
}

export function 关闭章节目录() {
  window.clearTimeout(搜索计时器);
  if (元素.章节目录弹窗.open) 元素.章节目录弹窗.close();
}

function 打开章节目录() {
  if (!状态.文件名 || 元素.章节目录弹窗.open) return;
  回调.准备打开();
  元素.章节目录弹窗.showModal();
  定位当前章节();
  元素.章节搜索框.focus({ preventScroll: true });
}

export function 读取当前章节(
  滚动位置 = 元素.滚动容器.scrollTop,
  最大位置 = 元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight,
) {
  // 非整数缩放下 scrollTop 会量化到设备像素，行边界可能出现不足半像素的负误差。
  const 行idx = Math.min(
    状态.行起点列表.length - 1,
    Math.max(0, Math.floor((滚动位置 + 0.5) / 状态.行高)),
  );
  // 最后一章可能短于一屏，滚动到书末时它的标题无法到达视口顶端。
  const 偏移 =
    最大位置 > 0 && 滚动位置 >= 最大位置 - 1
      ? 状态.文本.length
      : (状态.行起点列表[行idx] ?? 0);
  return 计算章节进度(状态.章节列表, 偏移, 状态.文本.length);
}

export function 更新章节进度(滚动位置, 最大位置) {
  const { 索引, 进度 } = 读取当前章节(滚动位置, 最大位置);
  const 章节 = 状态.章节列表[索引];
  const 数量 = 状态.章节列表.length;
  const 说明 = 章节
    ? `${章节.标题} · ${章节.类型 === '分卷' ? '本节' : '本章'} ${(进度 * 100).toFixed(0)}%`
    : 数量
      ? '当前位于首章之前'
      : '未识别到章节';
  元素.章节目录按钮.disabled = !状态.文件名;
  if (元素.章节数量.textContent !== String(数量))
    元素.章节数量.textContent = String(数量);
  const 提示 = `章节目录 · ${说明}`;
  if (元素.章节目录按钮.title !== 提示) 元素.章节目录按钮.title = 提示;
  if (元素.章节目录弹窗.open && 元素.章节目录摘要.textContent !== 说明) {
    元素.章节目录摘要.textContent = 说明;
    元素.章节目录摘要.title = 说明;
  }
}

function 定位当前章节() {
  window.clearTimeout(搜索计时器);
  元素.章节搜索框.value = '';
  匹配章节 = 状态.章节列表.map((章节, 索引) => 索引);
  const { 索引 } = 读取当前章节();
  当前页 = Math.floor(Math.max(0, 索引) / 每页章节数);
  渲染目录();
  元素.章节目录列表
    .querySelector('[aria-current="location"]')
    ?.scrollIntoView({ block: 'center' });
}

function 搜索章节() {
  if (!元素.章节目录弹窗.open) return;
  const 查询 = 规范搜索文字(元素.章节搜索框.value);
  匹配章节 = [];
  for (let idx = 0; idx < 状态.章节列表.length; idx += 1) {
    if (规范搜索文字(状态.章节列表[idx].标题).includes(查询))
      匹配章节.push(idx);
  }
  当前页 = 0;
  渲染目录();
}

function 规范搜索文字(文字) {
  return 文字.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase();
}

function 翻目录页(方向) {
  当前页 = Math.min(
    Math.max(0, Math.ceil(匹配章节.length / 每页章节数) - 1),
    Math.max(0, 当前页 + 方向),
  );
  渲染目录();
}

function 渲染目录() {
  更新章节进度();
  const { 索引 } = 读取当前章节();
  const 数量 = 状态.章节列表.length;
  const 页数 = Math.max(1, Math.ceil(匹配章节.length / 每页章节数));
  const 片段 = document.createDocumentFragment();
  元素.定位当前章节按钮.disabled = !数量;
  元素.章节目录反馈.textContent = 元素.章节搜索框.value.trim()
    ? `找到 ${匹配章节.length} 项，共 ${数量} 项`
    : `共 ${数量} 项`;

  if (!匹配章节.length) {
    const 提示 = document.createElement('p');
    提示.className = '内容选择提示';
    提示.textContent = 数量
      ? '没有匹配的章节标题'
      : '未识别到章节。支持独立成行的“第一章”“第1回”“卷一”等标题。';
    片段.append(提示);
  }
  for (const idx of 匹配章节.slice(
    当前页 * 每页章节数,
    (当前页 + 1) * 每页章节数,
  )) {
    const 章节 = 状态.章节列表[idx];
    const 按钮 = document.createElement('button');
    按钮.type = 'button';
    按钮.className = '内容选项 章节目录项';
    按钮.dataset.chapterIndex = String(idx);
    按钮.dataset.chapterType = 章节.类型;
    if (idx === 索引) {
      按钮.classList.add('当前');
      按钮.setAttribute('aria-current', 'location');
    }
    const 名称 = document.createElement('span');
    名称.className = '章节目录项名称';
    名称.textContent = 章节.标题;
    const 位置 = document.createElement('span');
    位置.className = '内容选项状态';
    位置.textContent =
      idx === 索引
        ? '当前'
        : `全书 ${((章节.偏移 / Math.max(1, 状态.文本.length)) * 100).toFixed(1)}%`;
    按钮.append(名称, 位置);
    片段.append(按钮);
  }
  元素.章节目录列表.replaceChildren(片段);
  元素.章节目录列表.scrollTop = 0;
  元素.章节目录分页.hidden = 页数 <= 1;
  元素.章节目录页码.textContent = `${当前页 + 1} / ${页数}`;
  元素.章节上一页.disabled = 当前页 === 0;
  元素.章节下一页.disabled = 当前页 >= 页数 - 1;
}
