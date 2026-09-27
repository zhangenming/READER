import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// 滚动时间段浏览器回归：真实自动滚动 → 时间段记账 → 落盘 → 重载读回 → 统计弹窗渲染，
// 外加页面激活时段（前台停留会话 → 浅色底带，与滚动共用一条轴）。
// 与 statistics-browser.mjs 同约定：复用已打开的阅读器标签，不启动/关闭浏览器。
const 持久化键名 = '原文阅读器:阅读状态:v2';
const port = process.env.CDP_PORT;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(
  (t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:15921/'),
);
assert.ok(target, 'reader tab');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(code) {
  const result = await send('Runtime.evaluate', {
    expression: `(async () => { ${code} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description);
  return result.result.value;
}
const 等待 = (毫秒) => new Promise((resolve) => setTimeout(resolve, 毫秒));
async function 等待正文载入() {
  for (let n = 0; n < 300; n += 1) {
    await 等待(100);
    if (await evaluate('return document.querySelector("#载入状态")?.hidden === true')) return;
    if (n === 299) throw new Error('reader loaded 超时');
  }
}

const 历史 = {
  '2026-09-17': [[39_804, 39_904], [50_400, 51_000]],
  '2026-09-18': [[3_600, 4_200]],
  // 旧版格式：每段多一位「种类」（1 = 按键滚动），读取后应只剩起止两列
  '2026-09-16': [[7_200, 7_300, 1]],
};

// 页面激活时段：09-16 那条从 00:30 开始，比任何滚动都早，用来验证共用轴被它撑开；
// 09-18 那条 00:50–01:23 把 1:00–1:10 的滚动整个包住，用来验证深色块压在浅色带里面。
const 激活历史 = {
  '2026-09-18': [[3_000, 5_000]],
  '2026-09-16': [[1_800, 43_200]],
};

function 格式化时刻(当日秒) {
  const 补零 = (值) => String(值).padStart(2, '0');
  return `${补零(Math.floor(当日秒 / 3600))}:${补零(Math.floor(当日秒 / 60) % 60)}:${补零(当日秒 % 60)}`;
}

// 色块悬停提示是「HH:MM:SS → HH:MM:SS · 时长」，取回当日秒用来核对进行中段的段尾
function 解析轴时刻(文本) {
  const [时, 分, 秒] = String(文本).split(':').map(Number);
  return 时 * 3600 + 分 * 60 + 秒;
}

let 备份 = null;
try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.reload', { ignoreCache: true });
  await 等待正文载入();
  // 0) 开机即有的激活会话：页面可见 + 有书 → 前台停留计时应当已经开了一段
  assert.equal(
    await evaluate(`
      const m = await import('./js/激活时段.js');
      return m.获取进行中激活时段() !== null;
    `),
    true,
    '启动即由 更新前台停留计时 开了进行中激活段',
  );
  // 整体备份，结尾原样还原：中途会往真实账本里写注入数据与几分钟的前台停留时长
  备份 = await evaluate(`return localStorage.getItem(${JSON.stringify(持久化键名)});`);
  // 从空表开始，保证「一次滚动只记一段」的断言可重复执行。
  // 清空会把开机那次进行中激活段一起抹掉，所以立刻用真实入口重新开一段。
  await evaluate(`
    const m = await import('./js/滚动时段.js');
    const a = await import('./js/激活时段.js');
    const p = await import('./js/前台停留.js');
    const { 状态 } = await import('./js/状态.js');
    const { 保存持久化状态 } = await import('./js/持久化.js');
    m.载入滚动时段统计({});
    a.载入激活时段统计({});
    p.更新前台停留计时(状态.文件名, true);
    保存持久化状态();
    return m.每日滚动时段.size + a.每日激活时段.size;
  `);

  // 1) 滚一段真实时间：起止时刻精确到秒，落盘后可读
  const 起始 = await evaluate(`
    const 滚 = await import('./js/自动滚动.js');
    滚.开始自动滚动();
    const 刻 = new Date();
    return {
      进行中: 滚.自动滚动进行中(),
      当日秒: 刻.getHours() * 3600 + 刻.getMinutes() * 60 + 刻.getSeconds(),
    };
  `);
  assert.ok(起始.进行中, '自动滚动已启动');
  await 等待(6000);
  // 把开机到现在这段真实可见时间收口：前台停留会话 → 页面激活时段 → 落盘
  const 记录 = await evaluate(`
    const 滚 = await import('./js/自动滚动.js');
    const m = await import('./js/滚动时段.js');
    const a = await import('./js/激活时段.js');
    const p = await import('./js/前台停留.js');
    const { 状态 } = await import('./js/状态.js');
    const { 保存持久化状态, } = await import('./js/持久化.js');
    滚.停止自动滚动('回归测试');
    p.更新前台停留计时(状态.文件名, false);
    p.更新前台停留计时(状态.文件名, true);
    保存持久化状态();
    const 今天 = new Date().toLocaleDateString('sv');
    const 落盘 = JSON.parse(localStorage.getItem(${JSON.stringify(持久化键名)}));
    return {
      今日: m.获取当日时段(今天),
      落盘: 落盘.自动滚动统计.每日时段?.[今天],
      今日激活: a.获取当日激活时段(今天),
      落盘激活: 落盘.前台停留统计.每日激活时段?.[今天],
    };
  `);
  assert.equal(记录.今日.length, 1, '一次滚动只记一段');
  const [起, 止] = 记录.今日[0];
  assert.equal(记录.今日[0].length, 2, '一段只有起止两列，不记触发方式');
  assert.ok(止 - 起 >= 5 && 止 - 起 <= 12, `段长应约 6 秒，实际 ${止 - 起} 秒`);
  assert.ok(Math.abs(起 - 起始.当日秒) <= 2, `起点即按下滚动的时刻（${起} / ${起始.当日秒}）`);
  assert.deepEqual(记录.落盘, 记录.今日.map((段) => [...段]), '时间段已随持久化落盘');
  assert.equal(记录.今日激活.length, 1, '开机到现在的可见时间记成一段激活');
  assert.ok(
    记录.今日激活[0][1] - 记录.今日激活[0][0] >= 5,
    `激活段应覆盖整次滚动，实际 ${记录.今日激活[0][1] - 记录.今日激活[0][0]} 秒`,
  );
  assert.deepEqual(记录.落盘激活, 记录.今日激活.map((段) => [...段]), '激活时段落在前台停留统计下');

  // 2) 注入两天历史数据，走「内存 → 落盘 → 重载读回」验证读取路径与共用轴外扩
  await evaluate(`
    const m = await import('./js/滚动时段.js');
    const a = await import('./js/激活时段.js');
    const { 保存持久化状态 } = await import('./js/持久化.js');
    const 现存滚动 = Object.fromEntries(m.每日滚动时段);
    const 现存激活 = Object.fromEntries(a.每日激活时段);
    m.载入滚动时段统计({ 自动滚动统计: { 每日时段: Object.assign(现存滚动, ${JSON.stringify(历史)}) } });
    a.载入激活时段统计({ 前台停留统计: { 每日激活时段: Object.assign(现存激活, ${JSON.stringify(激活历史)}) } });
    保存持久化状态();
    return true;
  `);
  await send('Page.reload', { ignoreCache: true });
  await 等待正文载入();
  const 读回 = await evaluate(`
    const m = await import('./js/滚动时段.js');
    const a = await import('./js/激活时段.js');
    const 今天 = new Date().toLocaleDateString('sv');
    return {
      日期: [...new Set([...m.每日滚动时段.keys(), ...a.每日激活时段.keys()])].sort(),
      今日: m.获取当日时段(今天),
      今日激活: a.获取当日激活时段(今天),
      旧格式: m.获取当日时段('2026-09-16'),
    };
  `);
  for (const 日期 of [...Object.keys(历史), ...Object.keys(激活历史)]) {
    assert.ok(读回.日期.includes(日期), `重载后读回 ${日期}`);
  }
  assert.ok(读回.今日.length >= 1, '今天的真实记录也在');
  assert.ok(读回.今日激活.length >= 1, '重载后今天的激活时段读回来了');
  assert.deepEqual(读回.旧格式, [[7_200, 7_300]], '旧版带「种类」的段照常读回，多余一位丢掉');

  // 3) 统计弹窗：一天一行、两类时段共用一条轴、浅色激活带垫底、深色滚动块压上
  //    打开前先空转 12 秒：这段时间只存在于「进行中」的激活段里，还没封口。
  //    轴若只画已封口的段，段尾就会停在这 12 秒之前，下面的段尾断言当场失败；
  //    画得出来，段尾即打开弹窗的此刻，与上表「前台停留」同一时刻（2026-09-26 的 33 分 vs 17 分）。
  await 等待(12_000);
  const 点击前 = await evaluate(`
    const 刻 = new Date();
    return 刻.getHours() * 3600 + 刻.getMinutes() * 60 + 刻.getSeconds();
  `);
  await evaluate(`document.querySelector('#阅读统计按钮').click()`);
  assert.ok(await evaluate('return document.querySelector("#阅读统计弹窗").open'));
  const 渲染 = await evaluate(`
    const { 计算时段窗口 } = await import('./js/阅读统计.js');
    const m = await import('./js/滚动时段.js');
    const a = await import('./js/激活时段.js');
    const 今天 = new Date().toLocaleDateString('sv');
    const 刻 = new Date();
    const 表 = document.querySelector('.统计时段表');
    const 全部 = new Map();
    const 并入 = (映射) => {
      for (const [日期, 段们] of 映射) 全部.set(日期, [...(全部.get(日期) ?? []), ...段们]);
    };
    并入(m.每日滚动时段);
    并入(a.每日激活时段);
    const 窗口 = 计算时段窗口(全部);
    const 行们 = [...表.querySelectorAll('tbody tr')];
    const 取块 = (标题) => {
      const 轨道 = 行们
        .find((行) => 行.querySelector('.统计时段日期')?.title === 标题)
        ?.querySelector('.统计时段轨道');
      if (!轨道) return [];
      const 轨 = 轨道.getBoundingClientRect();
      return [...轨道.querySelectorAll('.统计时段块')].map((节点) => {
        const 段 = 节点.getBoundingClientRect();
        return {
          激活: 节点.classList.contains('统计时段块-激活'),
          左: +(((段.left - 轨.left) / 轨.width) * 100).toFixed(1),
          右: +(((段.right - 轨.left) / 轨.width) * 100).toFixed(1),
          标题: 节点.title,
        };
      });
    };
    const 内容右缘 = (节点) => {
      const 框 = 节点.getBoundingClientRect();
      const 样式 = getComputedStyle(节点);
      return Math.round(
        框.right - parseFloat(样式.paddingRight) - parseFloat(样式.borderRightWidth),
      );
    };
    // 文字基线：Chrome 给文本 Range 的矩形＝[基线-升部, 基线+降部]，反推回基线
    const 画布 = document.createElement('canvas').getContext('2d');
    const 基线 = (节点) => {
      const 样式 = getComputedStyle(节点);
      画布.font = \`\${样式.fontStyle} \${样式.fontWeight} \${样式.fontSize} \${样式.fontFamily}\`;
      const 量 = 画布.measureText(节点.textContent.trim());
      const 区 = document.createRange();
      区.selectNodeContents(节点);
      return +(区.getBoundingClientRect().top + 量.fontBoundingBoxAscent).toFixed(2);
    };
    return {
      窗口,
      现在: 刻.getHours() * 3600 + 刻.getMinutes() * 60 + 刻.getSeconds(),
      行数: 表.querySelectorAll('.统计时段轨道').length,
      日期列: [...表.querySelectorAll('.统计时段日期')].map((节点) => 节点.textContent),
      日期标题: [...表.querySelectorAll('.统计时段日期')].map((节点) => 节点.title),
      色块类名: [...new Set([...表.querySelectorAll('.统计时段块')].map((块) => 块.className))],
      刻度标签: [...表.querySelectorAll('.统计时段刻度标签')].map((节点) => 节点.textContent),
      首尾: [...表.querySelectorAll('.统计时段端点')].map((节点) => 节点.textContent),
      汇总: 行们.map((行) => [
        行.querySelector('.统计时段日期')?.title ?? '',
        [...(行.querySelector('.统计时段滚动格')?.children ?? [])].map((项) => 项.textContent),
        行.querySelector('.统计时段激活格')?.textContent ?? '',
      ]),
      表头: [...表.querySelectorAll('thead th')].map(
        (节点) => 节点.querySelector('.统计时段表头名')?.textContent.trim() ?? '',
      ),
      // 合计不占表头一行，只留在列名的悬停提示里
      表头合计节点: 表.querySelectorAll('thead .统计时段合计').length,
      表头提示: Object.fromEntries(
        [...表.querySelectorAll('thead th')]
          .map((节点) => [
            节点.querySelector('.统计时段表头名')?.textContent.trim() ?? '',
            节点.title ?? '',
          ])
          .filter(([名, 提示]) => 名 && 提示),
      ),
      // 时间刻度不许浮在表头中间：和「日期/滚动/激活」压在同一条基线上
      表头基线: {
        列名: [...表.querySelectorAll('thead th .统计时段表头名')].map(基线),
        刻度: [...表.querySelectorAll('.统计时段刻度标签, .统计时段端点')].map(基线),
      },
      // 「滚动」「激活」两枚表头要各自压在自己那列读数上（内容区右边缘同轴）
      表头右缘: [...表.querySelectorAll('thead th')].map((节点) => 内容右缘(节点)),
      读数右缘: 行们.map((行) => [
        内容右缘(行.querySelector('.统计时段读数主')),
        内容右缘(行.querySelector('.统计时段激活格')),
      ]),
      图例: [...document.querySelectorAll('.统计时段图例项')].map((项) => 项.textContent),
      轴标题: 表.querySelector('caption').textContent,
      轨道宽: [...new Set([...表.querySelectorAll('.统计时段轨道')].map((行) => Math.round(行.getBoundingClientRect().width)))],
      最早: 取块('2026-09-16'),
      注入: 取块('2026-09-18'),
      今日: 取块(今天),
    };
  `);
  assert.equal(渲染.行数, 读回.日期.length, '一天一行（两类时段按日期取并集）');
  assert.equal(渲染.日期列[0], '今天', '今天在最上');
  assert.deepEqual(渲染.日期标题, [...读回.日期].sort().reverse(), '按日期倒序，标题为完整日期');
  assert.equal(渲染.轨道宽.length, 1, '所有行共用同一条轴（轨道等宽）');
  assert.deepEqual(渲染.色块类名, ['统计时段块 统计时段块-激活', '统计时段块'], '激活带在滚动块之前绘制');
  assert.deepEqual(渲染.图例, ['页面激活', '持续滚动'], '图例两项');
  // 共用轴窗口把两类时段一起算进来：最早由注入的 00:30 激活段决定；
  // 最晚则是「已封口段的最晚止」与「打开弹窗的此刻」中较大的那个（进行中那段也上了轴）。
  const 已封口止秒 = Math.max(
    51_000,
    ...读回.今日.map((段) => 段[1]),
    ...读回.今日激活.map((段) => 段[1]),
  );
  assert.equal(
    渲染.窗口.起秒,
    Math.min(
      1_800,
      ...读回.今日.map((段) => 段[0]),
      ...读回.今日激活.map((段) => 段[0]),
    ),
    `轴起点仍由注入的 00:30 激活段决定：${渲染.轴标题}`,
  );
  assert.ok(
    渲染.窗口.止秒 === 已封口止秒 ||
      (渲染.窗口.止秒 >= 点击前 && 渲染.窗口.止秒 <= 渲染.现在 + 1),
    `轴尾应为已封口最晚止(${已封口止秒})或此刻(${点击前}–${渲染.现在})：${渲染.窗口.止秒}`,
  );
  assert.ok(渲染.窗口.起秒 <= 1_800, '00:30 的激活段把轴往左撑开');
  assert.ok(渲染.刻度标签.length >= 1 && 渲染.刻度标签.length <= 6, `整点刻度 ${渲染.刻度标签}`);
  assert.deepEqual(渲染.首尾, [
    格式化时刻(渲染.窗口.起秒).slice(0, 5),
    格式化时刻(渲染.窗口.止秒).slice(0, 5),
  ], '轴首尾标到分');
  // 09-16：注入的激活带从轴起点（00:30）铺到 12:00，02:00 出发的滚动块落在带内
  assert.deepEqual(渲染.最早.map((块) => 块.激活), [true, false], '先带后块');
  assert.equal(渲染.最早[0].左, 0, '激活带即轴起点');
  assert.ok(渲染.最早[1].左 > 渲染.最早[0].左 && 渲染.最早[1].右 <= 渲染.最早[0].右, '滚动块在激活带内');
  assert.match(渲染.最早[1].标题, /^\d\d:\d\d:\d\d → \d\d:\d\d:\d\d · \d+ 分 \d+ 秒$/);
  // 09-18：注入的 00:50–01:23 激活带整个包住 01:00–01:10 的滚动段
  assert.deepEqual(渲染.注入.map((块) => 块.激活), [true, false]);
  assert.ok(
    渲染.注入[0].左 < 渲染.注入[1].左 && 渲染.注入[0].右 > 渲染.注入[1].右,
    `滚动段应被激活带覆盖：${JSON.stringify(渲染.注入)}`,
  );
  const 今日行 = 渲染.汇总.find(([日期]) => 日期 === '2026-09-18');
  assert.deepEqual(
    今日行,
    ['2026-09-18', ['1 段·10 分'], '33 分'],
    `两列读数到分为止（秒只在色块悬停里给）：${JSON.stringify(今日行)}`,
  );
  assert.ok(渲染.今日.some((块) => 块.激活), '今天的真实激活段也画出来了');
  assert.ok(渲染.今日.some((块) => !块.激活), '今天的真实滚动段也画出来了');
  // 进行中（还没封口）的那段激活必须上轴：它的段尾就是打开弹窗的此刻，与上表「前台停留」同时刻
  const 最后激活带 = 渲染.今日.filter((块) => 块.激活).at(-1);
  const 带尾 = 解析轴时刻(最后激活带.标题.split(' → ')[1].split(' · ')[0]);
  assert.ok(
    带尾 >= 点击前 - 1 && 带尾 <= 渲染.现在 + 1,
    `进行中的激活段画到此刻：${最后激活带.标题}，打开弹窗于 ${格式化时刻(点击前)}–${格式化时刻(渲染.现在)}`,
  );
  assert.match(
    渲染.汇总.find(([日期]) => 日期 === '2026-09-17')?.[1][0] ?? '',
    /^2 段·\d+ 分$/,
  );
  assert.match(渲染.今日[0].标题, /\d{2}:\d{2}:\d{2} → \d{2}:\d{2}:\d{2} · /, '悬停提示仍给到秒');
  // 表头两列各自对齐自家读数的右边缘，且每一行都对齐
  assert.deepEqual(
    渲染.表头.slice(-2),
    ['滚动', '激活'],
    `滚动/激活各占一列表头：${JSON.stringify(渲染.表头)}`,
  );
  const [滚动表头右缘, 激活表头右缘] = 渲染.表头右缘.slice(-2);
  for (const [滚动右缘, 激活右缘] of 渲染.读数右缘) {
    assert.ok(
      Math.abs(滚动右缘 - 滚动表头右缘) <= 1 && Math.abs(激活右缘 - 激活表头右缘) <= 1,
      `表头与读数同轴：滚动 ${滚动表头右缘}/${滚动右缘}，激活 ${激活表头右缘}/${激活右缘}`,
    );
  }

  // 表头只留列名：合计那行撤掉了，数字进悬停提示。
  // 提示里的合计仍要拿计算器把这一列竖着加得出同一个数
  // （每行只到分、秒舍掉，所以合计按「各行显示值」相加，不是先加秒再取整）
  const 到分钟 = (文本) => {
    if (!文本 || 文本.includes('不足')) return 0; // 不足 1 分钟显示出来是字，账上是 0
    const 时 = /(\d+) 小时/.exec(文本);
    const 分 = /(\d+) 分/.exec(文本);
    return (时 ? +时[1] * 60 : 0) + (分 ? +分[1] : 0);
  };
  assert.equal(渲染.表头合计节点, 0, '表头不再有合计那一行');
  const 表头合计 = {};
  for (const [名, 提示] of Object.entries(渲染.表头提示)) {
    const 合计 = /合计 [^；]+/.exec(提示);
    if (合计) 表头合计[名] = 合计[0];
  }
  assert.ok(表头合计.滚动 && 表头合计.激活, `两列提示都要有合计：${JSON.stringify(渲染.表头提示)}`);
  assert.match(表头合计.滚动, /^合计 \d+ 段 · /, `滚动合计要走「N 段 · 时长」：${表头合计.滚动}`);
  // 滚动格只有一枚 div，文本形如「3 段·10 分」，到分钟 从里面挑「X 分」
  const 滚动列 = 渲染.汇总.map(([, 滚动格]) => 滚动格.join(''));
  const 滚动列分 = 滚动列.reduce((总, 文本) => 总 + 到分钟(文本), 0);
  const 激活列分 = 渲染.汇总.reduce((总, [, , 激活格]) => 总 + 到分钟(激活格), 0);
  assert.equal(
    到分钟(表头合计.滚动),
    滚动列分,
    `滚动合计与各行相加对不上：${表头合计.滚动} vs ${滚动列分} 分`,
  );
  assert.equal(
    到分钟(表头合计.激活),
    激活列分,
    `激活合计与各行相加对不上：${表头合计.激活} vs ${激活列分} 分`,
  );
  const 段数列 = 滚动列.reduce((总, 文本) => 总 + Number(/^(\d+) 段/.exec(文本)[1]), 0);
  assert.equal(
    Number(/^合计 (\d+) 段/.exec(表头合计.滚动)[1]),
    段数列,
    `段数合计与各行相加对不上：${表头合计.滚动} vs ${段数列} 段`,
  );

  // 时间刻度与列名同一条基线（贴底，不许浮在表头中间）
  const 列名基线 = Math.max(...渲染.表头基线.列名);
  const 基线差 = 渲染.表头基线.刻度.map((值) => +(值 - 列名基线).toFixed(2));
  assert.ok(
    渲染.表头基线.刻度.length > 0 &&
      Math.max(...基线差.map(Math.abs)) <= 1,
    `刻度没和列名压在同一基线上：列名 ${列名基线}，刻度 ${渲染.表头基线.刻度}`,
  );

  // 每日数据条压矮：行高＝20px 轨道＋上下留白，不许退回 44px 那种散排
  const 行距 = await evaluate(`
    const 行 = [...document.querySelectorAll('.统计时段表 tbody tr')];
    const 轨 = (节点) => 节点.querySelector('.统计时段轨道').getBoundingClientRect();
    return {
      行高: 行.map((r) => Math.round(r.getBoundingClientRect().height)),
      间距: 行.length > 1 ? Math.round(轨(行[1]).top - 轨(行[0]).bottom) : -1,
    };
  `);
  assert.ok(Math.max(...行距.行高) <= 34, `每日数据条还是太高：${JSON.stringify(行距)}`);
  assert.ok(行距.间距 >= 0, `两行轨道叠在一起了：${JSON.stringify(行距)}`);
  console.log('表头合计与各行相加对账通过；行高', 行距.行高);

  // 4) 窄屏不横向溢出
  for (const 宽度 of [885, 375]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 宽度,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.equal(
      await evaluate(`
        const d = document.querySelector('#阅读统计弹窗');
        const r = d.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && d.scrollWidth <= d.clientWidth;
      `),
      true,
      `${宽度}px 无横向溢出`,
    );
    assert.equal(
      await evaluate(`
        const 标签们 = [...document.querySelectorAll('.统计时段刻度标签')];
        return 标签们.filter((节点) => getComputedStyle(节点).display !== 'none').length;
      `),
      宽度 === 375 ? 0 : 渲染.刻度标签.length,
      `${宽度}px 刻度标签密度`,
    );
    if (process.env.SCREENSHOT_DIR) {
      await evaluate(
        'document.querySelector(".统计时段").scrollIntoView({ block: "end" }); return true;',
      );
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(
        `${process.env.SCREENSHOT_DIR}/reader-scroll-segments-${宽度}.png`,
        Buffer.from(data, 'base64'),
      );
    }
  }
  console.log(
    'PASS scroll segments: second-precision recording, persistence round-trip, activation band + scroll block on one shared axis',
  );
} finally {
  // 整体还原：注入的历史时段与测试期间攒下的前台停留时长一并抹掉。
  // 内存里的三本账也要一起回读，否则 reload 触发的 pagehide 会把脏数据再存一遍。
  await evaluate(`
    const 原 = ${JSON.stringify(备份)};
    if (原 === null) localStorage.removeItem(${JSON.stringify(持久化键名)});
    else localStorage.setItem(${JSON.stringify(持久化键名)}, 原);
    const 数据 = 原 ? JSON.parse(原) : {};
    const m = await import('./js/滚动时段.js');
    const a = await import('./js/激活时段.js');
    const p = await import('./js/前台停留.js');
    m.载入滚动时段统计(数据);
    a.载入激活时段统计(数据);
    p.载入前台停留统计(数据);
    return true;
  `);
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Page.reload', { ignoreCache: true });
  ws.close();
}
