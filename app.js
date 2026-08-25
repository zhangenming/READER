import {
  shift双击中阈值,
  关键词排序方式列表,
  双击判定延迟,
  字素分段器,
  拼音排序器,
  文本目录地址,
  时间格式器,
  最大字号,
  最大行高,
  最小字号,
  最小行高硬下限,
  汉字模式,
  自动滚动反向翻页停留时长,
  自动滚动快速速度,
  自动滚动最低速度,
  自动滚动最高速度,
  自动滚动滚轮归一化,
  自动滚动滚轮死区,
  自动滚动滚轮灵敏系数,
  自动滚动界面间隔,
  自动滚动统计保存间隔,
  自动滚动缓动时长,
  自动滚动翻页距离比例,
  自动滚动默认速度,
  自适应密度因子上限,
  自适应密度因子下限,
  自适应滚动强度,
  自适应窗口下移比例,
  自适应视口负担下限,
  衔接线停留时长,
  词组分段器,
  高亮配色,
  默认关键词颜色,
  默认内置字词颜色,
  默认奇偶行颜色,
  默认字号,
  默认引文背景色,
  默认文件名,
  默认纸面色,
  默认行高,
  默认页面背景色,
} from './js/常量.js';
import { 创建Uint32Array, 创建Uint8Array, 按需让出主线程 } from './js/调度.js';
import {
  是句内停顿码,
  是有效文本文件名,
  是汉字,
  是阅读字符码,
} from './js/文本工具.js';
import {
  元素,
  外观,
  奇偶行颜色,
  字体粗细设置,
  字体设置,
  字体颜色设置,
  引文背景色,
  状态,
  统计,
} from './js/状态.js';
import { 显示文本处理错误, 显示错误 } from './js/错误提示.js';
import {
  二分句段起点,
  创建行索引,
  刷新画布尺寸,
  提交行索引,
  查找偏移所在行,
  计算句段负担,
  计算最小行高,
  读取正文排版,
  重建行索引,
} from './js/排版引擎.js';
import { 渲染可见行, 设置文本 } from './js/虚拟渲染.js';
import {
  关闭上下文弹窗,
  切换关键词排序,
  创建关键词标记,
  删除关键词标记,
  打开上下文弹窗,
  排序后的关键词列表,
  有弹窗打开,
  查找关键词,
  查找关键词命中,
  渲染关键词面板,
  读取选择关键词,
  追加上下文行块,
} from './js/关键词.js';
import { 更新关键词指示器 } from './js/指示器.js';
import {
  更新滚动块,
  更新滚动块位置,
  读取滚动条度量,
  轨道中心转滚动位置,
} from './js/滚动条.js';
import {
  动画滚动到,
  取消滚动动画,
  显示当前命中位置提示,
  显示衔接线,
  获取元素命中边框,
  获取元素行位置,
  获取当前命中边框,
  获取静止滚动位置,
  跳到命中,
  隐藏衔接线,
} from './js/跳转动画.js';
import {
  今日滚动后缀,
  更新自动滚动速度,
  格式化当前滚动分钟,
  格式化滚动小时,
  确保今日滚动统计,
  载入自动滚动统计,
} from './js/自动滚动.js';
import {
  关闭字体弹窗,
  切换字体标签,
  处理字体粗细按钮点击,
  处理字体粗细滚轮,
  处理字体选项点击,
  处理字号滚轮,
  处理行距滚轮,
  字体粗细列表,
  打开字体弹窗,
  更新字号显示,
  更新行高显示,
  离开字号调节,
  离开行距调节,
  设置关键词粗细,
  设置关键词颜色,
  设置内置字词颜色,
  设置区域颜色,
  设置奇偶行颜色,
  设置引文背景色,
  设置引文背景颜色,
  设置引文边框显示,
  设置纸面色,
  设置阶梯段落,
  设置页面背景色,
  调整字号,
  调整行高,
  进入字号调节,
  进入行距调节,
  重置字体设置,
} from './js/字体设置.js';
import {
  保存持久化状态,
  安排保存持久化状态,
  计算阅读位置,
  读取持久化数据,
  读取阅读位置,
} from './js/持久化.js';

启动();

function 启动() {
  载入自动滚动统计();
  绑定事件();
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
        重建行索引(新排版);
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

  const 全文单字 = await 统计全文单字(文本);
  if (!全文单字) {
    return;
  }

  try {
    const 已应用 = await 应用文本(
      文本,
      文件名,
      全文单字,
      function 载入仍然有效() {
        return 本次载入序号 === 状态.载入序号;
      },
    );
    if (!已应用) {
      return;
    }
    保存持久化状态();
  } catch (错误) {
    显示文本处理错误(错误);
  }

  async function 统计全文单字(全文) {
    const 汉字频次 = new Map();
    let 已扫描字符数 = 0;
    let 时间片开始 = performance.now();
    for (const 字 of 全文) {
      if (是汉字(字)) {
        汉字频次.set(字, (汉字频次.get(字) ?? 0) + 1);
      }
      已扫描字符数 += 1;
      if ((已扫描字符数 & 4095) === 0) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (本次载入序号 !== 状态.载入序号) {
          return null;
        }
      }
    }
    if (本次载入序号 !== 状态.载入序号) {
      return null;
    }
    return new Set(
      [...汉字频次]
        .filter(function 筛选全文单字([, 频次]) {
          return 频次 === 1;
        })
        .map(function 读取全文单字([字]) {
          return 字;
        }),
    );
  }
}

