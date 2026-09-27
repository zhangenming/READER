import { 文本目录地址, 拼音排序器 } from './常量.js';
import { 按需让出主线程 } from './调度.js';
import { 是有效文本文件名 } from './文本工具.js';
import { 元素, 状态 } from './状态.js';
import { 格式化滚动小时, 书籍时间账 } from './统计展示.js';
import { 停止自动滚动 } from './自动滚动.js';
import { 保存持久化状态, 读取持久化数据或新建, 安排保存持久化状态 } from './持久化.js';

// 内容选择弹窗：从 app.js 绑定事件() 闭包拆出。
// 簇内原先调用 app.js 的 载入文本 / 创建文本地址；为避免「内容选择弹窗 → app」
// 反向依赖成环，改由 app.js 绑定事件() 时经 初始化内容选择弹窗 注入回调。

let 文本字数任务 = new Map();
let 注入回调 = null;

// 一行一本书，一列一个量：原来书名/字数/已阅读三行堆在一枚按钮里，
// 几十本书要滚很久，「继续 · 4%」还把进度和状态挤成一句话。
// 排序存在 状态.内容排序（全局偏好）：弹窗反复开关、换书、刷新都保持用户上一次点的列。
// 表头第二行的合计：只有书名和两笔时间账有数可合，口径写进悬停提示。
function 本数合计(行列表) {
  return `共 ${行列表.length} 本`;
}

// 合计＝各行显示值相加（每行只到 0.1h，秒舍掉）：先加毫秒再取整会凭空多出零点几小时，
// 拿计算器竖着加这一列要能加出同一个数。
function 时间合计(取毫秒) {
  return function (行列表) {
    const 小时 = 行列表.reduce(function 累加(总, 行) {
      const 毫秒 = 取毫秒(行);
      return 毫秒 === null
        ? 总
        : 总 + Number((毫秒 / 3_600_000).toFixed(1));
    }, 0);
    return `共 ${小时.toFixed(1)}h`;
  };
}

const 时间合计口径 = '各行相加，每行只到 0.1 小时，多出的秒舍掉';

const 内容排序列 = {
  书名: {
    名: '书名',
    自然方向: '升',
    取文本: (行) => 行.名称,
    合计: 本数合计,
    合计口径: '目录里可读取的 txt 文件个数',
  },
  字数: { 名: '万字', 自然方向: '降', 取值: (行) => 行.字数 },
  激活: {
    名: '激活',
    自然方向: '降',
    取值: (行) => 行.激活毫秒,
    合计: 时间合计((行) => 行.激活毫秒),
    合计口径: `页面可见且载入这本书的时长，${时间合计口径}`,
  },
  滚动: {
    名: '滚动',
    自然方向: '降',
    取值: (行) => 行.滚动毫秒,
    合计: 时间合计((行) => 行.滚动毫秒),
    合计口径: `自动滚动与按住方向键的时长，${时间合计口径}`,
  },
  进度: { 名: '进度', 自然方向: '降', 取值: (行) => 行.进度 },
};

export function 初始化内容选择弹窗({ 载入文本, 创建文本地址 }) {
  注入回调 = { 载入文本, 创建文本地址 };
}

// 只在启动时调用一次：内存里的排序是本次会话的权威值，之后每次点击都会落盘，
// 再读一遍反而会把用户刚点的顺序盖回上一次的值。
export function 恢复内容排序(持久化数据) {
  const 已存 = 持久化数据?.内容排序;
  if (
    !已存 ||
    !Object.hasOwn(内容排序列, 已存.键) ||
    (已存.方向 !== '升' && 已存.方向 !== '降')
  ) {
    return;
  }
  状态.内容排序 = { 键: 已存.键, 方向: 已存.方向 };
}

function 取注入回调() {
  if (注入回调 === null) {
    throw new Error(
      '内容选择弹窗未初始化：请先在组合根调用 初始化内容选择弹窗',
    );
  }
  return 注入回调;
}

