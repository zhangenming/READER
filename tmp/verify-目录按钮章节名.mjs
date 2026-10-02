// 一次性验证脚本：右下角「目录」按钮显示当前章节名，只留名字、剥掉章节序号。
// 覆盖：各种标题形态（第X章/裸序号/卷X/第X部分/Chapter N/中英配对/顿号冒号分隔/序跋）
// 逐章滚动后按钮上的文字、序号不许残留、旧的章节总数不再出现、长名省略号收尾且全名进 title、
// 右下三钮不越界、章节与百分比都按**视口中线**算（标题压到中线才算开这一章、章中那一档
// 顶/中/底三个口径分得开、书末 100%、不许串成全书进度、与悬停 title 那笔对账）、
// 无章节时名字和百分比两格都空掉且不占 flex 间距。
// 自启 server.mjs + headless Chrome（CDP + Fetch 拦截喂 fixture），按 AGENTS.md 清理 reader-* profile。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

function 取空闲端口() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const 端口 = s.address().port;
      s.close(() => resolve(端口));
    });
  });
}
const 清理遗留profile = () => {
  for (const 名 of readdirSync(tmpdir())) {
    if (!名.startsWith('reader-')) continue;
    const 路径 = join(tmpdir(), 名);
    try {
      execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
      continue;
    } catch {}
    rmSync(路径, { recursive: true, force: true });
    if (existsSync(路径)) {
      console.error('遗留 profile 清理失败:', 路径);
      process.exit(1);
    }
  }
};
清理遗留profile();

const 站点端口 = await 取空闲端口();
const CDP端口 = await 取空闲端口();
const 地址 = `http://127.0.0.1:${站点端口}/`;
const profile = mkdtempSync(join(tmpdir(), 'reader-toc-name-'));
console.log('地址:', 地址, 'CDP:', CDP端口);

const 服务 = spawn('node', ['server.mjs', String(站点端口)], { cwd: 项目根, stdio: 'ignore' });
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    地址,
  ],
  { stdio: 'ignore' },
);
const chrome已退出 = new Promise((r) => chrome.on('exit', r));
const 服务已退出 = new Promise((r) => 服务.on('exit', r));
async function 收尾() {
  chrome.kill();
  服务.kill();
  await Promise.race([
    Promise.all([chrome已退出, 服务已退出]),
    pause(3000).then(() => {
      chrome.kill('SIGKILL');
      服务.kill('SIGKILL');
    }),
  ]);
  rmSync(profile, { recursive: true, force: true });
  if (existsSync(profile)) {
    console.error('profile 清理失败，目录仍存在:', profile);
    process.exitCode = 1;
  } else {
    console.log('profile 已清理:', profile);
  }
}
process.on('exit', () => {
  chrome.kill();
  服务.kill();
});

// 超长那章的名字刻意超过按钮 16em 上限，用来量省略号
const 长名 = '欧洲均势体系及其终结与伊斯兰主义和中东世界乱局的全面展开';
// 每章正文约三屏：章太短的话底边一眼就压过章末，百分比处处 100%，测不出口径
const 正文 = (n) => `这是第${n}段正文句子，用来撑出若干行。`.repeat(80);
const fixture = [
  `第1章 未来的挑战\n${正文(1)}`,
  `第三章 先人后事\n${正文(3)}`,
  `第七章\n${正文(7)}`,
  `卷二 赤壁之战\n${正文(8)}`,
  `第二部分 典型债务大周期\n${正文(9)}`,
  `Chapter 7 Warring Queens\n${正文(10)}`,
  `1 The Blood Clot\n\n一块凝血\n${正文(11)}`,
  `2 Tale of Three Rivers\n\n三条河流的故事\n${正文(12)}`,
  `3 War of the Khans\n\n可汗之战\n${正文(13)}`,
  `第八章、公平的长期繁荣\n${正文(14)}`,
  `第十五章：${长名}\n${正文(15)}`,
  `楔子 测试序跋\n${正文(16)}`,
].join('\n\n');

// 与实现独立复算：期望出现在按钮上的名字（手工写死，不共用 章节名()）
const 期望 = [
  '未来的挑战',
  '先人后事',
  '第七章',
  '赤壁之战',
  '典型债务大周期',
  'Warring Queens',
  'The Blood Clot · 一块凝血',
  'Tale of Three Rivers · 三条河流的故事',
  'War of the Khans · 可汗之战',
  '公平的长期繁荣',
  长名,
  '楔子 测试序跋',
];

