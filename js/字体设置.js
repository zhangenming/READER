import {
  字号步进,
  最大字号,
  最大行高,
  最小字号,
  行高步进,
  高亮配色,
  默认关键词颜色,
  默认内置字词颜色,
  默认奇偶行颜色,
  默认引文背景色,
  默认纸面色,
  默认页面背景色,
} from './常量.js';
import {
  元素,
  外观,
  奇偶行颜色,
  字体粗细设置,
  字体设置,
  字体颜色设置,
  引文背景色,
  状态,
} from './状态.js';
import {
  刷新画布尺寸,
  计算最小行高,
  设置画布高度,
  读取正文排版,
  重建行索引,
  重算全文负担密度,
} from './排版引擎.js';
import { 渲染可见行 } from './虚拟渲染.js';
import { 更新关键词指示器 } from './指示器.js';
import { 安排保存持久化状态 } from './持久化.js';

export function 打开字体弹窗() {
  if (!元素.字体弹窗.hidden) {
    return;
  }
  元素.字体遮罩.hidden = false;
  元素.字体弹窗.hidden = false;
  渲染字体标签();
  渲染字体选项();
  requestAnimationFrame(function 聚焦字体选项() {
    const 首项 = 元素.字体弹窗.querySelector('.字体选项.选中');
    首项?.focus();
  });
}

export function 关闭字体弹窗() {
  if (元素.字体弹窗.hidden) {
    return;
  }
  元素.字体遮罩.hidden = true;
  元素.字体弹窗.hidden = true;
  元素.滚动容器.focus({ preventScroll: true });
}

export function 切换字体标签(标签) {
  外观.当前字体标签 = 标签;
  渲染字体标签();
  渲染字体选项();
  安排保存持久化状态();
}

export function 处理字体选项点击(事件) {
  if (['关键词', '背景'].includes(外观.当前字体标签)) {
    return;
  }
  const 选项 = 事件.target.closest('.字体选项');
  if (!选项) {
    return;
  }
  const 原始值 = 选项.dataset.字体值;
  const 值 = 原始值 === '' ? null : 原始值;
  if (外观.当前字体标签 === '全部') {
    // 「全部」tab：一次点击同时设置引号内/引号外；首次设置静默，
    // 避免渲染一次「引号内已变、引号外未变」的中间态。
    设置区域字体('引号内', 值, { 静默: true });
    设置区域字体('引号外', 值);
    return;
  }
  设置区域字体(外观.当前字体标签, 值);
}

export function 处理字体粗细按钮点击() {
  if (外观.当前字体标签 === '关键词') {
    const 当前idx = 字体粗细列表.indexOf(外观.关键词粗细);
    设置关键词粗细(字体粗细列表[(当前idx + 1) % 字体粗细列表.length]);
    return;
  }
  const 当前区域 = 外观.当前字体标签 === '全部' ? null : 外观.当前字体标签;
  const 当前值 = 当前区域
    ? 读取有效字体粗细(当前区域)
    : 读取有效字体粗细('引号内') === 读取有效字体粗细('引号外')
      ? 读取有效字体粗细('引号内')
      : null;
  const 当前idx = 字体粗细列表.indexOf(当前值);
  const 下一个值 = 字体粗细列表[(当前idx + 1) % 字体粗细列表.length];
  if (当前区域) {
    设置区域粗细(当前区域, 下一个值);
    return;
  }
  设置区域粗细('引号内', 下一个值, { 静默: true });
  设置区域粗细('引号外', 下一个值);
}

