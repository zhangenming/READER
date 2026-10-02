// 一次性验证脚本：章节标题行的常驻强调样式（加粗 700 + 0.6px 描边 + 4px 顶满立柱 + 独占行标题底线）。
// 覆盖：① 字重/描边只落在标题行、正文不动，折行长标题不画底线、末字不裁；② 标题行里的命中词
// 不被抢色抢字重（与正文命中词逐项一致）；③ 立柱 4px 顶满行高、与首字留缝、白轴显形时也没被盖住；
// ⑤ 悬停态仍然生效（转朱砂红 + 下划线）；⑥ 独占一行的标题压底线；⑦ 深浅两档各出一张图。
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
const profile = mkdtempSync(join(tmpdir(), 'reader-title-emphasis-'));
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

// 标题刻意写到 60 字：1280 宽下必然折成两行，首行填满行宽，正是加粗后最容易顶出末字的那一档
const 正文 = '他站在街角看了看表，随后沿着铁十字街一直往南走。'.repeat(9);
const fixture = [
  '第一章 俱乐部',
  正文,
  '第三十七章 顶着下午的烈阳克莱恩走出俱乐部大门准备沿着铁十字街一直走到韦特街去再穿过两条安静的巷子回到他在街尾租下的那间住处',
  正文,
].join('\n\n');

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
  await 发送('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 3, mobile: false });
  assert.equal(await 求值(`${S} return 状态.章节列表.length;`), 2, 失败('fixture 应有 2 章'));

  async function 停在标题(索引) {
    await 求值(`${S}
      const { 查找偏移所在行 } = await import('./js/排版引擎.js');
      元素.滚动容器.scrollTop = 查找偏移所在行(状态.章节列表[${索引}].偏移) * 状态.行高;`);
    await pause(200);
    await 求值(两帧);
  }

  // ① + ④ + ③ 一次量齐
  await 停在标题(1);
  const 量 = await 求值(`${S}
    // 只取没有任何修饰类的普通字：内置词（他/一/不…）自带字重，拿它当样本会误判
    const 净字 = (行) => [...行.querySelectorAll('.字')].find((元) => 元.className === '字');
    const 行 = document.querySelector('.正文行[data-chapter-index="1"]');
    const 折行 = document.querySelectorAll('.正文行[data-chapter-index="1"]').length;
    const 字 = 净字(行);
    const 正文行 = [...document.querySelectorAll('.正文行:not(.章节标题行)')]
      .find((r) => 净字(r));
    const 伪 = getComputedStyle(行, '::before');
    const 首字盒 = 行.querySelector('.字').getBoundingClientRect();
    const 行盒 = 行.getBoundingClientRect();
    const 条 = { left: 行盒.left + parseFloat(伪.left), width: parseFloat(伪.width) };
    return {
      标题字重: getComputedStyle(字).fontWeight,
      标题描边: getComputedStyle(字).webkitTextStrokeWidth,
      命中描边: 行.querySelector('.字.命中')
        ? getComputedStyle(行.querySelector('.字.命中')).webkitTextStrokeWidth : '无',
      正文字重: getComputedStyle(净字(正文行)).fontWeight,
      正文描边: getComputedStyle(净字(正文行)).webkitTextStrokeWidth,
      折行数: 折行,
      条宽: 条.width, 条高: 行盒.height - parseFloat(伪.top) - parseFloat(伪.bottom),
      条底色: 伪.backgroundColor,
      条右缘到首字: +(首字盒.left - 条.left - 条.width).toFixed(1),
      条在行内: 条.left >= 行盒.left && 条.left + 条.width <= 首字盒.left,
      行高: 行盒.height,
      折行标题有底线: [...document.querySelectorAll('.正文行[data-chapter-index="1"]')]
        .map((r) => /inset/.test(getComputedStyle(r).boxShadow)),
      末字余量: +(行盒.right - [...行.querySelectorAll('.字')].pop().getBoundingClientRect().right).toFixed(1),
      条心命中: (() => {
        const 点 = document.elementFromPoint(条.left + 条.width / 2, 行盒.top + 行盒.height / 2);
        return { 标签: 点?.tagName, 是指示器画布: 点 === 元素.关键词指示器, 类: 点?.className?.slice?.(0, 24) };
      })(),
    };`);
  assert.equal(量.标题字重, '700', 失败(`① 标题行字重应为 700，实际 ${量.标题字重}`));
  assert.equal(量.标题描边, '0.6px', 失败(`① 标题行应有 0.6px 同色描边，实际 ${量.标题描边}`));
  assert.equal(量.正文字重, '100', 失败(`① 正文行字重不该被带走，实际 ${量.正文字重}`));
  assert.equal(量.正文描边, '0px', 失败(`① 正文行不该有描边，实际 ${量.正文描边}`));
  assert.equal(量.折行数, 2, 失败(`④ 这条长标题应折成 2 行（末字余量才有意义），实际 ${量.折行数}`));
  assert.ok(量.末字余量 > 0, 失败(`④ 加粗后末字越出行盒会被裁，余量 ${量.末字余量}px`));
  assert.deepEqual(
    量.折行标题有底线, [false, false],
    失败(`① 折行的长标题不许画底线（会在标题中间切一刀）：${JSON.stringify(量.折行标题有底线)}`),
  );
  assert.equal(量.条宽, 4, 失败(`③ 立柱应 4px 宽，实际 ${量.条宽}`));
  assert.ok(
    Math.abs(量.条高 - 量.行高) < 1,
    失败(`③ 立柱应顶满行高，实际 ${量.条高}/${量.行高}`),
  );
  assert.ok(量.条在行内, 失败(`③ 竖条要落在行首留白里（不压首字）：${JSON.stringify(量)}`));
  assert.ok(量.条右缘到首字 >= 2, 失败(`③ 竖条与首字之间至少留 2px，实际 ${量.条右缘到首字}`));
  assert.equal(量.条心命中.是指示器画布, false, 失败(`③ 竖条被左缘白轴盖住了：${JSON.stringify(量.条心命中)}`));
  console.log('①③④', JSON.stringify(量));

  // ② 标题行里的命中词：仍走命中那套配色，没被标题样式抢走
  await 求值(`${S}
    const { 添加关键词标记 } = await import('./js/关键词.js');
    const 偏 = 状态.文本.indexOf('铁十字街', 状态.章节列表[1].偏移);
    添加关键词标记('铁十字街', [偏, 状态.文本.indexOf('铁十字街')]);
    const { 渲染关键词面板 } = await import('./js/面板.js');
    渲染关键词面板();
    return 1;`);
  await pause(300);
  await 停在标题(1);
  const 命中 = await 求值(`${S}
    const 行 = document.querySelector('.正文行[data-chapter-index="1"]');
    const 标题命中字 = 行.querySelector('.字.命中');
    const 标题普通字 = [...行.querySelectorAll('.字')].find((元) => 元.className === '字');
    const 正文命中字 = [...document.querySelectorAll('.正文行:not(.章节标题行) .字.命中')][0];
    const 取 = (元) => ({ 色: getComputedStyle(元).color, 底: getComputedStyle(元).backgroundColor,
      重: getComputedStyle(元).fontWeight, 描边: getComputedStyle(元).webkitTextStrokeWidth });
    return { 有: !!标题命中字 && !!正文命中字, 标题命中: 取(标题命中字), 标题普通: 取(标题普通字),
      正文命中: 取(正文命中字), 轴在画: !元素.关键词指示器.hidden };`);
  assert.ok(命中.有, 失败('② 标题行与正文行里都该有命中词'));
  assert.notEqual(命中.标题命中.色, 命中.标题普通.色, 失败(`② 标题里的命中词被抢色了：${JSON.stringify(命中)}`));
  assert.equal(命中.标题命中.色, 命中.正文命中.色, 失败(`② 命中词该走同一套配色：${JSON.stringify(命中)}`));
  // 命中词的字重归关键词那一套（--关键词粗细），标题样式不该插手：
  // 判据是「标题里的命中字和正文里的命中字一模一样」，不是某个固定值
  assert.equal(
    命中.标题命中.重,
    命中.正文命中.重,
    失败(`② 标题里的命中字重被带走了：标题 ${命中.标题命中.重} vs 正文 ${命中.正文命中.重}`),
  );
  assert.ok(命中.轴在画, 失败('② 选中关键词后左缘白轴应显形（下一步要在这种状态下量竖条）'));
  const 轴下竖条 = await 求值(`${S}
    const 行 = document.querySelector('.正文行[data-chapter-index="1"]');
    const 伪 = getComputedStyle(行, '::before');
    const 行盒 = 行.getBoundingClientRect();
    const 左 = 行盒.left + parseFloat(伪.left);
    const 点 = document.elementFromPoint(左 + parseFloat(伪.width) / 2, 行盒.top + 行盒.height / 2);
    return { 白轴宽: Math.round(元素.关键词指示器.getBoundingClientRect().right),
      条心x: Math.round(左), 盖住: 点 === 元素.关键词指示器, 标签: 点?.tagName };`);
  assert.equal(轴下竖条.盖住, false, 失败(`③ 白轴显形时竖条被盖住：${JSON.stringify(轴下竖条)}`));
  console.log('②/③ 命中与白轴:', JSON.stringify(命中), JSON.stringify(轴下竖条));

  // ⑤ 悬停仍要转朱砂红（常驻样式不能把交互态吃掉）；先在没悬停时取常态色
  const 净 = `const 净字 = (行) => [...行.querySelectorAll('.字')].find((元) => 元.className === '字');`;
  const 常态 = await 求值(`${S}
    ${净}
    const 行 = document.querySelector('.正文行[data-chapter-index="1"]');
    const 字 = 净字(行);
    const r = 字.getBoundingClientRect();
    return { 色: getComputedStyle(字).color, x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 460 });
  await pause(60);
  await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 常态.x, y: 常态.y });
  await pause(200);
  const 悬停 = await 求值(`${S}
    ${净}
    const 行 = document.querySelector('.正文行[data-chapter-index="1"]');
    const 字 = 净字(行);
    return { 色: getComputedStyle(字).color,
      下划线: getComputedStyle(字).textDecorationLine, 字重: getComputedStyle(字).fontWeight };`);
  assert.notEqual(悬停.色, 常态.色, 失败(`⑤ 悬停色没变（常驻样式吃掉了交互态）：常驻 ${常态.色} 悬停 ${悬停.色}`));
  assert.equal(悬停.下划线, 'underline', 失败(`⑤ 悬停应压出下划线，实际 ${悬停.下划线}`));
  assert.equal(悬停.字重, '700', 失败(`⑤ 悬停时仍应保持加粗：${悬停.字重}`));
  console.log('⑤ 悬停:', JSON.stringify(悬停));

  // ⑥ 独占一行的标题才画底线（折行的那档已在 ① 里断言不画）
  await 停在标题(0);
  const 短标题 = await 求值(`${S}
    const 行 = document.querySelector('.正文行[data-chapter-index="0"]');
    return { 有提示: 行.hasAttribute('data-chapter-hint'),
      底线: getComputedStyle(行).boxShadow,
      立柱: getComputedStyle(行, '::before').width };`);
  assert.ok(短标题.有提示, 失败('⑥ 「第一章 俱乐部」应独占一行（带 data-chapter-hint）'));
  assert.match(短标题.底线, /inset/, 失败(`⑥ 独占一行的标题该压一条底线，实际 ${短标题.底线}`));
  assert.equal(短标题.立柱, '4px', 失败(`⑥ 立柱该跟着短标题走，实际 ${短标题.立柱}`));
  console.log('⑥ 独占行标题:', JSON.stringify(短标题));

  // ⑦ 深浅两档各出一张图（指针要先挪开：停在标题上会带着悬停态一起拍进去）
  async function 出图(名) {
    await 停在标题(1);
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 700 });
    await pause(200);
    const 常态 = await 求值(`${S}
      const 行 = document.querySelector('.正文行[data-chapter-index="1"]');
      const 字 = [...行.querySelectorAll('.字')].find((元) => 元.className === '字');
      return getComputedStyle(字).color;`);
    assert.notEqual(常态, 'rgb(199, 78, 47)', 失败(`⑥ 出图时标题还挂着悬停红（指针没挪开）：${常态}`));
    const 盒 = await 求值(`${S}
      const 行 = document.querySelector('.正文行[data-chapter-index="1"]');
      const r = 行.getBoundingClientRect();
      return { x: Math.max(0, r.left - 24), y: r.top, w: Math.min(1000, r.width + 32), h: r.height * 3 };`);
    const 图 = await 发送('Page.captureScreenshot', {
      format: 'png', clip: { x: 盒.x, y: 盒.y, width: 盒.w, height: 盒.h, scale: 1 },
    });
    writeFileSync(join(项目根, 'tmp', `章节行醒目-${名}.png`), Buffer.from(图.data, 'base64'));
  }
  // 深色档 = 用户截图那一档：黑纸面 + 用户自定的浅色正文（--正文字色 不随纸面自动翻）
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
    失败('⑥ 深色档没设上，图会是假的'),
  );
  await 出图('深');
  await 求值(`${S}
    const { 默认纸面色, 默认页面背景色 } = await import('./js/常量.js');
    const { 设置纸面色, 设置页面背景色, 设置区域颜色 } = await import('./js/字体设置.js');
    设置区域颜色('引号外', null);
    设置区域颜色('引号内', null);
    设置纸面色(默认纸面色, { 静默: true });
    设置页面背景色(默认页面背景色, { 静默: true });
    return 1;`);
  await pause(400);
  await 出图('浅');
  console.log('已写入 tmp/章节行醒目-深.png / -浅.png');
  console.log('\nOK：标题行加粗 700 + 0.6px 描边 + 4px 顶满立柱 + 独占行标题底线；正文不动、命中词不抢、白轴不盖、折行标题不切刀、末字不裁、悬停照旧');
  ws.close();
} finally {
  await 收尾();
}
