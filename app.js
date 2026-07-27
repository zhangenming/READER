'use strict';

const 默认文本地址 = './txt/嫌疑人X的献身 (东野圭吾) (z-library.sk, 1lib.sk, z-lib.sk).txt';
const 持久化键 = '原文阅读器:阅读状态:v1';
const 最大虚拟高度 = 30_000_000;
const 字素分段器 = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
const 词组分段器 = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const 西文字素模式 =
  /^(?:[\u0020-\u007e\u00a0]|\p{Script=Latin}|\p{Number}|\p{Mark})+$/u;
const 西文单词模式 = /\s*\S+|\s+$/gu;
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
const 指示器标记高度 = 7;
const 指示器标记留白 = 2;
const 高亮配色 = [
  { 浅色: '#f6d768', 深色: '#9a6614' },
  { 浅色: '#8bd4cb', 深色: '#176d67' },
  { 浅色: '#f1aaa1', 深色: '#a83f50' },
  { 浅色: '#9fcceb', 深色: '#326c9b' },
  { 浅色: '#b9d98f', 深色: '#587535' },
  { 浅色: '#efb07d', 深色: '#a9512f' },
];
const 状态 = {
  文本: '',
  文件名: '',
  行起点列表: new Uint32Array(),
  行终点列表: new Uint32Array(),
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
  载入序号: 0,
  拖选状态: null,
  关键词列表: [],
  当前关键词id: null,
  悬停关键词id: null,
  悬停命中idx: null,
  下一个关键词id: 1,
  跳转起点: null,
  指示器缓存: null,
};

const 元素 = {
  滚动容器: document.querySelector('#滚动容器'),
  虚拟画布: document.querySelector('#虚拟画布'),
  可见内容: document.querySelector('#可见内容'),
  载入状态: document.querySelector('#载入状态'),
  跳转边框: document.querySelector('#跳转边框'),
  跳转迸发: document.querySelector('#跳转迸发'),
  查找弹窗: document.querySelector('#查找弹窗'),
  查找表单: document.querySelector('#查找表单'),
  查找输入框: document.querySelector('#查找输入框'),
  查找反馈: document.querySelector('#查找反馈'),
  分析按钮: document.querySelector('#分析按钮'),
  分析结果: document.querySelector('#分析结果'),
  分析结果摘要: document.querySelector('#分析结果摘要'),
  分析结果列表: document.querySelector('#分析结果列表'),
  关闭查找按钮: document.querySelector('#关闭查找按钮'),
  关键词指示器: document.querySelector('#关键词指示器'),
};

const 指示器上下文 = 元素.关键词指示器.getContext('2d');
if (!指示器上下文) {
  throw new Error('当前浏览器无法创建关键词指示器画布');
}

元素.跳转迸发.append(
  ...Array.from({ length: 迸发粒子数 }, function 造火花() {
    return document.createElement('i');
  }),
);

启动();