export function 处理字体粗细滚轮(事件) {
  事件.preventDefault();
  事件.stopPropagation();
  const 方向 = Math.sign(事件.deltaY) * -1;
  if (方向 === 0) {
    return;
  }
  if (外观.当前字体标签 === '关键词') {
    const 当前idx = 字体粗细列表.indexOf(外观.关键词粗细);
    const 起始idx = 当前idx === -1 ? (方向 > 0 ? -1 : 0) : 当前idx;
    const 目标idx =
      (起始idx + 方向 + 字体粗细列表.length) % 字体粗细列表.length;
    设置关键词粗细(字体粗细列表[目标idx]);
    return;
  }
  if (外观.当前字体标签 === '全部') {
    设置区域粗细('引号内', 调整值('引号内'), { 静默: true });
    设置区域粗细('引号外', 调整值('引号外'));
    return;
  }
  设置区域粗细(外观.当前字体标签, 调整值(外观.当前字体标签));

  function 调整值(区域) {
    const 当前值 = 读取有效字体粗细(区域);
    const 当前idx = 字体粗细列表.indexOf(当前值);
    const 目标idx = Math.max(
      0,
      Math.min(字体粗细列表.length - 1, 当前idx + 方向),
    );
    return 字体粗细列表[目标idx];
  }
}

