import { 文本目录地址, 拼音排序器 } from './常量.js';
import { 按需让出主线程 } from './调度.js';
import { 是有效文本文件名 } from './文本工具.js';
import { 元素, 状态 } from './状态.js';
import { 格式化滚动小时 } from './统计展示.js';
import { 停止自动滚动 } from './自动滚动.js';
import { 保存持久化状态, 读取持久化数据 } from './持久化.js';

// 内容选择弹窗：从 app.js 绑定事件() 闭包拆出。
// 簇内原先调用 app.js 的 载入文本 / 创建文本地址；为避免「内容选择弹窗 → app」
// 反向依赖成环，改由 app.js 绑定事件() 时经 初始化内容选择弹窗 注入回调。

let 文本字数任务 = new Map();
let 注入回调 = null;

export function 初始化内容选择弹窗({ 载入文本, 创建文本地址 }) {
  注入回调 = { 载入文本, 创建文本地址 };
}

function 取注入回调() {
  if (注入回调 === null) {
    throw new Error('内容选择弹窗未初始化：请先在组合根调用 初始化内容选择弹窗');
  }
  return 注入回调;
}

export async function 打开内容选择弹窗() {
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
        const 响应 = await fetch(取注入回调().创建文本地址(文件名));
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

export function 关闭内容选择弹窗() {
  if (元素.内容选择弹窗.open) {
    元素.内容选择弹窗.close();
  }
}

export function 处理内容选择弹窗点击(事件) {
  if (事件.target === 元素.内容选择弹窗) {
    关闭内容选择弹窗();
  }
}

export function 处理内容选择列表点击(事件) {
  const 按钮 = 事件.target.closest('button[data-file-name]');
  if (!按钮) {
    return;
  }
  const 文件名 = 按钮.dataset.fileName;
  关闭内容选择弹窗();
  void 取注入回调().载入文本(文件名);
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
