'use strict';

const 默认文本预加载 = document.querySelector('#默认文本预加载');
if (!(默认文本预加载 instanceof HTMLLinkElement)) {
  throw new Error('缺少默认文本预加载链接');
}
const 默认文本地址 = 默认文本预加载.href;
const 文本目录地址 = new URL('./txt/', document.baseURI);
const 默认文件名 = decodeURIComponent(
  new URL(默认文本地址).pathname.split('/').pop(),
);
const 持久化键 = '原文阅读器:阅读状态:v2';
const 旧持久化键 = '原文阅读器:阅读状态:v1';
const 最大虚拟高度 = 30_000_000;
const 字素分段器 = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
const 词组分段器 = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const 拼音排序器 = new Intl.Collator('zh-Hans-CN-u-co-pinyin');
const 汉字模式 = /^\p{Script=Han}$/u;
const 时间格式器 = new Intl.DateTimeFormat('zh-CN', {
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const 整数格式器 = new Intl.NumberFormat('zh-CN');
const 关键词排序方式列表 = ['数量', '位置', '拼音'];
const 西文字素模式 =
  /^(?:[\u0020-\u007e\u00a0]|\p{Script=Latin}|\p{Number}|\p{Mark})+$/u;
const 西文单词模式 = /\s*\S+|\s+$/gu;
const 不渲染引号集合 = new Set(['“', '”']);
const 显示引号过滤模式 = /[“”]/gu;
const 正文测量上下文 = document.createElement('canvas').getContext('2d');
if (!正文测量上下文) {
  throw new Error('当前浏览器无法创建正文测量画布');
}
const 跳转迸发时长 = 680; // 与 styles.css 的 @keyframes 跳转迸发 保持一致
const 迸发粒子数 = 18;
const 迸发起跳留白 = 3;
const 迸发最短射程 = 32;
const 迸发射程差 = 36;
const 迸发重力位移 = 24;
const 迸发最小尺寸 = 4;
const 迸发尺寸差 = 5;
const 指示器刻度高度 = 3;
const 指示器基础透明度 = 0.45;
const 当前命中位置提示时长 = 1000;
const 上下文分块行数 = 200;
const 上下文最大初始行数 = 2000;
const 上下文前文字数 = 24;
const 上下文后文字数 = 30;
const 自动滚动默认速度 = 36;
const 自动滚动最低速度 = 1;
const 自动滚动最高速度 = 600;
const 自动滚动快速速度 = 2400;
const 自动滚动缓动时长 = 140;
const 自动滚动界面间隔 = 50;
const 自动滚动反向翻页停留时长 = 1000;
// —— 自适应滚动（内容密度驱动）——
// 恒定像素速度的「生硬」根源：它假设每个像素等阅读价值，对内容密度无感。
// 这里把目标速度改为「基准速度 × 密度修正」：视口内文字密集（长句、实字多）自动放慢，
// 稀疏（对话、短行、空行）自动加快；修正叠加在用户手动设定的基准速度之上，
// 因此滚轮 / 快慢指令仍调节「基准节奏」，用户无需再按内容密度来回手动调速。
const 自适应滚动强度 = 0.7; // 密度修正强度：0=关闭自适应；1=完全按密度反比；0.7 保留基准速度主导权
const 自适应密度因子下限 = 0.5; // 视口比全局平均密集时，速度最多按此下限衰减（乘性）
const 自适应密度因子上限 = 2; // 视口比全局平均稀疏时，速度最多按此上限提升（乘性）
const 自适应视口负担下限 = 6; // 负担；视口负担低于此值按下限计算，防止近乎全空的视口爆速
const 自适应句长起点 = 15; // 字；连续无标点超过此长度开始句长惩罚（长句需要更多解析时间）
const 自适应句长惩罚系数 = 0.12; // 每超出「句长起点」一个区间，行负担加成 12%
const 自适应句长惩罚上限 = 2.5; // 单行句长惩罚系数封顶
const 自适应窗口下移比例 = 0.3; // 密度评估窗口相对视口整体下移的比例（高度不变）：忽略屏内顶部该比例内容、额外纳入屏外下方等量内容，让调速提前启动；调大则调速更提前，但越偏离眼前内容
const 默认字号 = 30;
const 最小字号 = 16;
const 最大字号 = 72;
const 字号步进 = 2;
const 默认行高 = 30; // 与 CSS --行高 默认值（=正文字号）一致
const 最小行高硬下限 = 16;
const 最大行高 = 240;
const 行高步进 = 2;
// 行高不应低于当前字号，否则相邻行字身会重叠；下限随字号联动。
function 计算最小行高() {
  return Math.max(最小行高硬下限, Math.round(状态.字号));
}
const 自动滚动滚轮灵敏系数 = 0.1; // 每格指数强度；越小越柔和、节奏越慢
const 自动滚动滚轮死区 = 3; // 像素；过滤触控板/鼠标的细微抖动，避免速度剧烈跳变
const 自动滚动滚轮归一化 = 120; // 像素；单格滚轮对应的归一化基准，用于把 deltaY 映射到 [-1, 1]
const 衔接线停留时长 = 700; // 方案 D：快速前进到位后停留毫秒数
const 衔接线播放时长 = 1200; // 与 styles.css 的 @keyframes 衔接线淡出 保持一致
const 双击判定延迟 = 150; // 纯单击前进的延迟；双击会清空挂起项，因此两者不冲突。取 150ms：比 180 跟手，需快双点击间隔稳定 < 150ms 才不竞态；若双击偶发「前进一格再跳」回升到 180（干净双击的硬下限）
const shift双击中阈值 = 350; // 双击 Shift 启动自动滚动的时间窗口（毫秒）：两次「干净」的 Shift 松开间隔小于此值即判定为双击
// 关键词深色用于正文与指示器，浅色用于面板、上下文与跳转边框。
const 默认关键词颜色 = '#1e4a7a';
const 默认奇偶行颜色 = { 奇数: '#d3dde1', 偶数: '#eedbd4' };
const 默认引文背景色 = { 奇数: '#bcc7cc', 偶数: '#d7c5bf' };
const 默认奇偶行左侧边框显示 = true;
const 高亮配色 = [{ 浅色: '#c5d9f0', 深色: 默认关键词颜色 }];

// 关系连词词表（数据驱动，按词着色；2 字词用「首字+邻字」邻接判定）：
// 因果（因词/果词）、假设（假设词）、递进（递进词）、选择（选择词）、顺接（顺接词）、时间（时间词）、限制（限制词）、语气（语气词）、强调（强调词）。
// 注意「既然」末字「然」与「虽然」末字同字，靠首字（既/虽）邻接区分，已无冲突。
const 关系连词表 = [
  ['因为', '因词'],
  ['由于', '因词'],
  ['既然', '因词'],
  ['所以', '果词'],
  ['因此', '果词'],
  ['于是', '果词'],
  ['如果', '假设词'],
  ['只要', '假设词'],
  ['只有', '假设词'],
  ['不但', '递进词'],
  ['而且', '递进词'],
  ['甚至', '递进词'],
  ['况且', '递进词'],
  ['或者', '选择词'],
  ['然后', '顺接词'],
  ['继续', '顺接词'],
  ['接着', '顺接词'],
  ['随后', '顺接词'],
  ['然而', '转折词'],
  ['反而', '转折词'],
  ['果然', '果词'],
  ['因而', '果词'],
  ['从而', '果词'],
  ['忽然', '时间词'],
  ['后来', '时间词'],
  ['莫非', '假设词'],
  ['倘若', '假设词'],
  ['除非', '假设词'],
  ['只能', '限制词'],
  ['仅仅', '限制词'],
  ['无非', '限制词'],
  ['居然', '语气词'],
  ['到底', '语气词'],
  ['难道', '语气词'],
  ['究竟', '语气词'],
  ['偏偏', '语气词'],
  ['就是', '强调词'],
  ['都是', '强调词'],
  ['其实', '强调词'],
  ['确实', '强调词'],
];

// 字体选择：引号内（spk 内）/ 引号外（spk 外）两块独立。
// 值为 null 表示“跟随该区域 CSS 默认”，写入时清空内联变量以回退到 :root。
const 字体设置 = { 引号内: null, 引号外: null };
const 字体粗细设置 = { 引号内: null, 引号外: null };
const 字体颜色设置 = { 引号内: null, 引号外: null };
let 关键词颜色 = 默认关键词颜色;
let 关键词粗细 = null;
const 奇偶行颜色 = { ...默认奇偶行颜色 };
const 引文背景色 = { ...默认引文背景色 };
let 奇偶行左侧边框显示 = 默认奇偶行左侧边框显示;
let 引文背景色启用 = true;
let 引文边框启用 = true;
let 当前字体标签 = '引号内';
const 字体粗细列表 = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const 默认字体粗细 = { 引号内: 900, 引号外: 100 };
const 可选字体列表 = [
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
const 状态 = {
  文本: '',
  文件名: '',
  行起点列表: new Uint32Array(),
  行终点列表: new Uint32Array(),
  行逻辑索引: new Uint32Array(),
  行段落索引: new Uint32Array(),
  引文边界列表: new Uint32Array(),
  缩进起点集合: new Set(),
  排版键: '',
  行高: 39,
  渲染起点: -1,
  渲染终点: -1,
  滚动帧: 0,
  滚动动画帧: 0,
  滚动动画目标: null,
  尺寸计时器: 0,
  保存计时器: 0,
  迸发计时器: 0,
  衔接线计时器: 0,
  载入序号: 0,
  拖选状态: null,
  关键词列表: [],
  当前关键词id: null,
  悬停关键词id: null,
  悬停命中idx: null,
  悬停逻辑行idx: null,
  下一个关键词id: 1,
  跳转起点: null,
  指示器缓存: null,
  当前命中位置计时器: 0,
  关键词面板展开: false,
  关键词面板签名: '',
  关键词排序: '数量',
  上下文视图: null,
  自动滚动速度: 自动滚动默认速度,
  句段起点列表: new Uint32Array(), // 全文「无标点连续段」起点（文本偏移，升序），用于运行时二分
  句段负担前缀和: new Float64Array(1), // 句段负担前缀和，长度 = 段数 + 1；[i] = 前 i 段负担之和
  句段负担总合: 0, // 全部句段负担之和（= 前缀和末位），用于剩余时间语义化
  全文负担密度: 0, // 负担/像素 = 句段负担总合 ÷ 虚拟总高度；视口期望负担 = 密度 × 视口高度
  字号: 默认字号,
  词频分析: null,
  全文单字: new Set(),
  文本目录: [],
  文本字数: new Map(),
};

const 元素 = {
  滚动容器: document.querySelector('#滚动容器'),
  虚拟画布: document.querySelector('#虚拟画布'),
  可见内容: document.querySelector('#可见内容'),
  载入状态: document.querySelector('#载入状态'),
  跳转边框: document.querySelector('#跳转边框'),
  跳转迸发: document.querySelector('#跳转迸发'),
  衔接线: document.querySelector('#衔接线'),
  查找弹窗: document.querySelector('#查找弹窗'),
  查找表单: document.querySelector('#查找表单'),
  查找输入框: document.querySelector('#查找输入框'),
  查找反馈: document.querySelector('#查找反馈'),
  分析按钮: document.querySelector('#分析按钮'),
  分析结果: document.querySelector('#分析结果'),
  分析结果摘要: document.querySelector('#分析结果摘要'),
  分析结果列表: document.querySelector('#分析结果列表'),
  关闭查找按钮: document.querySelector('#关闭查找按钮'),
  自定义滚动条: document.querySelector('#自定义滚动条'),
  滚动块: document.querySelector('#滚动块'),
  滚动进度: document.querySelector('#滚动进度'),
  滚动百分比: document.querySelector('#滚动百分比'),
  剩余滚动时间: document.querySelector('#剩余滚动时间'),
  基础速度显示: document.querySelector('#基础速度显示'),
  实际速度显示: document.querySelector('#实际速度显示'),
  关键词指示器: document.querySelector('#关键词指示器'),
  悬停关键词指示器: document.querySelector('#悬停关键词指示器'),
  自动滚动按钮: document.querySelector('#自动滚动按钮'),
  当前时间: document.querySelector('#当前时间'),
  字号控制: document.querySelector('#字号控制'),
  字号值: document.querySelector('#字号值'),
  行距控制: document.querySelector('#行距控制'),
  行距值: document.querySelector('#行距值'),
  内容选择按钮: document.querySelector('#内容选择按钮'),
  内容选择弹窗: document.querySelector('#内容选择弹窗'),
  内容选择摘要: document.querySelector('#内容选择摘要'),
  内容选择列表: document.querySelector('#内容选择列表'),
  关闭内容选择按钮: document.querySelector('#关闭内容选择按钮'),
  关键词面板: document.querySelector('#关键词面板'),
  关键词面板开关: document.querySelector('#关键词面板开关'),
  关键词列表容器: document.querySelector('#关键词列表容器'),
  上下文弹窗: document.querySelector('#上下文弹窗'),
  上下文标题: document.querySelector('#上下文标题'),
  上下文列表: document.querySelector('#上下文列表'),
  关闭上下文按钮: document.querySelector('#关闭上下文按钮'),
  词频弹窗: document.querySelector('#词频弹窗'),
  词频摘要: document.querySelector('#词频摘要'),
  词频标签栏: document.querySelector('#词频标签栏'),
  单字双列表: document.querySelector('#单字双列表'),
  单字重复列表: document.querySelector('#单字重复列表'),
  单字一次列表: document.querySelector('#单字一次列表'),
  词频表格容器: document.querySelector('#词频表格容器'),
  词频列表: document.querySelector('#词频列表'),
  词频分页: document.querySelector('#词频分页'),
  词频上一页: document.querySelector('#词频上一页'),
  词频页码: document.querySelector('#词频页码'),
  词频下一页: document.querySelector('#词频下一页'),
  关闭词频按钮: document.querySelector('#关闭词频按钮'),
  字体弹窗: document.querySelector('#字体弹窗'),
  字体遮罩: document.querySelector('#字体遮罩'),
  关闭字体按钮: document.querySelector('#关闭字体按钮'),
  字体重置按钮: document.querySelector('#字体重置按钮'),
  字体关闭底部按钮: document.querySelector('#字体关闭底部按钮'),
  字体标签引号内: document.querySelector('#字体标签引号内'),
  字体标签引号外: document.querySelector('#字体标签引号外'),
  字体标签全部: document.querySelector('#字体标签全部'),
  字体标签关键词: document.querySelector('#字体标签关键词'),
  字体标签奇偶行: document.querySelector('#字体标签奇偶行'),
  引文背景色选项: document.querySelector('#引文背景色选项'),
  引文背景色开关: document.querySelector('#引文背景色开关'),
  奇数引文颜色选择器: document.querySelector('#奇数引文颜色选择器'),
  偶数引文颜色选择器: document.querySelector('#偶数引文颜色选择器'),
  引文边框选项: document.querySelector('#引文边框选项'),
  引文边框开关: document.querySelector('#引文边框开关'),
  关键词颜色选项: document.querySelector('#关键词颜色选项'),
  关键词颜色选择器: document.querySelector('#关键词颜色选择器'),
  字体颜色选项: document.querySelector('#字体颜色选项'),
  字体颜色选择器: document.querySelector('#字体颜色选择器'),
  奇偶行颜色选项: document.querySelector('#奇偶行颜色选项'),
  奇偶行左侧边框开关: document.querySelector('#奇偶行左侧边框开关'),
  奇数行颜色选择器: document.querySelector('#奇数行颜色选择器'),
  偶数行颜色选择器: document.querySelector('#偶数行颜色选择器'),
  字体粗细按钮: document.querySelector('#字体粗细按钮'),
  字体选项列表: document.querySelector('#字体选项列表'),
};

const 当前指示器上下文 = 元素.关键词指示器.getContext('2d');
const 悬停指示器上下文 = 元素.悬停关键词指示器.getContext('2d');
if (!当前指示器上下文 || !悬停指示器上下文) {
  throw new Error('当前浏览器无法创建关键词指示器画布上下文');
}

元素.跳转迸发.append(
  ...Array.from({ length: 迸发粒子数 }, function 造火花() {
    return document.createElement('i');
  }),
);

启动();

function 启动() {
  绑定事件();
  绑定视觉方案();
  更新当前时间();
  window.setInterval(更新当前时间, 1000);
  new ResizeObserver(处理尺寸变化).observe(元素.滚动容器);
  void 载入文本(读取初始文件名());

  function 更新当前时间() {
    const 现在 = new Date();
    元素.当前时间.dateTime = 现在.toISOString();
    元素.当前时间.textContent = 时间格式器.format(现在);
  }

  function 处理尺寸变化() {
    window.clearTimeout(状态.尺寸计时器);
    状态.尺寸计时器 = window.setTimeout(function 重排正文() {
      if (!状态.文件名) {
        return;
      }

      const 新排版 = 读取正文排版();
      if (新排版.键 !== 状态.排版键) {
        try {
          重建行索引(新排版);
        } catch (错误) {
          显示文本处理错误(错误);
        }
        return;
      }

      try {
        刷新画布尺寸(新排版);
        渲染可见行(true);
        更新关键词指示器();
      } catch (错误) {
        显示文本处理错误(错误);
      }
    }, 100);
  }

  function 读取初始文件名() {
    const 持久化数据 = 读取持久化数据();
    return 是有效文本文件名(持久化数据.当前文件名)
      ? 持久化数据.当前文件名
      : 默认文件名;
  }

  function 绑定视觉方案() {
    const 按钮列表 = document.querySelectorAll('.视觉方案钮');
    const 已保存方案 = localStorage.getItem('原文阅读器:视觉方案');
    const 初始方案 = ['纸本', '夜读', '蓝图'].includes(已保存方案)
      ? 已保存方案
      : '纸本';
    设置视觉方案(初始方案);

    按钮列表.forEach(function 绑定方案按钮(按钮) {
      按钮.addEventListener('click', function 切换视觉方案() {
        设置视觉方案(按钮.dataset.视觉方案);
      });
    });

    function 设置视觉方案(方案) {
      if (!['纸本', '夜读', '蓝图'].includes(方案)) {
        throw new TypeError(`未知的视觉方案：${方案}`);
      }
      document.body.dataset.视觉方案 = 方案;
      按钮列表.forEach(function 更新方案状态(按钮) {
        const 当前 = 按钮.dataset.视觉方案 === 方案;
        按钮.classList.toggle('当前', 当前);
        按钮.setAttribute('aria-pressed', String(当前));
      });
      localStorage.setItem('原文阅读器:视觉方案', 方案);
    }
  }
}

async function 载入文本(文件名) {
  if (!是有效文本文件名(文件名)) {
    throw new TypeError(`无效的文本文件名：${文件名}`);
  }
  if (文件名 === 状态.文件名) {
    return;
  }
  if (状态.文件名) {
    保存持久化状态();
  }

  const 本次载入序号 = ++状态.载入序号;
  元素.载入状态.classList.remove('错误');
  元素.载入状态.querySelector('.载入线').hidden = false;
  元素.载入状态.querySelector('p').textContent =
    `正在打开《${文件名.replace(/\.txt$/i, '')}》`;
  元素.载入状态.hidden = false;

  let 数据;
  try {
    const 响应 = await fetch(创建文本地址(文件名));
    if (!响应.ok) {
      throw new Error(`HTTP ${响应.status} ${响应.statusText}`);
    }
    数据 = await 响应.arrayBuffer();
  } catch (错误) {
    if (本次载入序号 === 状态.载入序号) {
      显示错误(`文本载入失败：txt/${文件名}`, 错误);
    }
    return;
  }

  if (本次载入序号 !== 状态.载入序号) {
    return;
  }

  let 文本;
  try {
    文本 = new TextDecoder('utf-8', { fatal: true }).decode(数据);
  } catch (错误) {
    显示错误(`txt/${文件名} 不是有效的 UTF-8 文本。`, 错误);
    return;
  }

  try {
    应用文本(文本, 文件名);
    保存持久化状态();
  } catch (错误) {
    显示文本处理错误(错误);
  }
}

function 创建文本地址(文件名) {
  return new URL(encodeURIComponent(文件名), 文本目录地址);
}

function 是有效文本文件名(文件名) {
  return (
    typeof 文件名 === 'string' &&
    文件名.toLowerCase().endsWith('.txt') &&
    !文件名.includes('/') &&
    !文件名.includes('\\')
  );
}

function 绑定事件() {
  // ===== 右下角控件：默认隐藏，仅在鼠标靠近 / 触摸 / 聚焦 / 自动滚动时显示 =====
  // 时间（#当前时间）固定显示，不受影响。隐藏时 opacity:0 + pointer-events:none，
  // 既不遮挡正文，也不拦截文本选择。
  let 右下悬停 = false;
  let 右下聚焦 = false;
  let 右下强制 = false;
  let 右下触摸 = false;
  let 右下悬停帧 = 0;
  let 右下悬停X = 0;
  let 右下悬停Y = 0;
  let 右下触摸计时器 = 0;

  function 刷新右下控件可见性() {
    document.body.classList.toggle(
      '右下控件显示',
      右下悬停 || 右下聚焦 || 右下强制 || 右下触摸,
    );
  }

  // 鼠标靠近右下角热区（右 380px / 底 130px 以内）即显示，离开则隐藏。
  // 用 rAF 节流，避免每次 mousemove 都同步刷新。
  function 处理右下控件悬停(事件) {
    右下悬停X = 事件.clientX;
    右下悬停Y = 事件.clientY;
    if (右下悬停帧) {
      return;
    }
    右下悬停帧 = requestAnimationFrame(function 计算下方热区() {
      右下悬停帧 = 0;
      const 在热区 =
        右下悬停X > window.innerWidth - 380 &&
        右下悬停Y > window.innerHeight - 130;
      右下悬停 = 在热区;
      刷新右下控件可见性();
    });
  }

  // 触摸设备无 hover：点击右下角热区后短暂显示 3 秒，给触摸用户一个入口，
  // 超时后自动隐藏，避免长期遮挡正文。
  function 处理右下控件触摸(事件) {
    const 触点 = 事件.touches[0];
    if (!触点) {
      return;
    }
    if (
      触点.clientX > window.innerWidth - 380 &&
      触点.clientY > window.innerHeight - 130
    ) {
      右下触摸 = true;
      刷新右下控件可见性();
      window.clearTimeout(右下触摸计时器);
      右下触摸计时器 = window.setTimeout(function 结束触摸显示() {
        右下触摸 = false;
        刷新右下控件可见性();
      }, 3000);
    }
  }

  let Ctrl按键状态 = null;
  let 双击待定 = false;
  let 待定单击列表 = []; // 每次单击各自排一个计时器；双击时统一清空，确保单击不抢先在双击前前进
  let 滚动块拖动状态 = null;
  let 滚动进度拖动状态 = null;
  let 自动滚动状态 = null;
  let 当前词频字数 = 1;
  let 当前词频页码 = 1;
  const 每页词频数 = 200;
  // 「关键词手势」状态：单击=该词下一个 / 双击=该词上一个 / 向上拖=该词第一个 / 向下拖=该词最后一个
  let 关键词手势 = null; // { 关键词, 命中idx, 起点Y, 起点X, 方向: null|'上'|'下' }
  let 点击抑制 = false; // 拖拽手势触发后抑制紧随的 click，避免重复跳转
  const 拖拽阈值 = 24; // 触发跳转所需的最小垂直位移（px）
  const 拖拽死区 = 10; // 小于此位移视为未拖动（横向容差，避免轻微抖动误判）
  元素.滚动容器.addEventListener('scroll', 处理滚动, { passive: true });
  元素.滚动容器.addEventListener('wheel', 处理手动滚动, { passive: true });
  元素.滚动容器.addEventListener('touchstart', 取消滚动动画, { passive: true });
  元素.滚动容器.addEventListener('touchmove', 处理手动滚动, { passive: true });
  元素.滚动容器.addEventListener('mousedown', 处理正文按下);
  元素.滚动容器.addEventListener('pointerup', 处理非鼠标选择结束);
  元素.滚动容器.addEventListener('click', 处理高亮点击);
  元素.滚动容器.addEventListener('dblclick', 处理高亮双击);
  元素.滚动容器.addEventListener('pointerover', 处理高亮移入);
  元素.滚动容器.addEventListener('pointerout', 处理高亮移出);
  元素.滚动容器.addEventListener('pointerover', 处理正文行移入);
  元素.滚动容器.addEventListener('pointerout', 处理正文行移出);
  元素.滚动容器.addEventListener('contextmenu', 处理高亮上下文点击);
  元素.滚动容器.addEventListener('keyup', 处理正文键盘选择);
  元素.自动滚动按钮.addEventListener('mouseenter', 开始自动滚动);
  元素.自动滚动按钮.addEventListener('focus', 开始自动滚动);
  元素.自动滚动按钮.addEventListener('click', 切换全屏模式);
  元素.自动滚动按钮.addEventListener('mouseleave', 处理自动滚动按钮移出);
  元素.自动滚动按钮.addEventListener('blur', 处理自动滚动按钮失焦);
  元素.内容选择按钮.addEventListener('click', 打开内容选择弹窗);
  元素.关闭内容选择按钮.addEventListener('click', 关闭内容选择弹窗);
  元素.内容选择弹窗.addEventListener('click', 处理内容选择弹窗点击);
  元素.内容选择列表.addEventListener('click', 处理内容选择列表点击);
  元素.查找表单.addEventListener('submit', 处理查找提交);
  元素.查找输入框.addEventListener('input', 处理查找输入);
  元素.分析按钮.addEventListener('click', 处理词组分析);
  元素.关闭查找按钮.addEventListener('click', 关闭查找弹窗);
  元素.查找弹窗.addEventListener('click', 处理查找弹窗点击);
  元素.关键词面板开关.addEventListener('click', 处理面板开关);
  元素.关键词列表容器.addEventListener('click', 处理面板操作);
  元素.关闭上下文按钮.addEventListener('click', 关闭上下文弹窗);
  元素.上下文弹窗.addEventListener('click', 处理上下文弹窗点击);
  元素.上下文弹窗.addEventListener('close', 处理上下文弹窗关闭);
  元素.上下文列表.addEventListener('click', 处理上下文行点击);
  元素.上下文列表.addEventListener('scroll', 处理上下文滚动, {
    passive: true,
  });
  元素.关闭词频按钮.addEventListener('click', 关闭词频弹窗);
  元素.词频弹窗.addEventListener('click', 处理词频弹窗点击);
  元素.词频标签栏.addEventListener('click', 处理词频标签点击);
  元素.词频标签栏.addEventListener('keydown', 处理词频标签键盘);
  元素.词频上一页.addEventListener('click', function 显示上一页词频() {
    当前词频页码 -= 1;
    渲染词频页();
  });
  元素.词频下一页.addEventListener('click', function 显示下一页词频() {
    当前词频页码 += 1;
    渲染词频页();
  });
  元素.关闭字体按钮.addEventListener('click', 关闭字体弹窗);
  元素.字体遮罩.addEventListener('click', 关闭字体弹窗);
  元素.字体关闭底部按钮.addEventListener('click', 关闭字体弹窗);
  元素.字体重置按钮.addEventListener('click', 重置字体设置);
  元素.字号控制.addEventListener('wheel', 处理字号滚轮, { passive: false });
  元素.字号控制.addEventListener('click', () => 调整字号(默认字号));
  元素.字号控制.addEventListener('mouseenter', 进入字号调节);
  元素.字号控制.addEventListener('mouseleave', 离开字号调节);
  元素.行距控制.addEventListener('wheel', 处理行距滚轮, { passive: false });
  // 点击恢复默认行距（= 当前字号，即 1.0 倍行距）
  元素.行距控制.addEventListener('click', () => 调整行高(状态.字号));
  元素.行距控制.addEventListener('mouseenter', 进入行距调节);
  元素.行距控制.addEventListener('mouseleave', 离开行距调节);
  元素.字体标签引号内.addEventListener('click', () => 切换字体标签('引号内'));
  元素.字体标签引号外.addEventListener('click', () => 切换字体标签('引号外'));
  元素.字体标签全部.addEventListener('click', () => 切换字体标签('全部'));
  元素.字体标签关键词.addEventListener('click', () => 切换字体标签('关键词'));
  元素.字体标签奇偶行.addEventListener('click', () => 切换字体标签('奇偶行'));
  元素.引文背景色开关.addEventListener('change', function 切换引文背景色() {
    设置引文背景色(元素.引文背景色开关.checked);
  });
  元素.奇数引文颜色选择器.addEventListener(
    'input',
    function 切换奇数引文背景色() {
      设置引文背景颜色('奇数', 元素.奇数引文颜色选择器.value);
    },
  );
  元素.偶数引文颜色选择器.addEventListener(
    'input',
    function 切换偶数引文背景色() {
      设置引文背景颜色('偶数', 元素.偶数引文颜色选择器.value);
    },
  );
  元素.引文边框开关.addEventListener('change', function 切换引文边框() {
    设置引文边框显示(元素.引文边框开关.checked);
  });
  元素.关键词颜色选择器.addEventListener('input', function 切换关键词颜色() {
    设置关键词颜色(元素.关键词颜色选择器.value);
  });
  元素.字体颜色选择器.addEventListener('input', function 切换字体颜色() {
    if (当前字体标签 === '全部') {
      设置区域颜色('引号内', 元素.字体颜色选择器.value, { 静默: true });
      设置区域颜色('引号外', 元素.字体颜色选择器.value);
      return;
    }
    设置区域颜色(当前字体标签, 元素.字体颜色选择器.value);
  });
  元素.奇数行颜色选择器.addEventListener('input', function 切换奇数行颜色() {
    设置奇偶行颜色('奇数', 元素.奇数行颜色选择器.value);
  });
  元素.偶数行颜色选择器.addEventListener('input', function 切换偶数行颜色() {
    设置奇偶行颜色('偶数', 元素.偶数行颜色选择器.value);
  });
  元素.奇偶行左侧边框开关.addEventListener(
    'change',
    function 切换奇偶行左侧边框() {
      设置奇偶行左侧边框显示(元素.奇偶行左侧边框开关.checked);
    },
  );
  元素.字体粗细按钮.addEventListener('click', 处理字体粗细按钮点击);
  元素.字体粗细按钮.addEventListener('wheel', 处理字体粗细滚轮, {
    passive: false,
  });
  元素.字体选项列表.addEventListener('click', 处理字体选项点击);
  元素.自定义滚动条.addEventListener('pointerdown', 处理滚动条按下);
  元素.自定义滚动条.addEventListener('pointermove', 处理滚动条拖动);
  元素.自定义滚动条.addEventListener('pointerup', 结束滚动条拖动);
  元素.自定义滚动条.addEventListener('pointercancel', 结束滚动条拖动);
  元素.自定义滚动条.addEventListener('wheel', 处理滚动条滚轮, {
    passive: false,
  });
  元素.自定义滚动条.addEventListener('keydown', 处理滚动条键盘);
  元素.滚动进度.addEventListener('pointerdown', 处理滚动进度按下);
  元素.滚动进度.addEventListener('pointermove', 处理滚动进度拖动);
  元素.滚动进度.addEventListener('pointerup', 结束滚动进度拖动);
  元素.滚动进度.addEventListener('pointercancel', 结束滚动进度拖动);
  window.addEventListener('mouseup', 处理鼠标选择结束);
  window.addEventListener('mousemove', 处理鼠标移动, { passive: true });
  window.addEventListener('wheel', 处理自动滚动滚轮, {
    capture: true,
    passive: false,
  });
  window.addEventListener('blur', 取消交互状态);
  window.addEventListener('keydown', 处理键盘按下);
  window.addEventListener('keyup', 处理键盘松开);
  // Shift 按住期间发生鼠标按下（如 Shift+点击命中词）→ 标记为组合，松开时不切换自动滚动
  window.addEventListener('mousedown', () => {
    if (shift按住中) {
      shift期间有其他交互 = true;
    }
  });
  window.addEventListener('pagehide', 保存持久化状态);

  // 右下角控件悬停热区（鼠标 / 触摸）与键盘聚焦时显示
  window.addEventListener('mousemove', 处理右下控件悬停, { passive: true });
  window.addEventListener('touchstart', 处理右下控件触摸, { passive: true });
  for (const 控件 of [
    元素.自动滚动按钮,
    元素.关键词面板开关,
    元素.内容选择按钮,
  ]) {
    if (!控件) {
      continue;
    }
    控件.addEventListener('focus', function () {
      右下聚焦 = true;
      刷新右下控件可见性();
    });
    控件.addEventListener('blur', function () {
      右下聚焦 = false;
      刷新右下控件可见性();
    });
  }

  // 「关键词手势」：单击/双击/上下拖拽（pointer 统一鼠标/触摸/笔）
  // 单击=下一个 / 双击=上一个 / 向上拖=第一个 / 向下拖=最后一个
  元素.滚动容器.addEventListener('pointerdown', 处理关键词手势开始);
  window.addEventListener('pointermove', 处理关键词手势移动, {
    passive: false,
  });
  元素.滚动容器.addEventListener('touchmove', 处理关键词触摸移动, {
    passive: false,
  });
  document.addEventListener('selectstart', 处理关键词选择阻止, {
    passive: false,
  });
  window.addEventListener('pointerup', 处理关键词手势松开);
  window.addEventListener('pointercancel', 处理关键词手势取消);

  function 处理滚动() {
    if (状态.拖选状态) {
      if (元素.滚动容器.scrollTop !== 状态.拖选状态.滚动位置) {
        元素.滚动容器.scrollTop = 状态.拖选状态.滚动位置;
        状态.拖选状态.已阻止滚动 = true;
      }
      return;
    }

    if (自动滚动状态 || 状态.滚动帧) {
      return;
    }

    状态.滚动帧 = requestAnimationFrame(function 更新滚动状态() {
      状态.滚动帧 = 0;
      if (自动滚动状态) {
        return;
      }
      更新滚动块();
      渲染可见行();
      安排保存持久化状态();
    });
  }

  function 处理正文按下(事件) {
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

  function 处理鼠标选择结束() {
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

  function 处理非鼠标选择结束(事件) {
    if (事件.pointerType !== 'mouse') {
      window.setTimeout(读取选择关键词);
    }
  }

  function 取消交互状态() {
    停止自动滚动('窗口失去焦点');
    状态.拖选状态 = null;
    关键词手势 = null;
    document.body.classList.remove('关键词手势中');
    Ctrl按键状态 = null;
    滚动块拖动状态 = null;
    元素.自定义滚动条.classList.remove('拖动中');
    滚动进度拖动状态 = null;
    元素.滚动进度.classList.remove('拖动中');
  }

  function 处理滚动条按下(事件) {
    if (事件.button !== 0) {
      return;
    }
    事件.preventDefault();
    取消滚动动画();
    结束跳转会话('拖动滚动条');

    const 滚动块边框 = 元素.滚动块.getBoundingClientRect();
    const 点在滚动块内 = 元素.滚动块.contains(事件.target);
    滚动块拖动状态 = {
      pointerId: 事件.pointerId,
      块内偏移: 点在滚动块内
        ? 事件.clientY - 滚动块边框.top
        : 滚动块边框.height / 2,
    };
    元素.自定义滚动条.setPointerCapture(事件.pointerId);
    元素.自定义滚动条.classList.add('拖动中');
    根据指针滚动(事件.clientY);
  }

  function 处理滚动条拖动(事件) {
    if (滚动块拖动状态?.pointerId !== 事件.pointerId) {
      return;
    }
    事件.preventDefault();
    根据指针滚动(事件.clientY);
  }

  function 结束滚动条拖动(事件) {
    if (滚动块拖动状态?.pointerId !== 事件.pointerId) {
      return;
    }
    滚动块拖动状态 = null;
    元素.自定义滚动条.classList.remove('拖动中');
    if (元素.自定义滚动条.hasPointerCapture(事件.pointerId)) {
      元素.自定义滚动条.releasePointerCapture(事件.pointerId);
    }
  }

  function 处理滚动进度按下(事件) {
    if (事件.button !== 0) {
      return;
    }
    事件.preventDefault();
    取消滚动动画();
    结束跳转会话('拖动进度');

    const 进度边框 = 元素.滚动进度.getBoundingClientRect();
    滚动进度拖动状态 = {
      pointerId: 事件.pointerId,
      块内偏移: 事件.clientY - 进度边框.top,
    };
    元素.滚动进度.setPointerCapture(事件.pointerId);
    元素.滚动进度.classList.add('拖动中');
    根据指针滚动(事件.clientY);
  }

  function 处理滚动进度拖动(事件) {
    if (滚动进度拖动状态?.pointerId !== 事件.pointerId) {
      return;
    }
    事件.preventDefault();
    根据指针滚动(事件.clientY);
  }

  function 结束滚动进度拖动(事件) {
    if (滚动进度拖动状态?.pointerId !== 事件.pointerId) {
      return;
    }
    滚动进度拖动状态 = null;
    元素.滚动进度.classList.remove('拖动中');
    if (元素.滚动进度.hasPointerCapture(事件.pointerId)) {
      元素.滚动进度.releasePointerCapture(事件.pointerId);
    }
  }

  function 处理滚动条滚轮(事件) {
    事件.preventDefault();
    取消滚动动画();
    结束跳转会话('滚轮滚动');
    const 滚动单位 =
      事件.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 状态.行高
        : 事件.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? 元素.滚动容器.clientHeight
          : 1;
    元素.滚动容器.scrollTop += 事件.deltaY * 滚动单位;
  }

  function 处理滚动条键盘(事件) {
    const 最大滚动位置 =
      元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight;
    const 键盘滚动表 = {
      ArrowUp: -状态.行高,
      ArrowDown: 状态.行高,
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
    取消滚动动画();
    结束跳转会话('滚动条键盘滚动');
    元素.滚动容器.scrollTop =
      滚动量 === -Infinity
        ? 0
        : 滚动量 === Infinity
          ? 最大滚动位置
          : 元素.滚动容器.scrollTop + 滚动量;
  }

  function 根据指针滚动(指针Y) {
    const 块内偏移 =
      滚动块拖动状态?.块内偏移 ?? 滚动进度拖动状态?.块内偏移 ?? 0;
    const 轨道边框 = 元素.自定义滚动条.getBoundingClientRect();
    const 滚动块高度 = 元素.滚动块.offsetHeight;
    const 最大块偏移 = 轨道边框.height - 滚动块高度;
    const 最大滚动位置 =
      元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight;
    if (最大块偏移 <= 0 || 最大滚动位置 <= 0) {
      return;
    }
    const 块偏移 = Math.min(
      最大块偏移,
      Math.max(0, 指针Y - 轨道边框.top - 块内偏移),
    );
    元素.滚动容器.scrollTop = (块偏移 / 最大块偏移) * 最大滚动位置;
  }

  function 处理正文键盘选择(事件) {
    if (事件.key.startsWith('Arrow')) {
      读取选择关键词();
    }
  }

  let shift按住中 = false; // 当前是否处于「Shift 被按住」状态
  let shift期间有其他交互 = false; // Shift 按住期间是否出现过其它按键或鼠标点击（区分单独 Shift 与组合）
  let shift最后松开时间 = 0; // 最近一次「干净」Shift 松开的时间戳（performance.now），用于双击判定
  let 待导航参数 = null; // Ctrl 导航待执行参数：Ctrl 先于其它修饰键松开时，推迟到「全部松开」再跳转

  // ===== 语音翻页：监听「语音翻页」语义事件（由 语音订阅.js 在识别到
  // 「上一页 / 下一页」指令时派发），立即同步翻页，无需任何手动确认。
  // 映射：上一页 → 向后翻（回到上一屏）；下一页 → 向前翻（下一屏）。
  function 翻页整屏(向上) {
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

  function 处理语音翻页(事件) {
    const 指令 = 事件.detail && 事件.detail.指令;
    if (指令 !== '上一页' && 指令 !== '下一页') {
      return;
    }
    if (!状态.行起点列表.length) {
      // 正文尚未载入时不执行翻页，避免给出错误反馈
      console.info('[阅读器] 语音翻页被忽略', { 原因: '正文未载入', 指令 });
      return;
    }
    // 上一页 = 向后翻（回到上一屏，向上）；下一页 = 向前翻（下一屏，向下）
    document.body.classList.add('自动滚动中');
    翻页整屏(指令 === '上一页');
    // 回传当前页码，确保语音指令与导航状态一致、可见
    try {
      const 视口行数 = Math.max(
        1,
        Math.floor(元素.滚动容器.clientHeight / 状态.行高),
      );
      const 当前行idx = Math.round(元素.滚动容器.scrollTop / 状态.行高);
      const 最大顶部行idx = Math.round(
        (元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight) / 状态.行高,
      );
      const 当前页 = Math.floor(当前行idx / 视口行数) + 1;
      const 总页 = Math.max(1, Math.floor(最大顶部行idx / 视口行数) + 1);
      window.dispatchEvent(
        new CustomEvent('语音翻页完成', {
          detail: { 指令, 当前页, 总页 },
        }),
      );
    } catch {
      /* 回传失败不影响翻页 */
    }
  }

  window.addEventListener('语音翻页', 处理语音翻页);

  function 处理语音自动滚动(事件) {
    const 指令 = 事件.detail && 事件.detail.指令;
    if (指令 !== '快' && 指令 !== '慢') {
      return;
    }
    执行自动滚动翻页(指令 === '慢', `语音“${指令}”`);
  }

  window.addEventListener('语音自动滚动', 处理语音自动滚动);

  function 处理键盘按下(事件) {
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
      // 2) 若 Ctrl 导航已激活（Ctrl 先按），把方向改为「向上」（上一个）。
      // 注：本机 Ctrl↔Win 对调，物理 Ctrl 以 Meta 形式送达，故同时检查 ctrlKey/metaKey。
      if (事件.ctrlKey || 事件.metaKey) {
        shift期间有其他交互 = true;
        if (Ctrl按键状态) {
          Ctrl按键状态.向上 = true;
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
      if (自动滚动状态) {
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

    // 右方向键：直接开启自动滚动（作为 Space / Shift+Space 整屏翻页之外的另一种启动入口）。
    if (
      事件.key === 'ArrowRight' &&
      !事件.altKey &&
      !事件.ctrlKey &&
      !事件.metaKey &&
      !事件.shiftKey &&
      !是交互目标 &&
      !有弹窗打开() &&
      状态.行起点列表.length
    ) {
      事件.preventDefault();
      if (!自动滚动状态) {
        开始自动滚动();
      }
      return;
    }

    const 是翻页按键 = 事件.code === 'Space' || 事件.key === 'Enter';

    if (
      是翻页按键 &&
      !事件.altKey &&
      !事件.ctrlKey &&
      !事件.metaKey &&
      可快速前进自动滚动 &&
      自动滚动状态
    ) {
      事件.preventDefault();
      if (!事件.repeat) {
        执行自动滚动翻页(
          事件.shiftKey,
          事件.shiftKey
            ? 事件.key === 'Enter'
              ? 'Shift + Enter'
              : 'Shift + Space'
            : 事件.key === 'Enter'
              ? 'Enter'
              : 'Space',
        );
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
      翻页整屏(事件.shiftKey);
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

  function 处理键盘松开(事件) {
    // 若上一轮 Ctrl 已先松开、当前正松开的是最后一个修饰键，则此刻才真正跳转
    尝试执行待导航(事件);

    // 双击 Shift（两次连续、各自「干净」的按下-松开，间隔在窗口内）→ 切换自动滚动。
    // 单次 Shift 松开只记录时间戳，不触发，避免误触；第二次在阈值内松开才启动/停止。
    if (事件.key === 'Shift' && !事件.altKey) {
      if (shift按住中 && !shift期间有其他交互) {
        const 现在 = performance.now();
        if (现在 - shift最后松开时间 <= shift双击中阈值) {
          if (自动滚动状态) {
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

    // 若松开 Ctrl 时仍有其它修饰键（Shift / 物理 Win / Alt）按住，
    // 暂不跳转，等「全部松开」的那一刻再生效（避免先放开 Ctrl 就提前跳）。
    if (事件.shiftKey || 事件.ctrlKey || 事件.altKey) {
      待导航参数 = 本次按键状态;
      return;
    }

    执行导航跳转(本次按键状态);
  }

  function 执行导航跳转(按键状态, 选项 = {}) {
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

  function 处理高亮上下文点击(事件) {
    if (事件.altKey || 事件.metaKey || 事件.ctrlKey) {
      事件.preventDefault();
      处理高亮点击(事件);
    }
  }

  function 处理高亮点击(事件) {
    // 拖拽手势已触发跳转，抑制随后派发的 click，避免再前进一格
    if (点击抑制) {
      点击抑制 = false;
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
    if ((事件.ctrlKey || 事件.metaKey) && typeof Ctrl按键状态 !== 'undefined') {
      Ctrl按键状态 = null;
      if (typeof 待导航参数 !== 'undefined') {
        待导航参数 = null;
      }
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
  function 处理高亮双击(事件) {
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

  function 处理高亮移入(事件) {
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

  function 处理高亮移出(事件) {
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

  function 处理正文行移入(事件) {
    if (事件.pointerType && 事件.pointerType !== 'mouse') {
      return;
    }
    const 行元素 = 事件.target.closest('.正文行');
    if (!行元素 || !元素.可见内容.contains(行元素)) {
      return;
    }
    const 原行元素 = 事件.relatedTarget?.closest?.('.正文行');
    if (原行元素 === 行元素) {
      return;
    }
    切换逻辑行悬停(Number(行元素.dataset.logicalLine));
  }

  function 处理正文行移出(事件) {
    if (事件.pointerType && 事件.pointerType !== 'mouse') {
      return;
    }
    const 行元素 = 事件.target.closest('.正文行');
    if (!行元素 || !元素.可见内容.contains(行元素)) {
      return;
    }
    if (事件.relatedTarget?.closest?.('.正文行')) {
      return;
    }
    切换逻辑行悬停(null);
  }

  function 切换逻辑行悬停(逻辑行idx) {
    状态.悬停逻辑行idx = 逻辑行idx;
    for (const 行元素 of 元素.可见内容.querySelectorAll('.正文行')) {
      行元素.classList.toggle(
        '逻辑行悬停',
        逻辑行idx !== null && Number(行元素.dataset.logicalLine) === 逻辑行idx,
      );
    }
  }

  function 切换同组高亮(关键词id, 命中idx) {
    const 旧悬停id = 状态.悬停关键词id;
    状态.悬停关键词id = 关键词id;
    状态.悬停命中idx = 命中idx;
    for (const 命中元素 of 元素.可见内容.querySelectorAll('.字.命中')) {
      const 是悬停关键词 = Number(命中元素.dataset.keywordId) === 关键词id;
      命中元素.classList.toggle('同组悬停', 是悬停关键词);
      命中元素.classList.toggle(
        '悬停命中',
        是悬停关键词 && Number(命中元素.dataset.hitIndex) === 命中idx,
      );
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

  function 悬停影响指示器(悬停id) {
    return 悬停id !== null && 悬停id !== 状态.当前关键词id;
  }

  function 打开查找弹窗() {
    if (!元素.查找弹窗.open) {
      元素.查找弹窗.showModal();
    }
    清除查找错误();
    requestAnimationFrame(function 聚焦查找输入框() {
      元素.查找输入框.focus();
      元素.查找输入框.select();
    });
  }

  function 关闭查找弹窗() {
    if (!元素.查找弹窗.open) {
      return;
    }
    元素.查找弹窗.close();
    元素.滚动容器.focus({ preventScroll: true });
  }

  function 处理查找弹窗点击(事件) {
    if (事件.target === 元素.查找弹窗) {
      关闭查找弹窗();
    }
  }

  function 打开词频弹窗() {
    if (!元素.词频弹窗.open) {
      元素.词频弹窗.showModal();
    }
    if (状态.词频分析) {
      渲染词频页();
      return;
    }
    if (!状态.文件名) {
      元素.词频摘要.textContent = '正文尚未载入';
      return;
    }

    元素.词频摘要.textContent = '正在统计全文';
    元素.词频列表.replaceChildren();
    元素.单字重复列表.replaceChildren();
    元素.单字一次列表.replaceChildren();
    元素.词频分页.hidden = true;
    requestAnimationFrame(function 分析全文词频() {
      const 开始时间 = performance.now();
      状态.词频分析 = 统计全文词频(状态.文本);
      当前词频页码 = 1;
      渲染词频页();
      console.info('[阅读器] 词频分析完成', {
        汉字总数: 状态.词频分析.汉字总数,
        去重汉字数: 状态.词频分析.去重汉字数,
        单字种数: 状态.词频分析.列表[1].length,
        二字种数: 状态.词频分析.列表[2].length,
        三字种数: 状态.词频分析.列表[3].length,
        四字种数: 状态.词频分析.列表[4].length,
        五字种数: 状态.词频分析.列表[5].length,
        六字种数: 状态.词频分析.列表[6].length,
        只出现一次单字数: 状态.词频分析.单字列表.一次.length,
        耗时毫秒: Math.round(performance.now() - 开始时间),
      });
    });
  }

  function 关闭词频弹窗() {
    if (!元素.词频弹窗.open) {
      return;
    }
    元素.词频弹窗.close();
    元素.滚动容器.focus({ preventScroll: true });
  }

  function 处理词频弹窗点击(事件) {
    if (事件.target === 元素.词频弹窗) {
      关闭词频弹窗();
    }
  }

  function 处理词频标签点击(事件) {
    const 标签 = 事件.target.closest('.词频标签');
    if (!(标签 instanceof HTMLButtonElement)) {
      return;
    }
    切换词频字数(Number(标签.dataset.字数));
  }

  function 处理词频标签键盘(事件) {
    if (事件.key !== 'ArrowLeft' && 事件.key !== 'ArrowRight') {
      return;
    }
    const 标签列表 = [...元素.词频标签栏.querySelectorAll('.词频标签')];
    const 当前idx = 标签列表.indexOf(事件.target);
    if (当前idx === -1) {
      return;
    }
    事件.preventDefault();
    const 步进 = 事件.key === 'ArrowRight' ? 1 : -1;
    const 目标标签 =
      标签列表[(当前idx + 步进 + 标签列表.length) % 标签列表.length];
    切换词频字数(Number(目标标签.dataset.字数));
    目标标签.focus();
  }

  function 切换词频字数(字数) {
    当前词频字数 = 字数;
    当前词频页码 = 1;
    元素.单字双列表.hidden = 字数 !== 1;
    元素.词频表格容器.hidden = 字数 === 1;
    for (const 标签 of 元素.词频标签栏.querySelectorAll('.词频标签')) {
      const 是当前 = Number(标签.dataset.字数) === 字数;
      标签.classList.toggle('当前', 是当前);
      标签.setAttribute('aria-selected', String(是当前));
      标签.tabIndex = 是当前 ? 0 : -1;
    }
    渲染词频页();
  }

  function 渲染词频页() {
    const 分析 = 状态.词频分析;
    if (!分析) {
      return;
    }
    const 是单字 = 当前词频字数 === 1;
    const 统计列表 = 是单字 ? 分析.单字列表.重复 : 分析.列表[当前词频字数];
    const 最长列表数 = 是单字
      ? Math.max(统计列表.length, 分析.单字列表.一次.length)
      : 统计列表.length;
    const 总页数 = Math.max(1, Math.ceil(最长列表数 / 每页词频数));
    当前词频页码 = Math.min(总页数, Math.max(1, 当前词频页码));
    const 起点 = (当前词频页码 - 1) * 每页词频数;
    if (是单字) {
      元素.单字重复列表.replaceChildren(创建词频表格片段(统计列表, 起点));
      元素.单字一次列表.replaceChildren(
        创建词频表格片段(分析.单字列表.一次, 起点),
      );
    } else {
      元素.词频列表.replaceChildren(创建词频表格片段(统计列表, 起点));
    }

    const 统计说明 = 是单字
      ? `${分析.单字列表.一次.length.toLocaleString('zh-CN')} 个字只出现一次`
      : `${统计列表.length.toLocaleString('zh-CN')} 种${['二', '三', '四', '五', '六'][当前词频字数 - 2]}字组合`;
    元素.词频摘要.textContent = `${分析.去重汉字数.toLocaleString('zh-CN')} 个汉字 · ${统计说明}`;
    元素.词频页码.textContent = `${当前词频页码.toLocaleString('zh-CN')} / ${总页数.toLocaleString('zh-CN')}`;
    元素.词频上一页.disabled = 当前词频页码 === 1;
    元素.词频下一页.disabled = 当前词频页码 === 总页数;
    元素.词频分页.hidden = 总页数 === 1;
    (是单字 ? 元素.单字双列表 : 元素.词频表格容器).scrollTop = 0;

    function 创建词频表格片段(列表, 起点) {
      const 表格片段 = document.createDocumentFragment();
      const 本页列表 = 列表.slice(起点, 起点 + 每页词频数);
      for (const [idx, 统计项] of 本页列表.entries()) {
        const 行 = document.createElement('tr');
        const 排名单元格 = document.createElement('td');
        const 字词单元格 = document.createElement('td');
        const 频次单元格 = document.createElement('td');
        排名单元格.textContent = (起点 + idx + 1).toLocaleString('zh-CN');
        字词单元格.textContent = 统计项.文本;
        频次单元格.textContent = 统计项.数量.toLocaleString('zh-CN');
        行.append(排名单元格, 字词单元格, 频次单元格);
        表格片段.append(行);
      }
      return 表格片段;
    }
  }

  function 统计全文词频(全文) {
    const 词频映射 = Array.from({ length: 7 }, function 创建词频映射() {
      return new Map();
    });
    const 连续汉字 = [];
    let 汉字总数 = 0;
    let 文本位置 = 0;

    for (const 字 of 全文) {
      if (!汉字模式.test(字)) {
        连续汉字.length = 0;
        文本位置 += 字.length;
        continue;
      }
      汉字总数 += 1;
      连续汉字.push({ 字, 位置: 文本位置 });
      if (连续汉字.length > 6) {
        连续汉字.shift();
      }
      for (let 字数 = 1; 字数 <= 连续汉字.length; 字数 += 1) {
        const 起点 = 连续汉字.length - 字数;
        const 字词 = 连续汉字
          .slice(起点)
          .map(function 读取汉字(项) {
            return 项.字;
          })
          .join('');
        记录词频(词频映射[字数], 字词, 连续汉字[起点].位置);
      }
      文本位置 += 字.length;
    }

    const 被更长组合覆盖 = Array.from({ length: 7 }, function 创建覆盖集合() {
      return new Set();
    });
    for (let 字数 = 2; 字数 <= 5; 字数 += 1) {
      for (const [更长文本, 更长统计] of 词频映射[字数 + 1]) {
        const 更长汉字 = [...更长文本];
        for (const 起点 of [0, 1]) {
          const 短文本 = 更长汉字.slice(起点, 起点 + 字数).join('');
          const 短统计 = 词频映射[字数].get(短文本);
          if (短统计.数量 === 更长统计.数量) {
            被更长组合覆盖[字数].add(短文本);
          }
        }
      }
    }

    const 列表 = {};
    for (const 字数 of [1, 2, 3, 4, 5, 6]) {
      列表[字数] = [...词频映射[字数]]
        .map(function 转换词频项([文本, 统计]) {
          return { 文本, 数量: 统计.数量, 首次位置: 统计.首次位置 };
        })
        .filter(function 筛选重复词组(项) {
          return (
            字数 === 1 || (项.数量 > 1 && !被更长组合覆盖[字数].has(项.文本))
          );
        })
        .sort(function 排序词频(左项, 右项) {
          return 右项.数量 - 左项.数量 || 左项.首次位置 - 右项.首次位置;
        });
    }
    const 单字列表 = {
      重复: 列表[1].filter(function 筛选重复单字(项) {
        return 项.数量 > 1;
      }),
      一次: 列表[1].filter(function 筛选只出现一次的单字(项) {
        return 项.数量 === 1;
      }),
    };
    return {
      汉字总数,
      去重汉字数: 词频映射[1].size,
      列表,
      单字列表,
    };

    function 记录词频(映射, 字词, 首次位置) {
      const 已有统计 = 映射.get(字词);
      if (已有统计) {
        已有统计.数量 += 1;
        return;
      }
      映射.set(字词, { 数量: 1, 首次位置 });
    }
  }

  function 处理查找提交(事件) {
    事件.preventDefault();
    const 关键词文本 = 元素.查找输入框.value.trim();
    if (!关键词文本) {
      显示查找错误('请输入关键词');
      return;
    }
    if (!状态.文件名) {
      显示查找错误('正文尚未载入');
      return;
    }

    let 关键词 = 状态.关键词列表.find(function 找到相同关键词(已有关键词) {
      return 已有关键词.文本 === 关键词文本;
    });
    const 命中位置 = 关键词?.命中位置 ?? 查找关键词命中(关键词文本);
    if (!命中位置.length) {
      显示查找错误('未找到该关键词');
      console.info('[阅读器] 查找无匹配', { 关键词: 关键词文本 });
      return;
    }

    关键词 ??= 创建关键词标记(关键词文本, 命中位置);
    关闭查找弹窗();
    跳到命中(关键词, 0);
  }

  function 处理词组分析() {
    const 前缀 = 元素.查找输入框.value.trim();
    if (!前缀) {
      清空分析结果();
      显示查找错误('请输入前缀');
      return;
    }
    if (!状态.文件名) {
      清空分析结果();
      显示查找错误('正文尚未载入');
      return;
    }

    清除查找错误();
    元素.分析按钮.disabled = true;
    元素.分析按钮.setAttribute('aria-busy', 'true');
    元素.分析按钮.textContent = '分析中';
    requestAnimationFrame(function 分析正文词组() {
      const 开始时间 = performance.now();
      try {
        const 命中位置 = 查找关键词命中(前缀);
        if (!命中位置.length) {
          清空分析结果();
          显示查找错误('未找到该前缀');
          console.info('[阅读器] 前缀分析无匹配', { 前缀 });
          return;
        }

        const 词组数量 = new Map();
        for (const 文本偏移 of 命中位置) {
          const 词组 = 提取词组(文本偏移);
          词组数量.set(词组, (词组数量.get(词组) ?? 0) + 1);
        }
        const 统计列表 = [...词组数量]
          .map(function 转换统计项([词组, 数量]) {
            return { 词组, 数量 };
          })
          .sort(function 排序统计项(左项, 右项) {
            return (
              右项.数量 - 左项.数量 ||
              左项.词组.localeCompare(右项.词组, 'zh-CN')
            );
          });
        渲染分析结果(统计列表, 命中位置.length);

        console.info('[阅读器] 前缀分析完成', {
          前缀,
          词组数: 统计列表.length,
          命中数: 命中位置.length,
          耗时毫秒: Math.round(performance.now() - 开始时间),
        });
      } finally {
        元素.分析按钮.disabled = false;
        元素.分析按钮.removeAttribute('aria-busy');
        元素.分析按钮.textContent = '分析';
      }
    });

    function 提取词组(文本偏移) {
      const 上下文 = 状态.文本.slice(文本偏移, 文本偏移 + 前缀.length + 64);
      const 前缀终点 = 前缀.length;
      let 词组终点 = 前缀终点;
      for (const 片段 of 词组分段器.segment(上下文)) {
        const 片段终点 = 片段.index + 片段.segment.length;
        if (片段终点 <= 前缀终点) {
          continue;
        }
        if (
          片段.index < 前缀终点 ||
          (片段.index === 前缀终点 && 片段.isWordLike)
        ) {
          词组终点 = 片段终点;
        }
        break;
      }
      return 上下文.slice(0, 词组终点);
    }

    function 渲染分析结果(统计列表, 命中总数) {
      const 表格片段 = document.createDocumentFragment();
      for (const 统计项 of 统计列表) {
        const 行 = document.createElement('tr');
        const 词组单元格 = document.createElement('td');
        const 数量单元格 = document.createElement('td');
        词组单元格.textContent = 统计项.词组;
        数量单元格.textContent = 统计项.数量.toLocaleString('zh-CN');
        行.append(词组单元格, 数量单元格);
        表格片段.append(行);
      }
      元素.分析结果摘要.textContent = `${统计列表.length} 个词组 · ${命中总数.toLocaleString('zh-CN')} 次出现`;
      元素.分析结果列表.replaceChildren(表格片段);
      元素.分析结果.hidden = false;
    }
  }

  function 处理查找输入() {
    清除查找错误();
    清空分析结果();
  }

  function 显示查找错误(文字) {
    元素.查找反馈.textContent = 文字;
    元素.查找输入框.setAttribute('aria-invalid', 'true');
    元素.查找输入框.focus();
  }

  function 清空分析结果() {
    元素.分析结果.hidden = true;
    元素.分析结果摘要.textContent = '';
    元素.分析结果列表.replaceChildren();
  }

  function 清除查找错误() {
    元素.查找反馈.textContent = '';
    元素.查找输入框.removeAttribute('aria-invalid');
  }

  function 开始自动滚动() {
    if (自动滚动状态) {
      return;
    }

    const 最大滚动位置 =
      元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight;
    if (元素.滚动容器.scrollTop >= 最大滚动位置 - 0.5) {
      console.info('[阅读器] 自动滚动未启动', { 原因: '已到文末' });
      return;
    }

    取消滚动动画();
    结束跳转会话('自动滚动');
    自动滚动状态 = {
      帧: 0,
      上帧时间: performance.now(),
      上次界面时间: 0,
      当前速度: 0,
      浮点位置: 元素.滚动容器.scrollTop,
      快速滚动终点: null,
      快速滚动方向: 0,
      衔接位置: null,
      停留结束时间: 0,
      衔接线已淡出: false,
      密度目标速度: 状态.自动滚动速度,
      // 滚动中画布高度不变，避免在每一帧读取布局尺寸触发同步重排。
      最大滚动位置: Math.max(
        0,
        元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight,
      ),
    };
    自动滚动状态.帧 = requestAnimationFrame(执行自动滚动);
    更新自动滚动按钮(true);
    document.body.classList.add('自动滚动中');
    console.info('[阅读器] 自动滚动已启动', {
      速度: 状态.自动滚动速度,
    });
  }

  function 处理自动滚动按钮移出() {
    停止自动滚动('鼠标移出滚动按钮');
  }

  function 处理自动滚动按钮失焦() {
    if (!元素.自动滚动按钮.matches(':hover')) {
      停止自动滚动('滚动按钮失去焦点');
    }
  }

  async function 切换全屏模式(事件) {
    const 正在退出 = Boolean(document.fullscreenElement);
    const 全屏操作 = 正在退出
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    if (事件.detail > 0) {
      元素.自动滚动按钮.blur();
    }
    await 全屏操作;
    console.info(`[阅读器] 已${正在退出 ? '退出' : '进入'}全屏`);
  }

  function 快速前进自动滚动() {
    const 本次滚动 = 自动滚动状态;
    if (!本次滚动) {
      return;
    }

    const 最大滚动位置 =
      元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight;
    本次滚动.快速滚动终点 = Math.min(
      最大滚动位置,
      本次滚动.浮点位置 + 元素.滚动容器.clientHeight * 0.9,
    );
    本次滚动.快速滚动方向 = 1;
    本次滚动.衔接位置 = Math.min(
      元素.滚动容器.scrollHeight,
      本次滚动.浮点位置 + 元素.滚动容器.clientHeight,
    );
    本次滚动.衔接线已淡出 = false;
    本次滚动.当前速度 = 自动滚动快速速度;
    if (
      本次滚动.衔接位置 <
      本次滚动.快速滚动终点 + 元素.滚动容器.clientHeight
    ) {
      显示衔接线(本次滚动.衔接位置);
    }
    console.info('[阅读器] 自动滚动开始快速前进', {
      原速度: Math.round(状态.自动滚动速度),
      目标位置: Math.round(本次滚动.快速滚动终点),
    });
  }

  function 执行自动滚动翻页(向上, 来源) {
    if (!自动滚动状态) {
      console.info('[阅读器] 自动滚动指令被忽略', {
        原因: '自动滚动未运行',
        来源,
      });
      return;
    }
    if (向上) {
      调整自动滚动速度(0.9, 来源);
      向上翻半页并暂停自动滚动();
      return;
    }
    调整自动滚动速度(1.1, 来源);
    快速前进自动滚动();
  }

  function 向上翻半页并暂停自动滚动() {
    const 本次滚动 = 自动滚动状态;
    if (!本次滚动) {
      return;
    }

    const 起始位置 = 本次滚动.浮点位置;
    const 目标位置 = Math.max(0, 起始位置 - 元素.滚动容器.clientHeight * 0.5);
    本次滚动.快速滚动终点 = 目标位置;
    本次滚动.快速滚动方向 = -1;
    本次滚动.衔接位置 = 起始位置;
    本次滚动.衔接线已淡出 = false;
    本次滚动.当前速度 = -自动滚动快速速度;
    显示衔接线(本次滚动.衔接位置);
    console.info('[阅读器] 自动滚动开始向上翻半页', {
      起始位置: Math.round(起始位置),
      目标位置: Math.round(目标位置),
    });
  }

  function 调整自动滚动速度(速度因子, 来源) {
    const 原速度 = 状态.自动滚动速度;
    状态.自动滚动速度 = Math.max(
      自动滚动最低速度,
      Math.min(自动滚动最高速度, 原速度 * 速度因子),
    );
    更新自动滚动速度();
    安排保存持久化状态();
    console.info('[阅读器] 自动滚动速度已调整', {
      来源,
      原速度: Math.round(原速度),
      速度: Math.round(状态.自动滚动速度),
    });
  }

  function 处理自动滚动滚轮(事件) {
    // 滚轮发生在行距控件上时，交给行距滚轮处理（调整行距），不干扰自动滚动速度
    if (元素.行距控制 && 元素.行距控制.contains(事件.target)) {
      return;
    }
    if (!自动滚动状态) {
      return;
    }

    事件.preventDefault();
    事件.stopPropagation();
    const 滚轮像素 =
      事件.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 事件.deltaY * 40
        : 事件.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? Math.sign(事件.deltaY) * 元素.滚动容器.clientHeight
          : 事件.deltaY;

    // 非线性（指数曲线）映射：调整幅度与当前速度成正比，微小输入影响极小，
    // 避免滚轮抖动导致速度剧烈跳变；整体灵敏度较旧线性方案更低、节奏更慢。
    if (Math.abs(滚轮像素) < 自动滚动滚轮死区) {
      return;
    }
    const 归一化输入 = Math.max(-1, Math.min(1, 滚轮像素 / 自动滚动滚轮归一化));
    // 上滚（deltaY<0）→ 速度因子 >1 加速；下滚 → 因子 <1 减速
    const 速度因子 = Math.exp(自动滚动滚轮灵敏系数 * -归一化输入);
    状态.自动滚动速度 = Math.max(
      自动滚动最低速度,
      Math.min(自动滚动最高速度, 状态.自动滚动速度 * 速度因子),
    );
    更新自动滚动速度();
    安排保存持久化状态();
    console.info('[阅读器] 自动滚动速度已调整', {
      速度: Math.round(状态.自动滚动速度),
    });
  }

  function 处理鼠标移动() {
    if (自动滚动状态) {
      if (!元素.自动滚动按钮.matches(':hover')) {
        停止自动滚动('鼠标移动');
      }
      return;
    }
    // 非自动滚动时，移除空格翻页触发的光标隐藏
    document.body.classList.remove('自动滚动中');
  }

  // ===== 「关键词手势」 =====
  // 单击命中词 → 跳到该词的下一个出现；双击 → 跳到该词的上一个出现；
  // 向上拖拽 → 跳到该词的第一个出现；向下拖拽 → 跳到该词的最后一个出现
  // （普通前进不回绕，到首/末个即停；上下拖拽直达首/末个）。
  // 拖拽期间通过 CSS（body.关键词手势中 的 user-select:none）+
  // 阻止 touchmove/pointermove 默认行为 + 阻止 selectstart，确保绝不选中文字。
  function 处理关键词手势开始(事件) {
    关键词手势 = null; // 每次新按下先清空，避免上一轮残留
    document.body.classList.remove('关键词手势中');
    if (事件.button !== 0) {
      return;
    }
    const 字元素 = 事件.target.closest?.('.字');
    if (!字元素 || !字元素.classList.contains('命中')) {
      return;
    }
    if (事件.shiftKey || 事件.altKey || 事件.metaKey || 事件.ctrlKey) {
      return; // 修饰键组合交给既有逻辑，不介入
    }
    点击抑制 = false;
    关键词手势 = {
      关键词: 查找关键词(Number(字元素.dataset.keywordId)),
      命中idx: Number(字元素.dataset.hitIndex),
      起点Y: 事件.clientY,
      起点X: 事件.clientX,
      方向: null, // null=尚未拖动；'上'=第一个；'下'=最后一个
    };
  }

  function 处理关键词手势移动(事件) {
    if (!关键词手势 || 关键词手势.方向) {
      return;
    }
    const 偏移Y = 事件.clientY - 关键词手势.起点Y;
    const 偏移X = 事件.clientX - 关键词手势.起点X;
    // 横向拖动或位移过小 → 视为普通点击/双击，不进入手势
    if (Math.abs(偏移X) > Math.abs(偏移Y) || Math.abs(偏移Y) < 拖拽死区) {
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

  function 处理关键词触摸移动(事件) {
    // 触摸场景下仅手势进行中阻止滚动/选择（不影响正常触摸滚动）
    if (关键词手势?.方向 && 事件.cancelable) {
      事件.preventDefault();
    }
  }

  function 处理关键词选择阻止(事件) {
    if (关键词手势?.方向 && 事件.cancelable) {
      事件.preventDefault();
    }
  }

  function 处理关键词手势松开(事件) {
    if (!关键词手势) {
      return;
    }
    const 手势 = 关键词手势;
    关键词手势 = null;
    document.body.classList.remove('关键词手势中');
    if (!手势.方向 || !手势.关键词?.命中位置.length) {
      return; // 无方向 = 普通点击/双击，交还给 click/dblclick 处理
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
  }

  function 处理关键词手势取消() {
    关键词手势 = null;
    document.body.classList.remove('关键词手势中');
  }

  // 密度自适应目标速度：评估窗口整体下移视口高度的 自适应窗口下移比例（高度不变，
  // 忽略屏内顶部该比例内容、额外纳入屏外下方等量内容），把窗口覆盖文本范围内的
  // 句段负担，与「全文平均密度 × 窗口高度」的期望负担比较——实际负担越高（长句多、
  // 文字密）目标越低（慢读），越低（对话、短句、空白多）目标越高（快读）。
  // 窗口前瞻使调速在密度变化进入屏幕前就开始启动。二分 + 前缀和 O(log 段数)，
  // 修正因子夹在 [自适应密度因子下限, 自适应密度因子上限]，再按 自适应滚动强度
  // 做幂映射，保证「基准速度」仍是用户可预期的主导量（滚轮 / 快慢指令调整的正是它）。
  function 计算密度自适应目标速度(浮点位置, 容器高度 = null) {
    const 行数 = 状态.行起点列表.length;
    if (行数 === 0 || 状态.句段起点列表.length === 0) {
      return 状态.自动滚动速度;
    }
    const 视口高度 = 容器高度 ?? 元素.滚动容器.clientHeight;
    const 窗口起点位置 = 浮点位置 + 视口高度 * 自适应窗口下移比例;
    const 窗口起始行idx = Math.max(
      0,
      Math.min(行数 - 1, Math.floor(窗口起点位置 / 状态.行高)),
    );
    const 视口行数 = Math.max(1, Math.ceil(视口高度 / 状态.行高) + 1);
    const 结束行idx = Math.min(行数, 窗口起始行idx + 视口行数);
    const 视口起点 = 状态.行起点列表[窗口起始行idx];
    const 视口终点 = 状态.行终点列表[结束行idx - 1];
    const 段起点idx = 二分句段起点(视口起点);
    const 段终点idx = 二分句段起点(视口终点 + 1);
    let 视口负担 =
      状态.句段负担前缀和[段终点idx] - 状态.句段负担前缀和[段起点idx];
    if (视口负担 < 自适应视口负担下限) {
      视口负担 = 自适应视口负担下限;
    }
    const 视口高度像素 = (结束行idx - 窗口起始行idx) * 状态.行高;
    const 期望负担 = 状态.全文负担密度 * 视口高度像素;
    const 密度因子 = Math.max(
      自适应密度因子下限,
      Math.min(自适应密度因子上限, 期望负担 / 视口负担),
    );
    return Math.max(
      自动滚动最低速度,
      状态.自动滚动速度 * Math.pow(密度因子, 自适应滚动强度),
    );
  }

  function 执行自动滚动(当前时间) {
    const 本次滚动 = 自动滚动状态;
    if (!本次滚动) {
      return;
    }

    const 最大滚动位置 = 本次滚动.最大滚动位置;
    const 经过毫秒 = Math.min(50, 当前时间 - 本次滚动.上帧时间);
    const 缓动比例 = 1 - Math.exp(-经过毫秒 / 自动滚动缓动时长);
    const 快速滚动中 = 本次滚动.快速滚动终点 !== null;
    const 停留中 = !快速滚动中 && 当前时间 < 本次滚动.停留结束时间;
    const 密度目标速度 = 本次滚动.密度目标速度;
    const 目标速度 = 快速滚动中
      ? 自动滚动快速速度 * 本次滚动.快速滚动方向
      : 停留中
        ? 0
        : 密度目标速度;
    // 密度目标速度由界面节拍更新，同时供滚动进度区显示。
    // 快速翻页的停留结束（恢复常速）后，淡出衔接线
    if (
      !快速滚动中 &&
      !停留中 &&
      本次滚动.停留结束时间 !== 0 &&
      !本次滚动.衔接线已淡出
    ) {
      本次滚动.衔接线已淡出 = true;
      隐藏衔接线();
    }
    本次滚动.当前速度 += (目标速度 - 本次滚动.当前速度) * 缓动比例;
    本次滚动.浮点位置 += (本次滚动.当前速度 * 经过毫秒) / 1000;
    let 新位置 = Math.max(0, Math.min(最大滚动位置, 本次滚动.浮点位置));
    const 快速滚动已到位 =
      快速滚动中 &&
      (本次滚动.快速滚动方向 > 0
        ? 新位置 >= 本次滚动.快速滚动终点
        : 新位置 <= 本次滚动.快速滚动终点);
    if (快速滚动已到位) {
      const 快速滚动方向 = 本次滚动.快速滚动方向;
      const 停留时长 =
        快速滚动方向 < 0 ? 自动滚动反向翻页停留时长 : 衔接线停留时长;
      新位置 = 本次滚动.快速滚动终点;
      本次滚动.浮点位置 = 新位置;
      本次滚动.快速滚动终点 = null;
      本次滚动.快速滚动方向 = 0;
      本次滚动.当前速度 = 快速滚动方向 < 0 ? 0 : 状态.自动滚动速度;
      本次滚动.停留结束时间 = 当前时间 + 停留时长;
      console.info('[阅读器] 自动滚动快速翻页已完成', {
        方向: 快速滚动方向 < 0 ? '向上' : '向下',
        恢复速度: Math.round(状态.自动滚动速度),
        滚动位置: Math.round(新位置),
        暂停毫秒: 停留时长,
      });
    }
    本次滚动.上帧时间 = 当前时间;
    元素.滚动容器.scrollTop = 新位置;
    if (当前时间 - 本次滚动.上次界面时间 >= 自动滚动界面间隔) {
      本次滚动.上次界面时间 = 当前时间;
      // 每个界面节拍只读取一次布局尺寸，并把结果传给后续更新，避免写入后反复强制重排。
      const 视口度量 = {
        轨道高度: 元素.自定义滚动条.clientHeight,
        容器高度: 元素.滚动容器.clientHeight,
        滚动高度: 元素.滚动容器.scrollHeight,
      };
      本次滚动.最大滚动位置 = Math.max(
        0,
        视口度量.滚动高度 - 视口度量.容器高度,
      );
      本次滚动.密度目标速度 = 计算密度自适应目标速度(
        本次滚动.浮点位置,
        视口度量.容器高度,
      );
      更新滚动块(视口度量);
      渲染可见行(false, 视口度量.容器高度);
      // 基础/实际速度：仅滚动进行中刷新（元素此时才可见）；
      // 实际速度 = 基础速度经窗口内容密度调整后的目标速度。
      设置文本(元素.基础速度显示, `基 ${Math.round(状态.自动滚动速度)}`);
      设置文本(元素.实际速度显示, `${Math.round(本次滚动.密度目标速度 / 状态.自动滚动速度 * 100)}%`);
    }
    if (新位置 >= 最大滚动位置 - 0.5) {
      停止自动滚动('已到文末');
      return;
    }
    本次滚动.帧 = requestAnimationFrame(执行自动滚动);
  }

  function 停止自动滚动(原因) {
    if (!自动滚动状态) {
      return;
    }

    cancelAnimationFrame(自动滚动状态.帧);
    自动滚动状态 = null;
    更新滚动块();
    渲染可见行();
    安排保存持久化状态();
    更新自动滚动按钮(false);
    隐藏衔接线();
    document.body.classList.remove('自动滚动中');
    console.info('[阅读器] 自动滚动已停止', {
      原因,
      滚动位置: Math.round(元素.滚动容器.scrollTop),
    });
  }

  function 更新自动滚动按钮(正在滚动) {
    元素.自动滚动按钮.setAttribute('aria-pressed', String(正在滚动));
    // 剩余滚动时间与实际速度仅在自动滚动进行中显示
    元素.剩余滚动时间.hidden = !正在滚动;
    元素.实际速度显示.hidden = !正在滚动;
    // 自动滚动进行中：强制显示右下角控件（尤其是自动滚动按钮本身）
    右下强制 = 正在滚动;
    刷新右下控件可见性();
  }

  function 处理手动滚动() {
    取消滚动动画();
    结束跳转会话('手动滚动');
  }

  function 处理面板开关() {
    状态.关键词面板展开 = !状态.关键词面板展开;
    渲染关键词面板();
    安排保存持久化状态();
  }

  function 处理面板操作(事件) {
    const 排序按钮 = 事件.target.closest('button[data-sort]');
    if (排序按钮) {
      切换关键词排序(排序按钮.dataset.sort);
      return;
    }

    const 操作按钮 = 事件.target.closest('button[data-action]');
    const 关键词项 = 操作按钮?.closest('.关键词项');
    const 关键词 = 关键词项
      ? 查找关键词(Number(关键词项.dataset.keywordId))
      : null;
    if (!关键词) {
      return;
    }

    switch (操作按钮.dataset.action) {
      case '删除':
        删除关键词标记(关键词.id);
        break;
      case '上下文':
        打开上下文弹窗(关键词);
        break;
      case '选中': {
        // 面板点击始终循环前进：末位 → 首位
        const 排序列表 = 排序后的关键词列表();
        if (排序列表.length <= 1) {
          // 只有一个词时无法前进，仅选中
          状态.当前关键词id = 关键词.id;
          渲染可见行(true);
        } else {
          const 当前idx = 排序列表.findIndex((k) => k.id === 关键词.id);
          const 下一个 = 排序列表[(当前idx + 1) % 排序列表.length];
          跳到命中(下一个, 0);
        }
        更新关键词指示器();
        安排保存持久化状态();
        console.info('[阅读器] 面板点击循环前进', {
          关键词: 查找关键词(状态.当前关键词id)?.文本,
        });
        break;
      }
    }
  }

  function 处理上下文弹窗点击(事件) {
    if (事件.target === 元素.上下文弹窗) {
      关闭上下文弹窗();
    }
  }

  function 处理上下文弹窗关闭() {
    状态.上下文视图 = null;
    元素.上下文列表.replaceChildren();
    元素.滚动容器.focus({ preventScroll: true });
  }

  function 处理上下文行点击(事件) {
    const 行元素 = 事件.target.closest('.上下文行');
    const 视图 = 状态.上下文视图;
    const 关键词 = 视图 ? 查找关键词(视图.关键词id) : null;
    if (!行元素 || !关键词) {
      return;
    }

    const 命中idx = Number(行元素.dataset.hitIndex);
    if (命中idx < 0 || 命中idx >= 关键词.命中位置.length) {
      return;
    }
    关闭上下文弹窗();
    跳到命中(关键词, 命中idx);
  }

  function 处理上下文滚动() {
    const 列表 = 元素.上下文列表;
    if (
      状态.上下文视图 &&
      列表.scrollTop + 列表.clientHeight > 列表.scrollHeight - 300
    ) {
      追加上下文行块();
    }
  }

  async function 打开内容选择弹窗() {
    if (元素.内容选择弹窗.open) {
      return;
    }
    停止自动滚动('打开内容选择');
    保存持久化状态();
    元素.内容选择摘要.textContent = '正在读取文本目录';
    元素.内容选择列表.replaceChildren(创建内容载入提示('正在读取'));
    元素.内容选择弹窗.showModal();

    try {
      状态.文本目录 = await 读取文本目录();
      if (!元素.内容选择弹窗.open) {
        return;
      }
      状态.文本字数 = new Map();
      渲染内容选择列表();
      状态.文本字数 = await 统计文本字数();
      if (元素.内容选择弹窗.open) {
        渲染内容选择列表();
      }
    } catch (错误) {
      元素.内容选择摘要.textContent = '目录读取失败';
      const 提示 = 创建内容载入提示('无法读取 txt 目录');
      提示.classList.add('错误');
      元素.内容选择列表.replaceChildren(提示);
      console.error('[阅读器] 文本目录读取失败', 错误);
    }

    async function 统计文本字数() {
      const 统计结果 = await Promise.all(
        状态.文本目录.map(async function 统计单个文本(文件名) {
          try {
            const 响应 = await fetch(创建文本地址(文件名));
            if (!响应.ok) {
              throw new Error(`HTTP ${响应.status} ${响应.statusText}`);
            }
            const 文本 = new TextDecoder('utf-8', { fatal: true }).decode(
              await 响应.arrayBuffer(),
            );
            const 非空白字符模式 = /\S/u;
            let 字数 = 0;
            for (const 字符 of 文本) {
              if (非空白字符模式.test(字符)) {
                字数 += 1;
              }
            }
            return [文件名, 字数];
          } catch (错误) {
            console.error(`[阅读器] 无法统计文本字数：${文件名}`, 错误);
            return [文件名, null];
          }
        }),
      );
      return new Map(统计结果);
    }
  }

  function 关闭内容选择弹窗() {
    if (元素.内容选择弹窗.open) {
      元素.内容选择弹窗.close();
    }
  }

  function 处理内容选择弹窗点击(事件) {
    if (事件.target === 元素.内容选择弹窗) {
      关闭内容选择弹窗();
    }
  }

  function 处理内容选择列表点击(事件) {
    const 按钮 = 事件.target.closest('button[data-file-name]');
    if (!按钮) {
      return;
    }
    const 文件名 = 按钮.dataset.fileName;
    关闭内容选择弹窗();
    void 载入文本(文件名);
  }

  async function 读取文本目录() {
    const 响应 = await fetch(文本目录地址, { cache: 'no-store' });
    if (!响应.ok) {
      throw new Error(`HTTP ${响应.status} ${响应.statusText}`);
    }

    const 目录文档 = new DOMParser().parseFromString(
      await 响应.text(),
      'text/html',
    );
    const 目录地址 = new URL(响应.url);
    const 目录路径 = 目录地址.pathname.endsWith('/')
      ? 目录地址.pathname
      : 目录地址.pathname + '/';
    const 文件名集合 = new Set();

    for (const 链接 of 目录文档.querySelectorAll('a[href]')) {
      const 文件地址 = new URL(链接.getAttribute('href'), 目录地址);
      if (
        文件地址.origin !== 目录地址.origin ||
        !文件地址.pathname.startsWith(目录路径)
      ) {
        continue;
      }
      const 文件名 = decodeURIComponent(
        文件地址.pathname.slice(目录路径.length),
      );
      if (是有效文本文件名(文件名)) {
        文件名集合.add(文件名);
      }
    }

    const 文件列表 = [...文件名集合].sort(function 按文件名排序(左, 右) {
      return 拼音排序器.compare(左, 右);
    });
    if (!文件列表.length) {
      throw new Error('txt 目录中没有可读取的 .txt 文件');
    }
    return 文件列表;
  }

  function 渲染内容选择列表() {
    const 持久化数据 = 读取持久化数据();
    const 片段 = document.createDocumentFragment();
    元素.内容选择摘要.textContent = `${状态.文本目录.length} 个文本`;

    for (const 文件名 of 状态.文本目录) {
      const 文本状态 = 持久化数据.文本状态[文件名];
      const 是当前文本 = 文件名 === 状态.文件名;
      const 按钮 = document.createElement('button');
      按钮.className = '内容选项';
      按钮.type = 'button';
      按钮.dataset.fileName = 文件名;
      按钮.title = 文件名;
      if (是当前文本) {
        按钮.classList.add('当前');
        按钮.setAttribute('aria-current', 'true');
      }

      const 名称 = document.createElement('span');
      名称.className = '内容选项名称';
      名称.textContent = 文件名.replace(/\.txt$/i, '');

      const 字数 = document.createElement('span');
      字数.className = '内容选项字数';
      const 统计字数 = 状态.文本字数.get(文件名);
      字数.textContent =
        统计字数 === undefined
          ? '正在统计'
          : 统计字数 === null
            ? '统计失败'
            : `${(统计字数 / 10_000).toFixed(1)} 万字`;

      const 文本信息 = document.createElement('span');
      文本信息.className = '内容选项信息';
      文本信息.append(名称, 字数);

      const 状态文字 = document.createElement('span');
      状态文字.className = '内容选项状态';
      const 阅读进度 = 计算已保存阅读进度(文本状态);
      状态文字.textContent = 是当前文本
        ? `当前 · ${阅读进度}`
        : 文本状态
          ? `继续 · ${阅读进度}`
          : '加载';

      按钮.append(文本信息, 状态文字);
      片段.append(按钮);
    }
    元素.内容选择列表.replaceChildren(片段);
  }

  function 创建内容载入提示(文字) {
    const 提示 = document.createElement('p');
    提示.className = '内容选择提示';
    提示.textContent = 文字;
    return 提示;
  }

  function 计算已保存阅读进度(文本状态) {
    if (
      !文本状态 ||
      !Number.isFinite(文本状态.文本长度) ||
      文本状态.文本长度 <= 0 ||
      !Number.isFinite(文本状态.阅读偏移)
    ) {
      return '0%';
    }
    const 比例 = Math.min(
      1,
      Math.max(0, 文本状态.阅读偏移 / 文本状态.文本长度),
    );
    return `${Math.round(比例 * 100)}%`;
  }

  function 结束跳转会话(原因) {
    if (!状态.跳转起点) {
      return;
    }
    状态.跳转起点 = null;
    console.info('[阅读器] 已结束跳转会话', { 原因 });
  }
}

function 打开字体弹窗() {
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

function 关闭字体弹窗() {
  if (元素.字体弹窗.hidden) {
    return;
  }
  元素.字体遮罩.hidden = true;
  元素.字体弹窗.hidden = true;
  元素.滚动容器.focus({ preventScroll: true });
}

function 切换字体标签(标签) {
  当前字体标签 = 标签;
  渲染字体标签();
  渲染字体选项();
  安排保存持久化状态();
}

function 处理字体选项点击(事件) {
  if (['关键词', '奇偶行'].includes(当前字体标签)) {
    return;
  }
  const 选项 = 事件.target.closest('.字体选项');
  if (!选项) {
    return;
  }
  const 原始值 = 选项.dataset.字体值;
  const 值 = 原始值 === '' ? null : 原始值;
  if (当前字体标签 === '全部') {
    // 「全部」tab：一次点击同时设置引号内/引号外；首次设置静默，
    // 避免渲染一次「引号内已变、引号外未变」的中间态。
    设置区域字体('引号内', 值, { 静默: true });
    设置区域字体('引号外', 值);
    return;
  }
  设置区域字体(当前字体标签, 值);
}

function 处理字体粗细按钮点击() {
  if (当前字体标签 === '关键词') {
    const 当前idx = 字体粗细列表.indexOf(关键词粗细);
    设置关键词粗细(字体粗细列表[(当前idx + 1) % 字体粗细列表.length]);
    return;
  }
  const 当前区域 = 当前字体标签 === '全部' ? null : 当前字体标签;
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

function 处理字体粗细滚轮(事件) {
  事件.preventDefault();
  事件.stopPropagation();
  const 方向 = Math.sign(事件.deltaY) * -1;
  if (方向 === 0) {
    return;
  }
  if (当前字体标签 === '关键词') {
    const 当前idx = 字体粗细列表.indexOf(关键词粗细);
    const 起始idx = 当前idx === -1 ? (方向 > 0 ? -1 : 0) : 当前idx;
    const 目标idx =
      (起始idx + 方向 + 字体粗细列表.length) % 字体粗细列表.length;
    设置关键词粗细(字体粗细列表[目标idx]);
    return;
  }
  if (当前字体标签 === '全部') {
    设置区域粗细('引号内', 调整值('引号内'), { 静默: true });
    设置区域粗细('引号外', 调整值('引号外'));
    return;
  }
  设置区域粗细(当前字体标签, 调整值(当前字体标签));

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

function 设置区域字体(区域, 值, 选项 = {}) {
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

function 设置区域粗细(区域, 值, 选项 = {}) {
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

function 重置字体设置() {
  if (当前字体标签 === '奇偶行') {
    设置奇偶行颜色('奇数', 默认奇偶行颜色.奇数, { 静默: true });
    设置奇偶行颜色('偶数', 默认奇偶行颜色.偶数, { 静默: true });
    设置奇偶行左侧边框显示(默认奇偶行左侧边框显示);
    return;
  }
  if (当前字体标签 === '关键词') {
    设置关键词颜色(默认关键词颜色, { 静默: true });
    设置关键词粗细(null);
    return;
  }
  if (当前字体标签 === '全部') {
    设置区域字体('引号内', null, { 静默: true });
    设置区域字体('引号外', null);
    设置区域粗细('引号内', null, { 静默: true });
    设置区域粗细('引号外', null);
    设置区域颜色('引号内', null, { 静默: true });
    设置区域颜色('引号外', null);
    设置引文背景色(true);
    设置引文背景颜色('奇数', 默认引文背景色.奇数, { 静默: true });
    设置引文背景颜色('偶数', 默认引文背景色.偶数);
    return;
  }
  设置区域字体(当前字体标签, null);
  设置区域粗细(当前字体标签, null);
  设置区域颜色(当前字体标签, null);
  if (当前字体标签 === '引号内') {
    设置引文背景色(true);
    设置引文背景颜色('奇数', 默认引文背景色.奇数, { 静默: true });
    设置引文背景颜色('偶数', 默认引文背景色.偶数);
  }
}

function 渲染字体标签() {
  const 标签列表 = [
    { 元素: 元素.字体标签全部, 名称: '全部' },
    { 元素: 元素.字体标签引号内, 名称: '引号内' },
    { 元素: 元素.字体标签引号外, 名称: '引号外' },
    { 元素: 元素.字体标签关键词, 名称: '关键词' },
    { 元素: 元素.字体标签奇偶行, 名称: '奇偶行' },
  ];
  for (const { 元素: 标签元素, 名称 } of 标签列表) {
    const 是当前 = 当前字体标签 === 名称;
    标签元素.classList.toggle('当前', 是当前);
    标签元素.setAttribute('aria-selected', String(是当前));
  }
  元素.引文背景色选项.hidden = 当前字体标签 !== '引号内';
  元素.引文边框选项.hidden = 当前字体标签 !== '引号内';
  元素.字体颜色选项.hidden = !['全部', '引号内', '引号外'].includes(当前字体标签);
  元素.关键词颜色选项.hidden = 当前字体标签 !== '关键词';
  元素.奇偶行颜色选项.hidden = 当前字体标签 !== '奇偶行';
  元素.字体粗细按钮.hidden = 当前字体标签 === '奇偶行';
}

function 渲染字体选项() {
  const 区域 = 当前字体标签;
  const 容器 = 元素.字体选项列表;
  const 片段 = document.createDocumentFragment();
  if (区域 === '奇偶行') {
    const 预览 = document.createElement('div');
    预览.className = '奇偶行样式预览';
    预览.append(
      创建行预览('奇数行颜色', '奇数'),
      创建行预览('偶数行颜色', '偶数'),
    );
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

  function 创建行预览(文字, 类型) {
    const 行 = document.createElement('div');
    行.textContent = 文字;
    行.style.backgroundColor = `var(--段落底色${类型 === '奇数' ? '一' : '二'})`;
    return 行;
  }
}

function 设置区域颜色(区域, 颜色, 选项 = {}) {
  if (!['引号内', '引号外'].includes(区域)) {
    throw new TypeError('字体颜色区域无效');
  }
  if (颜色 !== null && !/^#[\da-f]{6}$/i.test(颜色)) {
    throw new TypeError('字体颜色格式无效');
  }
  const 规范颜色 = 颜色?.toLowerCase() ?? null;
  const 变量名 = 区域 === '引号内' ? '--引文墨色' : '--正文字色';
  字体颜色设置[区域] = 规范颜色;
  if (规范颜色 === null) {
    document.documentElement.style.removeProperty(变量名);
  } else {
    document.documentElement.style.setProperty(变量名, 规范颜色);
  }
  元素.字体颜色选择器.value = 规范颜色 ?? (区域 === '引号内' ? '#221e16' : '#4f4a3d');
  if (!选项.静默) {
    渲染字体标签();
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置区域字体颜色', { 区域, 颜色: 规范颜色 ?? '默认' });
}

function 渲染字体颜色选择器() {
  if (!['全部', '引号内', '引号外'].includes(当前字体标签)) return;
  const 默认颜色 = 当前字体标签 === '引号外' ? '#4f4a3d' : '#221e16';
  const 当前颜色 = 当前字体标签 === '全部'
    ? 字体颜色设置.引号内 === 字体颜色设置.引号外
      ? 字体颜色设置.引号内
      : null
    : 字体颜色设置[当前字体标签];
  元素.字体颜色选择器.value = 当前颜色 ?? 默认颜色;
  元素.字体颜色选择器.setAttribute('aria-label', `当前${当前字体标签}字体颜色`);
}

function 渲染字体粗细按钮() {
  if (当前字体标签 === '关键词') {
    const 显示值 = 关键词粗细 === null ? '默认' : String(关键词粗细);
    元素.字体粗细按钮.textContent = `关键词粗细：${显示值}`;
    元素.字体粗细按钮.setAttribute(
      'aria-label',
      `当前关键词粗细：${显示值}，点击或滚轮循环调整`,
    );
    return;
  }
  const 是全部统一 =
    当前字体标签 !== '全部' ||
    读取有效字体粗细('引号内') === 读取有效字体粗细('引号外');
  const 当前值 =
    当前字体标签 === '全部'
      ? 是全部统一
        ? 读取有效字体粗细('引号内')
        : null
      : 读取有效字体粗细(当前字体标签);
  const 显示值 = 是全部统一
    ? 当前值 === null
      ? '默认'
      : String(当前值)
    : '混合';
  元素.字体粗细按钮.textContent = `字体粗细：${显示值}`;
  元素.字体粗细按钮.setAttribute(
    'aria-label',
    `当前${当前字体标签}字体粗细：${显示值}，点击切换`,
  );
  const 预览粗细 = 当前值 ?? 400;
  for (const 预览 of 元素.字体选项列表.querySelectorAll('.字体选项预览')) {
    预览.style.fontWeight = String(预览粗细);
  }
}

function 读取有效字体粗细(区域) {
  return 字体粗细设置[区域] ?? 默认字体粗细[区域];
}

function 设置关键词颜色(颜色, 选项 = {}) {
  if (!/^#[\da-f]{6}$/i.test(颜色)) {
    throw new TypeError('关键词颜色格式无效');
  }
  关键词颜色 = 颜色.toLowerCase();
  高亮配色[0].深色 = 关键词颜色;
  高亮配色[0].浅色 =
    关键词颜色 === 默认关键词颜色 ? '#c5d9f0' : 计算关键词浅色(关键词颜色);
  document.documentElement.style.setProperty('--关键词颜色', 关键词颜色);
  元素.关键词颜色选择器.value = 关键词颜色;
  if (!选项.不渲染) {
    状态.关键词面板签名 = '';
    状态.指示器缓存 = null;
    渲染可见行(true);
    更新关键词指示器();
  }
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置关键词颜色', { 颜色: 关键词颜色 });

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

function 设置关键词粗细(值, 选项 = {}) {
  if (值 !== null && !字体粗细列表.includes(值)) {
    throw new TypeError('关键词粗细格式无效');
  }
  关键词粗细 = 值;
  if (值 === null) {
    document.documentElement.style.removeProperty('--关键词粗细');
  } else {
    document.documentElement.style.setProperty('--关键词粗细', String(值));
  }
  if (!选项.静默) {
    渲染字体粗细按钮();
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置关键词粗细', { 值: 值 ?? '默认' });
}

function 设置奇偶行颜色(类型, 颜色, 选项 = {}) {
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
  if (规范颜色 === 默认奇偶行颜色[类型]) {
    document.documentElement.style.removeProperty(变量名);
  } else {
    document.documentElement.style.setProperty(变量名, 规范颜色);
  }
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置奇偶行颜色', { 类型, 颜色: 规范颜色 });
}

function 设置奇偶行左侧边框显示(显示, 选项 = {}) {
  if (typeof 显示 !== 'boolean') {
    throw new TypeError('奇偶行左侧边框显示设置格式无效');
  }
  奇偶行左侧边框显示 = 显示;
  document.documentElement.classList.toggle('隐藏奇偶行左侧边框', !显示);
  元素.奇偶行左侧边框开关.checked = 显示;
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置奇偶行左侧边框显示', { 显示 });
}

function 设置引文背景色(启用, 选项 = {}) {
  引文背景色启用 = 启用;
  document.documentElement.classList.toggle('隐藏引文背景色', !启用);
  元素.引文背景色开关.checked = 启用;
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置 spk 背景色', { 启用 });
}

function 设置引文背景颜色(类型, 颜色, 选项 = {}) {
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

function 设置引文边框显示(启用, 选项 = {}) {
  引文边框启用 = 启用;
  document.documentElement.classList.toggle('隐藏引文边框', !启用);
  元素.引文边框开关.checked = 启用;
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置 spk 边框', { 启用 });
}

function 刷新字体粗细排版() {
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

function 更新自动滚动速度() {
  const 显示速度 = String(Math.round(状态.自动滚动速度));
  元素.基础速度显示.textContent = `基 ${显示速度}`;
  元素.自动滚动按钮.setAttribute(
    'aria-label',
    `滚动，基准速度 ${显示速度}，自动适配内容密度，点击切换全屏`,
  );
}

function 调整字号(目标值) {
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

function 更新字号显示() {
  元素.字号值.textContent = String(状态.字号);
  元素.字号控制.setAttribute(
    'aria-label',
    `当前字号 ${状态.字号} 像素，悬停滚轮调节，点击恢复默认`,
  );
}

function 处理字号滚轮(事件) {
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

function 进入字号调节() {
  元素.字号控制.classList.add('滚轮调节中');
}

function 离开字号调节() {
  元素.字号控制.classList.remove('滚轮调节中');
}

/* ===== 行距（行间距）控制 =====
   行距仅影响垂直间距与滚动定位，不改变横向换行逻辑，因此调整时无需重建行索引：
   直接同步 CSS 变量与 状态.行高，按当前阅读位置比例缩放 scrollTop 以保持视觉稳定，
   再重算画布高度并重绘可见行即可。后续任意「尺寸变化」路径会基于最新的 --行高
   重新建立一致的排版键，行为自洽。 */
function 调整行高(目标值) {
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
  渲染可见行(true);
  更新关键词指示器();
  更新行高显示();
  安排保存持久化状态();
  console.info('[阅读器] 行距已调整', { 行高: 新值 });
}

function 更新行高显示() {
  const 值 = Math.round(状态.行高);
  元素.行距值.textContent = String(值);
  const 倍数 = 状态.字号 > 0 ? 值 / 状态.字号 : 0;
  元素.行距控制.setAttribute(
    'aria-label',
    `当前行距 ${值} 像素，约 ${倍数.toFixed(2)} 倍字号，悬停滚轮调节，点击恢复默认`,
  );
}

// 悬停行距控件时滚轮实时调整行距：上滚（deltaY<0）增大间距，下滚减小。
function 处理行距滚轮(事件) {
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
function 进入行距调节() {
  元素.行距控制.classList.add('滚轮调节中');
}

function 离开行距调节() {
  元素.行距控制.classList.remove('滚轮调节中');
}

function 读取持久化数据() {
  const 原始数据 = localStorage.getItem(持久化键);
  if (原始数据) {
    const 数据 = JSON.parse(原始数据);
    if (
      !数据 ||
      typeof 数据 !== 'object' ||
      typeof 数据.当前文件名 !== 'string' ||
      !数据.文本状态 ||
      typeof 数据.文本状态 !== 'object' ||
      Array.isArray(数据.文本状态)
    ) {
      throw new TypeError('持久化的文本状态数据库格式无效');
    }
    return 数据;
  }

  const 旧数据 = localStorage.getItem(旧持久化键);
  if (!旧数据) {
    return { 当前文件名: '', 文本状态: {} };
  }
  const 旧状态 = JSON.parse(旧数据);
  if (!旧状态 || typeof 旧状态 !== 'object') {
    throw new TypeError('旧版持久化阅读状态格式无效');
  }
  if (!是有效文本文件名(旧状态.文件名)) {
    return { 当前文件名: '', 文本状态: {} };
  }
  return {
    当前文件名: 旧状态.文件名,
    文本状态: { [旧状态.文件名]: 旧状态 },
  };
}

function 应用文本(原始文本, 文件名) {
  const 开始时间 = performance.now();
  const 规范文本 = 原始文本
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/(?<=\p{Script=Han})\?/gu, '？');
  const 句子整理开始时间 = performance.now();
  const 原引文索引 = 创建引文索引(规范文本);
  const 句子整理结果 = 整理句子换行(规范文本, 原引文索引.边界列表);
  const 句子整理耗时 = performance.now() - 句子整理开始时间;
  const 文本 = 句子整理结果.文本;
  const 缩进起点集合 = new Set(句子整理结果.缩进起点列表);

  const 上一本书公共状态 = 状态.文件名
    ? {
        自动滚动速度: 状态.自动滚动速度,
        字号: 状态.字号,
        行高: 状态.行高,
        当前字体标签,
        字体: { 引号内: 字体设置.引号内, 引号外: 字体设置.引号外 },
        字体粗细: {
          引号内: 字体粗细设置.引号内,
          引号外: 字体粗细设置.引号外,
        },
        字体颜色: {
          引号内: 字体颜色设置.引号内,
          引号外: 字体颜色设置.引号外,
        },
        关键词样式: { 颜色: 关键词颜色, 粗细: 关键词粗细 },
        奇偶行颜色: { ...奇偶行颜色 },
        奇偶行左侧边框显示,
        引文背景色启用,
        引文背景色: { ...引文背景色 },
        引文边框启用,
        关键词排序: 状态.关键词排序,
        关键词面板展开: 状态.关键词面板展开,
      }
    : null;
  const 持久化状态 = 读取持久化数据().文本状态[文件名] ?? null;
  恢复阅读设置(持久化状态 ?? 上一本书公共状态);
  if (!持久化状态 && 上一本书公共状态) {
    console.info('[阅读器] 新文本已继承上一本书的公共设置', { 文件名 });
  }

  const 排版 = 读取正文排版();
  const 行索引 = 创建行索引(文本, 排版, 缩进起点集合);

  状态.文本 = 文本;
  状态.指示器缓存 = null;
  状态.词频分析 = null;
  const 汉字频次 = new Map();
  for (const 字 of 文本) {
    if (汉字模式.test(字)) {
      汉字频次.set(字, (汉字频次.get(字) ?? 0) + 1);
    }
  }
  状态.全文单字 = new Set(
    [...汉字频次]
      .filter(function 筛选全文单字([, 频次]) {
        return 频次 === 1;
      })
      .map(function 读取全文单字([字]) {
        return 字;
      }),
  );
  状态.文件名 = 文件名;
  状态.引文边界列表 = 句子整理结果.引文边界列表;
  状态.缩进起点集合 = 缩进起点集合;
  状态.关键词列表 = [];
  状态.当前关键词id = null;
  状态.悬停逻辑行idx = null;
  状态.下一个关键词id = 1;
  状态.关键词面板签名 = '';
  状态.跳转起点 = null;
  取消滚动动画();
  隐藏衔接线();
  提交行索引(行索引);
  恢复文本内容状态(持久化状态);
  更新自动滚动速度();
  渲染可见行(true);
  更新关键词指示器();
  更新文档标题();
  元素.载入状态.hidden = true;

  if (原引文索引.未配对数量 > 0) {
    console.warn('[阅读器] 已忽略未配对引号', {
      数量: 原引文索引.未配对数量,
    });
  }
  console.info('[阅读器] 文本已载入', {
    文件名,
    字符数: 状态.文本.length,
    虚拟行数: 状态.行起点列表.length,
    引文片段数: 状态.引文边界列表.length / 2,
    新增句子换行数: 句子整理结果.新增换行数,
    原文单换行数: 状态.缩进起点集合.size,
    句子整理耗时毫秒: Math.round(句子整理耗时),
    耗时毫秒: Math.round(performance.now() - 开始时间),
  });

  function 恢复阅读设置(持久化状态) {
    const 根元素 = document.documentElement;
    for (const 变量名 of [
      '--正文字号',
      '--行高',
      '--引文字体',
      '--正文字体',
      '--引文粗细',
      '--正文粗细',
      '--引文墨色',
      '--正文字色',
      '--关键词粗细',
      '--段落底色一',
      '--段落底色二',
      '--奇数引文底色',
      '--偶数引文底色',
    ]) {
      根元素.style.removeProperty(变量名);
    }
    字体设置.引号内 = null;
    字体设置.引号外 = null;
    字体粗细设置.引号内 = null;
    字体粗细设置.引号外 = null;
    字体颜色设置.引号内 = null;
    字体颜色设置.引号外 = null;
    关键词颜色 = 默认关键词颜色;
    关键词粗细 = null;
    高亮配色[0].深色 = 默认关键词颜色;
    高亮配色[0].浅色 = '#c5d9f0';
    根元素.style.setProperty('--关键词颜色', 默认关键词颜色);
    元素.关键词颜色选择器.value = 默认关键词颜色;
    Object.assign(奇偶行颜色, 默认奇偶行颜色);
    元素.奇数行颜色选择器.value = 默认奇偶行颜色.奇数;
    元素.偶数行颜色选择器.value = 默认奇偶行颜色.偶数;
    Object.assign(引文背景色, 默认引文背景色);
    元素.奇数引文颜色选择器.value = 默认引文背景色.奇数;
    元素.偶数引文颜色选择器.value = 默认引文背景色.偶数;
    设置奇偶行左侧边框显示(默认奇偶行左侧边框显示, { 静默: true });
    引文背景色启用 = true;
    根元素.classList.remove('隐藏引文背景色');
    元素.引文背景色开关.checked = true;
    引文边框启用 = true;
    根元素.classList.remove('隐藏引文边框');
    元素.引文边框开关.checked = true;
    当前字体标签 = '引号内';
    状态.自动滚动速度 = 自动滚动默认速度;
    状态.关键词排序 = '数量';
    状态.关键词面板展开 = false;

    const 根计算样式 = getComputedStyle(根元素);
    const 计算字号 = Number.parseFloat(
      根计算样式.getPropertyValue('--正文字号'),
    );
    const 计算行高 = Number.parseFloat(根计算样式.getPropertyValue('--行高'));
    状态.字号 = Number.isFinite(计算字号) && 计算字号 > 0 ? 计算字号 : 默认字号;
    状态.行高 = Number.isFinite(计算行高) && 计算行高 > 0 ? 计算行高 : 默认行高;

    if (持久化状态) {
      if (持久化状态.字号 !== undefined) {
        if (
          typeof 持久化状态.字号 !== 'number' ||
          !Number.isFinite(持久化状态.字号)
        ) {
          throw new TypeError('持久化的字号格式无效');
        }
        if (持久化状态.字号 < 最小字号 || 持久化状态.字号 > 最大字号) {
          throw new RangeError('持久化的字号超出有效范围');
        }
        状态.字号 = 持久化状态.字号;
      }

      if (持久化状态.行高 !== undefined) {
        if (
          typeof 持久化状态.行高 !== 'number' ||
          !Number.isFinite(持久化状态.行高)
        ) {
          throw new TypeError('持久化的行距格式无效');
        }
        if (持久化状态.行高 < 最小行高硬下限 || 持久化状态.行高 > 最大行高) {
          throw new RangeError('持久化的行距超出有效范围');
        }
        状态.行高 = Math.max(持久化状态.行高, 状态.字号);
        if (状态.行高 !== 持久化状态.行高) {
          console.warn('[阅读器] 已迁移低于字号的旧行距', {
            文件名,
            原行距: 持久化状态.行高,
            新行距: 状态.行高,
          });
        }
      } else {
        状态.行高 = Math.max(状态.行高, 计算最小行高());
      }

      if (持久化状态.自动滚动速度 !== undefined) {
        if (
          typeof 持久化状态.自动滚动速度 !== 'number' ||
          !Number.isFinite(持久化状态.自动滚动速度)
        ) {
          throw new TypeError('持久化的自动滚动速度格式无效');
        }
        if (
          持久化状态.自动滚动速度 < 自动滚动最低速度 ||
          持久化状态.自动滚动速度 > 自动滚动最高速度
        ) {
          throw new RangeError('持久化的自动滚动速度超出有效范围');
        }
        状态.自动滚动速度 = 持久化状态.自动滚动速度;
      }

      if (持久化状态.关键词排序 !== undefined) {
        if (!关键词排序方式列表.includes(持久化状态.关键词排序)) {
          throw new TypeError('持久化的关键词排序方式无效');
        }
        状态.关键词排序 = 持久化状态.关键词排序;
      }
      if (持久化状态.关键词面板展开 !== undefined) {
        if (typeof 持久化状态.关键词面板展开 !== 'boolean') {
          throw new TypeError('持久化的关键词面板状态无效');
        }
        状态.关键词面板展开 = 持久化状态.关键词面板展开;
      }
      if (持久化状态.当前字体标签 !== undefined) {
        if (
          !['全部', '引号内', '引号外', '关键词', '奇偶行'].includes(
            持久化状态.当前字体标签,
          )
        ) {
          throw new TypeError('持久化的字体标签状态无效');
        }
        当前字体标签 = 持久化状态.当前字体标签;
      }
      恢复字体设置(持久化状态.字体);
      恢复字体粗细设置(持久化状态.字体粗细);
      恢复字体颜色设置(持久化状态.字体颜色);
      恢复关键词样式(持久化状态.关键词样式);
      恢复奇偶行颜色(持久化状态.奇偶行颜色);
      恢复奇偶行左侧边框显示(持久化状态.奇偶行左侧边框显示);
      恢复引文背景色设置(持久化状态.引文背景色启用);
      恢复引文背景颜色(持久化状态.引文背景色);
      恢复引文边框设置(持久化状态.引文边框启用);
    }

    根元素.style.setProperty('--正文字号', 状态.字号 + 'px');
    根元素.style.setProperty('--行高', 状态.行高 + 'px');
    更新字号显示();
    更新行高显示();

    function 恢复字体设置(持久化字体) {
      if (持久化字体 === undefined) {
        return;
      }
      if (!持久化字体 || typeof 持久化字体 !== 'object') {
        throw new TypeError('持久化的字体设置格式无效');
      }
      for (const 区域 of ['引号内', '引号外']) {
        const 值 = 持久化字体[区域];
        if (
          值 !== null &&
          值 !== undefined &&
          (typeof 值 !== 'string' || !值)
        ) {
          throw new TypeError(`持久化的${区域}字体设置格式无效`);
        }
        const 变量名 = 区域 === '引号内' ? '--引文字体' : '--正文字体';
        字体设置[区域] = 值 ?? null;
        if (字体设置[区域]) {
          根元素.style.setProperty(变量名, 字体设置[区域]);
        }
      }
    }

    function 恢复字体粗细设置(持久化粗细) {
      if (持久化粗细 === undefined) {
        return;
      }
      if (!持久化粗细 || typeof 持久化粗细 !== 'object') {
        throw new TypeError('持久化的字体粗细设置格式无效');
      }
      for (const 区域 of ['引号内', '引号外']) {
        const 值 = 持久化粗细[区域];
        if (值 !== null && 值 !== undefined && !字体粗细列表.includes(值)) {
          throw new TypeError(`持久化的${区域}字体粗细设置格式无效`);
        }
        const 变量名 = 区域 === '引号内' ? '--引文粗细' : '--正文粗细';
        字体粗细设置[区域] = 值 ?? null;
        if (字体粗细设置[区域] !== null) {
          根元素.style.setProperty(变量名, String(字体粗细设置[区域]));
        }
      }
    }

    function 恢复字体颜色设置(持久化颜色) {
      if (持久化颜色 === undefined) return;
      if (!持久化颜色 || typeof 持久化颜色 !== 'object') {
        throw new TypeError('持久化的字体颜色设置格式无效');
      }
      for (const 区域 of ['引号内', '引号外']) {
        const 值 = 持久化颜色[区域];
        if (值 !== null && 值 !== undefined && !/^#[\da-f]{6}$/i.test(值)) {
          throw new TypeError(`持久化的${区域}字体颜色设置格式无效`);
        }
        设置区域颜色(区域, 值 ?? null, { 静默: true });
      }
    }

    function 恢复引文背景色设置(持久化设置) {
      if (持久化设置 === undefined) {
        return;
      }
      if (typeof 持久化设置 !== 'boolean') {
        throw new TypeError('持久化的 spk 背景色设置格式无效');
      }
      设置引文背景色(持久化设置, { 静默: true });
    }

    function 恢复引文背景颜色(持久化颜色) {
      if (持久化颜色 === undefined) {
        return;
      }
      if (!持久化颜色 || typeof 持久化颜色 !== 'object') {
        throw new TypeError('持久化的 spk 背景颜色格式无效');
      }
      设置引文背景颜色('奇数', 持久化颜色.奇数, { 静默: true });
      设置引文背景颜色('偶数', 持久化颜色.偶数, { 静默: true });
    }

    function 恢复引文边框设置(持久化设置) {
      if (持久化设置 === undefined) {
        return;
      }
      if (typeof 持久化设置 !== 'boolean') {
        throw new TypeError('持久化的 spk 边框设置格式无效');
      }
      设置引文边框显示(持久化设置, { 静默: true });
    }

    function 恢复关键词样式(持久化样式) {
      if (持久化样式 === undefined) {
        return;
      }
      if (!持久化样式 || typeof 持久化样式 !== 'object') {
        throw new TypeError('持久化的关键词样式格式无效');
      }
      设置关键词颜色(持久化样式.颜色, { 静默: true, 不渲染: true });
      设置关键词粗细(持久化样式.粗细 ?? null, { 静默: true });
    }

    function 恢复奇偶行颜色(持久化颜色) {
      if (持久化颜色 === undefined) {
        return;
      }
      if (!持久化颜色 || typeof 持久化颜色 !== 'object') {
        throw new TypeError('持久化的奇偶行颜色格式无效');
      }
      设置奇偶行颜色('奇数', 持久化颜色.奇数, { 静默: true });
      设置奇偶行颜色('偶数', 持久化颜色.偶数, { 静默: true });
    }

    function 恢复奇偶行左侧边框显示(持久化设置) {
      if (持久化设置 === undefined) {
        return;
      }
      if (typeof 持久化设置 !== 'boolean') {
        throw new TypeError('持久化的奇偶行左侧边框显示设置格式无效');
      }
      设置奇偶行左侧边框显示(持久化设置, { 静默: true });
    }
  }

  function 恢复文本内容状态(持久化状态) {
    元素.滚动容器.scrollTop = 0;
    if (
      !持久化状态 ||
      持久化状态.文件名 !== 状态.文件名 ||
      持久化状态.文本长度 !== 状态.文本.length
    ) {
      return;
    }
    if (!Array.isArray(持久化状态.关键词列表)) {
      throw new TypeError('持久化的关键词列表格式无效');
    }
    if (
      typeof 持久化状态.阅读偏移 !== 'number' ||
      !Number.isFinite(持久化状态.阅读偏移) ||
      typeof 持久化状态.行内比例 !== 'number' ||
      !Number.isFinite(持久化状态.行内比例)
    ) {
      throw new TypeError('持久化的阅读位置格式无效');
    }

    状态.关键词列表 = 持久化状态.关键词列表.map(
      function 恢复关键词(持久化关键词) {
        const 命中位置 = 查找关键词命中(持久化关键词.文本);
        return {
          id: 持久化关键词.id,
          文本: 持久化关键词.文本,
          命中位置,
          当前命中idx:
            持久化关键词.当前命中idx >= 0 &&
            持久化关键词.当前命中idx < 命中位置.length
              ? 持久化关键词.当前命中idx
              : -1,
          配色idx: 持久化关键词.配色idx % 高亮配色.length,
        };
      },
    );
    状态.当前关键词id = 状态.关键词列表.some(function 是当前关键词(关键词) {
      return 关键词.id === 持久化状态.当前关键词id;
    })
      ? 持久化状态.当前关键词id
      : null;
    状态.下一个关键词id =
      Math.max(
        0,
        ...状态.关键词列表.map(function 读取关键词id(关键词) {
          return 关键词.id;
        }),
      ) + 1;
    元素.滚动容器.scrollTop = 计算阅读位置(持久化状态);
  }

  function 创建引文索引(全文) {
    const 引号配对 = new Map([
      ['“', '”'],
      ['‘', '’'],
      ['「', '」'],
      ['『', '』'],
      ['《', '》'],
    ]);
    const 引号模式 = /[“”‘’「」『》《》]/g;
    const 待闭合引号栈 = [];
    const 边界列表 = [];
    let 未配对数量 = 0;
    let 引号匹配;

    while ((引号匹配 = 引号模式.exec(全文)) !== null) {
      const 字 = 引号匹配[0];
      const idx = 引号匹配.index;
      const 目标闭引号 = 引号配对.get(字);
      if (目标闭引号) {
        待闭合引号栈.push({
          内容起点: idx + 字.length,
          目标闭引号,
          原边界数量: 边界列表.length,
        });
        continue;
      }

      const 待闭合引号 = 待闭合引号栈[待闭合引号栈.length - 1];
      if (!待闭合引号 || 待闭合引号.目标闭引号 !== 字) {
        未配对数量 += 1;
        continue;
      }

      待闭合引号栈.pop();
      边界列表.length = 待闭合引号.原边界数量;
      if (待闭合引号.内容起点 < idx) {
        边界列表.push(待闭合引号.内容起点, idx);
      }
    }

    未配对数量 += 待闭合引号栈.length;

    return {
      边界列表: Uint32Array.from(边界列表),
      未配对数量,
    };
  }

  function 整理句子换行(全文, 原引文边界列表) {
    const 句末标点集合 = new Set(['。', '！', '？', '!', '?', '…']);
    const 输出片段列表 = [];
    const 引文边界列表 = [];
    const 缩进起点列表 = [];
    let 上次截取位置 = 0;
    let 新增换行数 = 0;
    let 引文idx = 0;
    let 引文起点 = 原引文边界列表[引文idx];
    let 引文终点 = 原引文边界列表[引文idx + 1];
    let 引文包含句末标点 = false;

    for (let idx = 0; idx < 全文.length;) {
      if (
        全文[idx] === '\n' &&
        idx + 1 < 全文.length &&
        全文[idx + 1] !== '\n'
      ) {
        缩进起点列表.push(idx + 1 + 新增换行数);
      }

      if (idx === 引文起点) {
        引文边界列表.push(idx + 新增换行数);
        引文包含句末标点 = false;
      }

      if (idx === 引文终点) {
        引文边界列表.push(idx + 新增换行数);
        idx += 1;
        if (引文包含句末标点) {
          插入换行(idx);
        }
        引文idx += 2;
        引文起点 = 原引文边界列表[引文idx];
        引文终点 = 原引文边界列表[引文idx + 1];
        continue;
      }

      const 码 = 全文.charCodeAt(idx);
      if (
        码 !== 0x3002 &&
        码 !== 0xff01 &&
        码 !== 0xff1f &&
        码 !== 0x21 &&
        码 !== 0x3f &&
        码 !== 0x2026 &&
        !(码 === 0x2e && 全文.startsWith('...', idx))
      ) {
        idx += 1;
        continue;
      }

      const 标点终点 = 读取句末标点终点(idx);
      if (标点终点 === -1) {
        idx += 1;
        continue;
      }

      if (引文终点 !== undefined && idx >= 引文起点 && idx < 引文终点) {
        引文包含句末标点 = true;
      } else {
        插入换行(标点终点);
      }
      idx = 标点终点;
    }

    输出片段列表.push(全文.slice(上次截取位置));
    return {
      文本: 输出片段列表.join(''),
      引文边界列表: Uint32Array.from(引文边界列表),
      缩进起点列表: Uint32Array.from(缩进起点列表),
      新增换行数,
    };

    function 插入换行(位置) {
      if (位置 >= 全文.length || 全文[位置] === '\n') {
        return;
      }
      输出片段列表.push(全文.slice(上次截取位置, 位置), '\n');
      上次截取位置 = 位置;
      新增换行数 += 1;
    }

    function 读取句末标点终点(起点) {
      let idx = 起点;
      let 找到句末标点 = false;
      while (idx < 全文.length) {
        if (句末标点集合.has(全文[idx])) {
          找到句末标点 = true;
          idx += 1;
          continue;
        }
        if (全文.startsWith('...', idx)) {
          找到句末标点 = true;
          do {
            idx += 1;
          } while (全文[idx] === '.');
          continue;
        }
        break;
      }
      return 找到句末标点 ? idx : -1;
    }
  }
}

function 重建行索引(排版 = 读取正文排版()) {
  const 顶部行idx = Math.floor(获取静止滚动位置() / 状态.行高);
  const 顶部偏移 = 状态.行起点列表[顶部行idx] ?? 0;
  取消滚动动画();
  隐藏衔接线();
  const 行索引 = 创建行索引(状态.文本, 排版, 状态.缩进起点集合);
  提交行索引(行索引);
  const 新行idx = 查找偏移所在行(顶部偏移);
  元素.滚动容器.scrollTop = 新行idx * 状态.行高;
  渲染可见行(true);
  更新关键词指示器();

  console.info('[阅读器] 虚拟布局已重建', {
    正文宽度: Math.round(排版.内容宽度),
    行数: 行索引.行起点列表.length,
    总高度: 行索引.总高度,
  });
}

function 创建行索引(文本, 排版, 缩进起点集合) {
  const 起点数组 = [];
  const 终点数组 = [];
  const 逻辑行数组 = [];
  const 段落索引数组 = [];
  const 西文宽度缓存 = new Map();
  const 文本长度 = 文本.length;
  正文测量上下文.font = 排版.西文字体;
  正文测量上下文.fontKerning = 'normal';
  let 行起点 = 0;
  let 当前行宽度 = 0;
  let 当前行有内容 = false;
  let 物理行有内容 = false;
  let 西文片段起点 = -1;
  let 逻辑行idx = 0;
  let 段落idx = 0;
  let 字起点 = 0;

  while (字起点 < 文本长度) {
    const 码 = 文本.charCodeAt(字起点);
    let 字终点;
    if (
      是安全字素码(码) &&
      (字起点 + 1 >= 文本长度 || 是安全字素码(文本.charCodeAt(字起点 + 1)))
    ) {
      字终点 = 字起点 + 1;
    } else {
      字终点 = 查找字素终点(文本, 字起点);
    }

    if (码 === 0x0a && 字终点 === 字起点 + 1) {
      提交西文片段(字起点);
      if (当前行有内容) {
        添加行(行起点, 字起点);
      } else if (!物理行有内容) {
        添加行(行起点, 行起点);
      }

      行起点 = 字终点;
      当前行宽度 = 0;
      if (缩进起点集合.has(字终点)) {
        段落idx += 1;
      }
      当前行有内容 = false;
      物理行有内容 = false;
      逻辑行idx += 1;
      字起点 = 字终点;
      continue;
    }

    if (是西文范围(文本, 字起点, 字终点)) {
      if (西文片段起点 === -1) {
        西文片段起点 = 字起点;
      }
      字起点 = 字终点;
      continue;
    }

    提交西文片段(字起点);
    添加排版片段(字起点, 字终点, false, null);
    字起点 = 字终点;
  }
  提交西文片段(文本长度);

  if (当前行有内容 || 起点数组.length === 0) {
    添加行(行起点, 文本.length);
  } else if (文本.endsWith('\n')) {
    添加行(文本.length, 文本.length);
  }

  const 总高度 = 起点数组.length * 排版.行高;
  校验虚拟高度(总高度);
  return {
    行起点列表: Uint32Array.from(起点数组),
    行终点列表: Uint32Array.from(终点数组),
    行逻辑索引: Uint32Array.from(逻辑行数组),
    行段落索引: Uint32Array.from(段落索引数组),
    排版键: 排版.键,
    行高: 排版.行高,
    总高度,
  };

  function 提交西文片段(片段终点) {
    if (西文片段起点 === -1) {
      return;
    }

    const 西文片段文本 = 文本.slice(西文片段起点, 片段终点);
    for (const 匹配 of 西文片段文本.matchAll(西文单词模式)) {
      const 单词起点 = 西文片段起点 + 匹配.index;
      添加排版片段(单词起点, 单词起点 + 匹配[0].length, true, 匹配[0]);
    }
    西文片段起点 = -1;
  }

  function 添加排版片段(片段起点, 片段终点, 是西文, 已知文本) {
    const 片段宽度 = 测量范围(片段起点, 片段终点, 是西文, 已知文本);
    const 本行内容宽度 = 排版.内容宽度;
    if (片段宽度 <= 本行内容宽度 + 0.01) {
      if (当前行有内容 && 当前行宽度 + 片段宽度 > 本行内容宽度 + 0.01) {
        完成自动行(片段起点);
      }
      当前行宽度 += 片段宽度;
      当前行有内容 = true;
      物理行有内容 = true;
      return;
    }

    if (当前行有内容) {
      完成自动行(片段起点);
    }
    添加超长片段(已知文本 ?? 文本.slice(片段起点, 片段终点), 片段起点, 是西文);
  }

  function 添加超长片段(片段文本, 片段起点, 是西文) {
    const 字素边界 = [0];
    for (const 字素信息 of 字素分段器.segment(片段文本)) {
      字素边界.push(字素信息.index + 字素信息.segment.length);
    }

    let 起始边界idx = 0;
    while (起始边界idx < 字素边界.length - 1) {
      const 本行内容宽度 = 排版.内容宽度;
      let 左边界idx = 起始边界idx + 1;
      let 右边界idx = 字素边界.length - 1;
      let 最佳边界idx = 起始边界idx;
      while (左边界idx <= 右边界idx) {
        const 中间边界idx = (左边界idx + 右边界idx) >>> 1;
        const 候选文本 = 片段文本.slice(
          字素边界[起始边界idx],
          字素边界[中间边界idx],
        );
        if (测量片段(候选文本, 是西文) <= 本行内容宽度 + 0.01) {
          最佳边界idx = 中间边界idx;
          左边界idx = 中间边界idx + 1;
        } else {
          右边界idx = 中间边界idx - 1;
        }
      }

      if (最佳边界idx === 起始边界idx) {
        最佳边界idx += 1;
      }
      const 本行文本 = 片段文本.slice(
        字素边界[起始边界idx],
        字素边界[最佳边界idx],
      );
      const 本行终点 = 片段起点 + 字素边界[最佳边界idx];
      当前行宽度 = 测量片段(本行文本, 是西文);
      当前行有内容 = true;
      物理行有内容 = true;
      if (最佳边界idx < 字素边界.length - 1) {
        完成自动行(本行终点);
      }
      起始边界idx = 最佳边界idx;
    }
  }

  function 完成自动行(终点) {
    添加行(行起点, 终点);
    行起点 = 终点;
    当前行宽度 = 0;
    当前行有内容 = false;
  }

  function 测量范围(片段起点, 片段终点, 是西文, 已知文本) {
    if (!是西文) {
      if (片段终点 - 片段起点 === 1) {
        if (不渲染引号集合.has(文本[片段起点])) {
          return 0;
        }
      }
      return 排版.正文字号;
    }
    return 测量片段(已知文本 ?? 文本.slice(片段起点, 片段终点), true);
  }

  function 测量片段(片段文本, 是西文) {
    if (!是西文) {
      return 不渲染引号集合.has(片段文本) ? 0 : 排版.正文字号;
    }

    const 缓存宽度 = 西文宽度缓存.get(片段文本);
    if (缓存宽度 !== undefined) {
      return 缓存宽度;
    }
    const 宽度 = 正文测量上下文.measureText(片段文本).width;
    西文宽度缓存.set(片段文本, 宽度);
    return 宽度;
  }

  function 添加行(起点, 终点) {
    起点数组.push(起点);
    终点数组.push(终点);
    逻辑行数组.push(逻辑行idx);
    段落索引数组.push(段落idx);
  }
}

function 提交行索引(行索引) {
  状态.行起点列表 = 行索引.行起点列表;
  状态.行终点列表 = 行索引.行终点列表;
  状态.行逻辑索引 = 行索引.行逻辑索引;
  状态.行段落索引 = 行索引.行段落索引;
  状态.排版键 = 行索引.排版键;
  状态.行高 = 行索引.行高;
  状态.渲染起点 = -1;
  状态.渲染终点 = -1;
  设置画布高度(行索引.总高度);
  构建句段负担索引();
}

// 句段负担索引：把全文切为「无标点连续段」（跨虚拟折行连续，以标点 / 换行为界），
// 段负担 = 段长 × 句长惩罚。这是「内容密集」的真实信号——视口内长段越多越慢，
// 对话 / 短句 / 空白越多越快；且不被排版折行抹平（折行只影响显示，不切断文本段）。
// 在 提交行索引 时构建一次（O(全文)，重排等低频操作可接受），
// 运行时用二分 + 前缀和取任意文本范围（视口 / 剩余）的负担，O(log 段数)。
function 构建句段负担索引() {
  const 文本 = 状态.文本;
  const 文本长度 = 文本.length;
  const 起点数组 = [];
  const 负担数组 = [];
  let 段起点 = -1;
  let 段长度 = 0;
  let 总负担 = 0;
  for (let i = 0; i < 文本长度; i++) {
    const 码 = 文本.charCodeAt(i);
    if (是阅读字符码(码)) {
      if (段起点 === -1) {
        段起点 = i;
      }
      段长度 += 1;
    } else if (是句内停顿码(码) && 段起点 !== -1) {
      const 负担值 = 计算句段负担(段长度);
      起点数组.push(段起点);
      负担数组.push(负担值);
      总负担 += 负担值;
      段起点 = -1;
      段长度 = 0;
    }
  }
  if (段起点 !== -1) {
    const 负担值 = 计算句段负担(段长度);
    起点数组.push(段起点);
    负担数组.push(负担值);
    总负担 += 负担值;
  }
  const 段数 = 起点数组.length;
  const 负担前缀和 = new Float64Array(段数 + 1);
  for (let i = 0; i < 段数; i++) {
    负担前缀和[i + 1] = 负担前缀和[i] + 负担数组[i];
  }
  状态.句段起点列表 = Uint32Array.from(起点数组);
  状态.句段负担前缀和 = 负担前缀和;
  状态.句段负担总合 = 总负担;
  const 总高度 = 状态.行起点列表.length * 状态.行高;
  状态.全文负担密度 = 总高度 > 0 ? 总负担 / 总高度 : 0;
}

// 段负担 = 段长 × 句长惩罚：超过 自适应句长起点 的连续无标点段，每多一个「起点」区间
// 加成 自适应句长惩罚系数（封顶 自适应句长惩罚上限）。短段（对话、短语）无惩罚。
function 计算句段负担(段长度) {
  if (段长度 <= 自适应句长起点) {
    return 段长度;
  }
  const 惩罚 =
    1 + 自适应句长惩罚系数 * ((段长度 - 自适应句长起点) / 自适应句长起点);
  return 段长度 * Math.min(自适应句长惩罚上限, 惩罚);
}

// 二分：返回 句段起点列表 中第一个 ≥ 目标 的下标（0..长度）。列表升序，全扫描一次即可。
function 二分句段起点(目标) {
  const 列表 = 状态.句段起点列表;
  let 低 = 0;
  let 高 = 列表.length;
  while (低 < 高) {
    const 中 = (低 + 高) >>> 1;
    if (列表[中] < 目标) {
      低 = 中 + 1;
    } else {
      高 = 中;
    }
  }
  return 低;
}

// 汉字（含扩展 A）与西文字母数字：这些才真正需要「阅读」
function 是阅读字符码(码) {
  return (
    (码 >= 0x4e00 && 码 <= 0x9fff) ||
    (码 >= 0x3400 && 码 <= 0x4dbf) ||
    (码 >= 0x61 && 码 <= 0x7a) ||
    (码 >= 0x41 && 码 <= 0x5a) ||
    (码 >= 0x30 && 码 <= 0x39)
  );
}

// 句内停顿标点（含换行 = 段落边界）：作为句段边界，本身不计负担
function 是句内停顿码(码) {
  return (
    码 === 0x0a || // 换行（物理段落边界）
    (码 >= 0x3000 && 码 <= 0x303f) || // CJK 标点（，。！？；：、…「」《》等）
    (码 >= 0xff00 && 码 <= 0xffef) || // 全角形式（，。！？：；（））
    码 === 0x2026 || // …（省略号）
    (码 >= 0x2014 && 码 <= 0x2015) || // ——（破折号）
    (码 >= 0x2018 && 码 <= 0x201d) || // ‘’ “”（弯引号）
    码 === 0x2c || // ,（西文逗号）
    码 === 0x2e || // .
    码 === 0x3b || // ;
    码 === 0x3a || // :
    码 === 0x21 || // !
    码 === 0x3f // ?
  );
}

function 刷新画布尺寸(排版) {
  const 顶部行idx = Math.floor(元素.滚动容器.scrollTop / 状态.行高);
  const 顶部偏移 = 状态.行起点列表[顶部行idx] ?? 0;
  const 总高度 = 状态.行起点列表.length * 排版.行高;
  校验虚拟高度(总高度);
  状态.排版键 = 排版.键;
  状态.行高 = 排版.行高;
  状态.渲染起点 = -1;
  状态.渲染终点 = -1;
  设置画布高度(总高度);
  元素.滚动容器.scrollTop = 查找偏移所在行(顶部偏移) * 排版.行高;
}

function 校验虚拟高度(总高度) {
  if (总高度 > 最大虚拟高度) {
    throw new RangeError(`文本虚拟高度 ${总高度}px 超出 Chrome 单元素安全范围`);
  }
}

function 设置画布高度(总高度) {
  const 容器高度 = 元素.滚动容器.clientHeight;
  const 底部留白 = 总高度 > 容器高度 ? 容器高度 % 状态.行高 : 0;
  let 末段顶部所需高度 = 0;
  let 最后内容行idx = 状态.行起点列表.length - 1;
  while (
    最后内容行idx >= 0 &&
    状态.行起点列表[最后内容行idx] === 状态.行终点列表[最后内容行idx]
  ) {
    最后内容行idx -= 1;
  }
  if (最后内容行idx >= 0) {
    const 末段起始偏移 =
      状态.文本.lastIndexOf('\n', 状态.行起点列表[最后内容行idx] - 1) + 1;
    const 末段起始行idx = 查找偏移所在行(末段起始偏移);
    末段顶部所需高度 = 末段起始行idx * 状态.行高 + 容器高度;
  }

  const 画布高度 = Math.max(总高度 + 底部留白, 容器高度, 末段顶部所需高度);
  校验虚拟高度(画布高度);
  元素.虚拟画布.style.height = `${画布高度}px`;
}

function 读取正文排版() {
  const 画布宽度 =
    元素.虚拟画布.clientWidth || Math.min(940, window.innerWidth);
  const 根样式 = getComputedStyle(document.documentElement);

  // 取 CSS 变量，解析失败或无效时回退到默认值，避免样式表加载异常导致整个应用崩溃
  const 读取数字变量 = (变量名, 默认值) => {
    const 原始值 = 根样式.getPropertyValue(变量名);
    const 数值 = Number.parseFloat(原始值);
    return Number.isFinite(数值) && 数值 > 0 ? 数值 : 默认值;
  };
  const 读取字体变量 = (变量名, 默认值) => {
    const 原始值 = 根样式.getPropertyValue(变量名).trim();
    return 原始值 || 默认值;
  };

  const 默认正文字号 = 30;
  const 默认行高 = 58;
  const 默认西文字号比例 = 0.96;
  const 默认正文字体 = "'Songti SC', 'STSong', 'Noto Serif CJK SC', serif";
  const 默认西文字体 = "'Iowan Old Style', 'Times New Roman', serif";

  const 正文字号 = 读取数字变量('--正文字号', 默认正文字号);
  const 行高 = 读取数字变量('--行高', 默认行高);
  const 西文字号比例 = 读取数字变量('--西文字号', 默认西文字号比例);
  const 正文字体 = 读取字体变量('--正文字体', 默认正文字体);
  const 西文字体 = 读取字体变量('--西文字体', 默认西文字体);
  const 正文粗细 = 读取数字变量('--正文粗细', 100);
  const 引文粗细 = 读取数字变量('--引文粗细', 900);

  const css回退 =
    正文字号 === 默认正文字号 ||
    行高 === 默认行高 ||
    西文字号比例 === 默认西文字号比例 ||
    正文字体 === 默认正文字体 ||
    西文字体 === 默认西文字体;
  if (css回退) {
    console.warn('[阅读器] 部分正文排版 CSS 变量未生效，已使用默认值', {
      正文字号,
      行高,
      西文字号比例,
      正文字体,
      西文字体,
      正文粗细,
      引文粗细,
    });
  }

  const 内容宽度 = Math.max(正文字号, 画布宽度);
  return {
    键: [
      内容宽度.toFixed(2),
      正文字号,
      行高,
      正文字体,
      西文字体,
      西文字号比例,
      正文粗细,
      引文粗细,
    ].join('|'),
    内容宽度,
    正文字号,
    行高,
    西文字体: `${正文粗细} ${正文字号 * 西文字号比例}px ${西文字体}`,
  };
}

function 是西文字素(字素) {
  return 是西文范围(字素, 0, 字素.length);
}

// 数字（0-9、零~九、〇、两、十百千万亿，含小数点）：整段字素全部为数字字符时才判定为数字，
// 连续西文数字（如 "1984"）会被聚合成一个片段，故需按整段匹配；
// 允许小数点，使 "3.14" 这类小数整体作为数字高亮。
const 数字字素模式 = /^[0-9〇零一二两三四五六七八九.十百千万亿]+$/u;
function 是数字字素(字素) {
  return 数字字素模式.test(字素);
}

function 是西文范围(文本, 起点, 终点) {
  for (let idx = 起点; idx < 终点; idx += 1) {
    const 码 = 文本.charCodeAt(idx);
    if (
      (码 >= 0x20 && 码 <= 0x7e) ||
      码 === 0xa0 ||
      (码 >= 0xff10 && 码 <= 0xff19) ||
      (码 >= 0xff21 && 码 <= 0xff3a) ||
      (码 >= 0xff41 && 码 <= 0xff5a)
    ) {
      continue;
    }
    if (
      (码 >= 0x4e00 && 码 <= 0x9fff) ||
      (码 >= 0xff01 && 码 <= 0xff5e) ||
      (码 >= 0x3000 && 码 <= 0x3020 && 码 !== 0x3007) ||
      (码 >= 0x2018 && 码 <= 0x201d) ||
      码 === 0x0a ||
      码 === 0x2013 ||
      码 === 0x2014 ||
      码 === 0x2026
    ) {
      return false;
    }
    return 西文字素模式.test(
      起点 === 0 && 终点 === 文本.length ? 文本 : 文本.slice(起点, 终点),
    );
  }
  return 终点 > 起点;
}

function 是方块字素码(码) {
  return (
    (码 >= 0x4e00 && 码 <= 0x9fff) ||
    (码 >= 0x3400 && 码 <= 0x4dbf) ||
    (码 >= 0xf900 && 码 <= 0xfaff) ||
    (码 >= 0x3000 && 码 <= 0x303f) ||
    (码 >= 0xff01 && 码 <= 0xff5e) ||
    (码 >= 0x2018 && 码 <= 0x201d) ||
    码 === 0x2013 ||
    码 === 0x2014 ||
    码 === 0x2026
  );
}

function 是混合盒命中(命中起点, 命中终点) {
  let 有西文 = false;
  let 有方块 = false;
  for (let idx = 命中起点; idx < 命中终点; idx += 1) {
    const 码 = 状态.文本.charCodeAt(idx);
    if (码 === 0x201c || 码 === 0x201d) {
      return true;
    }
    if (是西文范围(状态.文本, idx, idx + 1)) {
      有西文 = true;
    } else if (是方块字素码(码)) {
      有方块 = true;
    } else {
      return true;
    }
    if (有西文 && 有方块) {
      return true;
    }
  }
  return false;
}

function 是安全字素码(码) {
  return (
    (码 >= 0x4e00 && 码 <= 0x9fff) ||
    (码 >= 0x20 && 码 <= 0x7e) ||
    (码 >= 0xff01 && 码 <= 0xff5e) ||
    (码 >= 0x3000 && 码 <= 0x3029) ||
    (码 >= 0x3030 && 码 <= 0x303f) ||
    (码 >= 0x2018 && 码 <= 0x201d) ||
    码 === 0x0a ||
    码 === 0xa0 ||
    码 === 0x2013 ||
    码 === 0x2014 ||
    码 === 0x2026
  );
}

function 查找字素终点(文本, 起点) {
  let 窗口长度 = 64;
  while (true) {
    const 窗口终点 = Math.min(文本.length, 起点 + 窗口长度);
    for (const 字素信息 of 字素分段器.segment(文本.slice(起点, 窗口终点))) {
      const 终点 = 起点 + 字素信息.segment.length;
      if (终点 < 窗口终点 || 窗口终点 === 文本.length) {
        return 终点;
      }
      break;
    }
    窗口长度 *= 2;
  }
}

function 渲染可见行(强制渲染 = false, 视口高度 = null) {
  if (!状态.行起点列表.length) {
    return;
  }

  const 缓冲行数 = 12;
  const 可见起点 = Math.max(
    0,
    Math.floor(元素.滚动容器.scrollTop / 状态.行高) - 缓冲行数,
  );
  const 实际视口高度 = 视口高度 ?? 元素.滚动容器.clientHeight;
  const 可见终点 = Math.min(
    状态.行起点列表.length,
    Math.ceil((元素.滚动容器.scrollTop + 实际视口高度) / 状态.行高) + 缓冲行数,
  );

  if (!强制渲染 && 可见起点 === 状态.渲染起点 && 可见终点 === 状态.渲染终点) {
    return;
  }

  const 原渲染起点 = 状态.渲染起点;
  const 原渲染终点 = 状态.渲染终点;
  const 有重叠范围 =
    !强制渲染 && 可见起点 < 原渲染终点 && 可见终点 > 原渲染起点;

  if (有重叠范围) {
    const 原渲染行数 = 原渲染终点 - 原渲染起点;
    if (元素.可见内容.children.length !== 原渲染行数) {
      throw new Error(
        `虚拟列表 DOM 行数 ${元素.可见内容.children.length} 与渲染状态 ${原渲染行数} 不一致`,
      );
    }

    const 保留起点 = Math.max(可见起点, 原渲染起点);
    const 保留终点 = Math.min(可见终点, 原渲染终点);
    const 前置片段 =
      可见起点 < 保留起点 ? 创建行片段(可见起点, 保留起点) : null;
    const 后置片段 =
      保留终点 < 可见终点 ? 创建行片段(保留终点, 可见终点) : null;

    for (let idx = 原渲染起点; idx < 保留起点; idx += 1) {
      元素.可见内容.firstElementChild.remove();
    }
    for (let idx = 保留终点; idx < 原渲染终点; idx += 1) {
      元素.可见内容.lastElementChild.remove();
    }
    if (前置片段) {
      元素.可见内容.prepend(前置片段);
    }
    if (后置片段) {
      元素.可见内容.append(后置片段);
    }
  } else {
    元素.可见内容.replaceChildren(创建行片段(可见起点, 可见终点));
  }

  元素.可见内容.style.top = `${可见起点 * 状态.行高}px`;
  状态.渲染起点 = 可见起点;
  状态.渲染终点 = 可见终点;

  function 创建行片段(创建起点, 创建终点) {
    const 片段 = document.createDocumentFragment();
    const 关键词游标列表 = 状态.关键词列表.map(function 创建关键词游标(关键词) {
      return {
        关键词,
        idx: 查找首个相交命中(关键词, 状态.行起点列表[创建起点]),
      };
    });
    let 引文idx = 查找首个未结束引文(状态.行起点列表[创建起点]);

    for (let idx = 创建起点; idx < 创建终点; idx += 1) {
      const 行起点 = 状态.行起点列表[idx];
      const 行终点 = 状态.行终点列表[idx];
      const 行文本 = 状态.文本.slice(行起点, 行终点);
      const 本行引文跨行状态 = new Map();
      const 行元素 = document.createElement('div');
      行元素.className = '正文行';
      const 段落idx = 状态.行段落索引[idx];
      if (行文本) {
        行元素.classList.add(段落idx % 2 === 0 ? '段落底色一' : '段落底色二');
      }
      const 是段落起始行 = idx === 0 || 状态.行段落索引[idx - 1] !== 段落idx;
      const 是段落结束行 =
        idx === 状态.行段落索引.length - 1 ||
        状态.行段落索引[idx + 1] !== 段落idx;
      行元素.classList.toggle('段落边框一', 段落idx % 2 === 0);
      行元素.classList.toggle('段落边框二', 段落idx % 2 === 1);
      行元素.classList.toggle('段落起始行', 是段落起始行);
      行元素.classList.toggle('段落结束行', 是段落结束行);
      行元素.dataset.start = String(行起点);
      行元素.dataset.end = String(行终点);
      行元素.dataset.logicalLine = String(状态.行逻辑索引[idx]);
      行元素.classList.toggle(
        '逻辑行悬停',
        状态.悬停逻辑行idx !== null &&
          状态.行逻辑索引[idx] === 状态.悬停逻辑行idx,
      );
      行元素.setAttribute(
        'aria-label',
        行文本.replace(显示引号过滤模式, '') || '空行',
      );

      for (const 关键词游标 of 关键词游标列表) {
        while (
          关键词游标.idx < 关键词游标.关键词.命中位置.length &&
          关键词游标.关键词.命中位置[关键词游标.idx] +
            关键词游标.关键词.文本.length <=
            行起点
        ) {
          关键词游标.idx += 1;
        }
      }

      const 片段边界 = 收集片段边界(行起点, 行终点, 行文本, 关键词游标列表);
      for (let 边界idx = 0; 边界idx < 片段边界.length - 1; 边界idx += 1) {
        const 字起点 = 片段边界[边界idx];
        const 字终点 = 片段边界[边界idx + 1];
        const 原字文本 = 状态.文本.slice(字起点, 字终点);
        const 字文本 = 原字文本.replace(显示引号过滤模式, '');
        if (!字文本) {
          continue;
        }
        const 字命中详情 = [];
        const 字元素 = document.createElement('span');
        字元素.className = '字';
        字元素.classList.toggle('西文', 是西文字素(字文本));
        字元素.classList.toggle('数字', 是数字字素(字文本));
        字元素.dataset.start = String(字起点);
        字元素.dataset.end = String(字终点);
        字元素.setAttribute('aria-hidden', 'true');
        if (字文本 === '的' || 字文本 === '了') {
          const 特殊字形 = document.createElement('span');
          特殊字形.className = '特殊字形';
          特殊字形.textContent = 字文本;
          字元素.append(特殊字形);
        } else {
          // 显示层替换：正文「我」渲染为 W（书本 .txt 原文件与 状态.文本 均不变，仅可见字形）。
          字元素.textContent = 字文本 === '我' ? 'W' : 字文本;
        }
        if (状态.全文单字.has(字文本)) {
          const 全文单字标记 = document.createElement('span');
          全文单字标记.className = '全文单字标记';
          全文单字标记.setAttribute('aria-hidden', 'true');
          字元素.append(全文单字标记);
        }

        // 「不」字：叠加浅黑色 ✕ 遮罩（见 .字.否定叉 样式）；
        // 但「不过」是凝固连词而非否定，排除其首字以免误标。
        if (字文本 === '不' && 状态.文本[字终点] !== '过') {
          字元素.classList.add('否定叉');
          const 否定叉标记 = document.createElement('span');
          否定叉标记.className = '否定叉标记';
          字元素.append(否定叉标记);
        }

        // 人称代词：单字、指定复数及「自己、本人」使用同一醒目样式
        if (
          '你我您他她它咱'.includes(字文本) ||
          (字文本 === '们' &&
            '你我您他她它咱'.includes(状态.文本[字起点 - 1])) ||
          (字文本 === '自' && 状态.文本[字终点] === '己') ||
          (字文本 === '己' && 状态.文本[字起点 - 1] === '自') ||
          (字文本 === '本' && 状态.文本[字终点] === '人') ||
          (字文本 === '人' && 状态.文本[字起点 - 1] === '本')
        ) {
          字元素.classList.add('人称代词');
        }

        // 让步词（暖色）：事实/假设让步 —— 虽然、尽管、即使
        if (
          (字文本 === '虽' && 状态.文本[字终点] === '然') ||
          (字文本 === '然' && 状态.文本[字起点 - 1] === '虽') ||
          (字文本 === '尽' && 状态.文本[字终点] === '管') ||
          (字文本 === '管' && 状态.文本[字起点 - 1] === '尽') ||
          (字文本 === '即' && 状态.文本[字终点] === '使') ||
          (字文本 === '使' && 状态.文本[字起点 - 1] === '即')
        ) {
          字元素.classList.add('让步词');
        }

        // 转折词（冷色）：语义转向 —— 但是、还是、不过
        if (
          (字文本 === '但' && 状态.文本[字终点] === '是') ||
          (字文本 === '是' && 状态.文本[字起点 - 1] === '但') ||
          (字文本 === '还' && 状态.文本[字终点] === '是') ||
          (字文本 === '是' && 状态.文本[字起点 - 1] === '还') ||
          (字文本 === '不' && 状态.文本[字终点] === '过') ||
          (字文本 === '过' && 状态.文本[字起点 - 1] === '不')
        ) {
          字元素.classList.add('转折词');
        }

        // 关系连词（数据驱动）：因果 / 假设 / 递进 / 选择 / 顺接，按词表着色
        for (const [词, 类] of 关系连词表) {
          if (词.length === 2) {
            const 首 = 词[0];
            const 次 = 词[1];
            if (
              (字文本 === 首 && 状态.文本[字终点] === 次) ||
              (字文本 === 次 && 状态.文本[字起点 - 1] === 首)
            ) {
              字元素.classList.add(类);
            }
          }
        }

        while (
          引文idx < 状态.引文边界列表.length &&
          状态.引文边界列表[引文idx + 1] < 字起点
        ) {
          引文idx += 2;
        }
        if (引文idx < 状态.引文边界列表.length) {
          const 引文起点 = 状态.引文边界列表[引文idx];
          const 引文终点 = 状态.引文边界列表[引文idx + 1];
          const 是引文内容 = 引文起点 <= 字起点 && 字终点 <= 引文终点;
          if (是引文内容) {
            let 引文跨行状态 = 本行引文跨行状态.get(引文idx);
            if (!引文跨行状态) {
              const 上一行起点 = idx > 0 ? 状态.行起点列表[idx - 1] : 行起点;
              const 上一行终点 = idx > 0 ? 状态.行终点列表[idx - 1] : 行起点;
              const 下一行起点 =
                idx + 1 < 状态.行起点列表.length
                  ? 状态.行起点列表[idx + 1]
                  : 行终点;
              const 下一行终点 =
                idx + 1 < 状态.行终点列表.length
                  ? 状态.行终点列表[idx + 1]
                  : 行终点;
              引文跨行状态 = {
                承接上行:
                  idx > 0 &&
                  引文起点 < 行起点 &&
                  引文范围含可见内容(
                    Math.max(引文起点, 上一行起点),
                    Math.min(引文终点, 上一行终点),
                  ),
                延续下行:
                  idx + 1 < 状态.行起点列表.length &&
                  引文终点 > 行终点 &&
                  引文范围含可见内容(
                    Math.max(引文起点, 下一行起点),
                    Math.min(引文终点, 下一行终点),
                  ),
                首个字元素: null,
                末个字元素: null,
              };
              本行引文跨行状态.set(引文idx, 引文跨行状态);
            }
            字元素.classList.add('引文内容');
            字元素.classList.add(
              (引文idx / 2) % 2 === 0 ? '引文底色一' : '引文底色二',
            );
            字元素.classList.toggle('引文承接上行', 引文跨行状态.承接上行);
            字元素.classList.toggle('引文延续下行', 引文跨行状态.延续下行);
            引文跨行状态.首个字元素 ??= 字元素;
            引文跨行状态.末个字元素 = 字元素;
          } else if (字终点 === 引文起点 || 字起点 === 引文终点) {
            字元素.classList.add('引文引号');
          }
        }

        for (const 关键词游标 of 关键词游标列表) {
          const { 关键词 } = 关键词游标;
          while (
            关键词游标.idx < 关键词.命中位置.length &&
            关键词.命中位置[关键词游标.idx] + 关键词.文本.length <= 字起点
          ) {
            关键词游标.idx += 1;
          }

          let 检查命中idx = 关键词游标.idx;
          while (
            检查命中idx < 关键词.命中位置.length &&
            关键词.命中位置[检查命中idx] < 字终点
          ) {
            const 命中起点 = 关键词.命中位置[检查命中idx];
            const 命中终点 = 命中起点 + 关键词.文本.length;
            if (命中终点 > 字起点) {
              字命中详情.push({
                关键词,
                命中idx: 检查命中idx,
                命中起点,
                命中终点,
              });
            }
            检查命中idx += 1;
          }
        }

        if (字命中详情.length) {
          const 当前关键词命中 = 字命中详情.find(
            function 找到当前关键词命中(命中详情) {
              return 命中详情.关键词.id === 状态.当前关键词id;
            },
          );
          const 当前项命中 = 字命中详情.find(function 找到当前项命中(命中详情) {
            return (
              命中详情.关键词.id === 状态.当前关键词id &&
              命中详情.命中idx === 命中详情.关键词.当前命中idx
            );
          });
          const 点击命中 = 当前项命中 || 当前关键词命中 || 字命中详情[0];

          const 主配色 = 获取关键词配色(点击命中.关键词);
          字元素.classList.add('命中');
          字元素.classList.toggle(
            '命中起点',
            字命中详情.some((命中详情) => 命中详情.命中起点 === 字起点),
          );
          字元素.classList.toggle(
            '命中终点',
            字命中详情.some((命中详情) => 命中详情.命中终点 === 字终点),
          );
          字元素.classList.toggle('当前关键词组', Boolean(当前关键词命中));
          字元素.classList.toggle('当前命中', Boolean(当前项命中));
          if (当前项命中) {
            字元素.classList.toggle(
              '当前命中起点',
              当前项命中.命中起点 === 字起点,
            );
            字元素.classList.toggle(
              '当前命中终点',
              当前项命中.命中终点 === 字终点,
            );
            字元素.classList.toggle(
              '逐字环',
              是混合盒命中(当前项命中.命中起点, 当前项命中.命中终点),
            );
          }
          字元素.classList.toggle(
            '同组悬停',
            点击命中.关键词.id === 状态.悬停关键词id,
          );
          字元素.classList.toggle(
            '悬停命中',
            点击命中.关键词.id === 状态.悬停关键词id &&
              点击命中.命中idx === 状态.悬停命中idx,
          );
          字元素.classList.toggle(
            '全文唯一',
            字命中详情.some(function 是全文唯一命中(命中详情) {
              return 命中详情.关键词.命中位置.length === 1;
            }),
          );
          if (当前关键词命中) {
            const 当前命中idx = 当前关键词命中.命中idx;
            const 最后命中idx = 当前关键词命中.关键词.命中位置.length - 1;
            if (当前命中idx === 0 && 当前关键词命中.命中起点 === 字起点) {
              字元素.dataset.groupStart = '';
            }
            if (
              当前命中idx === 最后命中idx &&
              当前关键词命中.命中终点 === 字终点
            ) {
              字元素.dataset.groupEnd = '';
            }
          }
          if (点击命中.命中终点 === 字终点) {
            字元素.dataset.hitPosition = `${点击命中.命中idx + 1}/${点击命中.关键词.命中位置.length}`;
          }
          字元素.dataset.keywordId = String(点击命中.关键词.id);
          字元素.dataset.hitIndex = String(点击命中.命中idx);
          字元素.style.setProperty('--命中背景', 主配色.浅色);
          字元素.style.setProperty('--命中当前色', 主配色.深色);
        }

        行元素.append(字元素);
      }

      for (const 引文跨行状态 of 本行引文跨行状态.values()) {
        if (!引文跨行状态.承接上行) {
          引文跨行状态.首个字元素.classList.add('引文起点');
        }
        if (!引文跨行状态.延续下行) {
          引文跨行状态.末个字元素.classList.add('引文终点');
        }
      }

      片段.append(行元素);
    }

    return 片段;

    function 引文范围含可见内容(范围起点, 范围终点) {
      for (let idx = 范围起点; idx < 范围终点; idx += 1) {
        const 字 = 状态.文本[idx];
        if (字 !== '\n' && 字 !== '\r' && !不渲染引号集合.has(字)) {
          return true;
        }
      }
      return false;
    }
  }

  function 收集片段边界(行起点, 行终点, 行文本, 关键词游标列表) {
    const 边界列表 = [行起点];
    const 行长度 = 行文本.length;
    let 字素起点 = 0;
    let 聚合片段起点 = -1;
    let 聚合片段是西文 = false;
    while (字素起点 < 行长度) {
      const 码 = 行文本.charCodeAt(字素起点);
      let 字素终点;
      if (
        是安全字素码(码) &&
        (字素起点 + 1 >= 行长度 ||
          是安全字素码(行文本.charCodeAt(字素起点 + 1)))
      ) {
        字素终点 = 字素起点 + 1;
      } else {
        字素终点 = 查找字素终点(行文本, 字素起点);
      }
      const 当前是西文 = 是西文范围(行文本, 字素起点, 字素终点);
      if (!当前是西文 && 是方块字素码(码)) {
        提交聚合片段(字素起点);
        边界列表.push(行起点 + 字素终点);
      } else if (聚合片段起点 === -1) {
        聚合片段起点 = 字素起点;
        聚合片段是西文 = 当前是西文;
      } else if (聚合片段是西文 !== 当前是西文) {
        提交聚合片段(字素起点);
        聚合片段起点 = 字素起点;
        聚合片段是西文 = 当前是西文;
      }
      字素起点 = 字素终点;
    }
    提交聚合片段(行长度);
    return 边界列表;

    function 提交聚合片段(片段终点) {
      if (聚合片段起点 === -1) {
        return;
      }
      const 片段绝对起点 = 行起点 + 聚合片段起点;
      const 片段绝对终点 = 行起点 + 片段终点;
      聚合片段起点 = -1;

      let 命中切分列表 = null;
      for (const 关键词游标 of 关键词游标列表) {
        const { 关键词 } = 关键词游标;
        for (
          let 检查命中idx = 关键词游标.idx;
          检查命中idx < 关键词.命中位置.length &&
          关键词.命中位置[检查命中idx] < 片段绝对终点;
          检查命中idx += 1
        ) {
          const 命中起点 = 关键词.命中位置[检查命中idx];
          const 命中终点 = 命中起点 + 关键词.文本.length;
          if (命中起点 > 片段绝对起点) {
            (命中切分列表 ??= []).push(命中起点);
          }
          if (命中终点 > 片段绝对起点 && 命中终点 < 片段绝对终点) {
            (命中切分列表 ??= []).push(命中终点);
          }
        }
      }

      if (命中切分列表) {
        命中切分列表.sort((左切分, 右切分) => 左切分 - 右切分);
        for (const 切分 of 命中切分列表) {
          if (切分 !== 边界列表[边界列表.length - 1]) {
            边界列表.push(切分);
          }
        }
      }
      边界列表.push(片段绝对终点);
    }
  }

  function 查找首个未结束引文(文本偏移) {
    let 左边界 = 0;
    let 右边界 = 状态.引文边界列表.length / 2;
    while (左边界 < 右边界) {
      const idx = (左边界 + 右边界) >>> 1;
      if (状态.引文边界列表[idx * 2 + 1] < 文本偏移) {
        左边界 = idx + 1;
      } else {
        右边界 = idx;
      }
    }
    return 左边界 * 2;
  }
}

function 读取选择关键词() {
  const 选择 = window.getSelection();
  if (!选择 || 选择.isCollapsed || 选择.rangeCount === 0) {
    return;
  }

  const 范围 = 选择.getRangeAt(0);
  const 公共节点 =
    范围.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? 范围.commonAncestorContainer
      : 范围.commonAncestorContainer.parentElement;
  if (!公共节点 || !元素.可见内容.contains(公共节点)) {
    return;
  }

  const 选择起点 = 获取选择边界偏移(范围.startContainer, 范围.startOffset);
  const 选择终点 = 获取选择边界偏移(范围.endContainer, 范围.endOffset);
  if (选择起点 === null || 选择终点 === null || 选择终点 <= 选择起点) {
    return;
  }

  const 原始关键词 = 状态.文本.slice(选择起点, 选择终点);
  if (/[\r\n]/.test(原始关键词)) {
    return;
  }

  const 关键词 = 原始关键词.trim();
  if (!关键词) {
    return;
  }

  const 实际选择起点 = 选择起点 + 原始关键词.indexOf(关键词);
  const 扩展后关键词 = 尝试自动扩展关键词(关键词, 实际选择起点);
  const 已有关键词 = 状态.关键词列表.find(function 找到相同关键词(已有关键词) {
    return 已有关键词.文本 === 扩展后关键词;
  });
  if (已有关键词) {
    删除关键词标记(已有关键词.id);
  } else {
    添加关键词标记(扩展后关键词, 实际选择起点);
  }
  选择.removeAllRanges();
}

function 尝试自动扩展关键词(关键词, 起点) {
  let 当前词 = 关键词;
  while (true) {
    const 下一位置 = 起点 + 当前词.length;
    if (下一位置 >= 状态.文本.length) {
      break;
    }
    const 下一字符 = 状态.文本[下一位置];
    const 候选词 = 当前词 + 下一字符;
    const 原次数 = 查找关键词命中(当前词).length;
    const 新次数 = 查找关键词命中(候选词).length;
    if (原次数 === 新次数 && 原次数 > 1) {
      当前词 = 候选词;
    } else {
      break;
    }
  }
  return 当前词;
}

function 获取选择边界偏移(节点, 节点内偏移) {
  const 字元素 = 获取最近字元素(节点);
  if (字元素) {
    const 起点 = Number(字元素.dataset.start);
    const 终点 = Number(字元素.dataset.end);
    if (节点.nodeType === Node.TEXT_NODE) {
      if (节点内偏移 <= 0) {
        return 起点;
      }
      if (节点内偏移 >= 节点.data.length) {
        return 终点;
      }
      return 起点 + 节点内偏移;
    }
    return 节点内偏移 > 0 ? 终点 : 起点;
  }

  if (节点.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const 子节点列表 = 节点.childNodes;
  if (节点内偏移 < 子节点列表.length) {
    return 获取节点起点(子节点列表[节点内偏移]);
  }
  if (节点内偏移 > 0) {
    return 获取节点终点(子节点列表[节点内偏移 - 1]);
  }
  if (节点.classList.contains('正文行')) {
    return Number(节点.dataset.start);
  }
  return null;

  function 获取最近字元素(目标节点) {
    const 元素节点 =
      目标节点.nodeType === Node.ELEMENT_NODE
        ? 目标节点
        : 目标节点.parentElement;
    return 元素节点?.closest('.字') ?? null;
  }

  function 获取节点起点(目标节点) {
    const 目标字 = 获取最近字元素(目标节点) || 目标节点.querySelector?.('.字');
    if (目标字) {
      return Number(目标字.dataset.start);
    }
    const 目标行 = 目标节点.closest?.('.正文行');
    return 目标行 ? Number(目标行.dataset.start) : null;
  }

  function 获取节点终点(目标节点) {
    const 字列表 = 目标节点.querySelectorAll?.('.字');
    const 目标字 = 字列表?.[字列表.length - 1] || 获取最近字元素(目标节点);
    if (目标字) {
      return Number(目标字.dataset.end);
    }
    const 目标行 = 目标节点.closest?.('.正文行');
    return 目标行 ? Number(目标行.dataset.end) : null;
  }
}

function 添加关键词标记(关键词文本, 选择位置) {
  const 开始时间 = performance.now();
  let 关键词 = 状态.关键词列表.find(function 找到相同关键词(已有关键词) {
    return 已有关键词.文本 === 关键词文本;
  });

  if (!关键词) {
    关键词 = 创建关键词标记(关键词文本, 查找关键词命中(关键词文本));
  }

  状态.当前关键词id = 关键词.id;
  if (选择位置 >= 0) {
    关键词.当前命中idx = 二分查找精确命中(关键词, 选择位置);
  }
  渲染可见行(true);
  更新关键词指示器();
  显示当前命中位置提示();
  安排保存持久化状态();

  console.info('[阅读器] 关键词标记已更新', {
    关键词: 关键词.文本,
    关键词数量: 状态.关键词列表.length,
    命中数: 关键词.命中位置.length,
    耗时毫秒: Math.round(performance.now() - 开始时间),
  });
}

function 创建关键词标记(关键词文本, 命中位置) {
  const id = 状态.下一个关键词id;
  const 关键词 = {
    id,
    文本: 关键词文本,
    命中位置,
    当前命中idx: -1,
    配色idx: (id - 1) % 高亮配色.length,
  };
  状态.下一个关键词id += 1;
  状态.关键词列表.push(关键词);
  return 关键词;
}

function 查找关键词命中(关键词) {
  const 命中数组 = [];
  const 文本字素列表 = 字素分段器.segment(状态.文本);
  let 搜索位置 = 0;
  while (搜索位置 <= 状态.文本.length - 关键词.length) {
    const 命中位置 = 状态.文本.indexOf(关键词, 搜索位置);
    if (命中位置 === -1) {
      break;
    }

    const 起始字素 = 文本字素列表.containing(命中位置);
    const 命中终点 = 命中位置 + 关键词.length;
    const 起点在字素边界 = 起始字素?.index === 命中位置;
    const 终点在字素边界 =
      命中终点 === 状态.文本.length ||
      文本字素列表.containing(命中终点)?.index === 命中终点;
    if (起点在字素边界 && 终点在字素边界) {
      命中数组.push(命中位置);
    }
    搜索位置 = 起始字素.index + 起始字素.segment.length;
  }
  return Uint32Array.from(命中数组);
}

function 删除关键词标记(关键词id) {
  const 删除idx = 状态.关键词列表.findIndex(function 找到删除项(关键词) {
    return 关键词.id === 关键词id;
  });
  if (删除idx === -1) {
    return;
  }

  const [已删除关键词] = 状态.关键词列表.splice(删除idx, 1);
  if (状态.当前关键词id === 关键词id) {
    const 接替关键词 = 状态.关键词列表[删除idx] || 状态.关键词列表[删除idx - 1];
    状态.当前关键词id = 接替关键词?.id ?? null;
  }
  状态.指示器缓存 = null;
  渲染可见行(true);
  更新关键词指示器();
  安排保存持久化状态();

  console.info('[阅读器] 关键词标记已删除', {
    关键词: 已删除关键词.文本,
    关键词数量: 状态.关键词列表.length,
  });
}

function 查找关键词(关键词id) {
  return 状态.关键词列表.find(function 找到关键词(关键词) {
    return 关键词.id === 关键词id;
  });
}

function 获取关键词配色(关键词) {
  return 高亮配色[关键词.配色idx % 高亮配色.length];
}

function 有弹窗打开() {
  return (
    元素.查找弹窗.open ||
    元素.上下文弹窗.open ||
    元素.词频弹窗.open ||
    元素.内容选择弹窗.open ||
    !元素.字体弹窗.hidden
  );
}

function 切换关键词排序(排序方式) {
  if (!关键词排序方式列表.includes(排序方式) || 状态.关键词排序 === 排序方式) {
    return;
  }
  状态.关键词排序 = 排序方式;
  渲染关键词面板();
  安排保存持久化状态();

  console.info('[阅读器] 已切换关键词排序', { 排序方式 });
}

/* 排序只影响面板展示顺序，不改动关键词的原始添加顺序。 */
function 排序后的关键词列表() {
  const 列表 = [...状态.关键词列表];
  switch (状态.关键词排序) {
    case '数量':
      列表.sort(function 按数量排序(左, 右) {
        return (
          右.命中位置.length - 左.命中位置.length ||
          (左.命中位置[0] ?? 0) - (右.命中位置[0] ?? 0)
        );
      });
      break;
    case '位置':
      列表.sort(function 按位置排序(左, 右) {
        return (左.命中位置[0] ?? 0) - (右.命中位置[0] ?? 0);
      });
      break;
    case '拼音':
      列表.sort(function 按拼音排序(左, 右) {
        return 拼音排序器.compare(左.文本, 右.文本);
      });
      break;
  }
  return 列表;
}

/* 面板只在关键词状态真正变化时重建 DOM，悬停、滚动引发的调用都会被签名拦下。 */
function 渲染关键词面板() {
  const 面板可见 = Boolean(状态.文件名) && 状态.关键词列表.length > 0;
  // 面板展开时，关键词面板开关需保持可见（即使鼠标不在热区），便于收起面板
  document.body.classList.toggle(
    '右下面板展开',
    面板可见 && 状态.关键词面板展开,
  );
  if (!面板可见) {
    元素.关键词面板.hidden = true;
    状态.关键词面板签名 = '';
    return;
  }

  const 签名 = [
    状态.当前关键词id,
    状态.关键词面板展开 ? 1 : 0,
    状态.关键词排序,
    ...状态.关键词列表.map(function 读取关键词签名(关键词) {
      return `${关键词.id}:${关键词.命中位置.length}:${关键词.当前命中idx}`;
    }),
  ].join('|');
  if (!元素.关键词面板.hidden && 签名 === 状态.关键词面板签名) {
    return;
  }
  状态.关键词面板签名 = 签名;

  元素.关键词面板.hidden = false;
  元素.关键词面板开关.textContent = `关键词 ${状态.关键词列表.length}`;
  元素.关键词面板开关.setAttribute(
    'aria-expanded',
    String(状态.关键词面板展开),
  );
  元素.关键词列表容器.hidden = !状态.关键词面板展开;
  if (!状态.关键词面板展开) {
    元素.关键词列表容器.replaceChildren();
    return;
  }

  const 片段 = document.createDocumentFragment();
  片段.append(创建排序栏());
  for (const 关键词 of 排序后的关键词列表()) {
    const 配色 = 获取关键词配色(关键词);
    const 是当前 = 关键词.id === 状态.当前关键词id;
    const 项 = document.createElement('div');
    项.className = '关键词项';
    项.classList.toggle('当前', 是当前);
    项.dataset.keywordId = String(关键词.id);
    项.style.setProperty('--关键词浅色', 配色.浅色);
    项.style.setProperty('--关键词深色', 配色.深色);

    const 主钮 = document.createElement('button');
    主钮.type = 'button';
    主钮.className = '关键词主钮';
    主钮.dataset.action = '选中';
    主钮.title = '设为当前关键词';
    const 色点 = document.createElement('i');
    色点.className = '关键词色点';
    const 文字 = document.createElement('span');
    文字.className = '关键词文字';
    文字.textContent = 关键词.文本;
    const 计数 = document.createElement('span');
    计数.className = '关键词计数';
    计数.textContent =
      是当前 && 关键词.当前命中idx >= 0
        ? `${(关键词.当前命中idx + 1).toLocaleString('zh-CN')}/${关键词.命中位置.length.toLocaleString('zh-CN')}`
        : 关键词.命中位置.length.toLocaleString('zh-CN');
    主钮.append(色点, 文字, 计数);

    项.append(
      主钮,
      创建面板操作钮('上下文', '≡', '上下文列表'),
      创建面板操作钮('删除', '×', '删除标记'),
    );
    片段.append(项);
  }
  元素.关键词列表容器.replaceChildren(片段);

  function 创建排序栏() {
    const 排序栏 = document.createElement('div');
    排序栏.className = '关键词排序栏';
    const 标签 = document.createElement('span');
    标签.className = '关键词排序标签';
    标签.textContent = '排序';
    排序栏.append(标签);
    const 提示表 = {
      数量: '按命中数量排序',
      位置: '按首次出现位置排序',
      拼音: '按首字母拼音排序',
    };
    for (const 排序方式 of 关键词排序方式列表) {
      const 按钮 = document.createElement('button');
      按钮.type = 'button';
      按钮.className = '关键词排序钮';
      按钮.dataset.sort = 排序方式;
      按钮.textContent = 排序方式;
      按钮.title = 提示表[排序方式];
      按钮.setAttribute('aria-pressed', String(状态.关键词排序 === 排序方式));
      排序栏.append(按钮);
    }
    return 排序栏;
  }

  function 创建面板操作钮(操作, 文字, 提示) {
    const 按钮 = document.createElement('button');
    按钮.type = 'button';
    按钮.className = '关键词操作钮';
    按钮.dataset.action = 操作;
    按钮.textContent = 文字;
    按钮.title = 提示;
    按钮.setAttribute('aria-label', 提示);
    return 按钮;
  }
}

function 打开上下文弹窗(关键词) {
  const 开始时间 = performance.now();
  状态.上下文视图 = { 关键词id: 关键词.id, 已渲染数: 0 };
  元素.上下文标题.textContent = `${关键词.文本} · ${关键词.命中位置.length.toLocaleString('zh-CN')} 处`;
  元素.上下文列表.replaceChildren();
  元素.上下文列表.scrollTop = 0;

  // 当前命中靠前时直接渲染到那一块并居中；太靠后则只渲染首块，避免一次性建海量 DOM
  const 居中命中idx =
    关键词.id === 状态.当前关键词id &&
    关键词.当前命中idx >= 0 &&
    关键词.当前命中idx < 上下文最大初始行数
      ? 关键词.当前命中idx
      : -1;
  do {
    追加上下文行块();
  } while (状态.上下文视图.已渲染数 <= 居中命中idx);

  if (!元素.上下文弹窗.open) {
    元素.上下文弹窗.showModal();
  }
  if (居中命中idx >= 0) {
    元素.上下文列表
      .querySelector('.上下文行.当前')
      ?.scrollIntoView({ block: 'center' });
  }

  console.info('[阅读器] 已打开上下文列表', {
    关键词: 关键词.文本,
    命中数: 关键词.命中位置.length,
    首批行数: 状态.上下文视图.已渲染数,
    耗时毫秒: Math.round(performance.now() - 开始时间),
  });
}

function 追加上下文行块() {
  const 视图 = 状态.上下文视图;
  const 关键词 = 视图 ? 查找关键词(视图.关键词id) : null;
  if (!关键词) {
    return;
  }

  const 起点 = 视图.已渲染数;
  const 终点 = Math.min(关键词.命中位置.length, 起点 + 上下文分块行数);
  if (起点 >= 终点) {
    return;
  }

  const 配色 = 获取关键词配色(关键词);
  const 片段 = document.createDocumentFragment();
  for (let idx = 起点; idx < 终点; idx += 1) {
    const 命中起点 = 关键词.命中位置[idx];
    const 命中终点 = 命中起点 + 关键词.文本.length;
    const 行 = document.createElement('button');
    行.type = 'button';
    行.className = '上下文行';
    行.classList.toggle(
      '当前',
      关键词.id === 状态.当前关键词id && idx === 关键词.当前命中idx,
    );
    行.dataset.hitIndex = String(idx);

    const 序号 = document.createElement('span');
    序号.className = '上下文序号';
    序号.textContent = String(idx + 1);
    const 前文 = document.createElement('span');
    前文.className = '上下文前文';
    前文.textContent = 读取上下文片段(命中起点 - 上下文前文字数, 命中起点);
    const 命中 = document.createElement('span');
    命中.className = '上下文命中';
    命中.textContent = 关键词.文本;
    命中.style.setProperty('--命中背景', 配色.浅色);
    const 后文 = document.createElement('span');
    后文.className = '上下文后文';
    后文.textContent = 读取上下文片段(命中终点, 命中终点 + 上下文后文字数);

    行.append(序号, 前文, 命中, 后文);
    片段.append(行);
  }
  视图.已渲染数 = 终点;
  元素.上下文列表.append(片段);
}

/* 截取上下文时绕开被切断的代理对，换行压成空格。 */
function 读取上下文片段(起点, 终点) {
  let 起 = Math.max(0, 起点);
  let 止 = Math.min(状态.文本.length, 终点);
  const 首码 = 状态.文本.charCodeAt(起);
  if (首码 >= 0xdc00 && 首码 <= 0xdfff) {
    起 += 1;
  }
  const 尾码 = 状态.文本.charCodeAt(止 - 1);
  if (尾码 >= 0xd800 && 尾码 <= 0xdbff) {
    止 -= 1;
  }
  return 状态.文本.slice(起, 止).replace(/\n+/g, ' ');
}

function 关闭上下文弹窗() {
  if (元素.上下文弹窗.open) {
    元素.上下文弹窗.close();
  }
}

function 更新关键词指示器() {
  渲染关键词面板();
  更新滚动块();
  const 轨道高度 = 元素.滚动容器.clientHeight;
  const 滚动高度 = 元素.滚动容器.scrollHeight;
  const 当前关键词 = 查找关键词(状态.当前关键词id);
  const 悬停关键词 =
    状态.悬停关键词id === 状态.当前关键词id
      ? null
      : 查找关键词(状态.悬停关键词id);
  const 可绘制 = 状态.行起点列表.length && 滚动高度 > 轨道高度;

  if (
    !可绘制 ||
    (!当前关键词?.命中位置.length && !悬停关键词?.命中位置.length)
  ) {
    元素.关键词指示器.hidden = true;
    元素.悬停关键词指示器.hidden = true;
    状态.指示器缓存 = null;
    return;
  }

  const 像素比 = Math.min(3, window.devicePixelRatio || 1);
  const 画布高 = Math.max(1, Math.round(轨道高度 * 像素比));
  const 布局键 = [状态.排版键, 画布高, 滚动高度, 像素比].join('|');

  if (状态.指示器缓存?.布局键 !== 布局键) {
    状态.指示器缓存 = {
      布局键,
      底图缓存: new Map(),
      段缓存: new Map(),
    };
  }

  绘制单列指示器(元素.关键词指示器, 当前指示器上下文, 当前关键词, '当前');
  绘制单列指示器(元素.悬停关键词指示器, 悬停指示器上下文, 悬停关键词, '悬停');

  function 绘制单列指示器(画布, 上下文, 关键词, 类型) {
    if (!关键词?.命中位置.length) {
      画布.hidden = true;
      return;
    }

    画布.hidden = false;
    const 画布宽 = Math.max(1, Math.round(画布.clientWidth * 像素比));
    if (画布.width !== 画布宽 || 画布.height !== 画布高) {
      画布.width = 画布宽;
      画布.height = 画布高;
    }

    const 底图键 = `${关键词.id}|${画布宽}`;
    let 底图 = 状态.指示器缓存.底图缓存.get(底图键);
    if (!底图) {
      const 开始时间 = performance.now();
      const 原刻度缓存数 = 状态.指示器缓存.段缓存.size;
      底图 = 创建指示器底图(画布宽, 画布高, 滚动高度, 像素比, 关键词);
      状态.指示器缓存.底图缓存.set(底图键, 底图);
      if (状态.指示器缓存.段缓存.size !== 原刻度缓存数) {
        console.info('[阅读器] 关键词指示器已重建', {
          类型,
          关键词: 关键词.文本,
          命中数: 关键词.命中位置.length,
          轨道像素高: 画布高,
          耗时毫秒: Math.round(performance.now() - 开始时间),
        });
      }
    }

    上下文.clearRect(0, 0, 画布宽, 画布高);
    上下文.drawImage(底图, 0, 0);
  }
}

// 将剩余秒数格式化为 MM:SS（超过 1 小时时为 H:MM:SS）
function 格式化剩余滚动时间(秒数) {
  const 总秒 = Math.max(0, Math.round(Number.isFinite(秒数) ? 秒数 : 0));
  const 时 = Math.floor(总秒 / 3600);
  const 分 = Math.floor((总秒 % 3600) / 60);
  const 秒 = 总秒 % 60;
  const 补零 = (值) => String(值).padStart(2, '0');
  return 时 > 0 ? `${时}:${补零(分)}:${补零(秒)}` : `${补零(分)}:${补零(秒)}`;
}

function 设置文本(元素, 文本) {
  if (元素.textContent !== 文本) {
    元素.textContent = 文本;
  }
}

function 设置属性(元素, 名称, 值) {
  if (元素.getAttribute(名称) !== 值) {
    元素.setAttribute(名称, 值);
  }
}

function 更新滚动块(度量 = null) {
  const 轨道 = 元素.自定义滚动条;
  轨道.hidden = false;
  元素.滚动进度.hidden = false;
  const 轨道高度 = 度量?.轨道高度 ?? 轨道.clientHeight;
  const 容器高度 = 度量?.容器高度 ?? 元素.滚动容器.clientHeight;
  const 滚动高度 = 度量?.滚动高度 ?? 元素.滚动容器.scrollHeight;
  const 最大滚动位置 = 滚动高度 - 容器高度;
  if (轨道高度 <= 0 || 最大滚动位置 <= 0) {
    轨道.hidden = true;
    元素.滚动进度.hidden = true;
    return;
  }

  const 滚动块高度 = Math.min(
    轨道高度,
    Math.max(32, (容器高度 / 滚动高度) * 轨道高度),
  );
  const 进度 = Math.min(1, Math.max(0, 元素.滚动容器.scrollTop / 最大滚动位置));
  const 百分比 = (进度 * 100).toFixed(1);
  const 滚动块偏移 = 进度 * (轨道高度 - 滚动块高度);

  const 滚动块高度样式 = `${滚动块高度}px`;
  if (元素.滚动块.style.height !== 滚动块高度样式) {
    元素.滚动块.style.height = 滚动块高度样式;
  }
  元素.滚动块.style.transform = `translateY(${滚动块偏移}px)`;
  if (元素.滚动进度.style.height !== 滚动块高度样式) {
    元素.滚动进度.style.height = 滚动块高度样式;
  }
  元素.滚动进度.style.transform = `translateY(${滚动块偏移}px)`;
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
  设置属性(元素.滚动块, 'title', `阅读进度 ${百分比}%`);
  设置属性(轨道, 'aria-valuenow', 百分比);
  设置属性(轨道, 'aria-valuetext', `阅读进度 ${百分比}%`);
}

function 创建指示器底图(画布宽, 画布高, 滚动高度, 像素比, 主关键词) {
  const 底图 = document.createElement('canvas');
  底图.width = 画布宽;
  底图.height = 画布高;
  const 底图上下文 = 底图.getContext('2d');
  if (!底图上下文) {
    throw new Error('无法创建关键词指示器底图');
  }

  const 最小刻度高度 = Math.max(1, Math.round(指示器刻度高度 * 像素比));
  const 刻度 = 读取指示器刻度(主关键词, 画布高, 滚动高度, 最小刻度高度);
  底图上下文.fillStyle = 获取关键词配色(主关键词).深色;

  // 先以基础透明度铺出所有刻度，保证稀疏命中也可见
  const 段列表 = 刻度.刻度列表;
  底图上下文.globalAlpha = 指示器基础透明度;
  for (let idx = 0; idx < 段列表.length; idx += 2) {
    底图上下文.fillRect(0, 段列表[idx], 画布宽, 段列表[idx + 1] - 段列表[idx]);
  }

  // 再按逐像素命中密度叠加颜色，密集段越深，一眼可见分布重心
  if (刻度.最大密度 > 0) {
    for (let 像素idx = 0; 像素idx < 刻度.密度列表.length; 像素idx += 1) {
      const 密度 = 刻度.密度列表[像素idx];
      if (!密度) {
        continue;
      }
      底图上下文.globalAlpha =
        指示器基础透明度 +
        (1 - 指示器基础透明度) * Math.sqrt(密度 / 刻度.最大密度);
      底图上下文.fillRect(0, 像素idx, 画布宽, 1);
    }
  }
  底图上下文.globalAlpha = 1;
  return 底图;
}

/* 刻度与密度只跟版面与命中有关，与谁是主关键词无关，可以跨悬停切换复用。 */
function 读取指示器刻度(关键词, 画布高, 滚动高度, 最小刻度高度) {
  const 段缓存 = 状态.指示器缓存.段缓存;
  let 刻度 = 段缓存.get(关键词.id);
  if (!刻度) {
    刻度 = 创建指示器刻度(关键词, 画布高, 滚动高度, 最小刻度高度);
    段缓存.set(关键词.id, 刻度);
  }
  return 刻度;
}

/* 逐轨道像素反查命中，代价只与轨道高度相关，与命中数量无关。 */
function 创建指示器刻度(关键词, 画布高, 滚动高度, 最小刻度高度) {
  const 总行数 = 状态.行起点列表.length;
  const 每像素行数 = 滚动高度 / (状态.行高 * 画布高);
  const 段数组 = [];
  const 密度列表 = new Uint32Array(画布高);
  let 最大密度 = 0;
  let 段起点 = -1;
  let 像素idx = 0;

  for (; 像素idx < 画布高; 像素idx += 1) {
    const 行起点idx = Math.floor(像素idx * 每像素行数);
    if (行起点idx >= 总行数) {
      break;
    }

    const 行终点idx = Math.min(
      总行数,
      Math.max(Math.floor((像素idx + 1) * 每像素行数), 行起点idx + 1),
    );
    const 像素起点偏移 = 状态.行起点列表[行起点idx];
    const 命中idx = 查找首个相交命中(关键词, 像素起点偏移);
    const 像素终点偏移 =
      行终点idx < 总行数 ? 状态.行起点列表[行终点idx] : 状态.文本.length;
    const 有命中 =
      命中idx < 关键词.命中位置.length &&
      关键词.命中位置[命中idx] < 像素终点偏移;

    const 密度 =
      查找首个不小于的命中(关键词, 像素终点偏移) -
      查找首个不小于的命中(关键词, 像素起点偏移);
    密度列表[像素idx] = 密度;
    if (密度 > 最大密度) {
      最大密度 = 密度;
    }

    if (有命中) {
      if (段起点 < 0) {
        段起点 = 像素idx;
      }
    } else if (段起点 >= 0) {
      段数组.push(段起点, 像素idx);
      段起点 = -1;
    }
  }
  if (段起点 >= 0) {
    段数组.push(段起点, 像素idx);
  }

  return {
    刻度列表: 展开最小刻度(段数组, 画布高, 最小刻度高度),
    密度列表,
    最大密度,
  };
}

function 展开最小刻度(段数组, 画布高, 最小刻度高度) {
  const 刻度列表 = [];
  for (let idx = 0; idx < 段数组.length; idx += 2) {
    let 起点 = 段数组[idx];
    let 终点 = 段数组[idx + 1];
    if (终点 - 起点 < 最小刻度高度) {
      起点 = Math.round((起点 + 终点 - 最小刻度高度) / 2);
      终点 = 起点 + 最小刻度高度;
      if (起点 < 0) {
        起点 = 0;
        终点 = Math.min(画布高, 最小刻度高度);
      }
      if (终点 > 画布高) {
        终点 = 画布高;
        起点 = Math.max(0, 画布高 - 最小刻度高度);
      }
    }

    if (刻度列表.length && 起点 <= 刻度列表[刻度列表.length - 1]) {
      刻度列表[刻度列表.length - 1] = Math.max(
        刻度列表[刻度列表.length - 1],
        终点,
      );
    } else {
      刻度列表.push(起点, 终点);
    }
  }
  return 刻度列表;
}

function 跳到命中(
  关键词,
  命中idx,
  原始行位置 = 获取当前命中行位置(关键词),
  原始边框 = 获取当前命中边框(关键词),
  最小前行距离 = 0,
) {
  const 是首次跳转 = !状态.跳转起点;
  if (是首次跳转) {
    const 原关键词 = 查找关键词(状态.当前关键词id);
    状态.跳转起点 = {
      ...读取阅读位置(),
      当前关键词id: 原关键词?.id ?? null,
      当前命中idx: 原关键词?.当前命中idx ?? -1,
    };
    console.info('[阅读器] 已记录跳转起点', {
      关键词: 原关键词?.文本 ?? null,
      当前项: (原关键词?.当前命中idx ?? -1) + 1,
      阅读偏移: 状态.跳转起点.阅读偏移,
    });
  }
  状态.当前关键词id = 关键词.id;
  关键词.当前命中idx = 命中idx;
  const 文本偏移 = 关键词.命中位置[命中idx];
  const 行idx = 查找偏移所在行(文本偏移);
  const 默认行位置 = (元素.滚动容器.clientHeight - 状态.行高) / 2;
  const 目标行位置 = Number.isFinite(原始行位置) ? 原始行位置 : 默认行位置;
  let 目标滚动位置 = 行idx * 状态.行高 - 目标行位置;
  // 仅对顺序向下跳转保留最小前行距离；首尾回绕时必须允许滚动方向反转。
  if (最小前行距离 > 0 && 目标滚动位置 >= 元素.滚动容器.scrollTop) {
    const 当前滚动位置 = 元素.滚动容器.scrollTop;
    const 最大滚动位置 = Math.max(
      0,
      元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight,
    );
    目标滚动位置 = Math.min(
      最大滚动位置,
      Math.max(目标滚动位置, 当前滚动位置 + 最小前行距离),
    );
  }
  渲染可见行(true);
  更新关键词指示器();
  显示当前命中位置提示();
  安排保存持久化状态();
  const 已启用边框动画 = 动画滚动到(
    目标滚动位置,
    原始边框
      ? {
          起点: 原始边框,
          关键词,
          命中idx,
        }
      : null,
  );

  console.info('[阅读器] 已跳转到命中', {
    关键词: 关键词.文本,
    当前项: 命中idx + 1,
    文本偏移,
    行idx,
    目标行位置: Math.round(目标行位置),
    是首次跳转,
    边框动画: 已启用边框动画,
  });
}

function 显示当前命中位置提示() {
  document.body.classList.add('显示当前命中位置');
  window.clearTimeout(状态.当前命中位置计时器);
  状态.当前命中位置计时器 = window.setTimeout(function 隐藏当前命中位置提示() {
    document.body.classList.remove('显示当前命中位置');
    状态.当前命中位置计时器 = 0;
  }, 当前命中位置提示时长);
}

function 获取当前命中行位置(关键词) {
  if (关键词.当前命中idx < 0 || 关键词.id !== 状态.当前关键词id) {
    return null;
  }
  if (状态.滚动动画目标) {
    const 行位置 =
      查找偏移所在行(关键词.命中位置[关键词.当前命中idx]) * 状态.行高 -
      获取静止滚动位置();
    const 在静止视口内 =
      行位置 > -状态.行高 && 行位置 < 元素.滚动容器.clientHeight;
    return 在静止视口内 ? 行位置 : null;
  }
  const 当前元素 = 元素.可见内容.querySelector(
    `.字.当前命中[data-keyword-id="${关键词.id}"]`,
  );
  return 当前元素 ? 获取元素行位置(当前元素) : null;
}

function 获取当前命中边框(关键词) {
  if (关键词.当前命中idx < 0 || 关键词.id !== 状态.当前关键词id) {
    return null;
  }
  if (状态.滚动动画目标) {
    return 获取动画中边框(状态.滚动动画目标);
  }
  const 当前元素 = 元素.可见内容.querySelector(
    `.字.当前命中[data-keyword-id="${关键词.id}"][data-hit-index="${关键词.当前命中idx}"]`,
  );
  return 当前元素 ? 获取元素命中边框(当前元素) : null;
}

function 获取动画中边框(动画目标) {
  const 边框动画 = 动画目标.边框动画;
  if (!边框动画) {
    return null;
  }
  const 进度 = 动画目标.缓动进度;
  return {
    左侧: 边框动画.起点.左侧 + (边框动画.终点.左侧 - 边框动画.起点.左侧) * 进度,
    顶部: 边框动画.起点.顶部,
    宽度: 边框动画.起点.宽度 + (边框动画.终点.宽度 - 边框动画.起点.宽度) * 进度,
    高度: 边框动画.起点.高度,
    颜色: 边框动画.终点.颜色,
  };
}

function 获取静止滚动位置() {
  if (!状态.滚动动画目标) {
    return 元素.滚动容器.scrollTop;
  }
  const 最大滚动位置 = Math.max(
    0,
    元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight,
  );
  return Math.min(最大滚动位置, 状态.滚动动画目标.终点);
}

function 获取元素命中边框(字元素) {
  const 关键词id = Number(字元素.dataset.keywordId);
  const 命中idx = Number(字元素.dataset.hitIndex);
  const 行元素 = 字元素.closest('.正文行');
  if (!Number.isInteger(关键词id) || !Number.isInteger(命中idx) || !行元素) {
    throw new TypeError('命中元素缺少有效的边框定位信息');
  }

  const 命中元素列表 = 行元素.querySelectorAll(
    `.字.命中[data-keyword-id="${关键词id}"][data-hit-index="${命中idx}"]`,
  );
  const 矩形列表 = [...命中元素列表].map(function 读取矩形(命中元素) {
    return 命中元素.getBoundingClientRect();
  });
  if (!矩形列表.length) {
    throw new Error('无法读取命中元素的边框区域');
  }

  const 左侧 = Math.min(...矩形列表.map((矩形) => 矩形.left));
  const 顶部 = Math.min(...矩形列表.map((矩形) => 矩形.top));
  const 右侧 = Math.max(...矩形列表.map((矩形) => 矩形.right));
  const 底部 = Math.max(...矩形列表.map((矩形) => 矩形.bottom));
  const 字样式 = getComputedStyle(字元素);
  return {
    左侧,
    顶部,
    宽度: 右侧 - 左侧,
    高度: 底部 - 顶部,
    颜色: 字样式.getPropertyValue('--命中背景').trim(),
  };
}

function 获取元素行位置(字元素) {
  const 文本偏移 = Number(字元素.dataset.start);
  if (!Number.isInteger(文本偏移)) {
    throw new TypeError('命中元素缺少有效的文本偏移');
  }

  return 查找偏移所在行(文本偏移) * 状态.行高 - 元素.滚动容器.scrollTop;
}

function 动画滚动到(目标位置, 边框跳转 = null) {
  取消滚动动画();
  const 最大滚动位置 = Math.max(
    0,
    元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight,
  );
  const 终点 = Math.min(最大滚动位置, Math.max(0, 目标位置));
  const 起点 = 元素.滚动容器.scrollTop;
  const 距离 = 终点 - 起点;
  const 边框动画 = 创建边框动画();
  const 边框横向距离 = 边框动画 ? 边框动画.终点.左侧 - 边框动画.起点.左侧 : 0;
  if (Math.abs(距离) < 1 && Math.abs(边框横向距离) < 1) {
    元素.滚动容器.scrollTop = 终点;
    渲染可见行(true);
    return false;
  }

  const 时长 =
    Math.abs(距离) < 1
      ? 220
      : Math.min(720, Math.max(300, Math.sqrt(Math.abs(距离)) * 12));
  const 开始时间 = performance.now();
  const 动画目标 = { 终点, 边框动画, 缓动进度: 0 };
  状态.滚动动画目标 = 动画目标;
  if (边框动画) {
    显示跳转边框(边框动画.起点);
  }
  状态.滚动动画帧 = requestAnimationFrame(function 执行动画(当前时间) {
    const 进度 = Math.min(1, (当前时间 - 开始时间) / 时长);
    const 缓动进度 = 进度 ** 2;
    动画目标.缓动进度 = 缓动进度;
    元素.滚动容器.scrollTop = 起点 + 距离 * 缓动进度;
    if (边框动画) {
      更新跳转边框(边框动画, 缓动进度);
    }
    if (进度 < 1) {
      状态.滚动动画帧 = requestAnimationFrame(执行动画);
    } else {
      状态.滚动动画帧 = 0;
      状态.滚动动画目标 = null;
      元素.滚动容器.scrollTop = 终点;
      渲染可见行(true);
      隐藏跳转边框();
      if (边框动画) {
        播放跳转迸发(边框动画.终点);
      }
    }
  });
  return Boolean(边框动画);

  function 创建边框动画() {
    if (!边框跳转) {
      return null;
    }

    try {
      元素.滚动容器.scrollTop = 终点;
      渲染可见行(true);
      const 目标元素 = 元素.可见内容.querySelector(
        `.字.当前命中[data-keyword-id="${边框跳转.关键词.id}"][data-hit-index="${边框跳转.命中idx}"]`,
      );
      if (!目标元素) {
        throw new Error('滚动终点缺少当前命中元素');
      }
      const 终点边框 = 获取元素命中边框(目标元素);
      const 垂直偏差 = Math.abs(终点边框.顶部 - 边框跳转.起点.顶部);
      if (垂直偏差 > 1) {
        console.info('[阅读器] 已跳过边框横移动画', {
          原因: '滚动边界使命中项未能保持原屏幕行',
          垂直偏差: Math.round(垂直偏差),
        });
        return null;
      }
      return {
        起点: 边框跳转.起点,
        终点: 终点边框,
      };
    } finally {
      元素.滚动容器.scrollTop = 起点;
      渲染可见行(true);
    }
  }

  function 显示跳转边框(边框) {
    元素.跳转边框.style.width = `${边框.宽度}px`;
    元素.跳转边框.style.height = `${边框.高度}px`;
    元素.跳转边框.style.setProperty('--命中背景', 边框.颜色);
    更新跳转边框({ 起点: 边框, 终点: 边框 }, 0);
    元素.滚动容器.classList.add('边框跳转中');
    元素.跳转边框.hidden = false;
  }

  function 更新跳转边框(动画, 进度) {
    const 左侧 = 动画.起点.左侧 + (动画.终点.左侧 - 动画.起点.左侧) * 进度;
    const 横向缩放 = 1 + (动画.终点.宽度 / 动画.起点.宽度 - 1) * 进度;
    元素.跳转边框.style.transform = `translate3d(${左侧}px, ${动画.起点.顶部}px, 0) scaleX(${横向缩放})`;
  }
}

function 取消滚动动画() {
  const 正在播放 = Boolean(状态.滚动动画帧);
  if (状态.滚动动画帧) {
    cancelAnimationFrame(状态.滚动动画帧);
    状态.滚动动画帧 = 0;
  }
  状态.滚动动画目标 = null;
  隐藏跳转边框();
  隐藏跳转迸发();
  if (正在播放) {
    console.info('[阅读器] 跳转动画已中断', {
      滚动位置: Math.round(元素.滚动容器.scrollTop),
    });
  }
}

function 隐藏跳转边框() {
  if (元素.跳转边框.hidden) {
    return;
  }
  元素.滚动容器.classList.remove('边框跳转中');
  元素.跳转边框.hidden = true;
  元素.跳转边框.removeAttribute('style');
}

function 播放跳转迸发(边框) {
  隐藏跳转迸发();
  元素.跳转迸发.style.left = `${边框.左侧 + 边框.宽度 / 2}px`;
  元素.跳转迸发.style.top = `${边框.顶部 + 边框.高度 / 2}px`;
  布置迸发粒子(边框.宽度 / 2, 边框.高度 / 2);
  元素.跳转迸发.hidden = false;
  void 元素.跳转迸发.offsetWidth; // 连续跳转时强制回流，让同名动画能重新起播
  元素.跳转迸发.classList.add('跳转迸发播放中');
  元素.跳转迸发.addEventListener('animationend', 隐藏跳转迸发, { once: true });
  // 页面切到后台时 CSS 动画会冻结，animationend 迟迟不来，用计时器兜底收走火花
  状态.迸发计时器 = window.setTimeout(隐藏跳转迸发, 跳转迸发时长 + 80);

  function 布置迸发粒子(字体半宽, 字体半高) {
    for (const 粒子 of 元素.跳转迸发.children) {
      const 弧度 = Math.random() * Math.PI * 2;
      const 水平分量 = Math.cos(弧度);
      const 竖直分量 = Math.sin(弧度);
      const 粒子尺寸 = 迸发最小尺寸 + Math.random() * 迸发尺寸差;
      const 起跳半宽 = 字体半宽 + 迸发起跳留白 + 粒子尺寸 / 2;
      const 起跳半高 = 字体半高 + 迸发起跳留白 + 粒子尺寸 / 2;
      const 起跳距离 = Math.min(
        起跳半宽 / Math.abs(水平分量),
        起跳半高 / Math.abs(竖直分量),
      );
      const 起x = 水平分量 * 起跳距离;
      const 起y = 竖直分量 * 起跳距离;
      const 射程 = 迸发最短射程 + Math.random() * 迸发射程差;
      const 水平位移 = 水平分量 * 射程;
      const 竖直位移 = 竖直分量 * 射程;
      // 该二次曲线等价于匀速横移叠加垂直重力加速度
      粒子.style.offsetPath = `path("M ${起x.toFixed(1)} ${起y.toFixed(1)} Q ${(起x + 水平位移 / 2).toFixed(1)} ${(起y + 竖直位移 / 2).toFixed(1)} ${(起x + 水平位移).toFixed(1)} ${(起y + 竖直位移 + 迸发重力位移).toFixed(1)}")`;
      粒子.style.setProperty('--粒子尺寸', `${粒子尺寸.toFixed(1)}px`);
    }
  }
}

function 隐藏跳转迸发() {
  if (元素.跳转迸发.hidden && !状态.迸发计时器) {
    return;
  }
  window.clearTimeout(状态.迸发计时器);
  状态.迸发计时器 = 0;
  元素.跳转迸发.removeEventListener('animationend', 隐藏跳转迸发);
  元素.跳转迸发.classList.remove('跳转迸发播放中');
  元素.跳转迸发.hidden = true;
  元素.跳转迸发.style.removeProperty('left');
  元素.跳转迸发.style.removeProperty('top');
}

/* 快速翻页开始时，在原视口的翻页方向边界画一条线，随内容滚动扫过视口，
   标明新旧内容衔接位置；停留结束后再淡出。
   衔接线位于虚拟画布内（文档坐标），随内容滚动，天然落在新旧内容交界处。 */
function 显示衔接线(滚动位置) {
  取消衔接线淡出();
  if (!状态.行高) {
    return;
  }
  const 行对齐位置 = Math.round(滚动位置 / 状态.行高) * 状态.行高;
  元素.衔接线.style.top = `${行对齐位置}px`;
  元素.衔接线.hidden = false;
}

function 隐藏衔接线() {
  if (元素.衔接线.hidden) {
    return;
  }
  元素.衔接线.classList.add('播放中'); // 播放 衔接线淡出（opacity 1 → 0）
  元素.衔接线.addEventListener('animationend', 收起衔接线, { once: true });
  状态.衔接线计时器 = window.setTimeout(收起衔接线, 衔接线播放时长 + 80);
}

function 取消衔接线淡出() {
  window.clearTimeout(状态.衔接线计时器);
  元素.衔接线.classList.remove('播放中');
  元素.衔接线.removeEventListener('animationend', 收起衔接线);
}

function 收起衔接线() {
  元素.衔接线.hidden = true;
  取消衔接线淡出();
}

function 查找首个相交命中(关键词, 文本偏移) {
  let 左边界 = 0;
  let 右边界 = 关键词.命中位置.length;
  while (左边界 < 右边界) {
    const idx = (左边界 + 右边界) >>> 1;
    if (关键词.命中位置[idx] + 关键词.文本.length <= 文本偏移) {
      左边界 = idx + 1;
    } else {
      右边界 = idx;
    }
  }
  return 左边界;
}

function 查找首个不小于的命中(关键词, 文本偏移) {
  let 左边界 = 0;
  let 右边界 = 关键词.命中位置.length;
  while (左边界 < 右边界) {
    const idx = (左边界 + 右边界) >>> 1;
    if (关键词.命中位置[idx] < 文本偏移) {
      左边界 = idx + 1;
    } else {
      右边界 = idx;
    }
  }
  return 左边界;
}

function 二分查找精确命中(关键词, 文本偏移) {
  const idx = 查找首个不小于的命中(关键词, 文本偏移);
  return 关键词.命中位置[idx] === 文本偏移 ? idx : -1;
}

function 更新文档标题() {
  let 标题 = '';
  let 行起点 = 0;
  while (行起点 < 状态.文本.length && !标题) {
    let 行终点 = 状态.文本.indexOf('\n', 行起点);
    if (行终点 === -1) {
      行终点 = 状态.文本.length;
    }
    标题 = 状态.文本.slice(行起点, 行终点).trim();
    行起点 = 行终点 + 1;
  }
  document.title = `${标题 || 状态.文件名.replace(/\.txt$/i, '')} · 原文阅读器`;
}

function 安排保存持久化状态() {
  window.clearTimeout(状态.保存计时器);
  状态.保存计时器 = window.setTimeout(保存持久化状态, 120);
}

function 保存持久化状态() {
  if (!状态.文件名 || !状态.行起点列表.length) {
    return;
  }

  window.clearTimeout(状态.保存计时器);
  状态.保存计时器 = 0;
  const 阅读位置 = 读取阅读位置();
  const 持久化数据 = 读取持久化数据();
  持久化数据.当前文件名 = 状态.文件名;
  持久化数据.文本状态[状态.文件名] = {
    文件名: 状态.文件名,
    文本长度: 状态.文本.length,
    ...阅读位置,
    当前关键词id: 状态.当前关键词id,
    关键词排序: 状态.关键词排序,
    关键词面板展开: 状态.关键词面板展开,
    自动滚动速度: 状态.自动滚动速度,
    字号: 状态.字号,
    行高: 状态.行高,
    当前字体标签,
    字体: { 引号内: 字体设置.引号内, 引号外: 字体设置.引号外 },
    字体粗细: {
      引号内: 字体粗细设置.引号内,
      引号外: 字体粗细设置.引号外,
    },
    字体颜色: {
      引号内: 字体颜色设置.引号内,
      引号外: 字体颜色设置.引号外,
    },
    关键词样式: { 颜色: 关键词颜色, 粗细: 关键词粗细 },
    奇偶行颜色: { ...奇偶行颜色 },
    奇偶行左侧边框显示,
    引文背景色启用,
    引文背景色: { ...引文背景色 },
    引文边框启用,
    关键词列表: 状态.关键词列表.map(function 序列化关键词(关键词) {
      return {
        id: 关键词.id,
        文本: 关键词.文本,
        当前命中idx: 关键词.当前命中idx,
        配色idx: 关键词.配色idx,
      };
    }),
  };
  localStorage.setItem(持久化键, JSON.stringify(持久化数据));
}

function 读取阅读位置() {
  const 行位置 = 获取静止滚动位置() / 状态.行高;
  const 顶部行idx = Math.min(状态.行起点列表.length - 1, Math.floor(行位置));
  return {
    阅读偏移: 状态.行起点列表[顶部行idx],
    行内比例: 行位置 - 顶部行idx,
  };
}

function 计算阅读位置(阅读位置) {
  const 阅读偏移 = Math.min(状态.文本.length, Math.max(0, 阅读位置.阅读偏移));
  const 行内比例 = Math.min(1, Math.max(0, 阅读位置.行内比例));
  return (查找偏移所在行(阅读偏移) + 行内比例) * 状态.行高;
}

function 查找偏移所在行(文本偏移) {
  let 左边界 = 0;
  let 右边界 = 状态.行起点列表.length - 1;

  while (左边界 <= 右边界) {
    const idx = (左边界 + 右边界) >>> 1;
    if (状态.行起点列表[idx] <= 文本偏移) {
      左边界 = idx + 1;
    } else {
      右边界 = idx - 1;
    }
  }

  const idx = Math.max(0, 右边界);
  if (状态.行起点列表[idx] === 文本偏移 && 状态.行终点列表[idx] === 文本偏移) {
    return idx;
  }
  if (状态.行终点列表[idx] <= 文本偏移 && idx + 1 < 状态.行起点列表.length) {
    return idx + 1;
  }
  return idx;
}

function 显示文本处理错误(错误) {
  const 文字 =
    错误 instanceof RangeError
      ? '文本过大，当前窗口宽度下超出了 Chrome 的安全滚动高度。'
      : '文本处理失败，请查看控制台错误信息。';
  显示错误(文字, 错误);
}

function 显示错误(文字, 错误) {
  元素.载入状态.classList.add('错误');
  元素.载入状态.querySelector('.载入线').hidden = true;
  元素.载入状态.querySelector('p').textContent = 文字;
  元素.载入状态.hidden = false;
  console.error('[阅读器] 操作失败', 错误);
}
