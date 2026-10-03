// 一次性验证脚本：章节标题行的「斜线背景」（朱砂 45° 细斜线，1.5px 线宽 / 8px 周期 / 38% 浓度）。
// 覆盖：① 只有标题行铺斜纹，正文行/空行 background-image 仍是 none；标题行的段落交替色带原样保留
// （斜纹画在色带之上，不是底纱）；② 深浅两档都显形：计算样式里渐变存在，且出图给人工复核；
// ③ 悬停态不受影响（转朱砂红 + 下划线照旧，背景不换）；④ 折行标题的每个显示行都有斜纹、
// 不画底线、末字不被裁；⑤ 标题里的命中词仍走命中配色，不被纹理吃色。
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
async function 取空闲端口() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const 端口 = s.address().port;
      s.close(() => resolve(端口));
    });
  });
}
for (const 名 of readdirSync(tmpdir())) {
  if (!名.startsWith('reader-')) continue;
  const 路径 = join(tmpdir(), 名);
  try {
    execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
    continue;
  } catch {}
  rmSync(路径, { recursive: true, force: true });
}
const 站点端口 = await 取空闲端口();
const CDP端口 = await 取空闲端口();
const 地址 = `http://127.0.0.1:${站点端口}/`;
const profile = mkdtempSync(join(tmpdir(), 'reader-title-stripe-verify-'));
const 服务 = spawn('node', ['server.mjs', String(站点端口)], { cwd: 项目根, stdio: 'ignore' });
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${CDP端口}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,900', 地址],
  { stdio: 'ignore' },
);
process.on('exit', () => {
  chrome.kill();
  服务.kill();
});
async function 收尾() {
  chrome.kill();
  服务.kill();
  await pause(500);
  chrome.kill('SIGKILL');
  服务.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
  if (existsSync(profile)) {
    console.error('profile 清理失败:', profile);
    process.exitCode = 1;
  } else console.log('profile 已清理');
}

// 短标题（独占一行）+ 长标题（1280 宽下必折行，且要带一个命中词）
const 正文段 = '话说纣王驾回龙德殿，百官朝贺毕，各归其位，静候来日早朝动静。'
  + '且说西伯侯姬昌自朝歌散后，星夜出城，取路往西岐而来，铁十字街上一路无话。'.repeat(2);
const fixture = [
  '不知姬昌等性命如何，且听下回分解。',
  '',
  '第十一回　羑里城囚西伯侯',
  '',
  '诗曰：',
  正文段,
  '',
  '第十二回　顶着下午的烈阳姬昌走出羑里城门准备沿着铁十字街一直走到渭水边去再穿过两条安静的巷子回到他在西岐城外租下的那间住处',
  '',
  正文段,
].join('\n');

