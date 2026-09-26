// 统计弹窗只负责展示快照，不参与滚动计时或持久化。
// 时间段（几点滚到几点、页面几点开着）的记账在 js/滚动时段.js 与 js/激活时段.js，
// 本模块只做几何换算与渲染：一天一行、所有行共用一条「当日秒」时间轴，
// 页面激活画成浅色底带、持续滚动画成深色块压在带上，轴窗口只覆盖两类数据合起来的范围。

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

// —— 滚动时间段：轴窗口 / 刻度 / 色块几何 / 时刻与时长格式化（纯函数）——

const 每日秒数 = 86_400;

// 把 { 日期 -> 段列表 } 或 [[日期, 段列表], ...] 归一成 [[日期, 段列表], ...]
function 归一时段条目(每日时段) {
  if (每日时段 instanceof Map) return [...每日时段];
  if (Array.isArray(每日时段)) {
    return 每日时段.filter((项) => Array.isArray(项) && typeof 项[0] === 'string');
  }
  return Object.entries(每日时段 ?? {});
}

// 只留有段的日期；两类时段（滚动 / 页面激活）按日期取并集渲染成一行
function 取有时段的条目(每日时段) {
  return 归一时段条目(每日时段).filter(([, 段列表]) => 段列表 && 段列表.length);
}

// 所有行共用一条时间轴：窗口 = 全部日期全部段的最早起点 ~ 最晚终点（当日秒）。
// 新一天出现更早/更晚的数据时窗口自动外扩；空隙不画进轴里。无数据返回 null。
export function 计算时段窗口(每日时段) {
  let 起秒 = Infinity;
  let 止秒 = -Infinity;
  for (const [, 段列表] of 归一时段条目(每日时段)) {
    for (const 段 of 段列表 ?? []) {
      if (!Array.isArray(段) || 段.length < 2) continue;
      const [起, 止] = 段;
      if (Number.isFinite(起) && Number.isFinite(止) && 止 > 起) {
        起秒 = Math.min(起秒, 起);
        止秒 = Math.max(止秒, 止);
      }
    }
  }
  return 起秒 < 止秒 ? { 起秒, 止秒: Math.min(止秒, 每日秒数) } : null;
}

// 共用轴可能横跨十几个小时，刻度步长随窗口跨度自适应，保证标签不挤在一起。
export function 计算刻度步长(窗口) {
  const 跨度 = 窗口 ? 窗口.止秒 - 窗口.起秒 : 0;
  for (const 步长 of [3600, 7200, 10800, 21600, 43200]) {
    if (跨度 / 步长 <= 6) return 步长;
  }
  return 43200;
}

// 轴内的整点（步长）刻度，不含与窗口起点重合者；窗口跨不过一个步长时为空，只显首尾时刻。
export function 计算整点刻度(窗口, 步长秒 = 计算刻度步长(窗口)) {
  if (!窗口 || !(窗口.止秒 > 窗口.起秒) || !(步长秒 > 0)) return [];
  const 刻度 = [];
  for (let 秒 = Math.ceil(窗口.起秒 / 步长秒) * 步长秒; 秒 < 窗口.止秒; 秒 += 步长秒) {
    if (秒 === 窗口.起秒) continue;
    刻度.push({ 秒, 标签: `${Math.floor(秒 / 3600)}:00` });
  }
  return 刻度;
}

// 段 → 轴上的百分比几何（超出窗口的部分裁掉；宽度可为 0，由 CSS min-width 兜底可见）。
export function 时段百分比(当日秒, 窗口) {
  if (!窗口 || !(窗口.止秒 > 窗口.起秒)) return 0;
  return ((当日秒 - 窗口.起秒) / (窗口.止秒 - 窗口.起秒)) * 100;
}

export function 计算时段布局(段列表, 窗口) {
  if (!窗口 || !(窗口.止秒 > 窗口.起秒)) return [];
  return (段列表 ?? [])
    .filter((段) => Array.isArray(段) && 段.length >= 2)
    .map(([起, 止]) => {
      const 起秒 = Math.min(Math.max(起, 窗口.起秒), 窗口.止秒);
      const 止秒 = Math.min(Math.max(止, 窗口.起秒), 窗口.止秒);
      return {
        起,
        止,
        左: 时段百分比(起秒, 窗口),
        宽: 时段百分比(止秒, 窗口) - 时段百分比(起秒, 窗口),
      };
    });
}

export function 格式化时段时刻(当日秒) {
  const 总 = Math.max(0, Math.min(每日秒数 - 1, Math.floor(当日秒) || 0));
  const 补零 = (值) => String(值).padStart(2, '0');
  return `${补零(Math.floor(总 / 3600))}:${补零(Math.floor(总 / 60) % 60)}:${补零(总 % 60)}`;
}

// 轴首尾只标到分（秒在色块悬停提示里给），窄屏上标签才不会互相压字。
export function 格式化轴时刻(当日秒) {
  return 格式化时段时刻(当日秒).slice(0, 5);
}

