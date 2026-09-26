// 一次性看图脚本：悬停章节标题行的高亮效果长什么样（下划线会不会被行盒裁掉、
// 命中词与书名号引文条是否被压花）。只出图不判定，产物在 tmp/ 与 profile 分开保存。
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
const profile = mkdtempSync(join(tmpdir(), 'reader-hover-shot-'));
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
process.on('exit', () => {
  chrome.kill();
  服务.kill();
});

const fixture = [
  '第1章 黄河归故斗争',
  '花园口决堤与黄河改道，南京会谈争取救济物资。'.repeat(2),
  '第2章 《第三次国内革命战争时期》的晋察冀部队整编与南下准备事项',
  '主力部队按原计划集结完毕，等待命令。'.repeat(2),
  '第3章 合龙',
  '解放区迅速恢复生产秩序。'.repeat(2),
].join('\n\n');

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
    throw new Error('未找到页面');
  }
  const 目标 = await 等待目标();
  const ws = new WebSocket(目标.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let 序号 = 0;
  const 待回复 = new Map();
  ws.addEventListener('message', async (事件) => {
    const 消息 = JSON.parse(事件.data);
    if (消息.id) {
      const 请求 = 待回复.get(消息.id);
      待回复.delete(消息.id);
      if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
      else 请求.resolve(消息.result);
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

  // 在第 2 章标题里造一个命中词，检查命中字是否被下划线压花
  await 求值(`${S}
    const { 添加关键词标记 } = await import("./js/关键词.js");
    添加关键词标记('革命', 状态.文本.indexOf('革命'));`);
  await pause(300);

  async function 拍(章节索引, 文件名) {
    const 盒 = await 求值(`${S}
      const 行 = document.querySelector('.正文行[data-chapter-index="${章节索引}"]');
      元素.滚动容器.scrollTop = 行.getBoundingClientRect().top - 元素.滚动容器.getBoundingClientRect().top + 元素.滚动容器.scrollTop;
      return null;`);
    await pause(200);
    const 位置 = await 求值(`${S}
      const 行 = document.querySelector('.正文行[data-chapter-index="${章节索引}"]');
      const 容器 = 元素.滚动容器.getBoundingClientRect();
      const 自身 = 行.getBoundingClientRect();
      return { x: 自身.left + 60, y: 自身.top + 自身.height / 2,
        截图: { x: Math.round(容器.left), y: Math.round(自身.top) - 6, width: Math.round(自身.width), height: Math.round(自身.height) + 12 } };`);
    await 发送('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 3, mobile: false });
    await pause(150);
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 位置.x, y: 位置.y });
    await pause(250);
    const 图 = await 发送('Page.captureScreenshot', { format: 'png', clip: { ...位置.截图, scale: 1 } });
    writeFileSync(join(项目根, 'tmp', 文件名), Buffer.from(图.data, 'base64'));
    console.log('已写入', 文件名);
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 位置.x, y: 位置.y - 260 });
    await pause(200);
    const 未悬停 = await 发送('Page.captureScreenshot', { format: 'png', clip: { ...位置.截图, scale: 1 } });
    writeFileSync(
      join(项目根, 'tmp', 文件名.replace('.png', '-未悬停.png')),
      Buffer.from(未悬停.data, 'base64'),
    );
    console.log('已写入', 文件名.replace('.png', '-未悬停.png'));
    await 发送('Emulation.clearDeviceMetricsOverride');
    await pause(120);
  }

  await 拍(0, '标题悬停-普通.png');
  await 拍(1, '标题悬停-含命中与书名号.png');

  // 夜读深底：纸面调成深色后再拍一次，检查强调色与提示的对比度
  await 求值(`const 字体 = await import("./js/字体设置.js");
    字体.设置纸面色('#141414', { 静默: true });
    字体.设置页面背景色('#0e0f10', { 静默: true });
    字体.设置奇偶行颜色('奇数', '#1c1f22', { 静默: true });
    字体.设置奇偶行颜色('偶数', '#22252a', { 静默: true });`);
  await pause(300);
  await 拍(0, '标题悬停-深色纸面.png');
  ws.close();
} finally {
  chrome.kill();
  服务.kill();
  await Promise.race([
    Promise.all([chrome已退出, 服务已退出]),
    pause(3000),
  ]);
  rmSync(profile, { recursive: true, force: true });
  console.log(existsSync(profile) ? 'profile 清理失败' : 'profile 已清理');
}