try {
  let 页 = null;
  for (let i = 0; i < 150 && !页; i++) {
    try {
      const 出 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
      页 = 出.find((t) => t.type === 'page' && t.url.startsWith(地址));
    } catch {}
    if (!页) await pause(200);
  }
  assert.ok(页, '未找到 headless Chrome 页面');
  const ws = new WebSocket(页.webSocketDebuggerUrl);
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
    } else if (消息.method === 'Runtime.exceptionThrown') {
      页面日志.push('EXCEPTION: ' + (消息.params.exceptionDetails.exception?.description || ''));
    } else if (消息.method === 'Fetch.requestPaused') {
      try {
        await 发送('Fetch.fulfillRequest', {
          requestId: 消息.params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/plain; charset=utf-8' }],
          body: Buffer.from(fixture).toString('base64'),
        });
      } catch {
        // 页面重载作废旧请求时 fulfill 会报 Invalid InterceptionId，忽略
      }
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
  const 失败 = (说明) => `${说明}\n页面日志:\n${页面日志.slice(-6).join('\n')}`;
  const S = 'const { 状态, 元素 } = await import("./js/状态.js");';
  const 两帧 = 'await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); return 1;';

  await 发送('Page.enable');
  await 发送('Runtime.enable');
  await 发送('Fetch.enable', { patterns: [{ urlPattern: '*txt/*.txt', requestStage: 'Request' }] });
  await 发送('Page.reload', { ignoreCache: true });
  for (let n = 0; n < 240; n++) {
    try {
      if (await 求值('return document.querySelector("#载入状态")?.hidden && !!(await import("./js/状态.js")).状态.文件名')) break;
    } catch {}
    await pause(120);
  }
  await pause(400);
  await 发送('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
  assert.equal(await 求值(`${S} return 状态.章节列表.length;`), 2, 失败('fixture 应有 2 章'));

  async function 停在标题(索引) {
    await 求值(`${S}
      const { 查找偏移所在行 } = await import('./js/排版引擎.js');
      元素.滚动容器.scrollTop = 查找偏移所在行(状态.章节列表[${索引}].偏移) * 状态.行高;`);
    await pause(200);
    await 求值(两帧);
  }

  // ① 斜纹只落在标题行；标题行的段落色带原样保留；正文行/空行不铺
  await 停在标题(0);
  const 量 = await 求值(`${S}
    const 取行 = (选) => document.querySelector(选);
    const 标题行 = 取行('.正文行.章节标题行');
    const 正文行 = [...document.querySelectorAll('.正文行:not(.章节标题行):not(:empty)')]
      .find((r) => r.querySelector('.字'));
    const 空行 = 取行('.正文行:empty');
    const 样 = (行) => {
      const s = getComputedStyle(行);
      return { 背景图: s.backgroundImage, 背景色: s.backgroundColor, 底类: [...行.classList].find((c) => c.startsWith('段落底色')) };
    };
    return {
      标题: 样(标题行),
      正文: 样(正文行),
      空行: 样(空行),
      标题行高: 标题行.getBoundingClientRect().height,
      探针色: (() => {
        const 探针 = document.createElement('span');
        探针.style.backgroundColor = 'color-mix(in oklab, var(--强调色) 38%, transparent)';
        document.body.append(探针);
        const 色 = getComputedStyle(探针).backgroundColor;
        探针.remove();
        return 色;
      })(),
    };`);
  assert.match(量.标题.背景图, /repeating-linear-gradient\(45deg/, 失败(`① 标题行该铺 45° 斜线底纹，实际 ${量.标题.背景图}`));
  assert.ok(
    量.探针色.replace(/\s/g, '').length > 3 && 量.标题.背景图.includes(量.探针色),
    失败(`① 斜线色该等于「强调色 38% 透明档」（${量.探针色}），实际 ${量.标题.背景图}`),
  );
  assert.equal(量.正文.背景图, 'none', 失败(`① 正文行不该有底纹，实际 ${量.正文.背景图}`));
  assert.equal(量.空行.背景图, 'none', 失败(`① 空行不该有底纹，实际 ${量.空行.背景图}`));
  assert.ok(量.标题.底类, 失败(`① 标题行该保留段落交替色带类，实际 ${JSON.stringify(量.标题)}`));
  assert.notEqual(量.标题.背景色, 'rgba(0, 0, 0, 0)', 失败(`① 标题行的段落色带该原样保留（斜纹画在色带之上）：${量.标题.背景色}`));
  console.log('① 底纹落点:', JSON.stringify(量));

  // ② 悬停态：背景不换、转朱砂红 + 下划线照旧
  const 悬停前后 = await 求值(`${S}
    const 行 = document.querySelector('.正文行.章节标题行');
    const 字 = [...行.querySelectorAll('.字')].find((元) => 元.className === '字');
    const r = 字.getBoundingClientRect();
    return { 常态化: getComputedStyle(字).color, 背景图: getComputedStyle(行).backgroundImage,
      x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 500 });
  await pause(60);
  await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 悬停前后.x, y: 悬停前后.y });
  await pause(200);
  const 悬停后 = await 求值(`${S}
    const 行 = document.querySelector('.正文行.章节标题行');
    const 字 = [...行.querySelectorAll('.字')].find((元) => 元.className === '字');
    return { 悬停色: getComputedStyle(字).color, 下划线: getComputedStyle(字).textDecorationLine,
      背景图: getComputedStyle(行).backgroundImage };`);
  assert.notEqual(悬停后.悬停色, 悬停前后.常态化, 失败(`② 悬停该变红：${JSON.stringify(悬停后)}`));
  assert.equal(悬停后.下划线, 'underline', 失败(`② 悬停该有下划线，实际 ${悬停后.下划线}`));
  assert.equal(悬停后.背景图, 悬停前后.背景图, 失败('② 悬停不该换背景（斜纹是常驻的）'));
  console.log('② 悬停:', JSON.stringify(悬停后));

  // ③ 折行长标题：每个显示行都有斜纹；不画底线；末字不裁
  await 求值(`${S}
    const { 添加关键词标记 } = await import('./js/关键词.js');
    const 偏 = 状态.文本.indexOf('铁十字街', 状态.章节列表[1].偏移);
    添加关键词标记('铁十字街', [偏, 状态.文本.indexOf('铁十字街')]);
    const { 渲染关键词面板 } = await import('./js/面板.js');
    渲染关键词面板();
    return 1;`);
  await pause(300);
  await 停在标题(1);
  const 折行 = await 求值(`${S}
    const 行们 = [...document.querySelectorAll('.正文行[data-chapter-index="1"]')];
    return {
      行数: 行们.length,
      都有斜纹: 行们.every((r) => /repeating-linear-gradient/.test(getComputedStyle(r).backgroundImage)),
      底线: 行们.map((r) => /inset/.test(getComputedStyle(r).boxShadow)),
      末字余量: +(行们.at(-1).getBoundingClientRect().right
        - [...行们.at(-1).querySelectorAll('.字')].pop().getBoundingClientRect().right).toFixed(1),
      命中字: (() => {
        const 字 = document.querySelector('.正文行[data-chapter-index="1"] .字.命中');
        return 字 ? { 色: getComputedStyle(字).color, 底: getComputedStyle(字).backgroundColor } : null;
      })(),
      正文命中字: (() => {
        const 字 = document.querySelector('.正文行:not(.章节标题行) .字.命中');
        return 字 ? { 色: getComputedStyle(字).color, 底: getComputedStyle(字).backgroundColor } : null;
      })(),
      折行标题提示: 行们.map((r) => r.hasAttribute('data-chapter-hint')),
    };`);
  assert.equal(折行.行数, 2, 失败(`③ 这条长标题该折成 2 行，实际 ${折行.行数}`));
  assert.ok(折行.都有斜纹, 失败('③ 折行标题的每个显示行都要有斜纹'));
  assert.deepEqual(折行.底线, [false, false], 失败(`③ 折行标题不许画底线：${JSON.stringify(折行.底线)}`));
  assert.ok(折行.末字余量 > 0, 失败(`③ 末字余量应为正（不被裁）：${折行.末字余量}`));
  assert.deepEqual(折行.折行标题提示, [false, false], 失败('③ 折行标题不该有行尾提示'));
  assert.ok(折行.命中字 && 折行.正文命中字, 失败('③ 标题与正文里都该有命中词'));
  assert.equal(折行.命中字.色, 折行.正文命中字.色, 失败(`③ 标题里的命中词该走同一套配色：${JSON.stringify(折行)}`));
  console.log('③ 折行与命中:', JSON.stringify(折行));

  // ④ 深浅两档出图（指针先挪开）
  async function 出图(名, 章节索引 = 0) {
    await 停在标题(章节索引);
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 700 });
    await pause(200);
    const 盒 = await 求值(`${S}
      const 行 = document.querySelector('.正文行.章节标题行');
      const r = 行.getBoundingClientRect();
      return { x: 0, y: Math.max(0, r.top - r.height), width: 1280, height: r.height * 3 };`);
    const 图 = await 发送('Page.captureScreenshot', {
      format: 'png', clip: { x: 盒.x, y: 盒.y, width: 盒.width, height: 盒.height, scale: 1 },
    });
    writeFileSync(join(项目根, 'tmp', `章节行斜纹-${名}.png`), Buffer.from(图.data, 'base64'));
  }
  // 深色档 = 用户截图那一档：黑纸面 + 用户自定的浅色正文
  await 求值(`${S}
    const { 设置纸面色, 设置页面背景色, 设置区域颜色 } = await import('./js/字体设置.js');
    设置页面背景色('#000000', { 静默: true });
    设置纸面色('#000000', { 静默: true });
    设置区域颜色('引号外', '#E8E6E1');
    设置区域颜色('引号内', '#E8E6E1');
    return 1;`);
  await pause(400);
  assert.equal(
    await 求值(`${S} return getComputedStyle(document.documentElement).getPropertyValue('--纸张色').trim();`),
    '#000000',
    失败('④ 深色档没设上，图会是假的'),
  );
  await 出图('深-短标题', 0);
  await 出图('深-折行标题', 1);
  await 求值(`${S}
    const { 默认纸面色, 默认页面背景色 } = await import('./js/常量.js');
    const { 设置纸面色, 设置页面背景色, 设置区域颜色 } = await import('./js/字体设置.js');
    设置区域颜色('引号外', null);
    设置区域颜色('引号内', null);
    设置纸面色(默认纸面色, { 静默: true });
    设置页面背景色(默认页面背景色, { 静默: true });
    return 1;`);
  await pause(400);
  await 出图('浅-短标题', 0);
  console.log('已写入 tmp/章节行斜纹-深-短标题.png / -深-折行标题.png / -浅-短标题.png');
  console.log('\nOK：斜线底纹只落在章节标题行（朱砂 45° 1.5px/8px/38%），段色带原样透出；悬停、折行、命中词均不受影响');
  ws.close();
} finally {
  await 收尾();
}
