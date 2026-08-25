import {
  shift双击中阈值,
  关键词排序方式列表,
  双击判定延迟,
  文本目录地址,
  时间格式器,
  最大字号,
  最大行高,
  最小字号,
  最小行高硬下限,
  自动滚动最低速度,
  自动滚动最高速度,
  自动滚动默认速度,
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
  语音事件,
} from './js/常量.js';
import { 是有效文本文件名 } from './js/文本工具.js';
import {
  元素,
  外观,
  奇偶行颜色,
  字体粗细设置,
  字体设置,
  字体颜色设置,
  引文背景色,
  状态,
  查找关键词,
} from './js/状态.js';
import { 显示文本处理错误, 显示错误 } from './js/错误提示.js';
import {
  创建行索引,
  刷新画布尺寸,
  提交行索引,
  计算最小行高,
  读取正文排版,
  重建行索引,
} from './js/排版引擎.js';
import {
  规范化文本,
  创建引文索引,
  创建阶梯断点索引,
  整理句子换行,
  构建句段负担索引,
  统计全文单字,
} from './js/文本管线.js';
import { 渲染可见行, 显示当前命中位置提示 } from './js/虚拟渲染.js';
import {
  关闭上下文弹窗,
  删除关键词标记,
  打开上下文弹窗,
  查找关键词命中,
  读取选择关键词,
  追加上下文行块,
} from './js/关键词.js';
import { 更新关键词指示器, 初始化指示器 } from './js/指示器.js';
import {
  有弹窗打开,
  切换关键词排序,
  排序后的关键词列表,
  渲染关键词面板,
} from './js/面板.js';
import {
  更新滚动块,
  读取滚动条度量,
  轨道中心转滚动位置,
} from './js/滚动条.js';
import {
  动画滚动到,
  取消滚动动画,
  结束跳转会话,
  获取元素命中边框,
  获取元素行位置,
  获取当前命中边框,
  跳到命中,
  隐藏衔接线,
} from './js/跳转动画.js';
import {
  更新自动滚动速度,
  载入自动滚动统计,
  开始自动滚动,
  开始按键滚动,
  停止按键滚动,
  执行自动滚动翻页,
  处理自动滚动滚轮,
  处理鼠标移动,
  停止自动滚动,
  自动滚动进行中,
  获取按键滚动按键,
  注册右下强制显示,
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
import {
  处理分析结果滚动,
  处理查找弹窗关闭,
  处理查找弹窗点击,
  处理查找提交,
  处理查找输入,
  处理词组分析,
  取消词组分析,
  关闭查找弹窗,
  定位查找命中,
  打开查找弹窗,
  标记合成开始,
  合成结束提交,
} from './js/查找弹窗.js';
import {
  处理词频标签点击,
  处理词频标签键盘,
  处理词频弹窗点击,
  取消词频分析,
  关闭词频弹窗,
  打开词频弹窗,
  翻词频页,
} from './js/词频弹窗.js';
import {
  初始化内容选择弹窗,
  处理内容选择弹窗点击,
  处理内容选择列表点击,
  关闭内容选择弹窗,
  打开内容选择弹窗,
} from './js/内容选择弹窗.js';

启动();

function 启动() {
  // 画布上下文在启动时创建（指示器模块本身不触碰 DOM，便于静态加载与测试）
  初始化指示器();
  let 持久化数据 = null;
  try {
    持久化数据 = 读取持久化数据();
  } catch (错误) {
    console.warn('[阅读器] 持久化数据未载入', 错误);
  }
  载入自动滚动统计(持久化数据);
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

  // 重建行索引只负责「建索引 + 提交 + 保持阅读位置」，
  // 视图刷新（取消动画、隐藏衔接线、重绘、更新指示器）由调用方编排。
  function 重建并刷新(排版) {
    重建行索引(
      排版,
      () => {
        取消滚动动画();
        隐藏衔接线();
      },
      () => {
        渲染可见行(true);
        更新关键词指示器();
      },
    );
  }

  function 处理尺寸变化() {
    window.clearTimeout(状态.尺寸计时器);
    状态.尺寸计时器 = window.setTimeout(function 重排正文() {
      if (!状态.文件名) {
        return;
      }

      const 新排版 = 读取正文排版();
      if (新排版.键 !== 状态.排版键) {
        重建并刷新(新排版);
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

  const 全文单字 = await 统计全文单字(文本, 载入仍然有效);
  if (!全文单字) {
    return;
  }

  try {
    const 已应用 = await 应用文本(文本, 文件名, 全文单字, 载入仍然有效);
    if (!已应用) {
      return;
    }
    保存持久化状态();
  } catch (错误) {
    显示文本处理错误(错误);
  }

  function 载入仍然有效() {
    return 本次载入序号 === 状态.载入序号;
  }
}

function 创建文本地址(文件名) {
  return new URL(encodeURIComponent(文件名), 文本目录地址);
}

function 绑定事件() {
  // 自动滚动的右下控件强制显示经钩子注入（断环：避免「自动滚动 → app」反向依赖）
  注册右下强制显示((正在滚动) => {
    右下强制 = 正在滚动;
    刷新右下控件可见性();
  });

  // 内容选择弹窗经注入回调访问 app 的 载入文本 / 创建文本地址（断环：避免「内容选择弹窗 → app」反向依赖）
  初始化内容选择弹窗({ 载入文本, 创建文本地址 });

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
  元素.查找输入框.addEventListener('compositionstart', 标记合成开始);
  元素.查找输入框.addEventListener('compositionend', 合成结束提交);
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
    翻词频页(-1);
  });
  元素.词频下一页.addEventListener('click', function 显示下一页词频() {
    翻词频页(1);
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

    if (自动滚动进行中() || 状态.滚动动画目标 || 状态.滚动帧) {
      return;
    }

    状态.滚动帧 = requestAnimationFrame(function 更新滚动状态() {
      状态.滚动帧 = 0;
      if (自动滚动进行中()) {
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
        new CustomEvent(语音事件.翻页完成, {
          detail: { 指令, 当前页, 总页 },
        }),
      );
    } catch {
      /* 回传失败不影响翻页 */
    }
  }

  window.addEventListener(语音事件.翻页, 处理语音翻页);

  function 处理语音自动滚动(事件) {
    const 指令 = 事件.detail && 事件.detail.指令;
    if (指令 !== '快' && 指令 !== '慢') {
      return;
    }
    执行自动滚动翻页(指令 === '慢', `语音“${指令}”`);
  }

  window.addEventListener(语音事件.自动滚动, 处理语音自动滚动);

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
      if (!自动滚动进行中()) {
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

  function 处理键盘松开(事件) {
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
  const 规范文本 = await 规范化文本(原始文本, 载入仍然有效);
  阶段耗时.文本规范化 = performance.now() - 阶段开始时间;
  if (规范文本 === null) {
    return false;
  }

  阶段开始时间 = performance.now();
  const 原引文索引 = await 创建引文索引(规范文本, 载入仍然有效);
  阶段耗时.引文索引 = performance.now() - 阶段开始时间;
  if (!原引文索引) {
    return false;
  }

  阶段开始时间 = performance.now();
  const 句子整理结果 = await 整理句子换行(
    规范文本,
    原引文索引.边界列表,
    载入仍然有效,
  );
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
  const 句段负担索引 = await 构建句段负担索引(文本, 载入仍然有效);
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