function 创建文本地址(文件名) {
  return new URL(encodeURIComponent(文件名), 文本目录地址);
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
  let 按键滚动状态 = null;
  let 上次滚动统计保存时刻 = 0;
  let 当前词频字数 = 1;
  let 当前词频页码 = 1;
  const 每页词频数 = 200;
  const 每批分析结果数 = 200;
  const 文本字数任务 = new Map();
  let 词频分析任务 = null;
  let 词组分析序号 = 0;
  let 分析结果视图 = null;
  let 查找临时状态 = null;
  let 实时查找计时器 = 0;
  const 实时查找延迟 = 250; // 输入停止后延时触发实时查找，避免每个按键都全文扫描
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
  元素.滚动容器.addEventListener('pointermove', 处理正文指针移动, {
    passive: true,
  });
  元素.滚动容器.addEventListener('pointerover', 处理高亮移入);
  元素.滚动容器.addEventListener('pointerout', 处理高亮移出);
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
  // 中文输入法组词过程中不触发实时查找
  元素.查找输入框.addEventListener('compositionstart', function 标记合成开始() {
    元素.查找输入框.dataset.合成中 = '1';
    window.clearTimeout(实时查找计时器);
  });
  // 组词结束后主动提交一次：部分输入法上屏后的最终 input 事件不会到达或先于本事件，
  // 仅依赖 input 会漏掉最后一次更新，导致实时查询不触发（表现为上一个/下一个一直禁用）。
  元素.查找输入框.addEventListener('compositionend', function 合成结束提交() {
    delete 元素.查找输入框.dataset.合成中;
    window.clearTimeout(实时查找计时器);
    实时查找计时器 = window.setTimeout(执行实时查找, 实时查找延迟);
  });
  元素.分析结果摘要.addEventListener('click', 处理词组分析);
  元素.查找上一个按钮.addEventListener('click', function 定位查找上一个() {
    定位查找命中(-1);
  });
  元素.查找下一个按钮.addEventListener('click', function 定位查找下一个() {
    定位查找命中(1);
  });
  元素.分析分栏.addEventListener('scroll', 处理分析结果滚动, {
    passive: true,
  });
  元素.关闭查找按钮.addEventListener('click', 关闭查找弹窗);
  元素.查找弹窗.addEventListener('click', 处理查找弹窗点击);
  元素.查找弹窗.addEventListener('close', 取消词组分析);
  元素.查找弹窗.addEventListener('close', 处理查找弹窗关闭);
  元素.关键词面板开关.addEventListener('click', 处理面板开关);
  元素.关键词列表容器.addEventListener('click', 处理面板操作);
  document.addEventListener('click', 处理关键词面板外部点击);
  元素.关闭上下文按钮.addEventListener('click', 关闭上下文弹窗);
  元素.上下文弹窗.addEventListener('click', 处理上下文弹窗点击);
  元素.上下文弹窗.addEventListener('close', 处理上下文弹窗关闭);
  元素.上下文列表.addEventListener('click', 处理上下文行点击);
  元素.上下文列表.addEventListener('scroll', 处理上下文滚动, {
    passive: true,
  });
  元素.关闭词频按钮.addEventListener('click', 关闭词频弹窗);
  元素.词频弹窗.addEventListener('click', 处理词频弹窗点击);
  元素.词频弹窗.addEventListener('close', 取消词频分析);
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
  元素.字体标签背景.addEventListener('click', () => 切换字体标签('背景'));
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
  元素.阶梯段落开关.addEventListener('change', function 切换阶梯段落() {
    设置阶梯段落(元素.阶梯段落开关.checked);
  });
  元素.换行标记开关.addEventListener('change', function 切换换行标记() {
    设置换行标记显示(元素.换行标记开关.checked);
  });
  元素.关键词颜色选择器.addEventListener('input', function 切换关键词颜色() {
    设置关键词颜色(元素.关键词颜色选择器.value);
  });
  元素.字体颜色选择器.addEventListener('input', function 切换字体颜色() {
    // 字体颜色只在「全部」tab 提供，统一控制全文（引号内 + 引号外）字色。
    // 先捕获当前值：设置区域内会重渲染选择器（内外暂不一致时回填默认值），
    // 第二次调用若再直接读 value 就会把引号外设成默认色。
    const 颜色 = 元素.字体颜色选择器.value;
    设置区域颜色('引号内', 颜色, { 静默: true });
    设置区域颜色('引号外', 颜色);
  });
  元素.内置字词颜色选择器.addEventListener(
    'input',
    function 切换内置字词颜色() {
      设置内置字词颜色(元素.内置字词颜色选择器.value);
    },
  );
  元素.奇数行颜色选择器.addEventListener('input', function 切换奇数行颜色() {
    设置奇偶行颜色('奇数', 元素.奇数行颜色选择器.value);
  });
  元素.偶数行颜色选择器.addEventListener('input', function 切换偶数行颜色() {
    设置奇偶行颜色('偶数', 元素.偶数行颜色选择器.value);
  });
  元素.背景色选择器.addEventListener('input', function 切换阅读背景色() {
    const 颜色 = 元素.背景色选择器.value;
    设置纸面色(颜色, { 静默: true });
    设置页面背景色(颜色);
  });
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
  // 标签页隐藏时立即落盘，避免长时间滚动会话中累计的自动滚动时长丢失
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && 状态.文件名) {
      保存持久化状态();
    }
  });

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
    暂停正文悬停();
    if (状态.拖选状态) {
      if (元素.滚动容器.scrollTop !== 状态.拖选状态.滚动位置) {
        元素.滚动容器.scrollTop = 状态.拖选状态.滚动位置;
        状态.拖选状态.已阻止滚动 = true;
      }
      return;
    }

    if (自动滚动状态 || 状态.滚动动画目标 || 状态.滚动帧) {
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

    function 暂停正文悬停() {
      if (状态.正文悬停已暂停) {
        return;
      }
      状态.正文悬停已暂停 = true;
      if (状态.悬停关键词id !== null) {
        切换同组高亮(null, null);
      }
    }
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
    停止按键滚动('窗口失去焦点');
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
    const 滚动条度量 = 读取滚动条度量(
      轨道边框.height,
      元素.滚动容器.clientHeight,
      元素.滚动容器.scrollHeight,
    );
    if (滚动条度量.滚动块行程 <= 0 || 滚动条度量.最大滚动位置 <= 0) {
      return;
    }
    const 滚动块中心 =
      指针Y - 轨道边框.top - 块内偏移 + 滚动条度量.滚动块高度 / 2;
    元素.滚动容器.scrollTop = 轨道中心转滚动位置(滚动块中心, 滚动条度量);
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

    // ← / ↑ / ↓ 方向键与 Space / Shift+Space 完全等价：↓ 向前翻整屏，← / ↑ 向后翻整屏。
    const 是箭头翻页键 =
      事件.key === 'ArrowLeft' ||
      事件.key === 'ArrowUp' ||
      事件.key === 'ArrowDown';
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
      自动滚动状态
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

  function 处理键盘松开(事件) {
    if (事件.key.toLowerCase() === 按键滚动状态?.按键) {
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

  function 处理高亮移出(事件) {
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

  function 切换同组高亮(关键词id, 命中idx) {
    const 旧悬停id = 状态.悬停关键词id;
    状态.悬停关键词id = 关键词id;
    状态.悬停命中idx = 命中idx;
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
        关键词id !== null &&
          命中元素.classList.contains('当前关键词组') &&
          !是悬停关键词,
      );
      命中元素.classList.toggle(
        '悬停隐藏当前框',
        关键词id !== null && 命中元素.classList.contains('当前命中'),
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

  function 处理正文指针移动(事件) {
    if (!状态.正文悬停已暂停 || 事件.pointerType === 'touch') {
      return;
    }
    状态.正文悬停已暂停 = false;
    处理高亮移入(事件);
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
    window.clearTimeout(实时查找计时器);
    实时查找计时器 = 0;
    元素.查找弹窗.close();
    元素.滚动容器.focus({ preventScroll: true });
  }

  function 处理查找弹窗关闭() {
    if (!查找临时状态) {
      return;
    }
    const 原状态 = 查找临时状态;
    查找临时状态 = null;
    移除临时查找关键词();
    状态.当前关键词id = 原状态.当前关键词id;
    const 原关键词 = 查找关键词(原状态.当前关键词id);
    if (原关键词 && 原状态.当前命中idx >= 0) {
      原关键词.当前命中idx = Math.min(
        原状态.当前命中idx,
        原关键词.命中位置.length - 1,
      );
    }
    状态.悬停关键词id = 原状态.悬停关键词id;
    状态.悬停命中idx = 原状态.悬停命中idx;
    渲染可见行(true);
    更新关键词指示器();
    动画滚动到(原状态.滚动位置);
    console.info('[阅读器] 查找临时定位已恢复', {
      阅读偏移: 原状态.阅读位置.阅读偏移,
    });
  }

  function 处理查找弹窗点击(事件) {
    if (事件.target === 元素.查找弹窗) {
      关闭查找弹窗();
    }
  }

  async function 打开词频弹窗() {
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
    if (词频分析任务) {
      return;
    }

    元素.词频摘要.textContent = '正在统计全文';
    元素.词频列表.replaceChildren();
    元素.单字重复列表.replaceChildren();
    元素.单字一次列表.replaceChildren();
    元素.词频分页.hidden = true;
    const 本次任务 = {
      载入序号: 状态.载入序号,
      文本: 状态.文本,
    };
    词频分析任务 = 本次任务;
    await scheduler.yield();
    try {
      const 开始时间 = performance.now();
      const 分析 = await 统计全文词频(本次任务.文本, 任务仍然有效);
      if (!分析 || !任务仍然有效()) {
        return;
      }
      状态.词频分析 = 分析;
      当前词频页码 = 1;
      渲染词频页();
      console.info('[阅读器] 词频分析完成', {
        汉字总数: 分析.汉字总数,
        去重汉字数: 分析.去重汉字数,
        单字种数: 分析.列表[1].length,
        二字种数: 分析.列表[2].length,
        三字种数: 分析.列表[3].length,
        四字种数: 分析.列表[4].length,
        五字种数: 分析.列表[5].length,
        六字种数: 分析.列表[6].length,
        只出现一次单字数: 分析.单字列表.一次.length,
        耗时毫秒: Math.round(performance.now() - 开始时间),
      });
    } finally {
      if (词频分析任务 === 本次任务) {
        词频分析任务 = null;
      }
    }

    function 任务仍然有效() {
      return (
        词频分析任务 === 本次任务 &&
        状态.载入序号 === 本次任务.载入序号 &&
        状态.文本 === 本次任务.文本
      );
    }
  }

  function 关闭词频弹窗() {
    if (!元素.词频弹窗.open) {
      return;
    }
    元素.词频弹窗.close();
    元素.滚动容器.focus({ preventScroll: true });
  }

  function 取消词频分析() {
    if (!词频分析任务) {
      return;
    }
    词频分析任务 = null;
    元素.词频摘要.textContent = '统计已取消';
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

  async function 统计全文词频(全文, 任务仍然有效) {
    const 词频映射 = Array.from({ length: 7 }, function 创建词频映射() {
      return new Map();
    });
    const 连续汉字 = [];
    let 汉字总数 = 0;
    let 文本位置 = 0;
    let 已扫描字符数 = 0;
    let 时间片开始 = performance.now();

    for (const 字 of 全文) {
      if (!是汉字(字)) {
        连续汉字.length = 0;
        文本位置 += 字.length;
      } else {
        汉字总数 += 1;
        连续汉字.push({ 字, 位置: 文本位置 });
        if (连续汉字.length > 6) {
          连续汉字.shift();
        }
        let 字词 = '';
        for (
          let 起点 = 连续汉字.length - 1, 字数 = 1;
          起点 >= 0;
          起点 -= 1, 字数 += 1
        ) {
          字词 = 连续汉字[起点].字 + 字词;
          记录词频(词频映射[字数], 字词, 连续汉字[起点].位置);
        }
        文本位置 += 字.length;
      }
      已扫描字符数 += 1;
      if ((已扫描字符数 & 255) === 0) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!任务仍然有效()) {
          return null;
        }
      }
    }

    const 被更长组合覆盖 = Array.from({ length: 7 }, function 创建覆盖集合() {
      return new Set();
    });
    let 已检查组合数 = 0;
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
        已检查组合数 += 1;
        if ((已检查组合数 & 1023) === 0) {
          时间片开始 = await 按需让出主线程(时间片开始);
          if (!任务仍然有效()) {
            return null;
          }
        }
      }
    }

    const 列表 = {};
    for (const 字数 of [1, 2, 3, 4, 5, 6]) {
      const 统计列表 = [];
      for (const [文本, 统计] of 词频映射[字数]) {
        if (字数 === 1 || (统计.数量 > 1 && !被更长组合覆盖[字数].has(文本))) {
          统计列表.push({ 文本, 数量: 统计.数量, 首次位置: 统计.首次位置 });
        }
        已检查组合数 += 1;
        if ((已检查组合数 & 1023) === 0) {
          时间片开始 = await 按需让出主线程(时间片开始);
          if (!任务仍然有效()) {
            return null;
          }
        }
      }
      统计列表.sort(function 排序词频(左项, 右项) {
        return 右项.数量 - 左项.数量 || 左项.首次位置 - 右项.首次位置;
      });
      列表[字数] = 统计列表;
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
    // 输入框已无独立按钮，回车仅用于跳过防抖立即查询
    事件.preventDefault();
    window.clearTimeout(实时查找计时器);
    实时查找计时器 = 0;
    执行实时查找();
  }

  function 执行实时查找() {
    实时查找计时器 = 0;
    const 查询 = 解析查找查询(元素.查找输入框.value.trim());
    if (查询.错误 || !查询.目标) {
      // 输入为空或不完整时静默清除旧结果
      清除查找错误();
      取消词组分析();
      清空分析结果();
      if (查找临时状态) {
        状态.悬停关键词id = 查找临时状态.悬停关键词id;
        状态.悬停命中idx = 查找临时状态.悬停命中idx;
        移除临时查找关键词();
        渲染可见行(true);
        更新关键词指示器();
      }
      return;
    }
    if (!状态.文件名) {
      显示查找错误('正文尚未载入');
      return;
    }

    const 命中位置 = 查找带排除前缀的命中(查询.目标, 查询.排除前缀);
    if (!命中位置.length) {
      显示查找错误('未找到该关键词');
      更新查找导航状态(null);
      清空分析结果();
      console.info('[阅读器] 查找无匹配', { 查询 });
      return;
    }

    const 关键词 = 创建临时查找关键词(
      元素.查找输入框.value.trim(),
      查询,
      命中位置,
    );
    查找临时状态.命中idx = 0;
    更新查找导航状态(关键词);
    临时跳到查找命中(0);
    // 实时刷新下方搭配分析面板
    处理词组分析();
  }

  function 解析查找查询(查询文本) {
    const 字素 = Array.from(查询文本);
    let idx = 0;
    const 排除列表 = [];
    while (字素[idx] === '!') {
      if (!字素[idx + 1]) {
        return { 目标: '', 排除前缀: '', 错误: '排除符号后需要一个字符' };
      }
      排除列表.push(字素[idx + 1]);
      idx += 2;
    }
    return {
      目标: 字素.slice(idx).join(''),
      排除前缀: 排除列表.join(''),
    };
  }

  function 查找带排除前缀的命中(关键词文本, 排除前缀) {
    const 命中数组 = [];
    const 文本字素列表 = 字素分段器.segment(状态.文本);
    let 搜索位置 = 0;
    while (搜索位置 <= 状态.文本.length - 关键词文本.length) {
      const 命中位置 = 状态.文本.indexOf(关键词文本, 搜索位置);
      if (命中位置 === -1) {
        break;
      }
      const 起点在字素边界 =
        文本字素列表.containing(命中位置)?.index === 命中位置;
      const 命中终点 = 命中位置 + 关键词文本.length;
      const 终点在字素边界 =
        命中终点 === 状态.文本.length ||
        文本字素列表.containing(命中终点)?.index === 命中终点;
      const 前缀匹配 =
        排除前缀 &&
        状态.文本.slice(Math.max(0, 命中位置 - 排除前缀.length), 命中位置) ===
          排除前缀;
      if (起点在字素边界 && 终点在字素边界 && !前缀匹配) {
        命中数组.push(命中位置);
      }
      搜索位置 = 命中位置 + Math.max(1, 关键词文本.length);
    }
    return Uint32Array.from(命中数组);
  }

  function 创建临时查找关键词(原查询, 查询, 命中位置) {
    移除临时查找关键词();
    const 关键词 = 创建关键词标记(查询.目标, 命中位置);
    关键词.临时 = true;
    状态.查找临时关键词id = 关键词.id;
    if (!查找临时状态) {
      查找临时状态 = {
        阅读位置: 读取阅读位置(),
        滚动位置: 获取静止滚动位置(),
        当前关键词id: 状态.当前关键词id,
        当前命中idx: 查找关键词(状态.当前关键词id)?.当前命中idx ?? -1,
        悬停关键词id: 状态.悬停关键词id,
        悬停命中idx: 状态.悬停命中idx,
      };
    }
    查找临时状态.原查询 = 原查询;
    查找临时状态.查询 = 查询;
    查找临时状态.关键词id = 关键词.id;
    状态.悬停关键词id = 关键词.id;
    状态.悬停命中idx = 0;
    return 关键词;
  }

  function 移除临时查找关键词() {
    if (状态.查找临时关键词id === null) {
      return;
    }
    const idx = 状态.关键词列表.findIndex(function 找到临时关键词(关键词) {
      return 关键词.id === 状态.查找临时关键词id;
    });
    if (idx >= 0) {
      状态.关键词列表.splice(idx, 1);
    }
    状态.查找临时关键词id = null;
    状态.指示器缓存 = null;
    更新查找导航状态(null);
  }

  function 临时跳到查找命中(命中idx) {
    const 关键词 = 查找关键词(状态.查找临时关键词id);
    if (!关键词 || !查找临时状态) {
      return;
    }
    查找临时状态.命中idx = Math.max(
      0,
      Math.min(命中idx, 关键词.命中位置.length - 1),
    );
    状态.悬停关键词id = 关键词.id;
    状态.悬停命中idx = 查找临时状态.命中idx;
    渲染可见行(true);
    更新关键词指示器();
    const 行idx = 查找偏移所在行(关键词.命中位置[查找临时状态.命中idx]);
    const 目标位置 =
      行idx * 状态.行高 - (元素.滚动容器.clientHeight - 状态.行高) / 2;
    更新查找导航状态(关键词);
    动画滚动到(目标位置);
  }

  function 定位查找命中(方向) {
    const 关键词 = 查找关键词(状态.查找临时关键词id);
    if (!关键词?.命中位置.length || !查找临时状态) {
      return;
    }
    const 下一个idx =
      (查找临时状态.命中idx + 方向 + 关键词.命中位置.length) %
      关键词.命中位置.length;
    临时跳到查找命中(下一个idx);
  }

  function 更新查找导航状态(关键词) {
    const 有效关键词 = 关键词 || 查找关键词(状态.查找临时关键词id);
    const 命中数 = 有效关键词?.命中位置.length ?? 0;
    const 当前idx = 查找临时状态?.命中idx ?? -1;
    元素.查找命中摘要.textContent = 命中数
      ? `${(当前idx + 1).toLocaleString('zh-CN')} / ${命中数.toLocaleString('zh-CN')}`
      : '';
    元素.查找上一个按钮.disabled = !命中数;
    元素.查找下一个按钮.disabled = !命中数;
  }

  async function 处理词组分析() {
    const 前缀 = 元素.查找输入框.value.trim();
    if (!前缀) {
      清空分析结果();
      return;
    }
    if (!状态.文件名) {
      清空分析结果();
      显示查找错误('正文尚未载入');
      return;
    }

    清除查找错误();
    const 本次分析序号 = ++词组分析序号;
    const 本次载入序号 = 状态.载入序号;
    const 分析文本 = 状态.文本;
    await scheduler.yield();
    const 开始时间 = performance.now();
    try {
      const 命中位置 = 查找关键词命中(前缀);
      if (!分析仍然有效()) {
        return;
      }
      if (!命中位置.length) {
        清空分析结果();
        显示查找错误('未找到该关键词');
        console.info('[阅读器] 关键词分析无匹配', { 关键词: 前缀 });
        return;
      }

      // 左右两组搭配分别计数；只出现 1 次的词组属于偶发组合，不展示。
      // 两栏都只记录「接续部分」本身：左侧是前置词，右侧把关键词自身切掉。
      const 后续数量 = new Map();
      const 前置数量 = new Map();
      let 已分析命中数 = 0;
      let 时间片开始 = performance.now();
      for (const 文本偏移 of 命中位置) {
        const 后续词组 = 提取后续词组(文本偏移);
        if (后续词组 !== 前缀) {
          const 接续 = 后续词组.slice(前缀.length);
          if (接续) {
            后续数量.set(接续, (后续数量.get(接续) ?? 0) + 1);
          }
        }
        const 前置词组 = 提取前置词组(文本偏移);
        if (前置词组 && 前置词组 !== 前缀) {
          前置数量.set(前置词组, (前置数量.get(前置词组) ?? 0) + 1);
        }
        已分析命中数 += 1;
        if ((已分析命中数 & 255) === 0) {
          时间片开始 = await 按需让出主线程(时间片开始);
          if (!分析仍然有效()) {
            return;
          }
        }
      }
      const 转换统计列表 = function 转换统计列表(数量表) {
        return [...数量表]
          .filter(function 过滤单次([, 数量]) {
            return 数量 > 1;
          })
          .map(function 转换统计项([词组, 数量]) {
            return { 词组, 数量 };
          })
          .sort(function 排序统计项(左项, 右项) {
            return (
              右项.数量 - 左项.数量 ||
              左项.词组.localeCompare(右项.词组, 'zh-CN')
            );
          });
      };
      const 后续列表 = 转换统计列表(后续数量);
      const 前置列表 = 转换统计列表(前置数量);
      if (!分析仍然有效()) {
        return;
      }
      渲染分析结果(后续列表, 前置列表, 命中位置.length);

      console.info('[阅读器] 关键词搭配分析完成', {
        关键词: 前缀,
        前置词组数: 前置列表.length,
        后续词组数: 后续列表.length,
        命中数: 命中位置.length,
        耗时毫秒: Math.round(performance.now() - 开始时间),
      });
    } catch (错误) {
      console.error('[阅读器] 关键词搭配分析失败', 错误);
    }

    function 提取后续词组(文本偏移) {
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

    function 提取前置词组(文本偏移) {
      const 起点 = Math.max(0, 文本偏移 - 64);
      const 上下文 = 状态.文本.slice(起点, 文本偏移);
      const 片段列表 = [...词组分段器.segment(上下文)];
      let 词组起点 = 上下文.length;
      for (let idx = 片段列表.length - 1; idx >= 0; idx -= 1) {
        const 片段 = 片段列表[idx];
        const 片段终点 = 片段.index + 片段.segment.length;
        if (片段.index >= 上下文.length) {
          continue;
        }
        if (
          片段终点 > 上下文.length ||
          (片段终点 === 上下文.length && 片段.isWordLike)
        ) {
          词组起点 = 片段.index;
        }
        break;
      }
      return 上下文.slice(词组起点);
    }

    function 渲染分析结果(后续列表, 前置列表, 命中总数) {
      分析结果视图 = { 后续列表, 前置列表, 已渲染后续: 0, 已渲染前置: 0 };
      const 高频词组数 = 后续列表.length + 前置列表.length;
      元素.分析结果摘要.textContent = `${命中总数.toLocaleString('zh-CN')} 次出现 · ${高频词组数} 个高频搭配`;
      元素.前置词组列表.replaceChildren();
      元素.后续词组列表.replaceChildren();
      元素.分析分栏.scrollTop = 0;
      元素.分析分栏.scrollLeft = 0;
      追加分析结果行();
      元素.分析结果.hidden = false;
    }

    function 分析仍然有效() {
      return (
        词组分析序号 === 本次分析序号 &&
        状态.载入序号 === 本次载入序号 &&
        状态.文本 === 分析文本 &&
        元素.查找输入框.value.trim() === 前缀
      );
    }
  }

  function 处理查找输入() {
    取消词组分析();
    清除查找错误();
    清空分析结果();
    if (!元素.查找输入框.dataset.合成中) {
      window.clearTimeout(实时查找计时器);
      实时查找计时器 = window.setTimeout(执行实时查找, 实时查找延迟);
    }
    if (查找临时状态) {
      状态.悬停关键词id = 查找临时状态.悬停关键词id;
      状态.悬停命中idx = 查找临时状态.悬停命中idx;
      移除临时查找关键词();
      渲染可见行(true);
      更新关键词指示器();
    }
  }

  function 处理分析结果滚动() {
    if (
      分析结果视图 &&
      (分析结果视图.已渲染后续 < 分析结果视图.后续列表.length ||
        分析结果视图.已渲染前置 < 分析结果视图.前置列表.length) &&
      元素.分析分栏.scrollTop + 元素.分析分栏.clientHeight >
        元素.分析分栏.scrollHeight - 200
    ) {
      追加分析结果行();
    }
  }

  function 追加分析结果行() {
    if (!分析结果视图) {
      return;
    }
    let 剩余额度 = 每批分析结果数;
    for (const 区间 of [
      {
        列表: 分析结果视图.后续列表,
        进度键: '已渲染后续',
        目标: 元素.后续词组列表,
      },
      {
        列表: 分析结果视图.前置列表,
        进度键: '已渲染前置',
        目标: 元素.前置词组列表,
      },
    ]) {
      const 起点 = 分析结果视图[区间.进度键];
      if (起点 >= 区间.列表.length || 剩余额度 <= 0) {
        continue;
      }
      const 终点 = Math.min(区间.列表.length, 起点 + 剩余额度);
      const 行片段 = document.createDocumentFragment();
      for (let idx = 起点; idx < 终点; idx += 1) {
        const 统计项 = 区间.列表[idx];
        const 行 = document.createElement('li');
        行.className = '分析行';
        const 词组单元格 = document.createElement('span');
        const 数量单元格 = document.createElement('span');
        词组单元格.textContent = 统计项.词组;
        数量单元格.textContent = 统计项.数量.toLocaleString('zh-CN');
        行.append(词组单元格, 数量单元格);
        行片段.append(行);
      }
      区间.目标.append(行片段);
      分析结果视图[区间.进度键] = 终点;
      剩余额度 -= 终点 - 起点;
    }
  }

  function 取消词组分析() {
    词组分析序号 += 1;
  }

  function 显示查找错误(文字) {
    元素.查找反馈.textContent = 文字;
    元素.查找输入框.setAttribute('aria-invalid', 'true');
    元素.查找输入框.focus();
  }

  function 清空分析结果() {
    分析结果视图 = null;
    元素.分析结果.hidden = true;
    元素.分析结果摘要.textContent = '';
    元素.前置词组列表.replaceChildren();
    元素.后续词组列表.replaceChildren();
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

    确保今日滚动统计();
    取消滚动动画();
    结束跳转会话('自动滚动');
    上次滚动统计保存时刻 = performance.now();
    自动滚动状态 = {
      帧: 0,
      上帧时间: performance.now(),
      上次界面时间: 0,
      开始时刻: performance.now(),
      当前速度: 0,
      浮点位置: 元素.滚动容器.scrollTop,
      快速滚动终点: null,
      快速滚动方向: 0,
      衔接位置: null,
      停留结束时间: 0,
      衔接线已淡出: false,
      密度目标速度: 状态.自动滚动速度,
      视口度量: {
        轨道高度: 元素.自定义滚动条.clientHeight,
        容器高度: 元素.滚动容器.clientHeight,
        滚动高度: 元素.滚动容器.scrollHeight,
      },
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
      帧调度: 'requestAnimationFrame',
      辅助界面刷新间隔毫秒: 自动滚动界面间隔,
    });
  }

  function 开始按键滚动(按键, 方向) {
    if (按键滚动状态) {
      return;
    }

    停止自动滚动('按键滚动');
    取消滚动动画();
    结束跳转会话('按键滚动');
    按键滚动状态 = {
      按键,
      方向,
      帧: requestAnimationFrame(执行按键滚动),
      上帧时间: performance.now(),
    };
    console.info('[阅读器] 按键滚动已启动', {
      按键,
      方向: 方向 > 0 ? '向下' : '向上',
      速度: 状态.自动滚动速度 * 2,
    });
  }

  function 执行按键滚动(当前时间) {
    const 本次滚动 = 按键滚动状态;
    if (!本次滚动) {
      return;
    }

    const 最大滚动位置 =
      元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight;
    const 经过毫秒 = Math.min(50, 当前时间 - 本次滚动.上帧时间);
    const 新位置 = Math.max(
      0,
      Math.min(
        最大滚动位置,
        元素.滚动容器.scrollTop +
          (状态.自动滚动速度 * 2 * 本次滚动.方向 * 经过毫秒) / 1000,
      ),
    );
    本次滚动.上帧时间 = 当前时间;
    元素.滚动容器.scrollTop = 新位置;
    const 已到边界 =
      (本次滚动.方向 < 0 && 新位置 <= 0) ||
      (本次滚动.方向 > 0 && 新位置 >= 最大滚动位置 - 0.5);
    if (已到边界) {
      停止按键滚动('已到文章边界');
      return;
    }
    本次滚动.帧 = requestAnimationFrame(执行按键滚动);
  }

  function 停止按键滚动(原因) {
    if (!按键滚动状态) {
      return;
    }

    cancelAnimationFrame(按键滚动状态.帧);
    按键滚动状态 = null;
    更新滚动块();
    渲染可见行();
    安排保存持久化状态();
    console.info('[阅读器] 按键滚动已停止', {
      原因,
      滚动位置: Math.round(元素.滚动容器.scrollTop),
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
      本次滚动.浮点位置 + 元素.滚动容器.clientHeight * 自动滚动翻页距离比例,
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
      向上翻页并暂停自动滚动();
      return;
    }
    调整自动滚动速度(1.1, 来源);
    快速前进自动滚动();
  }

  function 向上翻页并暂停自动滚动() {
    const 本次滚动 = 自动滚动状态;
    if (!本次滚动) {
      return;
    }

    const 起始位置 = 本次滚动.浮点位置;
    const 目标位置 = Math.max(
      0,
      起始位置 - 元素.滚动容器.clientHeight * 自动滚动翻页距离比例,
    );
    本次滚动.快速滚动终点 = 目标位置;
    本次滚动.快速滚动方向 = -1;
    本次滚动.衔接位置 = 起始位置;
    本次滚动.衔接线已淡出 = false;
    本次滚动.当前速度 = -自动滚动快速速度;
    显示衔接线(本次滚动.衔接位置);
    console.info('[阅读器] 自动滚动开始向上翻页', {
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
    // 自动滚动时长统计：按帧累计真实经过时间（rAF 暂停/标签页隐藏不会虚增）
    确保今日滚动统计();
    统计.未入账滚动毫秒 += 经过毫秒;
    if (当前时间 - 上次滚动统计保存时刻 >= 自动滚动统计保存间隔) {
      上次滚动统计保存时刻 = 当前时间;
      安排保存持久化状态();
    }
    元素.滚动容器.scrollTop = 新位置;
    if (当前时间 - 本次滚动.上次界面时间 >= 自动滚动界面间隔) {
      本次滚动.上次界面时间 = 当前时间;
      // 每个界面节拍只读取一次布局尺寸，并把结果传给后续更新，避免写入后反复强制重排。
      const 视口度量 = {
        轨道高度: 元素.自定义滚动条.clientHeight,
        容器高度: 元素.滚动容器.clientHeight,
        滚动高度: 元素.滚动容器.scrollHeight,
      };
      本次滚动.视口度量 = 视口度量;
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
      设置文本(
        元素.实际速度显示,
        `${Math.round((本次滚动.密度目标速度 / 状态.自动滚动速度) * 100)}%`,
      );
      // 当前自动滚动时长：随界面节拍刷新，并显示今日总时长
      设置文本(
        元素.已滚动时间,
        格式化当前滚动分钟(当前时间 - 本次滚动.开始时刻),
      );
      设置文本(元素.今日滚动时间, 今日滚动后缀());
    }
    // scrollTop 在 Chrome 中按整数像素存储；用合成层补回小数位，避免低速时
    // 必须累计到 1px 才产生一次可见移动。滚动块只依赖滚动位置，仍按每个 rAF 更新。
    const 实际滚动位置 = 元素.滚动容器.scrollTop;
    const 小数位移 = 本次滚动.浮点位置 - 实际滚动位置;
    元素.可见内容.style.transform = `translateY(${状态.渲染起点 * 状态.行高 - 小数位移}px)`;
    更新滚动块位置(本次滚动.视口度量, 本次滚动.浮点位置);
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
    元素.剩余滚动时间行.hidden = !正在滚动;
    元素.实际速度显示.hidden = !正在滚动;
    元素.已滚动时间行.hidden = !正在滚动;
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

  function 关闭关键词面板() {
    if (!状态.关键词面板展开) {
      return;
    }
    状态.关键词面板展开 = false;
    渲染关键词面板();
    安排保存持久化状态();
  }

  function 处理关键词面板外部点击(事件) {
    if (!状态.关键词面板展开) {
      return;
    }
    if (元素.关键词面板.contains(事件.target)) {
      return;
    }
    关闭关键词面板();
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
          if (状态.文本字数.has(文件名)) {
            return [文件名, 状态.文本字数.get(文件名)];
          }
          let 统计任务 = 文本字数任务.get(文件名);
          if (!统计任务) {
            统计任务 = 读取并统计文本(文件名).finally(
              function 清理文本字数任务() {
                文本字数任务.delete(文件名);
              },
            );
            文本字数任务.set(文件名, 统计任务);
          }
          return [文件名, await 统计任务];
        }),
      );
      for (const [文件名, 字数] of 统计结果) {
        if (字数 !== null) {
          状态.文本字数.set(文件名, 字数);
        }
      }
      return 状态.文本字数;

      async function 读取并统计文本(文件名) {
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
          let 已扫描字符数 = 0;
          let 时间片开始 = performance.now();
          for (const 字符 of 文本) {
            if (非空白字符模式.test(字符)) {
              字数 += 1;
            }
            已扫描字符数 += 1;
            if ((已扫描字符数 & 8191) === 0) {
              时间片开始 = await 按需让出主线程(时间片开始);
            }
          }
          return 字数;
        } catch (错误) {
          console.error(`[阅读器] 无法统计文本字数：${文件名}`, 错误);
          return null;
        }
      }
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

      const 已阅读时间 = document.createElement('span');
      已阅读时间.className = '内容选项时长';
      已阅读时间.textContent = `已阅读 · ${格式化滚动小时(
        文本状态?.总滚动毫秒 ?? 0,
      )}`;

      const 文本信息 = document.createElement('span');
      文本信息.className = '内容选项信息';
      文本信息.append(名称, 字数, 已阅读时间);

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

function 设置换行标记显示(启用, 选项 = {}) {
  外观.换行标记启用 = 启用;
  document.documentElement.classList.toggle('隐藏换行标记', !启用);
  元素.换行标记开关.checked = 启用;
  if (!选项.静默) {
    安排保存持久化状态();
  }
  console.info('[阅读器] 已设置换行标记', { 启用 });
}

async function 应用文本(原始文本, 文件名, 全文单字, 载入仍然有效) {
  const 开始时间 = performance.now();
  const 阶段耗时 = {};
  let 阶段开始时间 = performance.now();
  const 规范文本 = await 规范化文本(原始文本);
  阶段耗时.文本规范化 = performance.now() - 阶段开始时间;
  if (规范文本 === null) {
    return false;
  }

  阶段开始时间 = performance.now();
  const 原引文索引 = await 创建引文索引(规范文本);
  阶段耗时.引文索引 = performance.now() - 阶段开始时间;
  if (!原引文索引) {
    return false;
  }

  阶段开始时间 = performance.now();
  const 句子整理结果 = await 整理句子换行(规范文本, 原引文索引.边界列表);
  阶段耗时.句子整理 = performance.now() - 阶段开始时间;
  if (!句子整理结果) {
    return false;
  }
  const 文本 = 句子整理结果.文本;
  const 缩进起点集合 = 句子整理结果.缩进起点集合;

  阶段开始时间 = performance.now();
  const 阶梯断点 = await 创建阶梯断点索引(
    文本,
    句子整理结果.引文边界列表,
    缩进起点集合,
    载入仍然有效,
  );
  阶段耗时.阶梯断点 = performance.now() - 阶段开始时间;
  if (!阶梯断点) {
    return false;
  }

  阶段开始时间 = performance.now();
  const 句段负担索引 = await 构建句段负担索引(文本);
  阶段耗时.句段负担 = performance.now() - 阶段开始时间;
  if (!句段负担索引) {
    return false;
  }

  const 上一本书公共状态 = 状态.文件名
    ? {
        自动滚动速度: 状态.自动滚动速度,
        字号: 状态.字号,
        行高: 状态.行高,
        当前字体标签: 外观.当前字体标签,
        字体: { 引号内: 字体设置.引号内, 引号外: 字体设置.引号外 },
        字体粗细: {
          引号内: 字体粗细设置.引号内,
          引号外: 字体粗细设置.引号外,
        },
        字体颜色: {
          引号内: 字体颜色设置.引号内,
          引号外: 字体颜色设置.引号外,
        },
        内置字词颜色: 外观.内置字词颜色,
        关键词样式: { 颜色: 外观.关键词颜色, 粗细: 外观.关键词粗细 },
        奇偶行颜色: { ...奇偶行颜色 },
        页面背景色: 外观.页面背景色,
        纸面色: 外观.纸面色,
        引文背景色启用: 外观.引文背景色启用,
        引文背景色: { ...引文背景色 },
        引文边框启用: 外观.引文边框启用,
        换行标记启用: 外观.换行标记启用,
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
  阶段开始时间 = performance.now();
  const 行索引 = await 创建行索引(
    文本,
    排版,
    缩进起点集合,
    外观.阶梯段落启用 ? 阶梯断点 : null,
    载入仍然有效,
  );
  阶段耗时.行索引 = performance.now() - 阶段开始时间;
  if (!行索引 || !载入仍然有效()) {
    return false;
  }

  状态.排版任务序号 += 1;
  状态.文本 = 文本;
  状态.指示器缓存 = null;
  状态.词频分析 = null;
  状态.全文单字 = 全文单字;
  状态.文件名 = 文件名;
  状态.引文边界列表 = 句子整理结果.引文边界列表;
  状态.缩进起点集合 = 缩进起点集合;
  状态.阶梯断点 = 阶梯断点;
  状态.句段起点列表 = 句段负担索引.句段起点列表;
  状态.句段负担前缀和 = 句段负担索引.句段负担前缀和;
  状态.句段负担总合 = 句段负担索引.句段负担总合;
  状态.关键词列表 = [];
  状态.当前关键词id = null;
  状态.下一个关键词id = 1;
  状态.关键词面板签名 = '';
  状态.跳转起点 = null;
  取消滚动动画();
  隐藏衔接线();
  提交行索引(行索引);
  阶段开始时间 = performance.now();
  恢复文本内容状态(持久化状态);
  阶段耗时.内容状态恢复 = performance.now() - 阶段开始时间;
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
    阶梯断点数: 阶梯断点.起点列表.length,
    阶段耗时毫秒: Object.fromEntries(
      Object.entries(阶段耗时).map(function 取整阶段耗时([阶段, 耗时]) {
        return [阶段, Math.round(耗时)];
      }),
    ),
    耗时毫秒: Math.round(performance.now() - 开始时间),
  });
  return true;

  function 恢复阅读设置(持久化状态) {
    const 根元素 = document.documentElement;
    // 字色与奇偶行底色变量写在 body 上（见 设置区域颜色、设置奇偶行颜色），
    // 清理时也要从 body 移除。
    for (const 变量名 of [
      '--引文墨色',
      '--正文字色',
      '--段落底色一',
      '--段落底色二',
    ]) {
      document.body.style.removeProperty(变量名);
    }
    for (const 变量名 of [
      '--正文字号',
      '--行高',
      '--引文字体',
      '--正文字体',
      '--引文粗细',
      '--正文粗细',
      '--关键词粗细',
      '--内置字词颜色',
      '--奇数引文底色',
      '--偶数引文底色',
      '--背景色',
      '--纸张色',
      '--墨色',
      '--次要墨色',
    ]) {
      根元素.style.removeProperty(变量名);
    }
    字体设置.引号内 = null;
    字体设置.引号外 = null;
    字体粗细设置.引号内 = null;
    字体粗细设置.引号外 = null;
    字体颜色设置.引号内 = null;
    字体颜色设置.引号外 = null;
    外观.内置字词颜色 = 默认内置字词颜色;
    元素.内置字词颜色选择器.value = 默认内置字词颜色;
    外观.关键词颜色 = 默认关键词颜色;
    外观.关键词粗细 = null;
    高亮配色[0].深色 = 默认关键词颜色;
    高亮配色[0].浅色 = '#c5d9f0';
    根元素.style.setProperty('--关键词颜色', 默认关键词颜色);
    元素.关键词颜色选择器.value = 默认关键词颜色;
    Object.assign(奇偶行颜色, 默认奇偶行颜色);
    元素.奇数行颜色选择器.value = 默认奇偶行颜色.奇数;
    元素.偶数行颜色选择器.value = 默认奇偶行颜色.偶数;
    外观.页面背景色 = 默认页面背景色;
    外观.纸面色 = 默认纸面色;
    元素.背景色选择器.value = 默认页面背景色;
    Object.assign(引文背景色, 默认引文背景色);
    元素.奇数引文颜色选择器.value = 默认引文背景色.奇数;
    元素.偶数引文颜色选择器.value = 默认引文背景色.偶数;
    外观.引文背景色启用 = true;
    根元素.classList.remove('隐藏引文背景色');
    元素.引文背景色开关.checked = true;
    外观.引文边框启用 = true;
    根元素.classList.remove('隐藏引文边框');
    元素.引文边框开关.checked = true;
    外观.换行标记启用 = true;
    根元素.classList.remove('隐藏换行标记');
    元素.换行标记开关.checked = true;
    设置阶梯段落(false, { 静默: true });
    外观.当前字体标签 = '引号内';
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
        let 持久化标签 = 持久化状态.当前字体标签;
        if (持久化标签 === '奇偶行') {
          // 旧版「奇偶行」独立标签页已并入「正文」，迁移旧持久化值
          持久化标签 = '引号外';
        }
        if (
          !['全部', '引号内', '引号外', '关键词', '背景'].includes(持久化标签)
        ) {
          throw new TypeError('持久化的字体标签状态无效');
        }
        外观.当前字体标签 = 持久化标签;
      }
      恢复字体设置(持久化状态.字体);
      恢复字体粗细设置(持久化状态.字体粗细);
      恢复字体颜色设置(持久化状态.字体颜色);
      恢复内置字词颜色(持久化状态.内置字词颜色);
      恢复关键词样式(持久化状态.关键词样式);
      恢复奇偶行颜色(持久化状态.奇偶行颜色);
      恢复背景颜色(持久化状态.页面背景色, 持久化状态.纸面色);
      恢复引文背景色设置(持久化状态.引文背景色启用);
      恢复引文背景颜色(持久化状态.引文背景色);
      恢复引文边框设置(持久化状态.引文边框启用);
      恢复换行标记设置(持久化状态.换行标记启用);
      恢复阶梯段落设置(持久化状态.阶梯段落启用);
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

    function 恢复内置字词颜色(持久化颜色) {
      if (持久化颜色 === undefined) return;
      设置内置字词颜色(持久化颜色, { 静默: true });
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

    function 恢复换行标记设置(持久化设置) {
      if (持久化设置 === undefined) {
        return;
      }
      if (typeof 持久化设置 !== 'boolean') {
        throw new TypeError('持久化的换行标记设置格式无效');
      }
      设置换行标记显示(持久化设置, { 静默: true });
    }

    function 恢复阶梯段落设置(持久化设置) {
      if (持久化设置 === undefined) {
        return;
      }
      if (typeof 持久化设置 !== 'boolean') {
        throw new TypeError('持久化的阶梯段落设置格式无效');
      }
      设置阶梯段落(持久化设置, { 静默: true });
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

    function 恢复背景颜色(持久化页面背景色, 持久化纸面色) {
      if (持久化页面背景色 === undefined && 持久化纸面色 === undefined) {
        return;
      }
      for (const [名称, 值] of [
        ['页面背景色', 持久化页面背景色],
        ['纸面色', 持久化纸面色],
      ]) {
        if (值 !== undefined && !/^#[\da-f]{6}$/i.test(值)) {
          throw new TypeError(`持久化的${名称}格式无效`);
        }
      }
      if (持久化页面背景色 !== undefined) {
        设置页面背景色(持久化页面背景色, { 静默: true });
      }
      if (持久化纸面色 !== undefined) {
        设置纸面色(持久化纸面色, { 静默: true });
      }
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

  async function 规范化文本(全文) {
    const 输出片段列表 = [];
    const 文本长度 = 全文.length;
    const 文本起点 = 全文.charCodeAt(0) === 0xfeff ? 1 : 0;
    let 上次截取位置 = 文本起点;
    let 时间片开始 = performance.now();

    for (let idx = 文本起点; idx < 文本长度; idx += 1) {
      const 码 = 全文.charCodeAt(idx);
      let 替换终点 = idx + 1;
      let 替换文本 = null;
      if (码 === 0x0d) {
        if (全文.charCodeAt(idx + 1) === 0x0a) {
          替换终点 += 1;
        }
        替换文本 = '\n';
      } else if (码 === 0x3f && idx > 文本起点) {
        let 前字符起点 = idx - 1;
        if (
          前字符起点 > 文本起点 &&
          全文.charCodeAt(前字符起点) >= 0xdc00 &&
          全文.charCodeAt(前字符起点) <= 0xdfff &&
          全文.charCodeAt(前字符起点 - 1) >= 0xd800 &&
          全文.charCodeAt(前字符起点 - 1) <= 0xdbff
        ) {
          前字符起点 -= 1;
        }
        if (汉字模式.test(全文.slice(前字符起点, idx))) {
          替换文本 = '？';
        }
      }

      if (替换文本 !== null) {
        输出片段列表.push(全文.slice(上次截取位置, idx), 替换文本);
        上次截取位置 = 替换终点;
        idx = 替换终点 - 1;
      }

      if ((idx & 4095) === 4095) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!载入仍然有效()) {
          return null;
        }
      }
    }

    if (!载入仍然有效()) {
      return null;
    }
    if (输出片段列表.length === 0) {
      return 文本起点 === 0 ? 全文 : 全文.slice(文本起点);
    }
    输出片段列表.push(全文.slice(上次截取位置));
    return 输出片段列表.join('');
  }

  async function 创建引文索引(全文) {
    const 引号配对 = new Map([
      ['“', '”'],
      ['‘', '’'],
      ['「', '」'],
      ['『', '』'],
      ['《', '》'],
    ]);
    const 闭引号集合 = new Set(引号配对.values());
    const 待闭合引号栈 = [];
    const 边界列表 = [];
    let 未配对数量 = 0;
    let 时间片开始 = performance.now();

    for (let idx = 0; idx < 全文.length; idx += 1) {
      const 字 = 全文[idx];
      const 目标闭引号 = 引号配对.get(字);
      if (目标闭引号) {
        待闭合引号栈.push({
          内容起点: idx + 字.length,
          目标闭引号,
          原边界数量: 边界列表.length,
        });
      } else if (闭引号集合.has(字)) {
        const 待闭合引号 = 待闭合引号栈[待闭合引号栈.length - 1];
        if (!待闭合引号 || 待闭合引号.目标闭引号 !== 字) {
          未配对数量 += 1;
        } else {
          待闭合引号栈.pop();
          边界列表.length = 待闭合引号.原边界数量;
          if (待闭合引号.内容起点 < idx) {
            边界列表.push(待闭合引号.内容起点, idx);
          }
        }
      }

      if ((idx & 4095) === 4095) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!载入仍然有效()) {
          return null;
        }
      }
    }

    未配对数量 += 待闭合引号栈.length;
    const 类型化边界列表 = await 创建Uint32Array(边界列表, 载入仍然有效);
    if (!类型化边界列表) {
      return null;
    }

    return {
      边界列表: 类型化边界列表,
      未配对数量,
    };
  }

  async function 整理句子换行(全文, 原引文边界列表) {
    const 句末标点集合 = new Set(['。', '！', '？', '!', '?', '…']);
    const 输出片段列表 = [];
    const 引文边界列表 = [];
    const 缩进起点集合 = new Set();
    let 上次截取位置 = 0;
    let 新增换行数 = 0;
    let 引文idx = 0;
    let 引文起点 = 原引文边界列表[引文idx];
    let 引文终点 = 原引文边界列表[引文idx + 1];
    let 引文包含句末标点 = false;
    let 下次检查位置 = 4096;
    let 时间片开始 = performance.now();

    for (let idx = 0; idx < 全文.length;) {
      if (idx >= 下次检查位置) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!载入仍然有效()) {
          return null;
        }
        下次检查位置 = idx + 4096;
      }

      if (
        全文[idx] === '\n' &&
        idx + 1 < 全文.length &&
        全文[idx + 1] !== '\n'
      ) {
        缩进起点集合.add(idx + 1 + 新增换行数);
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

      let 标点终点 = idx;
      let 找到句末标点 = false;
      while (标点终点 < 全文.length) {
        if (句末标点集合.has(全文[标点终点])) {
          找到句末标点 = true;
          标点终点 += 1;
        } else if (全文.startsWith('...', 标点终点)) {
          找到句末标点 = true;
          do {
            标点终点 += 1;
            if (标点终点 >= 下次检查位置) {
              时间片开始 = await 按需让出主线程(时间片开始);
              if (!载入仍然有效()) {
                return null;
              }
              下次检查位置 = 标点终点 + 4096;
            }
          } while (全文[标点终点] === '.');
        } else {
          break;
        }

        if (标点终点 >= 下次检查位置) {
          时间片开始 = await 按需让出主线程(时间片开始);
          if (!载入仍然有效()) {
            return null;
          }
          下次检查位置 = 标点终点 + 4096;
        }
      }
      if (!找到句末标点) {
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
    const 类型化引文边界列表 = await 创建Uint32Array(
      引文边界列表,
      载入仍然有效,
    );
    if (!类型化引文边界列表) {
      return null;
    }
    return {
      文本: 输出片段列表.join(''),
      引文边界列表: 类型化引文边界列表,
      缩进起点集合,
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
  }

  // 阶梯段落断点扫描：找出每个「短话段起点」及其阶梯层级。
  // 只记录数据（起点偏移升序 + 层级），不改写文本；是否生效由创建行索引决定。
  // 规则：句内停顿（，、；：及半角 , ; :）另起一段并 +1 级；
  // 句末标点（。！？…）阶梯复原——引文之外归 0，引文之内归引文首段层级
  // （与 spk 第一句对齐）；标点簇越过闭引号即引文结束，随引文末段继续爬升；
  // 原文段落起点（缩进起点集合）归 0。整理句子换行插入的换行不是段落边界，
  // 由换行分支按簇的句末/停顿属性统一记账，避免重复 +1。
  async function 创建阶梯断点索引(
    全文,
    原引文边界列表,
    缩进起点集合,
    任务仍然有效,
  ) {
    // 顿号（、）仅列举停顿，不参与阶梯断行
    const 停顿标点集合 = new Set(['，', '；', '：', ',', ';', ':']);
    const 句末标点集合 = new Set(['。', '！', '？', '!', '?', '…']);
    const 闭引号集合 = new Set(['”', '’', '」', '』', '》']);
    const 断点标点集合 = new Set([...停顿标点集合, ...句末标点集合]);
    const 起点数组 = [];
    const 层级数组 = [];
    let 当前层级 = 0;
    let 区基层级 = 0; // 当前引文首段所在层级（引文内句末复原的目标）
    let 引文idx = 0;
    let 引文起点 = 原引文边界列表[引文idx];
    let 引文终点 = 原引文边界列表[引文idx + 1];
    let 句末待重置层级 = null; // 簇后紧跟换行时延后到换行分支记账；null = 爬升
    let 下次检查位置 = 4096;
    let 时间片开始 = performance.now();

    for (let idx = 0; idx < 全文.length;) {
      if (idx >= 下次检查位置) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!任务仍然有效()) {
          return null;
        }
        下次检查位置 = idx + 4096;
      }

      越过已结束引文(idx);
      if (引文起点 !== undefined && idx === 引文起点) {
        区基层级 = 当前层级;
      }

      const 字 = 全文[idx];
      if (字 === '\n') {
        const 下一个idx = idx + 1;
        if (下一个idx >= 全文.length || 缩进起点集合.has(下一个idx)) {
          当前层级 = 0;
          区基层级 = 0;
        } else if (
          全文[下一个idx] !== '\n' &&
          !断点标点集合.has(全文[下一个idx])
        ) {
          当前层级 = 句末待重置层级 ?? 当前层级 + 1;
          记录断点(下一个idx);
        }
        句末待重置层级 = null;
        idx += 1;
        continue;
      }

      if (断点标点集合.has(字)) {
        const 簇在行首 = idx > 0 && 全文[idx - 1] === '\n';
        const 簇在引文内 =
          引文起点 !== undefined &&
          引文终点 !== undefined &&
          idx >= 引文起点 &&
          idx < 引文终点;
        let 标点终点 = idx;
        let 簇含句末 = false;
        while (标点终点 < 全文.length) {
          const 簇字 = 全文[标点终点];
          if (断点标点集合.has(簇字)) {
            if (句末标点集合.has(簇字)) {
              簇含句末 = true;
            }
            标点终点 += 1;
          } else if (闭引号集合.has(簇字)) {
            标点终点 += 1;
          } else {
            break;
          }
          if (标点终点 >= 下次检查位置) {
            时间片开始 = await 按需让出主线程(时间片开始);
            if (!任务仍然有效()) {
              return null;
            }
            下次检查位置 = 标点终点 + 4096;
          }
        }
        const 簇越出引文 = 引文终点 !== undefined && 标点终点 > 引文终点;
        if (簇在行首) {
          // 行首标点（如 ”，她说 被句子整理断在 ，前）：整行并作新的一段，
          // 层级记在本行起点，避免簇后再断行拆出只有一个标点的行。
          当前层级 = 簇含句末
            ? 句末复原目标(簇在引文内, 簇越出引文)
            : 当前层级 + 1;
          记录断点(idx);
          句末待重置层级 = null;
        } else if (标点终点 < 全文.length && 全文[标点终点] !== '\n') {
          当前层级 = 簇含句末
            ? 句末复原目标(簇在引文内, 簇越出引文)
            : 当前层级 + 1;
          记录断点(标点终点);
          句末待重置层级 = null;
        } else {
          // 簇后紧跟换行或正文结束：换行分支统一爬升或复原，避免重复记账
          句末待重置层级 = 簇含句末
            ? 句末复原目标(簇在引文内, 簇越出引文)
            : null;
        }
        idx = 标点终点;
        continue;
      }

      idx += 1;
    }

    const 类型化起点列表 = await 创建Uint32Array(起点数组, 任务仍然有效);
    if (!类型化起点列表) {
      return null;
    }
    const 类型化层级列表 = await 创建Uint8Array(层级数组, 任务仍然有效);
    if (!类型化层级列表) {
      return null;
    }
    return { 起点列表: 类型化起点列表, 层级列表: 类型化层级列表 };

    function 越过已结束引文(位置) {
      while (引文终点 !== undefined && 引文终点 < 位置) {
        引文idx += 2;
        引文起点 = 原引文边界列表[引文idx];
        引文终点 = 原引文边界列表[引文idx + 1];
      }
    }

    function 句末复原目标(簇在引文内, 簇越出引文) {
      if (!簇在引文内) {
        return 0;
      }
      if (簇越出引文) {
        return 当前层级 + 1;
      }
      return 区基层级;
    }

    function 记录断点(偏移) {
      起点数组.push(偏移);
      层级数组.push(Math.min(当前层级, 255));
    }
  }

  async function 构建句段负担索引(全文) {
    const 起点数组 = [];
    const 负担数组 = [];
    let 段起点 = -1;
    let 段长度 = 0;
    let 总负担 = 0;
    let 时间片开始 = performance.now();
    for (let idx = 0; idx < 全文.length; idx += 1) {
      const 码 = 全文.charCodeAt(idx);
      if (是阅读字符码(码)) {
        if (段起点 === -1) {
          段起点 = idx;
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

      if ((idx & 4095) === 4095) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!载入仍然有效()) {
          return null;
        }
      }
    }
    if (段起点 !== -1) {
      const 负担值 = 计算句段负担(段长度);
      起点数组.push(段起点);
      负担数组.push(负担值);
      总负担 += 负担值;
    }

    const 句段起点列表 = await 创建Uint32Array(起点数组, 载入仍然有效);
    if (!句段起点列表) {
      return null;
    }
    const 句段负担前缀和 = new Float64Array(负担数组.length + 1);
    时间片开始 = performance.now();
    for (let idx = 0; idx < 负担数组.length; idx += 1) {
      句段负担前缀和[idx + 1] = 句段负担前缀和[idx] + 负担数组[idx];
      if ((idx & 4095) === 4095) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!载入仍然有效()) {
          return null;
        }
      }
    }
    return 载入仍然有效()
      ? { 句段起点列表, 句段负担前缀和, 句段负担总合: 总负担 }
      : null;
  }
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