export async function 打开内容选择弹窗() {
  if (元素.内容选择弹窗.open) {
    return;
  }
  停止自动滚动('打开内容选择');
  保存持久化状态();
  元素.内容选择列表.replaceChildren(创建内容载入提示('正在读取'));
  元素.内容选择弹窗.showModal();

  try {
    状态.文本目录 = await 读取文本目录();
    if (!元素.内容选择弹窗.open) {
      return;
    }
    渲染内容选择列表();
    滚动到当前文本();
    状态.文本字数 = await 统计文本字数();
    if (元素.内容选择弹窗.open) {
      渲染内容选择列表();
    }
  } catch (错误) {
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
  // 整格可点：合计占了表头第二行，只认按钮会让那一行成为死区
  const 列 = 事件.target.closest('.内容排序列');
  if (列) {
    切换内容排序(列.dataset.排序);
    return;
  }
  const 行 = 事件.target.closest('[data-file-name]');
  if (!行) {
    return;
  }
  载入内容行(行.dataset.fileName);
}

// 行是 <tr> 而不是按钮，键盘要自己接住：Enter 和空格都当「载入这本」。
export function 处理内容选择列表按键(事件) {
  if (事件.key !== 'Enter' && 事件.key !== ' ') {
    return;
  }
  const 行 = 事件.target.closest('tr[data-file-name]');
  if (!行) {
    return;
  }
  事件.preventDefault();
  载入内容行(行.dataset.fileName);
}

function 载入内容行(文件名) {
  关闭内容选择弹窗();
  void 取注入回调().载入文本(文件名);
}

function 切换内容排序(键) {
  const 列 = 内容排序列[键];
  if (!列) {
    return;
  }
  状态.内容排序 =
    状态.内容排序.键 === 键
      ? { 键, 方向: 状态.内容排序.方向 === '降' ? '升' : '降' }
      : { 键, 方向: 列.自然方向 };
  渲染内容选择列表();
  元素.内容选择列表.scrollTop = 0;
  安排保存持久化状态();
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
    const 文件名 = decodeURIComponent(文件地址.pathname.slice(目录路径.length));
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
  const 持久化数据 = 读取持久化数据或新建();
  const 行列表 = 状态.文本目录.map(function 创建行数据(文件名, 序) {
    return 创建内容行数据(文件名, 序, 持久化数据.文本状态[文件名]);
  });

  const 表格 = document.createElement('table');
  表格.className = '内容表格';
  表格.append(创建内容表头(行列表), 创建内容表体(排序内容行(行列表)));
  元素.内容选择列表.replaceChildren(表格);
}

function 创建内容行数据(文件名, 序, 文本状态) {
  const 统计字数 = 状态.文本字数.get(文件名);
  const 是当前 = 文件名 === 状态.文件名;
  // 从没打开过的书不取账：两列各自为 null，排序钉在尾部、格子里留白
  const 时间账 = 文本状态
    ? 书籍时间账(文件名, 文本状态.总滚动毫秒)
    : null;
  return {
    文件名,
    序,
    是当前,
    名称: 文件名.replace(/\.txt$/i, ''),
    // null = 这一格没有可比的数（还没统计出来 / 统计失败 / 从没打开过），排序时钉在尾部
    字数: Number.isFinite(统计字数) ? 统计字数 : null,
    统计中: 统计字数 === undefined,
    激活毫秒: 时间账?.激活毫秒 ?? null,
    滚动毫秒: 时间账?.滚动毫秒 ?? null,
    进度: 计算已保存阅读比例(文本状态),
  };
}

function 排序内容行(行列表) {
  const 列 = 内容排序列[状态.内容排序.键];
  const 符号 = 状态.内容排序.方向 === '降' ? -1 : 1;
  return 行列表.slice().sort(function 比较行(左, 右) {
    const 同序 = 左.序 - 右.序; // 书名列表本身按拼音排，任何并列都回落到这个顺序
    if (列.取文本) {
      return 拼音排序器.compare(列.取文本(左), 列.取文本(右)) * 符号 || 同序;
    }
    const 左值 = 列.取值(左);
    const 右值 = 列.取值(右);
    if (左值 === null || 右值 === null) {
      // 缺值不随方向跳到最前：升到「还没统计」的书前面去等于把空壳顶到第一行
      return 左值 === 右值 ? 同序 : 左值 === null ? 1 : -1;
    }
    return 左值 !== 右值 ? (左值 - 右值) * 符号 : 同序;
  });
}

function 创建内容表头(行列表) {
  const 行 = document.createElement('tr');
  for (const [键, 列] of Object.entries(内容排序列)) {
    const 单元格 = document.createElement('th');
    单元格.scope = 'col';
    单元格.className = '内容排序列';
    单元格.dataset.排序 = 键;
    单元格.setAttribute(
      'aria-sort',
      状态.内容排序.键 === 键
        ? 状态.内容排序.方向 === '降'
          ? 'descending'
          : 'ascending'
        : 'none',
    );

    const 按钮 = document.createElement('button');
    按钮.type = 'button';
    按钮.className = '内容排序按钮';
    按钮.textContent = 列.名;
    按钮.title = `按${列.名}排序`;
    单元格.append(按钮);

    if (列.合计) {
      const 合计文本 = 列.合计(行列表);
      const 合计格 = document.createElement('span');
      合计格.className = '内容表头合计';
      合计格.textContent = 合计文本;
      单元格.append(合计格);
      单元格.title = `${合计文本}＝${列.合计口径}`;
    }
    行.append(单元格);
  }
  const 表头组 = document.createElement('thead');
  表头组.append(行);
  return 表头组;
}

function 创建内容表体(行列表) {
  const 片段 = document.createDocumentFragment();
  for (const 行数据 of 行列表) {
    片段.append(创建内容行元素(行数据));
  }
  const 表体 = document.createElement('tbody');
  表体.append(片段);
  return 表体;
}

function 创建内容行元素(行数据) {
  const 行 = document.createElement('tr');
  行.className = '内容行';
  行.dataset.fileName = 行数据.文件名;
  行.tabIndex = 0;
  if (行数据.是当前) {
    行.classList.add('当前');
    行.setAttribute('aria-current', 'true');
  }

  const 名称 = 创建内容单元格(行数据.名称, '内容行名称');
  名称.title = 行数据.文件名;

  const 字数 = 创建内容单元格(
    行数据.统计中
      ? '…'
      : 行数据.字数 === null
        ? '—'
        : (行数据.字数 / 10_000).toFixed(1),
  );

  // 没读过、没进度都留白而不是写 0：一屏「0.0h」和「0%」是杂讯。
  // 「状态」那一列撤掉之后，有没有读过就看这两格有没有数；而激活按页面可见记账，
  // 刚打开这本书的几十秒也会算进去，所以不到半小时（显示成 0.0h）同样留白。
  const 时长格 = (毫秒) => {
    const 文字 = 毫秒 ? 格式化滚动小时(毫秒) : '';
    return 创建内容单元格(文字 === '0.0h' ? '' : 文字);
  };

  const 进度 = 创建内容单元格(
    行数据.进度 === null || 行数据.进度 === 0
      ? ''
      : `${Math.round(行数据.进度 * 100)}%`,
  );

  行.append(
    名称,
    字数,
    时长格(行数据.激活毫秒),
    时长格(行数据.滚动毫秒),
    进度,
  );
  return 行;
}

function 创建内容单元格(文字, 类名) {
  const 单元格 = document.createElement('td');
  单元格.textContent = 文字;
  if (类名) {
    单元格.className = 类名;
  }
  return 单元格;
}

// 打开弹窗后把当前在读的书滚到列表中间。只在首次渲染后调用一次：
// 字数统计完成会重渲染一遍，那时用户可能已经自己滚走了，再居中会把人拽回来。
// 表格行高固定，两次渲染的 scrollTop 会自然保留。
function 滚动到当前文本() {
  const 容器 = 元素.内容选择列表;
  const 当前项 = 容器.querySelector('.内容行.当前');
  if (!当前项) {
    return;
  }
  // 用矩形差而不是 offsetTop：列表本身没有 position，offsetTop 会算到 dialog 上，
  // 把标题栏的高度也当成滚动偏移。矩形差对两者都随弹窗入场动画平移，天然抵消。
  const 容器框 = 容器.getBoundingClientRect();
  const 项框 = 当前项.getBoundingClientRect();
  const 目标 =
    容器.scrollTop +
    (项框.top - 容器框.top) -
    (容器.clientHeight - 项框.height) / 2;
  容器.scrollTop = Math.max(0, 目标);
}

function 创建内容载入提示(文字) {
  const 提示 = document.createElement('p');
  提示.className = '内容选择提示';
  提示.textContent = 文字;
  return 提示;
}

function 计算已保存阅读比例(文本状态) {
  if (
    !文本状态 ||
    !Number.isFinite(文本状态.文本长度) ||
    文本状态.文本长度 <= 0 ||
    !Number.isFinite(文本状态.阅读偏移)
  ) {
    return null;
  }
  return Math.min(1, Math.max(0, 文本状态.阅读偏移 / 文本状态.文本长度));
}
