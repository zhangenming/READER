// 统计弹窗只负责展示快照，不参与滚动计时或持久化。
export function 格式化统计时长(毫秒) {
  const 有效毫秒 = Number.isFinite(毫秒) ? Math.max(0, 毫秒) : 0;
  if (有效毫秒 > 0 && 有效毫秒 < 60_000) return '不足 1 分钟';
  const 分钟 = Math.floor(有效毫秒 / 60_000);
  return 分钟 < 60
    ? `${分钟} 分钟`
    : `${Math.floor(分钟 / 60)} 小时 ${分钟 % 60} 分钟`;
}

export function 格式化统计日期(日期串, 今天) {
  if (typeof 日期串 !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(日期串)) {
    return 日期串 == null ? '' : String(日期串);
  }
  if (日期串 === 今天) return '今天';
  const 年 = 日期串.slice(0, 4);
  const 月 = Number(日期串.slice(5, 7));
  const 日 = Number(日期串.slice(8, 10));
  return typeof 今天 === 'string' && 今天.startsWith(年)
    ? `${月}月${日}日`
    : `${年}年${月}月${日}日`;
}

export function 创建阅读统计内容({
  今日,
  今日前台 = 0,
  每日前台 = {},
  书籍,
  文件名,
  进度,
  每日 = {},
  今天 = '',
}) {
  const 片段 = document.createDocumentFragment();
  const 说明 = 创建节点(
    'p',
    '自动滚动与前台停留分别计时；前台停留包含手动阅读、自动滚动和弹窗，页面隐藏时暂停。按本地日期计算；前台停留从本次升级开始记录。',
    '统计说明',
  );
  const 摘要 = 创建节点('dl', '', '统计摘要');
  const 总时长 = 书籍.reduce((总数, [, 项]) => 总数 + 项.总滚动毫秒, 0);
  for (const [标签, 值] of [
    ['今日自动滚动', 格式化统计时长(今日)],
    ['累计自动滚动', 格式化统计时长(总时长)],
    ['今日前台停留', 格式化统计时长(今日前台)],
    ['累计前台停留', 格式化统计时长(
      书籍.reduce((总数, [, 项]) => 总数 + (项.总前台毫秒 ?? 0), 0),
    )],
    ['本书进度', 文件名 ? `${进度.toFixed(1)}%` : '—'],
  ]) {
    const 卡片 = 创建节点('div', '', '统计卡片');
    卡片.append(创建节点('dt', 标签), 创建节点('dd', 值));
    摘要.append(卡片);
  }

  const 书籍名列表 = 书籍.map(([名]) => 名);
  let 选中书名 = 书籍名列表.includes(文件名) ? 文件名 : (书籍名列表[0] ?? '');
  let 每日标题;
  let 每日表体;

  const 表格 = 创建节点('table');
  表格.append(创建节点('caption', `书籍明细 · ${书籍.length} 本`));
  const 表头 = 创建节点('thead');
  const 标题行 = 创建节点('tr');
  for (const 标题 of ['书籍', '自动滚动', '前台停留', '进度']) {
    const 列 = 创建节点('th', 标题);
    列.scope = 'col';
    标题行.append(列);
  }
  表头.append(标题行);
  const 表体 = 创建节点('tbody');
  for (const [名, 项] of [...书籍].sort(
    ([, a], [, b]) => b.总滚动毫秒 - a.总滚动毫秒,
  )) {
    const 当前 = 名 === 文件名;
    const 行 = 创建节点('tr', '', '统计可点');
    if (名 === 选中书名) 行.classList.add('统计选中书');
    行.dataset.文件名 = 名;
    行.tabIndex = 0;
    行.setAttribute('aria-selected', 名 === 选中书名 ? 'true' : 'false');
    const 书名 = 创建节点('td');
    if (当前) 书名.append(创建节点('span', '当前', '统计当前标记'));
    书名.append(创建节点('span', 名));
    const 已存进度 =
      Number.isFinite(项.阅读偏移) &&
      Number.isFinite(项.文本长度) &&
      项.文本长度 > 0
        ? Math.min(100, Math.max(0, (项.阅读偏移 / 项.文本长度) * 100))
        : null;
    const 进度列 = 创建节点(
      'td',
      当前
        ? `${进度.toFixed(1)}%`
        : 已存进度 === null
          ? '—'
          : `约 ${已存进度.toFixed(1)}%`,
    );
    进度列.title = 当前 ? '当前滚动位置进度' : '按上次保存的文本位置估算';
    行.append(
      书名,
      创建节点('td', 格式化统计时长(项.总滚动毫秒)),
      创建节点('td', 格式化统计时长(项.总前台毫秒)),
      进度列,
    );
    表体.append(行);
  }
  if (!书籍.length) {
    const 行 = 创建节点('tr');
    const 提示 = 创建节点('td', '还没有阅读记录', '统计空状态');
    提示.colSpan = 4;
    行.append(提示);
    表体.append(行);
  }
  表格.append(表头, 表体);
  表体.addEventListener('click', 处理书籍点击);
  表体.addEventListener('keydown', 处理书籍按键);

  片段.append(说明, 摘要, 表格);
  if (选中书名) 片段.append(创建每日模块());
  return 片段;

  function 处理书籍点击(事件) {
    const 行 = 事件.target.closest('tr[data-文件名]');
    if (行) 切换选中(行.dataset.文件名);
  }

  function 处理书籍按键(事件) {
    if (事件.key !== 'Enter' && 事件.key !== ' ') return;
    const 行 = 事件.target.closest('tr[data-文件名]');
    if (!行) return;
    事件.preventDefault();
    切换选中(行.dataset.文件名);
  }

  function 切换选中(书名) {
    if (!书名 || 书名 === 选中书名) return;
    选中书名 = 书名;
    for (const 行 of 表体.querySelectorAll('tr[data-文件名]')) {
      const 选中 = 行.dataset.文件名 === 选中书名;
      行.classList.toggle('统计选中书', 选中);
      行.setAttribute('aria-selected', 选中 ? 'true' : 'false');
    }
    更新每日模块();
  }

  function 创建每日模块() {
    const 区块 = 创建节点('section', '', '统计每日');
    const 每日表 = 创建节点('table', '', '统计每日表');
    每日标题 = 创建节点('caption');
    const 每日表头 = 创建节点('thead');
    const 每日标题行 = 创建节点('tr');
    for (const 标题 of ['日期', '自动滚动', '前台停留']) {
      const 列 = 创建节点('th', 标题);
      列.scope = 'col';
      每日标题行.append(列);
    }
    每日表头.append(每日标题行);
    每日表体 = 创建节点('tbody');
    每日表.append(每日标题, 每日表头, 每日表体);
    区块.append(每日表);
    更新每日模块();
    return 区块;
  }

  function 更新每日模块() {
    if (!每日标题 || !每日表体) return;
    每日标题.textContent = `每日阅读 · ${选中书名}`;
    每日标题.title = 选中书名;
    每日表体.replaceChildren();
    const 滚动记录 = new Map(每日[选中书名] ?? []);
    const 前台记录 = new Map(每日前台[选中书名] ?? []);
    const 记录 = [...new Set([...滚动记录.keys(), ...前台记录.keys()])]
      .sort((左, 右) => 右.localeCompare(左));
    if (!记录.length) {
      const 行 = 创建节点('tr');
      const 提示 = 创建节点('td', '还没有按日记录', '统计空状态');
      提示.colSpan = 3;
      行.append(提示);
      每日表体.append(行);
      return;
    }
    for (const 日期 of 记录) {
      const 行 = 创建节点('tr');
      const 日期列 = 创建节点('td', 格式化统计日期(日期, 今天));
      日期列.title = 日期;
      行.append(
        日期列,
        创建节点('td', 格式化统计时长(滚动记录.get(日期))),
        创建节点('td', 格式化统计时长(前台记录.get(日期))),
      );
      每日表体.append(行);
    }
  }

  function 创建节点(标签, 文字 = '', 类名 = '') {
    const 节点 = document.createElement(标签);
    节点.textContent = 文字;
    if (类名) 节点.className = 类名;
    return 节点;
  }
}