export function 格式化时段时长(秒数) {
  const 总 = Math.max(0, Math.floor(Number.isFinite(秒数) ? 秒数 : 0));
  const 小时 = Math.floor(总 / 3600);
  const 分 = Math.floor(总 / 60) % 60;
  const 秒 = 总 % 60;
  if (小时) return `${小时} 小时 ${分} 分`;
  if (分) return `${分} 分 ${秒} 秒`;
  return `${秒} 秒`;
}

// 弹窗右侧那两列读数只到分：秒留给色块悬停提示与无障碍标签。
// 不足 1 分钟不写成「0 分」，与 格式化统计时长 同一口径。
export function 格式化时长到分(秒数) {
  const 总 = Math.max(0, Math.floor(Number.isFinite(秒数) ? 秒数 : 0));
  if (总 > 0 && 总 < 60) return '不足 1 分钟';
  const 分钟 = Math.floor(总 / 60);
  return 分钟 < 60 ? `${分钟} 分` : `${Math.floor(分钟 / 60)} 小时 ${分钟 % 60} 分`;
}

export function 创建阅读统计内容({
  书籍,
  文件名,
  进度,
  每日时段 = {},
  每日激活时段 = {},
  今天 = '',
}) {
  const 片段 = document.createDocumentFragment();

  const 表格 = 创建节点('table');
  表格.append(创建节点('caption', `书籍明细 · ${书籍.length} 本`));
  const 表头 = 创建节点('thead');
  const 标题行 = 创建节点('tr');
  for (const [标题, 口径] of [
    ['书籍', ''],
    ['滚动', '自动滚动与按住方向键的起止时长之和，按书累计'],
    ['前台停留', '页面可见且载入书即计时，按书累计'],
    ['进度', ''],
  ]) {
    const 列 = 创建节点('th', 标题);
    列.scope = 'col';
    if (口径) 列.title = 口径;
    标题行.append(列);
  }
  表头.append(标题行);
  const 表体 = 创建节点('tbody');
  for (const [名, 项] of [...书籍].sort(
    ([, a], [, b]) => b.总滚动毫秒 - a.总滚动毫秒,
  )) {
    const 当前 = 名 === 文件名;
    const 行 = 创建节点('tr');
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
  片段.append(表格, 创建时段模块());
  return 片段;

  function 创建时段模块() {
    const 滚动条目 = new Map(取有时段的条目(每日时段));
    const 激活条目 = new Map(取有时段的条目(每日激活时段));
    const 日期列表 = [
      ...new Set([...滚动条目.keys(), ...激活条目.keys()]),
    ].sort((左, 右) => String(右).localeCompare(String(左)));
    // 共用轴要把两类时段一起算进窗口：只滚了 1 分钟但页面开了一整天时，轴得盖住一整天。
    const 窗口 = 计算时段窗口(
      日期列表.map((日期) => [
        日期,
        [...(滚动条目.get(日期) ?? []), ...(激活条目.get(日期) ?? [])],
      ]),
    );
    const 区块 = 创建节点('section', '', '统计时段');
    const 表 = 创建节点('table', '', '统计时段表');
    const 标题 = 创建节点(
      'caption',
      窗口
        ? `页面激活与滚动 · 全部书籍 · 轴 ${格式化轴时刻(窗口.起秒)}–${格式化轴时刻(窗口.止秒)}`
        : '页面激活与滚动 · 全部书籍',
    );
    标题.title =
      '一天一行，所有行共用同一条时间轴：浅色带是页面激活（几点到几点开着页面），深色块是持续滚动';
    const 表头 = 创建节点('thead');
    const 标题行 = 创建节点('tr');
    const 日期列头 = 创建节点('th', '日期');
    const 轴列头 = 创建节点('th', '', '统计时段轴头');
    const 滚动列头 = 创建节点('th', '滚动');
    滚动列头.title =
      '全部书籍合并；间隔不超过 60 秒的两段并成一段，中间的空闲也算进来；正在进行的一段算到打开本弹窗为止';
    const 激活列头 = 创建节点('th', '激活');
    激活列头.title =
      '全部书籍合并；换书不算离开，10 秒内的抖动并成一段；正在进行的一段算到打开本弹窗为止，与上表「前台停留」同时刻';
    for (const 列 of [日期列头, 轴列头, 滚动列头, 激活列头]) 列.scope = 'col';
    if (窗口) 轴列头.append(创建时段标尺(窗口));
    标题行.append(日期列头, 轴列头, 滚动列头, 激活列头);
    表头.append(标题行);
    const 表体 = 创建节点('tbody');
    for (const 日期 of 日期列表) {
      表体.append(
        创建时段行(
          日期,
          滚动条目.get(日期) ?? [],
          激活条目.get(日期) ?? [],
          窗口,
        ),
      );
    }
    if (!日期列表.length) {
      const 行 = 创建节点('tr');
      const 提示 = 创建节点(
        'td',
        '还没有时间段记录（本版本起才记录页面激活与每次滚动的起止时刻）',
        '统计空状态',
      );
      提示.colSpan = 4;
      行.append(提示);
      表体.append(行);
    }
    表.append(标题, 表头, 表体);
    区块.append(表, 创建时段图例());
    return 区块;
  }

  function 创建时段行(日期, 滚动段, 激活段, 窗口) {
    const 行 = 创建节点('tr');
    const 日期格 = 创建节点('td', 格式化统计日期(日期, 今天), '统计时段日期');
    日期格.title = 日期;
    const 轨道格 = 创建节点('td', '', '统计时段轨道格');
    const 轨道 = 创建节点('div', '', '统计时段轨道');
    // 轨道里不再画整点竖线：竖线压在激活带上会被读成「带子断开了」，
    // 轴上的位置看表头标签，精确起止看每块的悬停提示。
    // 先画激活带再画滚动块：滚动必然发生在页面开着的时候，深色块要压在浅色带上面
    const 激活 = 追加时段块(轨道, 激活段, 窗口, '统计时段块-激活');
    const 滚动 = 追加时段块(轨道, 滚动段, 窗口, '');
    轨道.setAttribute('role', 'img');
    轨道.setAttribute(
      'aria-label',
      `${格式化统计日期(日期, 今天)}：页面激活 ${格式化时段时长(激活.总秒)} 共 ${激活.描述.length} 段` +
        `（${激活.描述.join('、') || '无'}）；滚动 ${格式化时段时长(滚动.总秒)} 共 ${滚动段.length} 段` +
        `（${滚动.描述.join('、') || '无'}）`,
    );
    轨道格.append(轨道);
    const 滚动格 = 创建节点('td', '', '统计时段滚动格');
    // 段数与滚动时长各钉一枚等宽槽：位数不同也能一行一行竖着对齐；激活时长自成一列
    const 滚动行 = 创建节点('div', '', '统计时段读数');
    滚动行.append(
      创建节点('span', `${滚动段.length} 段`, '统计时段读数段'),
      创建节点('span', '·', '统计时段读数点'),
      创建节点('span', 格式化时长到分(滚动.总秒), '统计时段读数主'),
    );
    滚动格.append(滚动行);
    const 激活格 = 创建节点('td', 格式化时长到分(激活.总秒), '统计时段激活格');
    行.append(日期格, 轨道格, 滚动格, 激活格);
    return 行;
  }

  function 追加时段块(轨道, 段列表, 窗口, 额外类名) {
    const 描述 = [];
    for (const 块 of 计算时段布局(段列表, 窗口)) {
      const 色块 = 创建节点(
        'span',
        '',
        额外类名 ? `统计时段块 ${额外类名}` : '统计时段块',
      );
      色块.style.left = `${块.左}%`;
      色块.style.width = `${块.宽}%`;
      色块.title = `${格式化时段时刻(块.起)} → ${格式化时段时刻(块.止)} · ${格式化时段时长(块.止 - 块.起)}`;
      描述.push(`${格式化时段时刻(块.起)}至${格式化时段时刻(块.止)}`);
      轨道.append(色块);
    }
    return {
      描述,
      总秒: 段列表.reduce((总数, [起, 止]) => 总数 + Math.max(0, 止 - 起), 0),
    };
  }

  function 创建时段标尺(窗口) {
    const 标尺 = 创建节点('div', '', '统计时段标尺');
    标尺.append(
      创建节点('span', 格式化轴时刻(窗口.起秒), '统计时段端点 统计时段端点首'),
      创建节点('span', 格式化轴时刻(窗口.止秒), '统计时段端点 统计时段端点尾'),
    );
    for (const 刻度 of 计算整点刻度(窗口)) {
      const 百分比 = 时段百分比(刻度.秒, 窗口);
      // 贴着首尾刻度的整点标签会和首尾时刻文字重叠，行内的竖线仍保留
      if (百分比 < 6 || 百分比 > 94) continue;
      const 标签 = 创建节点('span', 刻度.标签, '统计时段刻度标签');
      标签.style.left = `${百分比}%`;
      标尺.append(标签);
    }
    return 标尺;
  }

  function 创建时段图例() {
    const 图例 = 创建节点('div', '', '统计时段图例');
    for (const [名, 类名] of [
      ['页面激活', '统计时段图例块-激活'],
      ['持续滚动', ''],
    ]) {
      const 项 = 创建节点('span', 名, '统计时段图例项');
      项.prepend(
        创建节点('i', '', 类名 ? `统计时段图例块 ${类名}` : '统计时段图例块'),
      );
      图例.append(项);
    }
    图例.append(
      创建节点(
        'span',
        '激活＝页面可见且有书（含手动阅读与弹窗）· 轴范围随新数据外扩，空隙不画',
        '统计时段图例说明',
      ),
    );
    return 图例;
  }

  function 创建节点(标签, 文字 = '', 类名 = '') {
    const 节点 = document.createElement(标签);
    节点.textContent = 文字;
    if (类名) 节点.className = 类名;
    return 节点;
  }
}