export function 设置区域字体(区域, 值, 选项 = {}) {
  const 变量名 = 区域 === '引号内' ? '--引文字体' : '--正文字体';
  字体设置[区域] = 值;
  if (值 === null) {
    document.documentElement.style.removeProperty(变量名);
  } else {
    document.documentElement.style.setProperty(变量名, 值);
  }
  if (!选项.静默) {
    渲染字体选项();
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置区域字体', { 区域, 值: 值 ?? '默认' });
}

export function 设置区域粗细(区域, 值, 选项 = {}) {
  const 变量名 = 区域 === '引号内' ? '--引文粗细' : '--正文粗细';
  字体粗细设置[区域] = 值;
  if (值 === null) {
    document.documentElement.style.removeProperty(变量名);
  } else {
    document.documentElement.style.setProperty(变量名, String(值));
  }
  if (!选项.静默) {
    刷新字体粗细排版();
    渲染字体粗细按钮();
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置区域字体粗细', { 区域, 值: 值 ?? '默认' });
}

export function 重置字体设置() {
  if (外观.当前字体标签 === '背景') {
    设置纸面色(默认纸面色, { 静默: true });
    设置页面背景色(默认页面背景色);
    return;
  }
  if (外观.当前字体标签 === '关键词') {
    设置关键词颜色(默认关键词颜色, { 静默: true });
    设置关键词粗细(null);
    return;
  }
  if (外观.当前字体标签 === '全部') {
    设置区域字体('引号内', null, { 静默: true });
    设置区域字体('引号外', null);
    设置区域粗细('引号内', null, { 静默: true });
    设置区域粗细('引号外', null);
    设置区域颜色('引号内', null, { 静默: true });
    设置区域颜色('引号外', null);
    设置内置字词颜色(默认内置字词颜色);
    设置引文背景色(true);
    设置引文背景颜色('奇数', 默认引文背景色.奇数, { 静默: true });
    设置引文背景颜色('偶数', 默认引文背景色.偶数);
    return;
  }
  设置区域字体(外观.当前字体标签, null);
  设置区域粗细(外观.当前字体标签, null);
  if (外观.当前字体标签 === '引号内') {
    设置引文背景色(true);
    设置引文背景颜色('奇数', 默认引文背景色.奇数, { 静默: true });
    设置引文背景颜色('偶数', 默认引文背景色.偶数);
  }
  if (外观.当前字体标签 === '引号外') {
    // 正文 tab 现在容纳奇偶行底色，恢复默认时一并重置
    设置奇偶行颜色('奇数', 默认奇偶行颜色.奇数, { 静默: true });
    设置奇偶行颜色('偶数', 默认奇偶行颜色.偶数);
  }
}

export function 渲染字体标签() {
  const 标签列表 = [
    { 元素: 元素.字体标签全部, 名称: '全部' },
    { 元素: 元素.字体标签引号内, 名称: '引号内' },
    { 元素: 元素.字体标签引号外, 名称: '引号外' },
    { 元素: 元素.字体标签关键词, 名称: '关键词' },
    { 元素: 元素.字体标签背景, 名称: '背景' },
  ];
  for (const { 元素: 标签元素, 名称 } of 标签列表) {
    const 是当前 = 外观.当前字体标签 === 名称;
    标签元素.classList.toggle('当前', 是当前);
    标签元素.setAttribute('aria-selected', String(是当前));
  }
  元素.引文背景色选项.hidden = 外观.当前字体标签 !== '引号内';
  元素.引文边框选项.hidden = 外观.当前字体标签 !== '引号内';
  元素.阶梯段落选项.hidden = 外观.当前字体标签 !== '全部';
  元素.换行标记选项.hidden = 外观.当前字体标签 !== '全部';
  元素.字体颜色选项.hidden = 外观.当前字体标签 !== '全部';
  元素.内置字词颜色选项.hidden = 外观.当前字体标签 !== '全部';
  元素.奇偶行颜色选项.hidden = 外观.当前字体标签 !== '引号外';
  元素.关键词颜色选项.hidden = 外观.当前字体标签 !== '关键词';
  元素.背景颜色选项.hidden = 外观.当前字体标签 !== '背景';
  元素.字体粗细按钮.hidden = 外观.当前字体标签 === '背景';
}

export function 渲染字体选项() {
  const 区域 = 外观.当前字体标签;
  const 容器 = 元素.字体选项列表;
  const 片段 = document.createDocumentFragment();
  if (区域 === '背景') {
    // 背景预览：外层铺当前页面背景色，内层色块模拟正文纸面。
    // 弹窗作用域内 --背景色/--纸张色 已被钉成固定浅色（见 styles.css .字体弹窗），
    // 不能用变量引用，这里直接拷贝状态值，改色时由设置函数刷新重绘。
    const 预览 = document.createElement('div');
    预览.className = '背景样式预览';
    预览.style.backgroundColor = 外观.页面背景色;
    const 纸面块 = document.createElement('div');
    纸面块.className = '背景预览纸面块';
    纸面块.textContent = '页面背景 · 外观.纸面色';
    纸面块.style.backgroundColor = 外观.纸面色;
    纸面块.style.color = 'var(--正文字色)';
    预览.append(纸面块);
    容器.replaceChildren(预览);
    return;
  }
  if (区域 === '关键词') {
    const 预览 = document.createElement('div');
    预览.className = '关键词样式预览';
    预览.append('在长篇文本中标记', 创建关键词预览文字(), '并快速核对上下文');
    容器.replaceChildren(预览);
    渲染字体粗细按钮();
    return;
  }
  const 是全部 = 区域 === '全部';
  渲染字体颜色选择器();
  // 「全部」tab：仅当引号内/引号外的字体值完全一致时才视为「当前选中」；
  // 不一致（例如分区域选过）时不预选项，避免误以为已统一设置。
  const 当前值 = 是全部
    ? 字体设置.引号内 === 字体设置.引号外
      ? 字体设置.引号内
      : undefined
    : 字体设置[区域];
  const 选项区名 = 是全部
    ? '引号内/外统一字体'
    : 区域 === '引号内'
      ? '引号内字体'
      : '引号外字体';
  for (const 字体 of 可选字体列表) {
    const 选项 = document.createElement('button');
    选项.type = 'button';
    选项.className = '字体选项';
    选项.dataset.字体值 = 字体.值 ?? '';
    const 选中 = 字体.值 === 当前值;
    选项.classList.toggle('选中', 选中);
    选项.setAttribute('aria-checked', String(选中));
    选项.setAttribute('aria-pressed', String(选中));
    选项.setAttribute('aria-label', `${选项区名}：${字体.名称}`);

    const 名称 = document.createElement('div');
    名称.className = '字体选项名';
    名称.textContent = 字体.名称;

    const 预览 = document.createElement('div');
    预览.className = '字体选项预览';
    预览.textContent = '阅读字体预览 · 永和九年岁在癸丑 · The quick 123';
    // 「全部」tab 预览用字体值本身，让用户直接看到该字体外观；
    // null（跟随默认）时回退到 inherit，沿用弹窗当前生效字体。
    预览.style.fontFamily = 字体.值 === null ? 'inherit' : 字体.值;

    选项.append(名称, 预览);
    片段.append(选项);
  }
  容器.replaceChildren(片段);
  渲染字体粗细按钮();

  function 创建关键词预览文字() {
    const 文字 = document.createElement('span');
    文字.textContent = '关键词';
    return 文字;
  }
}

export function 设置区域颜色(区域, 颜色, 选项 = {}) {
  if (!['引号内', '引号外'].includes(区域)) {
    throw new TypeError('字体颜色区域无效');
  }
  if (颜色 !== null && !/^#[\da-f]{6}$/i.test(颜色)) {
    throw new TypeError('字体颜色格式无效');
  }
  const 规范颜色 = 颜色?.toLowerCase() ?? null;
  const 变量名 = 区域 === '引号内' ? '--引文墨色' : '--正文字色';
  字体颜色设置[区域] = 规范颜色;
  // 写在 body 内联上：正文行都在 body 内，body 级内联值可稳定压过任何样式表
  // 对这两个变量的同名声明，避免设置被层级更高的声明遮蔽而失效。
  if (规范颜色 === null) {
    document.body.style.removeProperty(变量名);
  } else {
    document.body.style.setProperty(变量名, 规范颜色);
  }
  渲染字体颜色选择器();
  if (!选项.静默) {
    渲染字体标签();
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置区域字体颜色', {
    区域,
    颜色: 规范颜色 ?? '默认',
  });
}

export function 渲染字体颜色选择器() {
  if (外观.当前字体标签 !== '全部') return;
  // 「全部」tab：仅当引号内/引号外颜色一致时才视为「当前选中」。
  const 当前颜色 =
    字体颜色设置.引号内 === 字体颜色设置.引号外 ? 字体颜色设置.引号内 : null;
  元素.字体颜色选择器.value = 当前颜色 ?? '#221e16';
  元素.字体颜色选择器.setAttribute('aria-label', `当前${外观.当前字体标签}字体颜色`);
}

export function 设置内置字词颜色(颜色, 选项 = {}) {
  if (!/^#[\da-f]{6}$/i.test(颜色)) {
    throw new TypeError('内置字词颜色格式无效');
  }
  外观.内置字词颜色 = 颜色.toLowerCase();
  document.documentElement.style.setProperty('--外观.内置字词颜色', 外观.内置字词颜色);
  元素.内置字词颜色选择器.value = 外观.内置字词颜色;
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置内置字词颜色', { 颜色: 外观.内置字词颜色 });
}

export function 渲染字体粗细按钮() {
  if (外观.当前字体标签 === '关键词') {
    const 显示值 = 外观.关键词粗细 === null ? '默认' : String(外观.关键词粗细);
    元素.字体粗细按钮.textContent = `外观.关键词粗细：${显示值}`;
    元素.字体粗细按钮.setAttribute(
      'aria-label',
      `当前关键词粗细：${显示值}，点击或滚轮循环调整`,
    );
    return;
  }
  const 是全部统一 =
    外观.当前字体标签 !== '全部' ||
    读取有效字体粗细('引号内') === 读取有效字体粗细('引号外');
  const 当前值 =
    外观.当前字体标签 === '全部'
      ? 是全部统一
        ? 读取有效字体粗细('引号内')
        : null
      : 读取有效字体粗细(外观.当前字体标签);
  const 显示值 = 是全部统一
    ? 当前值 === null
      ? '默认'
      : String(当前值)
    : '混合';
  元素.字体粗细按钮.textContent = `字体粗细：${显示值}`;
  元素.字体粗细按钮.setAttribute(
    'aria-label',
    `当前${外观.当前字体标签}字体粗细：${显示值}，点击切换`,
  );
  const 预览粗细 = 当前值 ?? 400;
  for (const 预览 of 元素.字体选项列表.querySelectorAll('.字体选项预览')) {
    预览.style.fontWeight = String(预览粗细);
  }
}

export function 读取有效字体粗细(区域) {
  return 字体粗细设置[区域] ?? 默认字体粗细[区域];
}

export function 设置关键词颜色(颜色, 选项 = {}) {
  if (!/^#[\da-f]{6}$/i.test(颜色)) {
    throw new TypeError('关键词颜色格式无效');
  }
  外观.关键词颜色 = 颜色.toLowerCase();
  高亮配色[0].深色 = 外观.关键词颜色;
  高亮配色[0].浅色 =
    外观.关键词颜色 === 默认关键词颜色 ? '#c5d9f0' : 计算关键词浅色(外观.关键词颜色);
  document.documentElement.style.setProperty('--外观.关键词颜色', 外观.关键词颜色);
  元素.关键词颜色选择器.value = 外观.关键词颜色;
  if (!选项.不渲染) {
    状态.关键词面板签名 = '';
    状态.指示器缓存 = null;
    渲染可见行(true);
    更新关键词指示器();
  }
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置关键词颜色', { 颜色: 外观.关键词颜色 });

  function 计算关键词浅色(深色) {
    const 通道 = 深色.match(/[\da-f]{2}/gi).map(function 转为数值(十六进制) {
      return Number.parseInt(十六进制, 16);
    });
    const 纸色 = [248, 245, 237];
    return `#${通道
      .map(function 混合通道(值, idx) {
        return Math.round(值 * 0.24 + 纸色[idx] * 0.76)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')}`;
  }
}

export function 设置关键词粗细(值, 选项 = {}) {
  if (值 !== null && !字体粗细列表.includes(值)) {
    throw new TypeError('关键词粗细格式无效');
  }
  外观.关键词粗细 = 值;
  if (值 === null) {
    document.documentElement.style.removeProperty('--外观.关键词粗细');
  } else {
    document.documentElement.style.setProperty('--外观.关键词粗细', String(值));
  }
  if (!选项.静默) {
    渲染字体粗细按钮();
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置关键词粗细', { 值: 值 ?? '默认' });
}

export function 设置奇偶行颜色(类型, 颜色, 选项 = {}) {
  if (!['奇数', '偶数'].includes(类型)) {
    throw new TypeError('奇偶行颜色类型无效');
  }
  if (!/^#[\da-f]{6}$/i.test(颜色)) {
    throw new TypeError(`${类型}行颜色格式无效`);
  }
  const 规范颜色 = 颜色.toLowerCase();
  const 变量名 = 类型 === '奇数' ? '--段落底色一' : '--段落底色二';
  const 选择器 =
    类型 === '奇数' ? 元素.奇数行颜色选择器 : 元素.偶数行颜色选择器;
  奇偶行颜色[类型] = 规范颜色;
  选择器.value = 规范颜色;
  // 写在 body 内联上：正文行都在 body 内，body 级内联值可稳定压过任何样式表
  // 对这两个变量的同名声明，避免设置被层级更高的声明遮蔽而失效。
  if (规范颜色 === 默认奇偶行颜色[类型]) {
    document.body.style.removeProperty(变量名);
  } else {
    document.body.style.setProperty(变量名, 规范颜色);
  }
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置奇偶行颜色', { 类型, 颜色: 规范颜色 });
}

export function 设置页面背景色(颜色, 选项 = {}) {
  if (!/^#[\da-f]{6}$/i.test(颜色)) {
    throw new TypeError('页面背景色格式无效');
  }
  const 规范颜色 = 颜色.toLowerCase();
  外观.页面背景色 = 规范颜色;
  元素.背景色选择器.value = 规范颜色;
  if (规范颜色 === 默认页面背景色) {
    document.documentElement.style.removeProperty('--背景色');
  } else {
    document.documentElement.style.setProperty('--背景色', 规范颜色);
  }
  if (!选项.静默) {
    刷新背景标签预览();
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置页面背景色', { 颜色: 规范颜色 });
}

/* 界面墨色自适应：左下角胶囊按钮、关键词面板、查找 / 内容选择 / 上下文等弹窗
   都以纸面色为底、用 --墨色 / --次要墨色 写字，而这两种墨色默认按浅色纸面配成深墨。
   纸面色一旦调成中灰或深色，深墨字与纸面亮度趋同（中灰纸面下对比度约 1:1），
   文字几乎不可见；这里按纸面色相对亮度分档重算两支墨色：
   中灰纸面换更深的墨、深纸面换浅墨、足够浅的纸面恢复默认。
   字体设置弹窗在自身作用域内钉住了浅色变量，不受这里的覆盖影响。 */

export function 计算相对亮度(十六进制颜色) {
  return 十六进制颜色
    .match(/[\da-f]{2}/gi)
    .map(function 转线性分量(分量文本) {
      const 分量 = parseInt(分量文本, 16) / 255;
      return 分量 <= 0.03928 ? 分量 / 12.92 : ((分量 + 0.055) / 1.055) ** 2.4;
    })
    .reduce(function 通道加权(累加, 线性分量, 通道idx) {
      return 累加 + [0.2126, 0.7152, 0.0722][通道idx] * 线性分量;
    }, 0);
}

export function 刷新界面墨色() {
  const 根样式 = document.documentElement.style;
  if (外观.纸面色 === 默认纸面色) {
    根样式.removeProperty('--墨色');
    根样式.removeProperty('--次要墨色');
    return;
  }
  const 亮度 = 计算相对亮度(外观.纸面色);
  const 深纸 = 亮度 < 界面墨色深纸亮度上限;
  if (深纸) {
    根样式.setProperty('--墨色', '#f5f3ec');
    根样式.setProperty('--次要墨色', '#cfccc2');
  } else if (亮度 < 界面墨色浅纸亮度下限) {
    根样式.setProperty('--墨色', '#1c1812');
    根样式.setProperty('--次要墨色', '#322d24');
  } else {
    根样式.removeProperty('--墨色');
    根样式.removeProperty('--次要墨色');
  }
}

export function 设置纸面色(颜色, 选项 = {}) {
  if (!/^#[\da-f]{6}$/i.test(颜色)) {
    throw new TypeError('纸面色格式无效');
  }
  const 规范颜色 = 颜色.toLowerCase();
  外观.纸面色 = 规范颜色;
  元素.背景色选择器.value = 规范颜色;
  // CSS 默认纸面是 oklch 记法，与任何 hex 都不相等；把近似默认值视为「重置」，
  // 这样恢复默认与用户选回默认色都走同一条 removeProperty 路径。
  if (规范颜色 === 默认纸面色) {
    document.documentElement.style.removeProperty('--纸张色');
  } else {
    document.documentElement.style.setProperty('--纸张色', 规范颜色);
  }
  刷新界面墨色();
  if (!选项.静默) {
    刷新背景标签预览();
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置纸面色', { 颜色: 规范颜色 });
}

export function 刷新背景标签预览() {
  if (外观.当前字体标签 === '背景') {
    渲染字体选项();
  }
}

export function 设置引文背景色(启用, 选项 = {}) {
  外观.引文背景色启用 = 启用;
  document.documentElement.classList.toggle('隐藏引文背景色', !启用);
  元素.引文背景色开关.checked = 启用;
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置 spk 背景色', { 启用 });
}

export function 设置引文背景颜色(类型, 颜色, 选项 = {}) {
  if (!['奇数', '偶数'].includes(类型)) {
    throw new TypeError('spk 背景色类型无效');
  }
  if (!/^#[\da-f]{6}$/i.test(颜色)) {
    throw new TypeError(`${类型} spk 背景色格式无效`);
  }
  const 规范颜色 = 颜色.toLowerCase();
  const 变量名 = 类型 === '奇数' ? '--奇数引文底色' : '--偶数引文底色';
  const 选择器 =
    类型 === '奇数' ? 元素.奇数引文颜色选择器 : 元素.偶数引文颜色选择器;
  引文背景色[类型] = 规范颜色;
  选择器.value = 规范颜色;
  if (规范颜色 === 默认引文背景色[类型]) {
    document.documentElement.style.removeProperty(变量名);
  } else {
    document.documentElement.style.setProperty(变量名, 规范颜色);
  }
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置 spk 背景颜色', { 类型, 颜色: 规范颜色 });
}

export function 设置引文边框显示(启用, 选项 = {}) {
  外观.引文边框启用 = 启用;
  document.documentElement.classList.toggle('隐藏引文边框', !启用);
  元素.引文边框开关.checked = 启用;
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置 spk 边框', { 启用 });
}

// 折行句竖条只走样式层：切根类隐藏即可，无需重建行索引或重渲染。

// 阶梯段落只影响排版层：切换时重建行索引即可，
// 文本与字符偏移不变，阅读位置经行起点映射自动保持。
export function 设置阶梯段落(启用, 选项 = {}) {
  外观.阶梯段落启用 = 启用;
  元素.阶梯段落开关.checked = 启用;
  if (!选项.静默) {
    安排保存持久化状态();
    if (状态.文件名 && 状态.行起点列表.length) {
      重建行索引();
    }
  }
  console.info('[阅读器] 已设置阶梯段落', { 启用 });
}

export function 刷新字体粗细排版() {
  if (!状态.文件名) {
    return;
  }
  const 新排版 = 读取正文排版();
  if (新排版.键 !== 状态.排版键) {
    重建行索引(新排版);
    return;
  }
  渲染可见行(true);
  更新关键词指示器();
}

export function 调整字号(目标值) {
  const 新值 = Math.max(最小字号, Math.min(最大字号, Math.round(目标值)));
  if (新值 === 状态.字号) {
    return;
  }
  状态.字号 = 新值;
  document.documentElement.style.setProperty('--正文字号', 新值 + 'px');
  if (状态.行高 < 新值) {
    状态.行高 = 新值;
    document.documentElement.style.setProperty('--行高', 新值 + 'px');
    更新行高显示();
  }
  更新字号显示();
  // 字号影响排版键（正文字号纳入键），变化后按「尺寸变化」逻辑重排：
  // 排版键改变则重建行索引，否则仅刷新画布高度并重绘。
  const 新排版 = 读取正文排版();
  if (新排版.键 !== 状态.排版键) {
    重建行索引(新排版);
  } else {
    刷新画布尺寸(新排版);
    渲染可见行(true);
    更新关键词指示器();
  }
  安排保存持久化状态();
  console.info('[阅读器] 字号已调整', { 字号: 新值 });
}

export function 更新字号显示() {
  元素.字号值.textContent = String(状态.字号);
  元素.字号控制.setAttribute(
    'aria-label',
    `当前字号 ${状态.字号} 像素，悬停滚轮调节，点击恢复默认`,
  );
}

export function 处理字号滚轮(事件) {
  事件.preventDefault();
  事件.stopPropagation();
  let 增量 = 事件.deltaY;
  if (事件.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    增量 *= 16;
  } else if (事件.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    增量 *= 元素.滚动容器.clientHeight;
  }
  const 步数 = (Math.sign(增量) || 0) * -1; // 上滚（deltaY<0）调大，下格调小
  if (步数 === 0) {
    return;
  }
  调整字号(状态.字号 + 步数 * 字号步进);
}

export function 进入字号调节() {
  元素.字号控制.classList.add('滚轮调节中');
}

export function 离开字号调节() {
  元素.字号控制.classList.remove('滚轮调节中');
}

/* ===== 行距（行间距）控制 =====
   行距仅影响垂直间距与滚动定位，不改变横向换行逻辑，因此调整时无需重建行索引：
   直接同步 CSS 变量与 状态.行高，按当前阅读位置比例缩放 scrollTop 以保持视觉稳定，
   再重算画布高度并重绘可见行即可。密度与排版键随行高即时同步：
   全文负担密度的分母是「行数 × 行高」，不重算会让自适应调速与剩余时长按旧密度失真；
   排版键若保留旧行高，下一次尺寸变化会被误判为排版改变而多做一次全文重建。 */

export function 调整行高(目标值) {
  const 下限 = 计算最小行高();
  const 新值 = Math.max(下限, Math.min(最大行高, Math.round(目标值)));
  if (新值 === 状态.行高) {
    return;
  }
  const 旧行高 = 状态.行高;
  状态.行高 = 新值;
  document.documentElement.style.setProperty('--行高', 新值 + 'px');
  // 保持当前文本行在屏幕上的视觉位置稳定：按比例缩放滚动偏移
  const 比例 = 新值 / 旧行高;
  元素.滚动容器.scrollTop = 元素.滚动容器.scrollTop * 比例;
  设置画布高度(状态.行起点列表.length * 新值);
  重算全文负担密度();
  状态.排版键 = 读取正文排版().键;
  渲染可见行(true);
  更新关键词指示器();
  更新行高显示();
  安排保存持久化状态();
  console.info('[阅读器] 行距已调整', { 行高: 新值 });
}

export function 更新行高显示() {
  const 值 = Math.round(状态.行高);
  元素.行距值.textContent = String(值);
  const 倍数 = 状态.字号 > 0 ? 值 / 状态.字号 : 0;
  元素.行距控制.setAttribute(
    'aria-label',
    `当前行距 ${值} 像素，约 ${倍数.toFixed(2)} 倍字号，悬停滚轮调节，点击恢复默认`,
  );
}

// 悬停行距控件时滚轮实时调整行距：上滚（deltaY<0）增大间距，下滚减小。

// 悬停行距控件时滚轮实时调整行距：上滚（deltaY<0）增大间距，下滚减小。
export function 处理行距滚轮(事件) {
  事件.preventDefault();
  事件.stopPropagation();
  let 增量 = 事件.deltaY;
  if (事件.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    增量 *= 16;
  } else if (事件.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    增量 *= 元素.滚动容器.clientHeight;
  }
  const 步数 = (Math.sign(增量) || 0) * -1; // 上滚（deltaY<0）调大，下格调小
  if (步数 === 0) {
    return;
  }
  调整行高(状态.行高 + 步数 * 行高步进);
}

// 悬停期间给按钮加高亮态，提示「滚轮可调节」

// 悬停期间给按钮加高亮态，提示「滚轮可调节」
export function 进入行距调节() {
  元素.行距控制.classList.add('滚轮调节中');
}

export function 离开行距调节() {
  元素.行距控制.classList.remove('滚轮调节中');
}

export const 字体粗细列表 = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const 默认字体粗细 = { 引号内: 900, 引号外: 100 };

export const 可选字体列表 = [
  {
    名称: 'TogeGothic荆棘黑 SemiLight',
    值: "'TogeGothic-SemiLight-Local', 'TogeGothicJingJiHei-SemiLight', 'TogeGothic', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
  {
    名称: 'TogeGothic荆棘黑 纤细',
    值: "'TogeGothic-ExtraLight-Local', 'TogeGothicJingJiHei-ExtraLight', 'TogeGothic', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
  {
    名称: '破碎零号字',
    值: "'LingKOSHIKKU-Local', 'LingKOSHIKKU', 'PoSuiLingHaoZi', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
  {
    名称: '思源黑体旧字形 ExtraLight',
    值: "'SourceHanSansOLD-ExtraLight-Local', 'SourceHanSansOLD-ExtraLight', '思源黑体旧字形', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
  { 名称: '默认（跟随正文）', 值: null },
  {
    名称: '字魂白鸽天行体',
    值: "'ZiHunBaiGeTianXingTi-Local', '字魂白鸽天行体', 'zihun50hao-baigetianxingti', 'Songti SC', 'STSong', 'Noto Serif CJK SC', serif",
  },
  {
    名称: '宋体（Songti SC）',
    值: "'Songti SC', 'STSong', 'Noto Serif CJK SC', serif",
  },
  {
    名称: '思源宋体（Noto Serif CJK SC）',
    值: "'Noto Serif CJK SC', 'Songti SC', serif",
  },
  { 名称: '楷体（KaiTi）', 值: "'KaiTi', 'STKaiti', 'Kaiti SC', serif" },
  { 名称: '华文楷体（STKaiti）', 值: "'STKaiti', 'KaiTi', serif" },
  { 名称: '黑体（Heiti SC）', 值: "'Heiti SC', 'SimHei', sans-serif" },
  {
    名称: '苹方（PingFang SC）',
    值: "'PingFang SC', 'Hiragino Sans GB', sans-serif",
  },
  { 名称: '仿宋（FangSong）', 值: "'FangSong', 'STFangsong', serif" },
  { 名称: '系统衬线（serif）', 值: 'serif' },
  { 名称: '系统无衬线（sans-serif）', 值: 'sans-serif' },
];

export const 界面墨色深纸亮度上限 = 0.179; // 纸面更暗时浅墨对比度反超深墨，改用浅墨

export const 界面墨色浅纸亮度下限 = 0.787; // 纸面更亮时默认次要墨色对比度仍 ≥ 3:1
