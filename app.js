import {
  文本目录地址,
  时间格式器,
  尺寸重排防抖毫秒,
  默认字号,
  默认文件名,
  语音事件,
} from './js/常量.js';
import { 是有效文本文件名, 清除文本字素分段缓存 } from './js/文本工具.js';
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
  确保今日滚动统计,
  高亮配色,
  查找关键词,
  获取静止滚动位置,
} from './js/状态.js';
import { 创建阅读统计内容 } from './js/阅读统计.js';
import {
  载入前台停留统计,
  更新前台停留计时,
  书籍每日前台毫秒,
  获取书籍前台毫秒,
} from './js/前台停留.js';
import { 载入滚动时段统计, 滚动时段统计快照 } from './js/滚动时段.js';
import { 载入激活时段统计, 激活时段统计快照 } from './js/激活时段.js';
import { 显示文本处理错误, 显示错误 } from './js/错误提示.js';
import {
  查找偏移所在行,
  创建行索引,
  刷新画布尺寸,
  提交行索引,
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
import { 渲染可见行 } from './js/虚拟渲染.js';
import {
  删除关键词标记,
  查找关键词命中,
} from './js/关键词.js';
import { 更新关键词指示器, 初始化指示器 } from './js/指示器.js';
import {
  切换关键词排序,
  排序后的关键词列表,
  渲染关键词面板,
} from './js/面板.js';
import {
  初始化滚动条拖拽,
  重置滚动条拖拽,
  更新滚动块,
  处理滚动进度按下,
  处理滚动进度拖动,
  处理滚动条滚轮,
  处理滚动条键盘,
  结束滚动进度拖动,
} from './js/滚动条.js';
import {
  动画滚动到,
  取消滚动动画,
  结束跳转会话,
  跳到命中,
  隐藏衔接线,
  注册自动滚动停止钩子,
} from './js/跳转动画.js';
import {
  更新自动滚动速度,
  载入自动滚动统计,
  开始自动滚动,
  停止按键滚动,
  执行自动滚动翻页,
  处理自动滚动滚轮,
  处理鼠标移动,
  停止自动滚动,
  自动滚动进行中,
  关闭滚动会话,
  恢复滚动会话,
  注册自动滚动滚轮监听,
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
  离开字号调节,
  离开行距调节,
  设置关键词颜色,
  设置内置字词颜色,
  设置区域颜色,
  设置奇偶行颜色,
  设置引文背景色,
  设置引文背景颜色,
  设置引文边框显示,
  设置纸面色,
  设置阶梯段落,
  设置换行标记显示,
  恢复阅读设置,
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
  读取持久化数据或新建,
} from './js/持久化.js';
import {
  处理搭配点击,
  处理搭配按下,
  处理搭配移动,
  处理搭配按下结束,
  处理搭配悬停,
  处理上下文悬停,
  处理分析结果滚动,
  处理查找弹窗关闭,
  处理查找弹窗点击,
  处理查找提交,
  处理查找输入,
  打开查找弹窗,
  处理上下文行点击,
  处理上下文滚动,
  处理查找按键,
  关闭查找弹窗,
  定位查找命中,
  标记合成开始,
  合成结束提交,
  恢复查找历史,
  处理查找历史点击,
  清空查找历史,
} from './js/查找弹窗.js';
import {
  处理字频排序点击,
  处理词频标签点击,
  处理词频标签键盘,
  处理词频弹窗点击,
  取消词频分析,
  关闭词频弹窗,
} from './js/词频弹窗.js';
import {
  初始化内容选择弹窗,
  处理内容选择弹窗点击,
  处理内容选择列表点击,
  关闭内容选择弹窗,
  打开内容选择弹窗,
} from './js/内容选择弹窗.js';
import {
  处理键盘按下,
  处理键盘松开,
  翻页整屏,
  取消待定导航,
  重置键盘导航,
  标记shift组合,
} from './js/键盘控制.js';
import {
  处理关键词手势开始,
  处理关键词手势移动,
  处理关键词触摸移动,
  处理关键词选择阻止,
  处理关键词手势松开,
  处理关键词手势取消,
} from './js/关键词手势.js';
import {
  处理正文按下,
  处理鼠标选择结束,
  处理非鼠标选择结束,
  处理正文键盘选择,
  处理正文复制,
  处理正文复制按键,
  处理高亮上下文点击,
  处理高亮点击,
  处理高亮双击,
  处理正文指针移动,
  处理高亮移入,
  处理高亮移出,
  切换同组高亮,
} from './js/正文交互.js';
import {
  处理右下控件悬停,
  处理右下控件触摸,
  设置右下强制显示,
  设置右下聚焦,
} from './js/右下控件.js';
import { 安排刷新时钟遮挡, 刷新时钟遮挡 } from './js/时钟遮挡.js';

import { 创建章节索引 } from './js/章节索引.js';
import { 初始化章节目录, 关闭章节目录 } from './js/章节目录.js';

启动();

function 启动() {
  // 画布上下文在启动时创建（指示器模块本身不触碰 DOM，便于静态加载与测试）
  初始化指示器();
  const 持久化数据 = 读取持久化数据或新建();
  载入自动滚动统计(持久化数据);
  载入前台停留统计(持久化数据);
  载入滚动时段统计(持久化数据);
  载入激活时段统计(持久化数据);
  // 手动阅读也定期保存，不依赖滚动事件。
  window.setInterval(() => {
    if (document.visibilityState === 'visible') 保存持久化状态();
  }, 30_000);
  绑定事件();
  更新当前时间();
  window.setInterval(更新当前时间, 1000);
  new ResizeObserver(处理尺寸变化).observe(元素.滚动容器);
  void 载入文本(
    是有效文本文件名(持久化数据.当前文件名)
      ? 持久化数据.当前文件名
      : 默认文件名,
  );

  function 更新当前时间() {
    const 现在 = new Date();
    元素.当前时间.dateTime = 现在.toISOString();
    元素.当前时间.textContent = 时间格式器.format(现在);
    // 每秒兜底一次遮挡判定：载入、字号/行距重排等不走滚动事件的变化，
    // 最迟 1s 内收敛；滚动路径由 scroll 监听实时驱动。
    刷新时钟遮挡();
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
        安排刷新时钟遮挡();
        return;
      }

      try {
        刷新画布尺寸(新排版);
        渲染可见行(true);
        更新关键词指示器();
      } catch (错误) {
        显示文本处理错误(错误);
      }
      安排刷新时钟遮挡();
    }, 尺寸重排防抖毫秒);
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
  // 自动滚动的右下控件强制显示经钩子注入（断环：避免「自动滚动 → app」反向依赖）；
  // 显示状态本体在 js/右下控件.js
  注册右下强制显示(设置右下强制显示);

  const 自动滚动滚轮监听选项 = { capture: true, passive: false };
  let 自动滚动滚轮已绑定 = false;
  注册自动滚动滚轮监听(function 切换自动滚动滚轮监听(启用) {
    if (启用 === 自动滚动滚轮已绑定) {
      return;
    }
    自动滚动滚轮已绑定 = 启用;
    if (启用) {
      window.addEventListener('wheel', 处理自动滚动滚轮, 自动滚动滚轮监听选项);
    } else {
      window.removeEventListener(
        'wheel',
        处理自动滚动滚轮,
        自动滚动滚轮监听选项,
      );
    }
  });

  // 内容选择弹窗经注入回调访问 app 的 载入文本 / 创建文本地址（断环：避免「内容选择弹窗 → app」反向依赖）
  初始化内容选择弹窗({ 载入文本, 创建文本地址 });
  初始化章节目录({
    准备打开() {
      停止自动滚动('打开章节目录');
      停止按键滚动('打开章节目录');
      取消滚动动画();
      状态.拖选状态 = null;
      重置键盘导航();
    },
    跳到章节(偏移) {
      结束跳转会话('章节导航');
      隐藏衔接线();
      const 目标位置 = 查找偏移所在行(偏移) * 状态.行高;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        取消滚动动画();
        元素.滚动容器.scrollTop = 目标位置;
        渲染可见行(true);
      } else {
        动画滚动到(目标位置);
      }
      更新滚动块();
      安排保存持久化状态();
      元素.滚动容器.focus({ preventScroll: true });
    },
  });

  // 滚动条/进度拖拽的滚动中断经注入回调访问（断环：跳转动画 → 滚动条 已有正向边，
  // 滚动条不能反向 import 跳转动画，否则成环）
  初始化滚动条拖拽({ 取消滚动动画, 结束跳转会话 });

  // 跳转动画在动画滚动开始时停止自动滚动（断环：跳转动画 → 自动滚动 会成环）。
  注册自动滚动停止钩子(停止自动滚动);

  // ===== 右下角控件：默认隐藏，仅在鼠标靠近 / 触摸 / 聚焦 / 自动滚动时显示 =====
  // 热区判定与显示状态机在 js/右下控件.js；时间浮层贴角常驻，
  // 但正文滚进其下方时整体隐藏（js/时钟遮挡.js），不遮挡正文。

  元素.滚动容器.addEventListener('scroll', 处理滚动, { passive: true });
  // 时间浮层遮挡判定独立于 处理滚动 的状态机：自动滚动 / 跳转动画期间
  // 处理滚动 会提前返回，但 scrollTop 变化仍会触发 scroll 事件。
  元素.滚动容器.addEventListener('scroll', 安排刷新时钟遮挡, { passive: true });
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
  // 拖选期间的复制要取消随后的关键词增删：copy 事件覆盖菜单复制与真实快捷键，
  // Ctrl/Command + C 的 keydown 覆盖 Ctrl↔Win 对调与 headless 环境（两条都只打标记，不拦默认行为）。
  document.addEventListener('copy', 处理正文复制);
  window.addEventListener('keydown', 处理正文复制按键);
  // 悬停不再启动自动滚动：滚动按钮只剩速度显示 + 点击切换全屏。
  // 键盘聚焦（Tab）仍作为无障碍启动入口，鼠标点击聚焦不会误触发。
  元素.自动滚动按钮.addEventListener('focus', 处理自动滚动按钮聚焦);
  元素.自动滚动按钮.addEventListener('click', 切换全屏模式);
  元素.自动滚动按钮.addEventListener('blur', 处理自动滚动按钮失焦);
  元素.内容选择按钮.addEventListener('click', 打开内容选择弹窗);
  元素.阅读统计按钮.addEventListener('click', 打开阅读统计);
  // 点击遮罩关闭：真实点击 ::backdrop 时事件目标是 html 而非 dialog 本身，
  // 因此用坐标命中判断，落在弹窗矩形之外即关闭
  document.addEventListener('pointerdown', (事件) => {
    const 弹窗 = 元素.阅读统计弹窗;
    if (!弹窗.open) return;
    const r = 弹窗.getBoundingClientRect();
    const { clientX: x, clientY: y } = 事件;
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) 弹窗.close();
  });
  元素.关闭内容选择按钮.addEventListener('click', 关闭内容选择弹窗);
  元素.内容选择弹窗.addEventListener('click', 处理内容选择弹窗点击);
  元素.内容选择列表.addEventListener('click', 处理内容选择列表点击);
  元素.查找表单.addEventListener('submit', 处理查找提交);
  元素.查找输入框.addEventListener('input', 处理查找输入);
  元素.查找输入框.addEventListener('compositionstart', 标记合成开始);
  元素.查找输入框.addEventListener('compositionend', 合成结束提交);
  元素.查找输入框.addEventListener('keydown', 处理查找按键);
  元素.查找上一个按钮.addEventListener('click', function 定位查找上一个() {
    定位查找命中(-1);
  });
  元素.查找下一个按钮.addEventListener('click', function 定位查找下一个() {
    定位查找命中(1);
  });
  元素.查找历史列表.addEventListener('click', 处理查找历史点击);
  元素.清空查找历史按钮.addEventListener('click', 清空查找历史);
  元素.分析分栏.addEventListener('click', 处理搭配点击);
  // 搭配行：单击只查该搭配词，长按 1 秒查「关键词+搭配」的合并词
  元素.分析分栏.addEventListener('pointerdown', 处理搭配按下);
  元素.分析分栏.addEventListener('pointermove', 处理搭配移动, {
    passive: true,
  });
  元素.分析分栏.addEventListener('pointerup', 处理搭配按下结束, {
    passive: true,
  });
  元素.分析分栏.addEventListener('pointercancel', 处理搭配按下结束, {
    passive: true,
  });
  元素.分析分栏.addEventListener('pointerover', 处理搭配悬停, {
    passive: true,
  });
  for (const 分析栏 of [元素.前置分析栏, 元素.后续分析栏]) {
    分析栏.addEventListener('scroll', 处理分析结果滚动, { passive: true });
    分析栏.addEventListener('pointerleave', 处理搭配悬停, { passive: true });
  }
  元素.关闭查找按钮.addEventListener('click', 关闭查找弹窗);
  元素.查找弹窗.addEventListener('click', 处理查找弹窗点击);
  元素.查找弹窗.addEventListener('close', 处理查找弹窗关闭);
  元素.关键词面板开关.addEventListener('click', 处理面板开关);
  元素.关键词列表容器.addEventListener('click', 处理面板操作);
  document.addEventListener('click', 处理关键词面板外部点击);
  元素.上下文列表.addEventListener('click', 处理上下文行点击);
  元素.上下文列表.addEventListener('pointerover', 处理上下文悬停, {
    passive: true,
  });
  元素.上下文列表.addEventListener('pointerleave', 处理上下文悬停, {
    passive: true,
  });
  元素.上下文列表.addEventListener('scroll', 处理上下文滚动, {
    passive: true,
  });
  元素.关闭词频按钮.addEventListener('click', 关闭词频弹窗);
  元素.词频弹窗.addEventListener('click', 处理词频弹窗点击);
  元素.词频弹窗.addEventListener('close', 取消词频分析);
  元素.词频标签栏.addEventListener('click', 处理词频标签点击);
  元素.词频标签栏.addEventListener('keydown', 处理词频标签键盘);
  元素.字频对照容器.addEventListener('click', 处理字频排序点击);
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
  元素.滚动进度.addEventListener('pointerdown', 处理滚动进度按下);
  元素.滚动进度.addEventListener('pointermove', 处理滚动进度拖动);
  元素.滚动进度.addEventListener('pointerup', 结束滚动进度拖动);
  元素.滚动进度.addEventListener('pointercancel', 结束滚动进度拖动);
  元素.滚动进度.addEventListener('wheel', 处理滚动条滚轮, {
    passive: false,
  });
  元素.滚动进度.addEventListener('keydown', 处理滚动条键盘);
  window.addEventListener('mouseup', 处理鼠标选择结束);
  window.addEventListener('mousemove', 处理鼠标移动, { passive: true });
  window.addEventListener('blur', 取消交互状态);
  window.addEventListener('keydown', 处理键盘按下);
  window.addEventListener('keyup', 处理键盘松开);
  // Shift 按住期间发生鼠标按下（如 Shift+点击命中词）→ 标记为组合，松开时不切换自动滚动
  // （状态机本体在 js/键盘控制.js，经 标记shift组合 注入）
  window.addEventListener('mousedown', 标记shift组合);
  window.addEventListener('pagehide', () => {
    更新前台停留计时('', false);
    关闭滚动会话();
    保存持久化状态();
  });
  window.addEventListener('pageshow', () => 更新前台停留计时());
  document.addEventListener('visibilitychange', function () {
    更新前台停留计时();
    // 页面隐藏时 rAF 停摆：时长和时段一起就地封口，轴上不留假空的滚动条、账上也不虚增
    if (document.visibilityState === 'hidden') 关闭滚动会话();
    else 恢复滚动会话();
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
    元素.章节目录按钮,
    元素.阅读统计按钮,
  ]) {
    if (!控件) {
      continue;
    }
    控件.addEventListener('focus', () => 设置右下聚焦(true));
    控件.addEventListener('blur', () => 设置右下聚焦(false));
  }

  // 「关键词手势」：单击/双击/上下拖拽（pointer 统一鼠标/触摸/笔）
  // 单击=下一个 / 双击=上一个 / 向上拖=第一个 / 向下拖=最后一个
  // 只有无修饰键按下关键词命中时才挂载非 passive 监听，普通正文滚动不受影响。
  let 关键词手势监听中 = false;
  const 关键词手势监听选项 = { passive: false };
  元素.滚动容器.addEventListener('pointerdown', 开始关键词手势监听);

  function 开始关键词手势监听(事件) {
    if (关键词手势监听中 || !处理关键词手势开始(事件)) {
      return;
    }
    关键词手势监听中 = true;
    window.addEventListener(
      'pointermove',
      处理关键词手势移动,
      关键词手势监听选项,
    );
    window.addEventListener('pointerup', 结束关键词手势监听);
    window.addEventListener('pointercancel', 取消关键词手势监听);
    window.addEventListener(
      'touchmove',
      处理关键词触摸移动,
      关键词手势监听选项,
    );
    document.addEventListener(
      'selectstart',
      处理关键词选择阻止,
      关键词手势监听选项,
    );
  }

  function 结束关键词手势监听(事件) {
    if (处理关键词手势松开(事件)) {
      移除关键词手势监听();
    }
  }

  function 取消关键词手势监听(事件) {
    if (处理关键词手势取消(事件)) {
      移除关键词手势监听();
    }
  }

  function 移除关键词手势监听() {
    if (!关键词手势监听中) {
      return;
    }
    关键词手势监听中 = false;
    window.removeEventListener(
      'pointermove',
      处理关键词手势移动,
      关键词手势监听选项,
    );
    window.removeEventListener('pointerup', 结束关键词手势监听);
    window.removeEventListener('pointercancel', 取消关键词手势监听);
    window.removeEventListener(
      'touchmove',
      处理关键词触摸移动,
      关键词手势监听选项,
    );
    document.removeEventListener(
      'selectstart',
      处理关键词选择阻止,
      关键词手势监听选项,
    );
  }

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

  function 取消交互状态() {
    停止自动滚动('窗口失去焦点');
    停止按键滚动('窗口失去焦点');
    状态.拖选状态 = null;
    取消关键词手势监听();
    取消待定导航();
    重置滚动条拖拽();
  }

  // ===== 语音翻页：监听「语音翻页」语义事件（由 语音订阅.js 在识别到
  // 「上一页 / 下一页」指令时派发），立即同步翻页，无需任何手动确认。
  // 映射：上一页 → 向后翻（回到上一屏）；下一页 → 向前翻（下一屏）。
  // 翻页原语 翻页整屏 已归位 js/键盘控制.js，与 Space/方向键共用同一实现。
  function 处理语音翻页(事件) {
    if (元素.章节目录弹窗.open || 元素.阅读统计弹窗.open) return;
    const 指令 = 事件.detail && 事件.detail.指令;
    if (指令 !== '上一页' && 指令 !== '下一页') {
      return;
    }
    if (!状态.行起点列表.length) {
      // 正文尚未载入时不执行翻页，避免给出错误反馈
      console.info('[阅读器] 语音翻页被忽略', { 原因: '正文未载入', 指令 });
      return;
    }
    document.body.classList.add('自动滚动中');
    翻页整屏(指令 === '上一页');
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

  function 处理自动滚动按钮聚焦() {
    // 只有键盘聚焦（:focus-visible）才启动滚动：鼠标点击按钮是为切换全屏，
    // 浏览器同样会派发 focus，不能顺带把自动滚动开起来。
    if (元素.自动滚动按钮.matches(':focus-visible')) {
      开始自动滚动();
    }
  }

  function 处理自动滚动按钮失焦() {
    // 指针仍停在按钮上时不停止：鼠标点击按钮切换全屏会先 focus 再 blur()
    // （见 切换全屏模式），这条判断保证它不会误停掉键盘启动的滚动。
    if (!元素.自动滚动按钮.matches(':hover')) {
      停止自动滚动('滚动按钮失去焦点');
    }
  }

  function 打开阅读统计() {
    停止自动滚动('打开阅读统计');
    停止按键滚动('打开阅读统计');
    取消滚动动画();
    重置键盘导航();
    确保今日滚动统计();
    保存持久化状态();
    // 两本账要对同一时刻：上面的「滚动 / 前台停留」列已由 保存持久化状态 就地结转、算到此刻，
    // 而时段 Map 里只有已封口的段（进行中的那段只在快照里补），直接读 Map 会让轴停在上一次
    // 切走标签页的那一刻，两行必然差出一整段正在进行的阅读。所以轴也取带进行中段的快照。
    const 此刻 = Date.now();
    const 每日时段 = 滚动时段统计快照(此刻).每日时段;
    const 每日激活时段 = 激活时段统计快照(此刻).每日时段;
    const 数据 = 读取持久化数据或新建();
    const 文件名集合 = new Set([
      ...Object.keys(数据.文本状态 ?? {}),
      ...统计.书籍滚动毫秒.keys(),
      ...书籍每日前台毫秒.keys(),
      ...(状态.文件名 ? [状态.文件名] : []),
    ]);
    const 书籍 = [...文件名集合].map((名) => {
      const 项 = 数据.文本状态?.[名];
      const 毫秒 = 统计.书籍滚动毫秒.get(名) ?? 项?.总滚动毫秒 ?? 0;
      return [
        名,
        {
          ...项,
          总前台毫秒: 获取书籍前台毫秒(名),
          总滚动毫秒:
            (Number.isFinite(毫秒) ? Math.max(0, 毫秒) : 0) +
            (名 === 状态.文件名 ? 统计.未入账滚动毫秒 : 0),
        },
      ];
    });
    const 进度 = 状态.文本.length
      ? Math.min(
          100,
          Math.max(
            0,
            (获取静止滚动位置() /
              Math.max(
                1,
                元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight,
              )) *
              100,
          ),
        )
      : 0;
    元素.阅读统计内容.replaceChildren(
      创建阅读统计内容({
        书籍,
        文件名: 状态.文件名,
        进度,
        每日时段,
        每日激活时段,
        今天: 统计.今日滚动日期,
      }),
    );
    元素.阅读统计弹窗.showModal();
  }

  async function 切换全屏模式(事件) {
    const 正在退出 = Boolean(document.fullscreenElement);
    const 全屏操作 = 正在退出
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    if (事件.detail > 0) {
      元素.自动滚动按钮.blur();
    }
    try {
      await 全屏操作;
      console.info(`[阅读器] 已${正在退出 ? '退出' : '进入'}全屏`);
    } catch (错误) {
      // 全屏请求可能因失去用户激活 / 权限策略被拒绝，静默记录即可
      console.warn('[阅读器] 切换全屏失败', 错误);
    }
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
        打开查找弹窗(关键词);
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
  const 原章节列表 = await 创建章节索引(规范文本, 载入仍然有效);
  阶段耗时.章节索引 = performance.now() - 阶段开始时间;
  if (!原章节列表) return false;

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
    原章节列表,
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
  const 持久化状态 = 读取持久化数据或新建().文本状态[文件名] ?? null;
  恢复阅读设置(持久化状态 ?? 上一本书公共状态, 文件名);
  if (!持久化状态 && 上一本书公共状态) {
    console.info('[阅读器] 新文本已继承上一本书的公共设置', { 文件名 });
  }

  let 排版 = 读取正文排版();
  阶段开始时间 = performance.now();
  let 行索引;
  while (载入仍然有效()) {
    行索引 = await 创建行索引(
      文本,
      排版,
      缩进起点集合,
      外观.阶梯段落启用 ? 阶梯断点 : null,
      载入仍然有效,
    );
    if (!行索引 || !载入仍然有效()) {
      return false;
    }
    const 最新排版 = 读取正文排版();
    if (最新排版.换行键 === 排版.换行键) {
      break;
    }
    console.info('[阅读器] 文本载入期间排版参数已变化，重建行索引', {
      文件名,
      原正文宽度: Math.round(排版.内容宽度),
      新正文宽度: Math.round(最新排版.内容宽度),
    });
    排版 = 最新排版;
  }
  阶段耗时.行索引 = performance.now() - 阶段开始时间;

  关闭章节目录();
  状态.排版任务序号 += 1;
  清除文本字素分段缓存();
  状态.文本 = 文本;
  状态.章节列表 = 句子整理结果.章节列表;
  状态.指示器缓存 = null;
  状态.词频分析 = null;
  状态.全文单字 = 全文单字;
  更新前台停留计时(文件名);
  状态.文件名 = 文件名;
  状态.引文边界列表 = 句子整理结果.引文边界列表;
  状态.引文底色奇偶列表 = 原引文索引.底色奇偶列表;
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

  function 恢复文本内容状态(持久化状态) {
    元素.滚动容器.scrollTop = 0;
    恢复查找历史(持久化状态);
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
