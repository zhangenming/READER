// 统计弹窗只负责展示快照，不参与滚动计时或持久化。
export function 格式化统计时长(毫秒) {
  const 有效毫秒 = Number.isFinite(毫秒) ? Math.max(0, 毫秒) : 0;
  if (有效毫秒 > 0 && 有效毫秒 < 60_000) return '不足 1 分钟';
  const 分钟 = Math.floor(有效毫秒 / 60_000);
  return 分钟 < 60
    ? `${分钟} 分钟`
    : `${Math.floor(分钟 / 60)} 小时 ${分钟 % 60} 分钟`;
}

export function 创建阅读统计内容({ 今日, 书籍, 文件名, 进度 }) {
  const 片段 = document.createDocumentFragment();
  const 说明 = 创建节点('p', '时长仅统计自动滚动，手动阅读不计时；今日按本地日期计算。', '统计说明');
  const 摘要 = 创建节点('dl', '', '统计摘要');
  const 总时长 = 书籍.reduce((总数, [, 项]) => 总数 + 项.总滚动毫秒, 0);
  for (const [标签, 值] of [
    ['今日阅读', 格式化统计时长(今日)],
    ['累计阅读', 格式化统计时长(总时长)],
    ['本书进度', 文件名 ? `${进度.toFixed(1)}%` : '—'],
  ]) {
    const 卡片 = 创建节点('div', '', '统计卡片');
    卡片.append(创建节点('dt', 标签), 创建节点('dd', 值));
    摘要.append(卡片);
  }
  const 表格 = 创建节点('table');
  表格.append(创建节点('caption', `书籍明细 · ${书籍.length} 本`));
  const 表头 = 创建节点('thead');
  const 标题行 = 创建节点('tr');
  for (const 标题 of ['书籍', '阅读时长', '进度']) {
    const 列 = 创建节点('th', 标题);
    列.scope = 'col';
    标题行.append(列);
  }
  表头.append(标题行);
  const 表体 = 创建节点('tbody');
  for (const [名, 项] of [...书籍].sort(([, a], [, b]) => b.总滚动毫秒 - a.总滚动毫秒)) {
    const 当前 = 名 === 文件名;
    const 行 = 创建节点('tr', '', 当前 ? '统计当前书' : '');
    const 书名 = 创建节点('td');
    if (当前) 书名.append(创建节点('span', '当前', '统计当前标记'));
    书名.append(创建节点('span', 名));
    const 已存进度 = Number.isFinite(项.阅读偏移) && Number.isFinite(项.文本长度) && 项.文本长度 > 0
      ? Math.min(100, Math.max(0, 项.阅读偏移 / 项.文本长度 * 100))
      : null;
    const 进度列 = 创建节点('td', 当前 ? `${进度.toFixed(1)}%` : 已存进度 === null ? '—' : `约 ${已存进度.toFixed(1)}%`);
    进度列.title = 当前 ? '当前滚动位置进度' : '按上次保存的文本位置估算';
    行.append(书名, 创建节点('td', 格式化统计时长(项.总滚动毫秒)), 进度列);
    表体.append(行);
  }
  if (!书籍.length) {
    const 行 = 创建节点('tr');
    const 提示 = 创建节点('td', '还没有阅读记录', '统计空状态');
    提示.colSpan = 3;
    行.append(提示);
    表体.append(行);
  }
  表格.append(表头, 表体);
  片段.append(说明, 摘要, 表格);
  return 片段;
}

function 创建节点(标签, 文字 = '', 类名 = '') {
  const 节点 = document.createElement(标签);
  节点.textContent = 文字;
  if (类名) 节点.className = 类名;
  return 节点;
}