try {
  async function 等待目标() {
    for (let i = 0; i < 150; i++) {
      try {
        const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
        const 目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
        if (目标) return 目标;
      } catch {}
      await pause(200);
    }
    throw new Error('未找到 headless Chrome 页面');
  }
  const 目标 = await 等待目标();
  const ws = new WebSocket(目标.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let 序号 = 0;
  const 待回复 = new Map();
  const 页面日志 = [];
  ws.addEventListener('message', async (事件) => {
    const 消息 = JSON.parse(事件.data);
    if (消息.id) {
      const 请求 = 待回复.get(消息.id);
      待回复.delete(消息.id);
      if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
      else 请求.resolve(消息.result);
    } else if (消息.method === 'Runtime.consoleAPICalled') {
      页面日志.push(
        [消息.params.type, ...消息.params.args.map((a) => a.value ?? a.description ?? '')].join(' '),
      );
    } else if (消息.method === 'Runtime.exceptionThrown') {
      页面日志.push(
        'EXCEPTION: ' + (消息.params.exceptionDetails.exception?.description || 消息.params.exceptionDetails.text),
      );
    } else if (消息.method === 'Fetch.requestPaused') {
      await 发送('Fetch.fulfillRequest', {
        requestId: 消息.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/plain; charset=utf-8' }],
        body: Buffer.from(fixture).toString('base64'),
      });
    }
  });
  function 发送(方法, 参数 = {}) {
    return new Promise((resolve, reject) => {
      const 下标 = ++序号;
      const 计时器 = setTimeout(() => {
        待回复.delete(下标);
        reject(new Error(`CDP 超时: ${方法}`));
      }, 20_000);
      待回复.set(下标, {
        resolve: (v) => (clearTimeout(计时器), resolve(v)),
        reject: (e) => (clearTimeout(计时器), reject(e)),
      });
      ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
    });
  }
  async function 求值(代码) {
    const 结果 = await 发送('Runtime.evaluate', {
      expression: `(async () => { ${代码} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (结果.exceptionDetails)
      throw new Error(结果.exceptionDetails.exception?.description || JSON.stringify(结果.exceptionDetails));
    return 结果.result.value;
  }
  const 失败 = (说明) => `${说明}\n页面日志:\n${页面日志.slice(-8).join('\n')}`;
  const S = 'const { 状态, 元素 } = await import("./js/状态.js");';

  await 发送('Page.enable');
  await 发送('Runtime.enable');
  await 发送('Fetch.enable', { patterns: [{ urlPattern: '*txt/*.txt', requestStage: 'Request' }] });
  await 发送('Page.reload', { ignoreCache: true });
  for (let n = 0; n < 200; n++) {
    try {
      if (await 求值('return document.querySelector("#载入状态")?.hidden && !!(await import("./js/状态.js")).状态.文件名')) break;
    } catch {}
    await pause(100);
  }
  await pause(300);
  const 章数 = await 求值(`${S} return 状态.章节列表.length;`);
  assert.equal(章数, 期望.length, 失败(`fixture 应识别出 ${期望.length} 章，实际 ${章数}`));

  const 按钮文字 = () =>
    求值(`${S}
      const 名 = 元素.当前章节名;
      const 率 = 元素.当前章节进度;
      return { 文字: 名.textContent, 整钮: 元素.章节目录按钮.textContent, 显示: getComputedStyle(名).display,
        截断: 名.scrollWidth > 名.clientWidth + 1,
        百分比: 率.textContent, 百分比显示: getComputedStyle(率).display,
        百分比宽: Math.round(率.getBoundingClientRect().width),
        标题: 元素.章节目录按钮.title, 按钮宽: Math.round(元素.章节目录按钮.getBoundingClientRect().width) };`);

  // 中线口径：把某个文本偏移放到视口中线上，它才应该是按钮的主语。
  // 只能按整行放——可视行数若是奇数，「半屏」就是半行，而应用会把 scrollTop 对齐回
  // 整行界，半行的落点会被吸走，中线在行界上抖一行（实测 2055 被吸成 2040）。
  const 放中线上 = (偏移表达式) => `${S}
    const { 正文可视高 } = await import('./js/白线.js');
    const { 查找偏移所在行 } = await import('./js/排版引擎.js');
    const 半 = Math.floor(正文可视高() / 状态.行高 / 2);
    元素.滚动容器.scrollTop = Math.max(0,
      (查找偏移所在行(${偏移表达式}) - 半) * 状态.行高);`;

  async function 滚到章节(索引) {
    await 求值(放中线上(`状态.章节列表[${索引}].偏移`));
    await pause(220);
    await 沉降();
  }

  // 把某章正文中点放到中线上：这一档顶边/中线/底边三种口径各报各的数，最能分辨用的哪个
  async function 滚到章中(索引) {
    await 求值(放中线上(
      `(状态.章节列表[${索引}].偏移 + 状态.章节列表[${索引 + 1}].偏移) / 2`,
    ));
    await pause(220);
    await 沉降();
  }

  // 独立复算按钮上那个百分比：本章内读到「中线上那一行」算几成；
  // 顶边/底边/全书三种口径一并回报，用来证明用的既不是边、也不是全书。
  const 独立进度 = (索引) => 求值(`${S}
    const { 正文可视高 } = await import('./js/白线.js');
    const c = 元素.滚动容器;
    const 行号 = (位置) => Math.min(状态.行起点列表.length - 1,
      Math.max(0, Math.floor((位置 + 0.5) / 状态.行高)));
    const 最大 = c.scrollHeight - c.clientHeight;
    const 到书末 = 最大 > 0 && c.scrollTop >= 最大 - 1;
    const 总长 = 状态.文本.length;
    const 起 = 状态.章节列表[${索引}].偏移;
    const 止 = 状态.章节列表[${索引 + 1}]?.偏移 ?? 总长;
    const 掐 = (偏) => (Math.min(1, Math.max(0, (偏 - 起) / Math.max(1, 止 - 起))) * 100).toFixed(0);
    const 取 = (行) => (到书末 ? 总长 : 状态.行起点列表[行]);
    const 视高 = 正文可视高();
    const 中偏 = 取(行号(c.scrollTop + 视高 / 2));
    return { 中: 掐(中偏),
      顶: 掐(取(行号(c.scrollTop))),
      底: 掐(取(行号(c.scrollTop + 视高))),
      全书: ((中偏 / 总长) * 100).toFixed(0) };`);

  // 落点几何：按钮读数偏章时靠这行分清是 scrollTop 被量化、还是可视高对不上
  const 诊断 = (索引) => 求值(`${S}
    const { 正文可视高 } = await import('./js/白线.js');
    const { 查找偏移所在行 } = await import('./js/排版引擎.js');
    const c = 元素.滚动容器;
    const 章行 = 查找偏移所在行(状态.章节列表[${索引}].偏移);
    const { 读取当前章节 } = await import('./js/章节目录.js');
    return { 实现索引: 读取当前章节().索引, scrollTop: c.scrollTop, 行高: 状态.行高, 视高: 正文可视高(),
      章行, 章行顶: 章行 * 状态.行高, 中线: c.scrollTop + 正文可视高() / 2,
      中线行: Math.floor((c.scrollTop + 正文可视高() / 2 + 0.5) / 状态.行高),
      行起点: 状态.行起点列表.slice(Math.max(0, 章行 - 2), 章行 + 2) };`);

  // 滚动后的读数走 rAF 那一趟才落到 DOM；只按时间等会在 headless 里慢一帧，
  // 于是按钮上的章节会比模型落后一章。等两帧再读。
  const 沉降 = () =>
    求值('await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return 1;');

  // ① 逐章滚动：按钮上就是那一章的名字，序号已剥
  const 实测 = [];
  for (let 索引 = 0; 索引 < 章数; 索引 += 1) {
    await 滚到章节(索引);
    const 态 = await 按钮文字();
    实测.push({ 原始: (await 求值(`${S} return 状态.章节列表[${索引}].标题;`)).split('\n')[0], 按钮: `${态.文字} ${态.百分比}` });
    const 落点 = await 诊断(索引);
    // 先问模型认不认这一章，再问按钮——两者不一致就是 DOM 读数比模型慢，别混成一种失败
    assert.equal(
      落点.实现索引,
      索引,
      失败(`① 第 ${索引 + 1} 章：模型判成了第 ${落点.实现索引 + 1} 章`) + `\n落点: ${JSON.stringify(落点)}`,
    );
    assert.equal(
      态.文字,
      期望[索引],
      失败(`① 第 ${索引 + 1} 章按钮应为「${期望[索引]}」，实际「${态.文字}」`) +
        `\n落点: ${JSON.stringify(落点)}`,
    );
    assert.ok(
      !/^(第[0-9零〇一二三四五六七八九十百千万]+[章节回卷]|卷[0-9零〇一二三四五六七八九十]+|第?[0-9]+\s|chapter\s+[0-9ivxlcdm])/i.test(
        态.文字,
      ) || 期望[索引] === '第七章',
      失败(`① 按钮上残留了章节序号：「${态.文字}」`),
    );
    // 全名不丢：整条原始标题在悬停里
    assert.ok(
      态.标题.includes((await 求值(`${S} return 状态.章节列表[${索引}].标题;`)).split('\n')[0]),
      失败(`① 悬停 title 应带完整原始标题：${态.标题}`),
    );
    // 中线口径：标题压到屏幕中间才算刚开这一章，进度也按中线上那一行算
    const 期 = await 独立进度(索引);
    assert.match(态.百分比, /^\d+%$/, 失败(`① 百分比应形如 NN%：${态.百分比}`));
    assert.equal(
      态.百分比,
      `${期.中}%`,
      失败(`① 第 ${索引 + 1} 章应按中线报 ${期.中}%，实际 ${态.百分比}（顶边 ${期.顶}% / 底边 ${期.底}%）`),
    );
    assert.ok(
      态.标题.includes(` ${态.百分比}`),
      失败(`① 按钮百分比「${态.百分比}」要和悬停 title 里那笔对得上：${态.标题}`),
    );
    assert.ok(态.百分比宽 > 0, 失败(`① 百分比那一格要有宽度（没被省略号吃掉）`));
  }
  console.log('① 逐章读数:', JSON.stringify(实测, null, 0));

  // ② 按钮上只剩「目」图标 + 名字：「目录」二字和旧的章节总数都不许出现
  const 末章 = await 按钮文字();
  assert.ok(!/^\d+$/.test(末章.文字), 失败(`② 按钮上不应再是纯数字计数：${末章.文字}`));
  assert.ok(!末章.整钮.includes('目录'), 失败(`② 按钮上不该再有「目录」二字：「${末章.整钮}」`));

  // ③ 超长名字省略号收尾，且没把整行撑破
  await 滚到章节(10);
  const 超长 = await 按钮文字();
  assert.equal(超长.显示, 'block', 失败(`③ 名字格应为块级才能省略号收尾，实际 ${超长.显示}`));
  assert.ok(超长.截断, 失败(`③ 超长名字应被截断出省略号，实际未截断（宽 ${超长.按钮宽}）`));
  assert.ok(超长.文字 === 长名, 失败(`③ textContent 仍是全名（省略号由 CSS 画）：${超长.文字}`));
  const 三钮 = await 求值(`
    const r = ['内容选择按钮', '章节目录按钮', '阅读统计按钮'].map((id) => {
      const b = document.getElementById(id).getBoundingClientRect();
      return { id, left: Math.round(b.left), right: Math.round(b.right) };
    });
    return { r, innerWidth };`);
  assert.ok(
    三钮.r.every((x) => x.left >= 0 && x.right <= 三钮.innerWidth) &&
      三钮.r[0].right <= 三钮.r[1].left &&
      三钮.r[1].right <= 三钮.r[2].left,
    失败(`③ 右下三钮要左右有序且不越界：${JSON.stringify(三钮)}`),
  );
  console.log('③ 超长名按钮宽:', 超长.按钮宽, '三钮:', JSON.stringify(三钮.r));

  // ④ 无章节：这一格空掉且不占 flex 间距（:empty 撤掉会白吃 6px gap）
  const 基线宽 = await 求值(`${S}
    const 原 = 状态.章节列表;
    状态.章节列表 = [];
    const { 更新章节进度 } = await import('./js/章节目录.js');
    更新章节进度();
    const 名 = 元素.当前章节名;
    const 宽 = Math.round(元素.章节目录按钮.getBoundingClientRect().width);
    名.style.display = 'inline-block';
    const 占位宽 = Math.round(元素.章节目录按钮.getBoundingClientRect().width);
    名.style.display = '';
    const 态 = { 文字: 名.textContent, 显示: getComputedStyle(名).display,
      百分比: 元素.当前章节进度.textContent,
      百分比显示: getComputedStyle(元素.当前章节进度).display, 宽, 占位宽 };
    状态.章节列表 = 原;
    更新章节进度();
    return 态;`);
  assert.equal(基线宽.文字, '', 失败(`④ 无章节时按钮上不该有文字：${基线宽.文字}`));
  assert.equal(基线宽.显示, 'none', 失败(`④ 空名字格应 display:none，不吃 6px 间距，实际 ${基线宽.显示}`));
  assert.equal(基线宽.百分比, '', 失败(`④ 无章节时不该有百分比：${基线宽.百分比}`));
  assert.equal(基线宽.百分比显示, 'none', 失败(`④ 空百分比格也应 display:none，实际 ${基线宽.百分比显示}`));
  assert.equal(
    基线宽.占位宽 - 基线宽.宽,
    6,
    失败(`④ 空格子若参与布局会多占一个 6px gap：${基线宽.宽} → ${基线宽.占位宽}`),
  );
  console.log('④ 空态只剩「目」图标，按钮宽:', 基线宽.宽);
  await 滚到章节(0);
  const 恢复后 = await 按钮文字();
  assert.equal(恢复后.文字, 期望[0], 失败(`④ 恢复章节后读数应回到「${期望[0]}」，实际 ${恢复后.文字}`));

  // ⑤ 章节和进度都按视口中线：章中那一档顶/中/底三个数各不同，能看出锚点确实在中间
  await 滚到章中(1);
  const 中态 = await 按钮文字();
  const 中量 = await 独立进度(1);
  assert.equal(
    中态.百分比,
    `${中量.中}%`,
    失败(`⑤ 第三章章中应按中线报 ${中量.中}%，实际 ${中态.百分比}`),
  );
  assert.ok(
    Number(中量.顶) < Number(中量.中) && Number(中量.中) < Number(中量.底),
    失败(`⑤ 顶<中<底 三个口径要分得开，否则这条测不出锚点：顶 ${中量.顶} 中 ${中量.中} 底 ${中量.底}`),
  );
  assert.notEqual(中态.百分比, `${中量.全书}%`, 失败(`⑤ ${中量.全书}% 是全书进度，不许串成本章进度`));
  assert.equal(中态.文字, 期望[1], 失败(`⑤ 章中名字仍应是「${期望[1]}」，实际 ${中态.文字}`));
  console.log(
    '⑤ 章中读数:', 中态.文字, 中态.百分比,
    '｜顶边会是', `${中量.顶}%`, '｜底边会是', `${中量.底}%`, '｜全书', `${中量.全书}%`,
  );

  await 求值(`${S} 元素.滚动容器.scrollTop = 元素.滚动容器.scrollHeight;`);
  await pause(250);
  const 书末 = await 按钮文字();
  assert.equal(书末.百分比, '100%', 失败(`⑤ 滚到书末最后一章应显示 100%，实际 ${书末.百分比}`));
  assert.equal(书末.文字, 期望[章数 - 1], 失败(`⑤ 书末名字应为「${期望[章数 - 1]}」，实际 ${书末.文字}`));

  // 出图：右下角按钮组放大。先覆盖度量再量盒子——覆盖会改变 innerHeight，
  // 按覆盖前的坐标裁只会裁到一片纸面。
  await 发送('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 4, mobile: false });
  await pause(250);
  await 滚到章中(4);
  const 盒 = await 求值(`
    const b = document.querySelector('.右下按钮组').getBoundingClientRect();
    return { x: Math.max(0, b.left - 12), y: Math.max(0, b.top - 12), w: b.width + 24, h: b.height + 24 };`);
  assert.ok(
    盒.y > 400 && 盒.x > 400 && 盒.y + 盒.h <= 900 && 盒.x + 盒.w <= 1280,
    `裁切框要真包住右下角按钮组（否则出图是一片纸面）：${JSON.stringify(盒)}`,
  );
  const 截图 = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 盒.x, y: 盒.y, width: 盒.w, height: 盒.h, scale: 1 },
  });
  writeFileSync(join(项目根, 'tmp', '目录按钮-章节名.png'), Buffer.from(截图.data, 'base64'));
  await 发送('Emulation.clearDeviceMetricsOverride');
  console.log('已写入 tmp/目录按钮-章节名.png');

  console.log('\nOK：按钮上「目」图标 + 章节名 + 本章百分比，12 种标题形态序号剥净、长名省略号不吃掉百分比、书末 100%、空态不占位');
  ws.close();
} finally {
  await 收尾();
}
