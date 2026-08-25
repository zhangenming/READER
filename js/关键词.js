import {
  上下文分块行数,
  上下文前文字数,
  上下文后文字数,
  上下文最大初始行数,
  关键词排序方式列表,
  字素分段器,
  拼音排序器,
  高亮配色,
} from './常量.js';
import { 元素, 状态 } from './状态.js';
import { 渲染可见行 } from './虚拟渲染.js';
import { 更新关键词指示器 } from './指示器.js';
import { 二分查找精确命中, 显示当前命中位置提示 } from './跳转动画.js';
import { 安排保存持久化状态 } from './持久化.js';

export function 读取选择关键词() {
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
  const 扩展结果 = 尝试自动扩展关键词(关键词, 实际选择起点);
  const 已有关键词 = 状态.关键词列表.find(function 找到相同关键词(已有关键词) {
    return 已有关键词.文本 === 扩展结果.词;
  });
  if (已有关键词) {
    删除关键词标记(已有关键词.id);
  } else {
    添加关键词标记(扩展结果.词, 扩展结果.起点);
  }
  选择.removeAllRanges();
}

// 双向自动扩展：向前探测（前置前一字符）与向后探测（追加后一字符）交替进行，
// 只要候选词的全文命中数与当前词一致且大于 1 就吸收该字符，
// 直到两个方向都无法扩展。返回 { 词, 起点 }——向前扩展会改变起点，
// 调用方必须用返回的起点定位「当前命中」。

// 双向自动扩展：向前探测（前置前一字符）与向后探测（追加后一字符）交替进行，
// 只要候选词的全文命中数与当前词一致且大于 1 就吸收该字符，
// 直到两个方向都无法扩展。返回 { 词, 起点 }——向前扩展会改变起点，
// 调用方必须用返回的起点定位「当前命中」。
export function 尝试自动扩展关键词(关键词, 起点) {
  // 命中次数缓存：同一次扩展内避免对相同候选词重复做全文扫描
  const 次数缓存 = new Map();
  function 取命中次数(词) {
    let 次数 = 次数缓存.get(词);
    if (次数 === undefined) {
      次数 = 查找关键词命中(词).length;
      次数缓存.set(词, 次数);
    }
    return 次数;
  }

  let 当前词 = 关键词;
  let 当前起点 = 起点;
  let 当前次数 = 取命中次数(当前词);
  while (当前次数 > 1) {
    let 已扩展 = false;
    if (当前起点 > 0) {
      const 左候选词 = 状态.文本[当前起点 - 1] + 当前词;
      const 左次数 = 取命中次数(左候选词);
      if (左次数 === 当前次数) {
        当前词 = 左候选词;
        当前起点 -= 1;
        已扩展 = true;
      }
    }
    const 下一位置 = 当前起点 + 当前词.length;
    if (下一位置 < 状态.文本.length) {
      const 右候选词 = 当前词 + 状态.文本[下一位置];
      const 右次数 = 取命中次数(右候选词);
      if (右次数 === 当前次数) {
        当前词 = 右候选词;
        当前次数 = 右次数;
        已扩展 = true;
      }
    }
    if (!已扩展) {
      break;
    }
  }
  return { 词: 当前词, 起点: 当前起点 };
}

export function 获取选择边界偏移(节点, 节点内偏移) {
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

export function 添加关键词标记(关键词文本, 选择位置) {
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

export function 创建关键词标记(关键词文本, 命中位置) {
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

export function 查找关键词命中(关键词) {
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

export function 删除关键词标记(关键词id) {
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

export function 查找关键词(关键词id) {
  return 状态.关键词列表.find(function 找到关键词(关键词) {
    return 关键词.id === 关键词id;
  });
}

export function 获取关键词配色(关键词) {
  return 高亮配色[关键词.配色idx % 高亮配色.length];
}

export function 有弹窗打开() {
  return (
    元素.查找弹窗.open ||
    元素.上下文弹窗.open ||
    元素.词频弹窗.open ||
    元素.内容选择弹窗.open ||
    !元素.字体弹窗.hidden
  );
}

export function 切换关键词排序(排序方式) {
  if (!关键词排序方式列表.includes(排序方式) || 状态.关键词排序 === 排序方式) {
    return;
  }
  状态.关键词排序 = 排序方式;
  渲染关键词面板();
  安排保存持久化状态();

  console.info('[阅读器] 已切换关键词排序', { 排序方式 });
}

/* 排序只影响面板展示顺序，不改动关键词的原始添加顺序。 */

export function 排序后的关键词列表() {
  const 列表 = 状态.关键词列表.filter(function 排除临时关键词(关键词) {
    return !关键词.临时;
  });
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

export function 渲染关键词面板() {
  const 持久关键词列表 = 状态.关键词列表.filter(
    function 排除临时关键词(关键词) {
      return !关键词.临时;
    },
  );
  const 面板可见 = Boolean(状态.文件名) && 持久关键词列表.length > 0;
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
    ...持久关键词列表.map(function 读取关键词签名(关键词) {
      return `${关键词.id}:${关键词.命中位置.length}:${关键词.当前命中idx}`;
    }),
  ].join('|');
  if (!元素.关键词面板.hidden && 签名 === 状态.关键词面板签名) {
    return;
  }
  状态.关键词面板签名 = 签名;

  元素.关键词面板.hidden = false;
  元素.关键词面板开关.textContent = `关键词 ${持久关键词列表.length}`;
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

export function 打开上下文弹窗(关键词) {
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

export function 追加上下文行块() {
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

export function 读取上下文片段(起点, 终点) {
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

export function 关闭上下文弹窗() {
  if (元素.上下文弹窗.open) {
    元素.上下文弹窗.close();
  }
}