function 启动() {
  绑定事件();
  new ResizeObserver(处理尺寸变化).observe(元素.滚动容器);
  void 载入默认文本();

  async function 载入默认文本() {
    const 本次载入序号 = ++状态.载入序号;
    let 数据;
    try {
      const 响应 = await fetch(默认文本地址);
      if (!响应.ok) {
        throw new Error(`HTTP ${响应.status} ${响应.statusText}`);
      }
      数据 = await 响应.arrayBuffer();
    } catch (错误) {
      if (本次载入序号 === 状态.载入序号) {
        显示错误(
          '文本载入失败，请确认本地服务与 txt/嫌疑人X的献身 (东野圭吾) (z-library.sk, 1lib.sk, z-lib.sk).txt 可访问。',
          错误,
        );
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
      显示错误('txt/嫌疑人X的献身 (东野圭吾) (z-library.sk, 1lib.sk, z-lib.sk).txt 不是有效的 UTF-8 文本。', 错误);
      return;
    }

    try {
      应用文本(文本, '嫌疑人X的献身 (东野圭吾) (z-library.sk, 1lib.sk, z-lib.sk).txt');
    } catch (错误) {
      显示文本处理错误(错误);
    }
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
}
function 绑定事件() {
  let Alt按键状态 = null;
  元素.滚动容器.addEventListener('scroll', 处理滚动, { passive: true });
  元素.滚动容器.addEventListener('wheel', 处理手动滚动, { passive: true });
  元素.滚动容器.addEventListener('touchstart', 取消滚动动画, { passive: true });
  元素.滚动容器.addEventListener('touchmove', 处理手动滚动, { passive: true });
  元素.滚动容器.addEventListener('mousedown', 处理正文按下);
  元素.滚动容器.addEventListener('pointerup', 处理非鼠标选择结束);
  元素.滚动容器.addEventListener('click', 处理高亮点击);
  元素.滚动容器.addEventListener('pointerover', 处理高亮移入);
  元素.滚动容器.addEventListener('pointerout', 处理高亮移出);
  元素.滚动容器.addEventListener('contextmenu', 处理高亮上下文点击);
  元素.滚动容器.addEventListener('keyup', 处理正文键盘选择);
  元素.查找表单.addEventListener('submit', 处理查找提交);
  元素.查找输入框.addEventListener('input', 处理查找输入);
  元素.分析按钮.addEventListener('click', 处理词组分析);
  元素.关闭查找按钮.addEventListener('click', 关闭查找弹窗);
  元素.查找弹窗.addEventListener('click', 处理查找弹窗点击);
  window.addEventListener('mouseup', 处理鼠标选择结束);
  window.addEventListener('blur', 取消交互状态);
  window.addEventListener('keydown', 处理键盘按下);
  window.addEventListener('keyup', 处理键盘松开);
  window.addEventListener('pagehide', 保存持久化状态);

  function 处理滚动() {
    if (状态.拖选状态) {
      if (元素.滚动容器.scrollTop !== 状态.拖选状态.滚动位置) {
        元素.滚动容器.scrollTop = 状态.拖选状态.滚动位置;
        状态.拖选状态.已阻止滚动 = true;
      }
      return;
    }

    if (状态.滚动帧) {
      return;
    }

    状态.滚动帧 = requestAnimationFrame(function 更新滚动状态() {
      状态.滚动帧 = 0;
      渲染可见行();
      安排保存持久化状态();
    });
  }

  function 处理正文按下(事件) {
    取消滚动动画();
    const 字元素 = 事件.target.closest('.字');
    if (!字元素 || 事件.button !== 0) {
      if (事件.button === 0 && 事件.target === 元素.滚动容器) {
        结束跳转会话('拖动滚动条');
      }
      return;
    }
    if (
      字元素.classList.contains('命中') &&
      (事件.shiftKey || 事件.ctrlKey || 事件.metaKey)
    ) {
      事件.preventDefault();
      window.getSelection()?.removeAllRanges();
      return;
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
    状态.拖选状态 = null;
    Alt按键状态 = null;
  }

  function 处理正文键盘选择(事件) {
    if (事件.key.startsWith('Arrow')) {
      读取选择关键词();
    }
  }

  function 处理键盘按下(事件) {
    const 目标 = 事件.target;
    const 是可编辑目标 =
      目标 instanceof HTMLElement &&
      (目标.isContentEditable || 目标.matches('input, textarea'));

    if (
      事件.key.toLowerCase() === 'f' &&
      (事件.ctrlKey || 事件.metaKey) &&
      !事件.altKey
    ) {
      事件.preventDefault();
      打开查找弹窗();
      return;
    }

    if (
      事件.code === 'Space' &&
      !事件.altKey &&
      !事件.ctrlKey &&
      !事件.metaKey &&
      !是可编辑目标 &&
      状态.行起点列表.length
    ) {
      事件.preventDefault();
      按整页滚动(事件.shiftKey);
      return;
    }

    if (事件.key === 'Alt') {
      if (!事件.repeat) {
        Alt按键状态 =
          事件.ctrlKey || 是可编辑目标
            ? null
            : {
                向上: 事件.shiftKey,
                Command已按下: 事件.metaKey,
                已与其他键组合: false,
              };
      }
      return;
    }

    if (Alt按键状态 && 事件.altKey) {
      if (事件.key === 'Shift') {
        Alt按键状态.向上 = true;
      } else if (事件.key === 'Meta') {
        Alt按键状态.Command已按下 = true;
      } else {
        Alt按键状态.已与其他键组合 = true;
      }
    }

    if (
      事件.key !== 'Backspace' ||
      事件.repeat ||
      事件.altKey ||
      事件.ctrlKey ||
      事件.metaKey ||
      事件.shiftKey ||
      是可编辑目标
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

    function 按整页滚动(向上) {
      取消滚动动画();
      结束跳转会话('Space 翻页');
      const 可见完整行数 = Math.max(
        1,
        Math.floor(元素.滚动容器.clientHeight / 状态.行高),
      );
      const 滚动行数 = 可见完整行数;
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
      console.info('[阅读器] 已按整页滚动', {
        方向: 向上 ? '向上' : '向下',
        起始行: 当前行idx,
        目标行: 目标行idx,
        滚动行数: Math.abs(目标行idx - 当前行idx),
      });
    }
  }

  function 处理键盘松开(事件) {
    if (事件.key !== 'Alt') {
      return;
    }

    const 本次按键状态 = Alt按键状态;
    Alt按键状态 = null;
    if (!本次按键状态 || 本次按键状态.已与其他键组合) {
      return;
    }

    const 关键词 = 查找关键词(状态.当前关键词id);
    if (
      !关键词?.命中位置.length ||
      关键词.当前命中idx < 0 ||
      关键词.当前命中idx >= 关键词.命中位置.length
    ) {
      return;
    }

    事件.preventDefault();
    let 目标命中idx;
    if (本次按键状态.Command已按下) {
      目标命中idx = 本次按键状态.向上 ? 0 : 关键词.命中位置.length - 1;
    } else {
      const 方向 = 本次按键状态.向上 ? -1 : 1;
      目标命中idx =
        (关键词.当前命中idx + 方向 + 关键词.命中位置.length) %
        关键词.命中位置.length;
    }
    if (目标命中idx === 关键词.当前命中idx) {
      console.info('[阅读器] 当前命中无需跳转', {
        关键词: 关键词.文本,
        当前项: 关键词.当前命中idx + 1,
      });
      return;
    }

    跳到命中(关键词, 目标命中idx);
  }

  function 处理高亮上下文点击(事件) {
    if (事件.ctrlKey || 事件.metaKey) {
      事件.preventDefault();
      处理高亮点击(事件);
    }
  }

  function 处理高亮点击(事件) {
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
    const 原始边框 = 获取元素命中边框(字元素);
    let 目标命中idx;
    if (事件.ctrlKey || 事件.metaKey) {
      目标命中idx = 事件.shiftKey ? 关键词.命中位置.length - 1 : 0;
    } else if (事件.shiftKey) {
      目标命中idx =
        (点击命中idx - 1 + 关键词.命中位置.length) % 关键词.命中位置.length;
    } else {
      目标命中idx = (点击命中idx + 1) % 关键词.命中位置.length;
    }

    状态.当前关键词id = 关键词.id;
    关键词.当前命中idx = 点击命中idx;
    if (目标命中idx === 点击命中idx) {
      渲染可见行(true);
      更新关键词指示器();
      安排保存持久化状态();
      console.info('[阅读器] 当前命中无需跳转', {
        关键词: 关键词.文本,
        当前项: 点击命中idx + 1,
      });
      return;
    }
    跳到命中(关键词, 目标命中idx, 原始行位置, 原始边框);
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

  function 切换同组高亮(关键词id, 命中idx) {
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
    更新关键词指示器();
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

  function 处理手动滚动() {
    取消滚动动画();
    结束跳转会话('手动滚动');
  }

  function 结束跳转会话(原因) {
    if (!状态.跳转起点) {
      return;
    }
    状态.跳转起点 = null;
    console.info('[阅读器] 已结束跳转会话', { 原因 });
  }
}
function 应用文本(原始文本, 文件名) {
  const 开始时间 = performance.now();
  const 规范文本 = 原始文本.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const 句子整理开始时间 = performance.now();
  const 原引文索引 = 创建引文索引(规范文本);
  const 句子整理结果 = 整理句子换行(规范文本, 原引文索引.边界列表);
  const 句子整理耗时 = performance.now() - 句子整理开始时间;
  const 文本 = 句子整理结果.文本;
  const 缩进起点集合 = new Set(句子整理结果.缩进起点列表);
  const 排版 = 读取正文排版();
  const 行索引 = 创建行索引(文本, 排版, 缩进起点集合);

  状态.文本 = 文本;
  状态.文件名 = 文件名;
  状态.引文边界列表 = 句子整理结果.引文边界列表;
  状态.缩进起点集合 = 缩进起点集合;
  状态.关键词列表 = [];
  状态.当前关键词id = null;
  状态.下一个关键词id = 1;
  状态.跳转起点 = null;
  取消滚动动画();
  提交行索引(行索引);
  恢复持久化状态();
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

  function 恢复持久化状态() {
    const 原始状态 = localStorage.getItem(持久化键);
    if (!原始状态) {
      元素.滚动容器.scrollTop = 0;
      return;
    }

    const 持久化状态 = JSON.parse(原始状态);
    if (
      持久化状态.文件名 !== 状态.文件名 ||
      持久化状态.文本长度 !== 状态.文本.length
    ) {
      元素.滚动容器.scrollTop = 0;
      return;
    }
    if (!Array.isArray(持久化状态.关键词列表)) {
      throw new TypeError('持久化的关键词列表格式无效');
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
          配色idx: 持久化关键词.配色idx,
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
    ]);
    const 引号模式 = /[“”‘’「」『』]/g;
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

    for (let idx = 0; idx < 全文.length; ) {
      if (
        全文[idx] === '\n' &&
        idx > 0 &&
        idx + 1 < 全文.length &&
        全文[idx - 1] !== '\n' &&
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
  const 西文宽度缓存 = new Map();
  const 文本长度 = 文本.length;
  正文测量上下文.font = 排版.西文字体;
  正文测量上下文.fontKerning = 'normal';
  let 行起点 = 0;
  let 当前行宽度 = 0;
  let 当前行需要缩进 = false;
  let 当前行有内容 = false;
  let 物理行有内容 = false;
  let 西文片段起点 = -1;
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
      当前行需要缩进 = 缩进起点集合.has(字终点);
      当前行有内容 = false;
      物理行有内容 = false;
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
    const 本行内容宽度 = 排版.内容宽度 - (当前行需要缩进 ? 排版.句首缩进 : 0);
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
      const 本行内容宽度 = 排版.内容宽度 - (当前行需要缩进 ? 排版.句首缩进 : 0);
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
    当前行需要缩进 = false;
    当前行有内容 = false;
  }

  function 测量范围(片段起点, 片段终点, 是西文, 已知文本) {
    if (!是西文) {
      if (片段终点 - 片段起点 === 1) {
        const 码 = 文本.charCodeAt(片段起点);
        if (码 === 0x201c || 码 === 0x201d) {
          return 排版.正文字号 * 0.78;
        }
      }
      return 排版.正文字号;
    }
    return 测量片段(已知文本 ?? 文本.slice(片段起点, 片段终点), true);
  }

  function 测量片段(片段文本, 是西文) {
    if (!是西文) {
      return 片段文本 === '“' || 片段文本 === '”'
        ? 排版.正文字号 * 0.78
        : 排版.正文字号;
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
  }
}

function 提交行索引(行索引) {
  状态.行起点列表 = 行索引.行起点列表;
  状态.行终点列表 = 行索引.行终点列表;
  状态.排版键 = 行索引.排版键;
  状态.行高 = 行索引.行高;
  状态.渲染起点 = -1;
  状态.渲染终点 = -1;
  设置画布高度(行索引.总高度);
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
  const 正文字号 = Number.parseFloat(根样式.getPropertyValue('--正文字号'));
  const 行高 = Number.parseFloat(根样式.getPropertyValue('--行高'));
  const 西文字号比例 = Number.parseFloat(根样式.getPropertyValue('--西文字号'));
  const 正文字体 = 根样式.getPropertyValue('--正文字体').trim();
  const 西文字体 = 根样式.getPropertyValue('--西文字体').trim();
  if (
    ![正文字号, 行高, 西文字号比例].every(Number.isFinite) ||
    正文字号 <= 0 ||
    行高 <= 0 ||
    西文字号比例 <= 0 ||
    !正文字体 ||
    !西文字体
  ) {
    throw new TypeError('正文排版 CSS 变量无效');
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
    ].join('|'),
    内容宽度,
    正文字号,
    句首缩进: 正文字号 * 2,
    行高,
    西文字体: `400 ${正文字号 * 西文字号比例}px ${西文字体}`,
  };
}

function 是西文字素(字素) {
  return 是西文范围(字素, 0, 字素.length);
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

function 渲染可见行(强制渲染 = false) {
  if (!状态.行起点列表.length) {
    return;
  }

  const 缓冲行数 = 12;
  const 可见起点 = Math.max(
    0,
    Math.floor(元素.滚动容器.scrollTop / 状态.行高) - 缓冲行数,
  );
  const 可见终点 = Math.min(
    状态.行起点列表.length,
    Math.ceil(
      (元素.滚动容器.scrollTop + 元素.滚动容器.clientHeight) / 状态.行高,
    ) + 缓冲行数,
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
      const 行元素 = document.createElement('div');
      行元素.className = '正文行';
      行元素.classList.toggle(
        '换行缩进行',
        状态.缩进起点集合.has(行起点),
      );
      行元素.dataset.start = String(行起点);
      行元素.dataset.end = String(行终点);
      行元素.setAttribute('aria-label', 行文本 || '空行');

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
        const 字文本 = 状态.文本.slice(字起点, 字终点);
        const 字命中详情 = [];
        const 字元素 = document.createElement('span');
        字元素.className = '字';
        字元素.classList.toggle('西文', 是西文字素(字文本));
        if (字文本 === '“') {
          字元素.classList.add('中文引号', '左引号');
        } else if (字文本 === '”') {
          字元素.classList.add('中文引号', '右引号');
        }
        字元素.dataset.start = String(字起点);
        字元素.dataset.end = String(字终点);
        字元素.setAttribute('aria-hidden', 'true');
        if (字文本 === '的' || 字文本 === '了') {
          const 特殊字形 = document.createElement('span');
          特殊字形.className = '特殊字形';
          特殊字形.textContent = 字文本;
          字元素.append(特殊字形);
        } else {
          字元素.textContent = 字文本;
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
            字元素.classList.add('引文内容');
            字元素.classList.toggle('引文起点', 字起点 === 引文起点);
            字元素.classList.toggle('引文终点', 字终点 === 引文终点);
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
          const 命中关键词列表 = [];
          for (const 命中详情 of 字命中详情) {
            if (
              !命中关键词列表.some((关键词) => 关键词.id === 命中详情.关键词.id)
            ) {
              命中关键词列表.push(命中详情.关键词);
            }
          }

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
            if (当前关键词命中.命中终点 === 字终点) {
              字元素.dataset.hitPosition = `${当前命中idx + 1}/${最后命中idx + 1}`;
            }
          }
          字元素.dataset.keywordId = String(点击命中.关键词.id);
          字元素.dataset.hitIndex = String(点击命中.命中idx);
          字元素.style.setProperty('--命中背景', 主配色.浅色);
          字元素.style.setProperty('--命中当前色', 主配色.深色);
          if (!当前项命中 && 命中关键词列表.length > 1) {
            字元素.style.backgroundImage = 创建高亮色带(命中关键词列表);
          }
        }

        行元素.append(字元素);
      }

      片段.append(行元素);
    }

    return 片段;
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

  function 创建高亮色带(关键词列表) {
    const 每段比例 = 100 / 关键词列表.length;
    const 色段 = 关键词列表.flatMap(function 创建色段(关键词, idx) {
      const 颜色 = 获取关键词配色(关键词).浅色;
      return [`${颜色} ${idx * 每段比例}%`, `${颜色} ${(idx + 1) * 每段比例}%`];
    });
    return `linear-gradient(to bottom, ${色段.join(', ')})`;
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
  const 已有关键词 = 状态.关键词列表.find(function 找到相同关键词(已有关键词) {
    return 已有关键词.文本 === 关键词;
  });
  if (已有关键词) {
    删除关键词标记(已有关键词.id);
  } else {
    添加关键词标记(关键词, 实际选择起点);
  }
  选择.removeAllRanges();
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
  return 高亮配色[关键词.配色idx];
}

function 更新关键词指示器() {
  const 画布 = 元素.关键词指示器;
  const 轨道高度 = 元素.滚动容器.clientHeight;
  const 滚动高度 = 元素.滚动容器.scrollHeight;
  const 主命中 = 获取指示器主命中();
  if (!主命中 || !状态.行起点列表.length || 滚动高度 <= 轨道高度) {
    画布.hidden = true;
    状态.指示器缓存 = null;
    return;
  }

  画布.hidden = false;
  const 像素比 = Math.min(3, window.devicePixelRatio || 1);
  const 画布宽 = Math.max(1, Math.round(画布.clientWidth * 像素比));
  const 画布高 = Math.max(1, Math.round(画布.clientHeight * 像素比));
  if (画布.width !== 画布宽 || 画布.height !== 画布高) {
    画布.width = 画布宽;
    画布.height = 画布高;
    状态.指示器缓存 = null;
  }

  // 关键词 id 不会在同一次会话里复用，所以刻度缓存不必随关键词增删失效
  const 布局键 = [状态.排版键, 画布宽, 画布高, 滚动高度].join('|');
  const 底图键 = `${布局键}|${主命中.关键词.id}`;

  if (状态.指示器缓存?.布局键 !== 布局键) {
    状态.指示器缓存 = {
      布局键,
      底图键: '',
      底图: null,
      段缓存: new Map(),
      墨色: getComputedStyle(document.documentElement)
        .getPropertyValue('--墨色')
        .trim(),
    };
  }
  if (状态.指示器缓存.底图键 !== 底图键) {
    const 开始时间 = performance.now();
    const 原刻度缓存数 = 状态.指示器缓存.段缓存.size;
    状态.指示器缓存.底图 = 创建指示器底图(
      画布宽,
      画布高,
      滚动高度,
      像素比,
      主命中.关键词,
    );
    状态.指示器缓存.底图键 = 底图键;
    // 只在真正重算过刻度时记一笔，切换主关键词时不刷屏
    if (状态.指示器缓存.段缓存.size !== 原刻度缓存数) {
      console.info('[阅读器] 关键词指示器已重建', {
        关键词: 主命中.关键词.文本,
        命中数: 主命中.关键词.命中位置.length,
        轨道像素高: 画布高,
        耗时毫秒: Math.round(performance.now() - 开始时间),
      });
    }
  }

  指示器上下文.clearRect(0, 0, 画布宽, 画布高);
  指示器上下文.drawImage(状态.指示器缓存.底图, 0, 0);
  绘制主命中标记(画布宽, 画布高, 滚动高度, 像素比, 主命中);
}

/* 指示器优先展示鼠标悬停的关键词，其次才是当前关键词。 */
function 获取指示器主命中() {
  const 悬停关键词 = 查找关键词(状态.悬停关键词id);
  if (悬停关键词?.命中位置.length) {
    return { 关键词: 悬停关键词, 命中idx: 状态.悬停命中idx ?? -1 };
  }

  const 当前关键词 = 查找关键词(状态.当前关键词id);
  if (当前关键词?.命中位置.length) {
    return { 关键词: 当前关键词, 命中idx: 当前关键词.当前命中idx };
  }
  return null;
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
  const 段列表 = 读取指示器段列表(主关键词, 画布高, 滚动高度, 最小刻度高度);
  底图上下文.fillStyle = 获取关键词配色(主关键词).深色;
  for (let idx = 0; idx < 段列表.length; idx += 2) {
    底图上下文.fillRect(0, 段列表[idx], 画布宽, 段列表[idx + 1] - 段列表[idx]);
  }
  return 底图;
}

/* 刻度只跟版面与命中有关，与谁是主关键词无关，可以跨悬停切换复用。 */
function 读取指示器段列表(关键词, 画布高, 滚动高度, 最小刻度高度) {
  const 段缓存 = 状态.指示器缓存.段缓存;
  let 段列表 = 段缓存.get(关键词.id);
  if (!段列表) {
    段列表 = 创建指示器段列表(关键词, 画布高, 滚动高度, 最小刻度高度);
    段缓存.set(关键词.id, 段列表);
  }
  return 段列表;
}

/* 逐轨道像素反查命中，代价只与轨道高度相关，与命中数量无关。 */
function 创建指示器段列表(关键词, 画布高, 滚动高度, 最小刻度高度) {
  const 总行数 = 状态.行起点列表.length;
  const 每像素行数 = 滚动高度 / (状态.行高 * 画布高);
  const 段数组 = [];
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
    const 命中idx = 查找首个相交命中(关键词, 状态.行起点列表[行起点idx]);
    const 像素终点偏移 =
      行终点idx < 总行数 ? 状态.行起点列表[行终点idx] : 状态.文本.length;
    const 有命中 =
      命中idx < 关键词.命中位置.length &&
      关键词.命中位置[命中idx] < 像素终点偏移;

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

  return 展开最小刻度(段数组, 画布高, 最小刻度高度);
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

function 绘制主命中标记(画布宽, 画布高, 滚动高度, 像素比, 主命中) {
  if (
    !主命中 ||
    主命中.命中idx < 0 ||
    主命中.命中idx >= 主命中.关键词.命中位置.length
  ) {
    return;
  }

  const 行idx = 查找偏移所在行(主命中.关键词.命中位置[主命中.命中idx]);
  const 标记高度 = Math.max(1, Math.round(指示器标记高度 * 像素比));
  const 标记留白 = Math.max(1, Math.round(指示器标记留白 * 像素比));
  const 标记中心 = (((行idx + 0.5) * 状态.行高) / 滚动高度) * 画布高;
  const 标记顶部 = Math.min(
    画布高 - 标记高度,
    Math.max(0, Math.round(标记中心 - 标记高度 / 2)),
  );
  指示器上下文.clearRect(
    0,
    标记顶部 - 标记留白,
    画布宽,
    标记高度 + 标记留白 * 2,
  );
  指示器上下文.fillStyle = 状态.指示器缓存.墨色;
  指示器上下文.fillRect(0, 标记顶部, 画布宽, 标记高度);
}

function 跳到命中(
  关键词,
  命中idx,
  原始行位置 = 获取当前命中行位置(关键词),
  原始边框 = 获取当前命中边框(关键词),
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
  const 目标滚动位置 = 行idx * 状态.行高 - 目标行位置;
  渲染可见行(true);
  更新关键词指示器();
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
  window.clearTimeout(状态.迸发计时器);
  状态.迸发计时器 = 0;
  元素.跳转迸发.removeEventListener('animationend', 隐藏跳转迸发);
  元素.跳转迸发.classList.remove('跳转迸发播放中');
  元素.跳转迸发.hidden = true;
  元素.跳转迸发.style.removeProperty('left');
  元素.跳转迸发.style.removeProperty('top');
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
  localStorage.setItem(
    持久化键,
    JSON.stringify({
      文件名: 状态.文件名,
      文本长度: 状态.文本.length,
      ...阅读位置,
      当前关键词id: 状态.当前关键词id,
      关键词列表: 状态.关键词列表.map(function 序列化关键词(关键词) {
        return {
          id: 关键词.id,
          文本: 关键词.文本,
          当前命中idx: 关键词.当前命中idx,
          配色idx: 关键词.配色idx,
        };
      }),
    }),
  );
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
