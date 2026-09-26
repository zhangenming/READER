// 一次性验证脚本：悬停章节标题行时，左缘那一列换成全书签章地图。
// 覆盖：未悬停时该列仍归关键词（无词即隐藏）、悬停后发丝线条数=章节数、
// 朱砂红那枚正好压在被悬停章节的轨道位置上、换悬停目标只移动红枚（灰底图复用）、
// 移开后收回、选中关键词时红枚让位回关键词刻度、命中词悬停优先于章节地图。
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
const profile = mkdtempSync(join(tmpdir(), 'reader-chapter-map-'));
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

// 8 章，每章正文足够长，保证轨道上八枚刻度彼此分得开
const fixture = Array.from(
  { length: 8 },
  (_, i) => `第${i + 1}章 测试标题${i + 1}\n${`这是第${i + 1}章的正文句子。`.repeat(30)}`,
).join('\n\n');

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
  assert.equal(await 求值(`${S} return 状态.章节列表.length;`), 8, 失败('fixture 应有 8 章'));

  // 读左缘那一列的像素：灰发丝线按连续行归组，朱砂红那枚单独记；墨组 = 两者合起来
  const 读列 = () => 求值(`${S}
    const 画布 = 元素.关键词指示器;
    const 上下文 = 画布.getContext('2d');
    const 结果 = { 隐藏: 画布.hidden, 宽: 画布.width, 高: 画布.height, 发丝组: [], 墨组: [], 红行: [] };
    if (画布.hidden || !画布.width) return 结果;
    const 数据 = 上下文.getImageData(0, 0, 画布.width, 画布.height).data;
    const x = Math.floor(画布.width / 2) * 4;
    let 上一丝 = null;
    let 上一墨 = null;
    for (let y = 0; y < 画布.height; y += 1) {
      const i = y * 画布.width * 4 + x;
      const a = 数据[i + 3];
      if (!a) { 上一丝 = null; 上一墨 = null; continue; }
      if (上一墨 !== null && y === 上一墨 + 1) {
        结果.墨组[结果.墨组.length - 1][1] = y;
      } else {
        结果.墨组.push([y, y]);
      }
      上一墨 = y;
      const 是红 = Math.abs(数据[i] - 199) < 14 && Math.abs(数据[i + 1] - 78) < 14 && Math.abs(数据[i + 2] - 47) < 14;
      if (是红) { 结果.红行.push(y); 上一丝 = null; continue; }
      if (上一丝 !== null && y === 上一丝 + 1) {
        结果.发丝组[结果.发丝组.length - 1][1] = y;
      } else {
        结果.发丝组.push([y, y]);
      }
      上一丝 = y;
    }
    return 结果;`);

  // 与实现独立复算：某章在轨道上的像素中心
  const 期望红心 = (索引) => 求值(`${S}
    const { 读取滚动条度量, 滚动位置转轨道中心 } = await import('./js/滚动条.js');
    const { 查找偏移所在行 } = await import('./js/排版引擎.js');
    const 轨道高度 = 元素.滚动容器.clientHeight;
    const 容器高度 = 元素.滚动容器.clientHeight;
    const 滚动高度 = 元素.滚动容器.scrollHeight;
    const 度量 = 读取滚动条度量(轨道高度, 容器高度, 滚动高度);
    const 文档中心 = 查找偏移所在行(状态.章节列表[${索引}].偏移) * 状态.行高 + 状态.行高 / 2;
    const 滚动位置 = Math.min(度量.最大滚动位置, Math.max(0, 文档中心 - 容器高度 / 2));
    const 画布 = 元素.关键词指示器;
    return 滚动位置转轨道中心(滚动位置, 度量) * (画布.height / 轨道高度);`);

  async function 滚到章节(索引) {
    await 求值(`${S}
      const { 查找偏移所在行 } = await import('./js/排版引擎.js');
      元素.滚动容器.scrollTop = 查找偏移所在行(状态.章节列表[${索引}].偏移) * 状态.行高;`);
    await pause(200);
  }
  async function 移到(x, y) {
    // 先挪到中间点再落位：滚动后光标位置不变时，Chrome 可能不再派发 pointerover
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 460 });
    await pause(40);
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await pause(120);
  }
  async function 悬停章节(索引, 第几行 = 0) {
    await 滚到章节(索引);
    const 位置 = await 求值(`${S}
      const 行列表 = document.querySelectorAll('.正文行[data-chapter-index="${索引}"]');
      const 行 = 行列表[${第几行}];
      if (!行) return null;
      const 字 = 行.querySelector('.字');
      const 盒 = (字 || 行).getBoundingClientRect();
      return { x: 盒.left + 盒.width / 2, y: 盒.top + 盒.height / 2 };`);
    if (!位置) return false;
    await 移到(位置.x, 位置.y);
    return true;
  }
  const 状态悬停 = () => 求值(`${S} return 状态.悬停章节索引;`);

  // ① 未悬停：没有关键词时这一列是隐藏的
  await 移到(600, 500);
  const 初始 = await 读列();
  assert.equal(初始.隐藏, true, 失败('① 未悬停且无关键词时，左缘列应隐藏'));
  assert.equal(await 状态悬停(), null, 失败('① 未悬停时 悬停章节索引 应为 null'));

  // ② 悬停第 3 章：整列换成章节地图——8 章里被红枚盖住的那枚不再算灰线，故 7 组灰 + 1 枚红
  assert.ok(await 悬停章节(2), 失败('② 第 3 章标题行应在视口内'));
  const 悬停中 = await 读列();
  assert.equal(悬停中.隐藏, false, 失败('② 悬停章节时左缘列应显形'));
  assert.equal(await 状态悬停(), 2, 失败('② 悬停章节索引应为 2'));
  assert.equal(悬停中.发丝组.length, 7, 失败(`② 应有 7 组灰发丝线（第 8 枚被红枚盖住），实际 ${悬停中.发丝组.length}`));
  assert.ok(悬停中.红行.length >= 3, 失败(`② 红枚至少 3 像素高，实际 ${悬停中.红行.length}`));
  const 红心 = (悬停中.红行[0] + 悬停中.红行[悬停中.红行.length - 1]) / 2;
  const 期望 = await 期望红心(2);
  assert.ok(
    Math.abs(红心 - 期望) <= 2,
    失败(`② 红枚应压在第三章的轨道位置：期望 ${期望.toFixed(1)}，实际 ${红心}`),
  );
  // 八枚刻度彼此分得开（轨道够长），红枚落在第三章那一档而不是随便一处
  const 各章期望 = await Promise.all(
    [0, 1, 2, 3, 4, 5, 6, 7].map((索引) => 期望红心(索引)),
  );
  assert.ok(
    new Set(各章期望.map((值) => Math.round(值))).size === 8,
    失败(`② 八枚刻度应各占一行，实际位置 ${各章期望.join(',')}`),
  );

  // ③ 换悬停目标：只有红枚移动，八枚刻度的位置一格不变（灰色底图被缓存复用）。
  // 红枚比发丝线厚，按每组的中心行比对，不比组高度。
  const 墨位 = (列) => JSON.stringify(列.墨组.map(([起, 止]) => Math.round((起 + 止) / 2)));
  assert.equal(悬停中.墨组.length, 8, 失败(`③ 八枚刻度应各占一处，实际 ${悬停中.墨组.length}`));
  const 原墨位 = 墨位(悬停中);
  assert.ok(await 悬停章节(6), 失败('③ 第 7 章标题行应在视口内'));
  const 换目标 = await 读列();
  assert.equal(墨位(换目标), 原墨位, 失败(`③ 换悬停目标时八枚刻度的位置不应改变：${原墨位} vs ${墨位(换目标)}`));
  const 新红心 = (换目标.红行[0] + 换目标.红行[换目标.红行.length - 1]) / 2;
  const 新期望 = await 期望红心(6);
  assert.ok(
    Math.abs(新红心 - 新期望) <= 2,
    失败(`③ 红枚应移到第七章：期望 ${新期望.toFixed(1)}，实际 ${新红心}`),
  );

  // ④ 移开：收回隐藏，状态清空
  await 移到(600, 500);
  const 移开 = await 读列();
  assert.equal(移开.隐藏, true, 失败('④ 移开标题行后左缘列应收回隐藏'));
  assert.equal(await 状态悬停(), null, 失败('④ 移开后 悬停章节索引 应为 null'));

  // ⑤ 选中关键词时：悬停章节标题（非命中字）仍换成章节地图；移开后回到该关键词的刻度
  await 求值(`${S}
    const { 添加关键词标记 } = await import("./js/关键词.js");
    添加关键词标记('标题', 状态.文本.indexOf('标题'));`);
  await pause(200);
  await 移到(600, 500);
  const 选中词 = await 读列();
  assert.equal(选中词.隐藏, false, 失败('⑤ 选中关键词后左缘列应显示该词刻度'));
  assert.equal(选中词.红行.length, 0, 失败('⑤ 关键词刻度不应有朱砂红枚'));
  assert.ok(await 悬停章节(4), 失败('⑤ 第 5 章标题行应在视口内'));
  const 章节盖词 = await 读列();
  assert.ok(章节盖词.红行.length >= 3, 失败('⑤ 悬停章节时这一列应换成章节地图（有红枚）'));
  assert.ok(
    Math.abs((章节盖词.红行[0] + 章节盖词.红行[章节盖词.红行.length - 1]) / 2 - (await 期望红心(4))) <= 2,
    失败('⑤ 红枚应压在第五章的位置'),
  );
  await 移到(600, 500);
  const 回到词 = await 读列();
  assert.equal(回到词.隐藏, false, 失败('⑤ 移开后应回到关键词刻度列，不是空白'));
  assert.equal(回到词.红行.length, 0, 失败('⑤ 移开后不应残留章节红枚'));

  // ⑥ 标题行里的命中词：悬停更具体，让给关键词，不画章节地图
  await 滚到章节(0);
  const 命中位置 = await 求值(`${S}
    const 行 = document.querySelector('.正文行[data-chapter-index="0"]');
    const 字 = 行 ? 行.querySelector('.字.命中') : null;
    if (!字) return null;
    const 盒 = 字.getBoundingClientRect();
    return { x: 盒.left + 盒.width / 2, y: 盒.top + 盒.height / 2 };`);
  assert.ok(命中位置, 失败('⑥ 第 1 章标题行内应有「标题」这个命中词'));
  await 移到(命中位置.x, 命中位置.y);
  const 命中悬停 = await 读列();
  assert.equal(命中悬停.隐藏, false, 失败('⑥ 悬停命中词时这一列应显示关键词刻度'));
  assert.equal(命中悬停.红行.length, 0, 失败('⑥ 悬停标题行内的命中词时不应画章节红枚'));
  assert.equal(
    await 状态悬停(),
    0,
    失败('⑥ 悬停章节索引仍记着所在章（绘制那一列时才让位给关键词）'),
  );
  // 从命中字移回同一行的普通字：章节地图要重新盖上来
  const 回到普通字 = await 求值(`${S}
    const 行 = document.querySelector('.正文行[data-chapter-index="0"]');
    const 字 = [...行.querySelectorAll('.字')].find((元) => !元.classList.contains('命中'));
    const 盒 = 字.getBoundingClientRect();
    return { x: 盒.left + 盒.width / 2, y: 盒.top + 盒.height / 2 };`);
  await 移到(回到普通字.x, 回到普通字.y);
  const 重新盖上 = await 读列();
  assert.ok(重新盖上.红行.length >= 3, 失败('⑥ 移回标题行的普通字后，章节地图应重新盖上来'));

  // 出图给用户看：整页 + 左缘窄条放大
  const 截图页 = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(项目根, 'tmp', '章节地图-整页.png'), Buffer.from(截图页.data, 'base64'));
  await 发送('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 4, mobile: false });
  await pause(200);
  assert.ok(await 悬停章节(3), 失败('出图：第 4 章标题行应在视口内'));
  const 截图轴 = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 260, height: 900, scale: 1 },
  });
  writeFileSync(join(项目根, 'tmp', '章节地图-左缘放大.png'), Buffer.from(截图轴.data, 'base64'));
  await 发送('Emulation.clearDeviceMetricsOverride');
  console.log('已写入 tmp/章节地图-整页.png 与 tmp/章节地图-左缘放大.png');

  console.log('\nOK：悬停章节标题行时左缘那一列换成全书签章地图，红枚压在悬停章上，移开收回');
  ws.close();
} finally {
  await 收尾();
}
