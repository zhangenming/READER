// 看一眼三列平分白轴的真实样子：载入有章节的书，加两个关键词，截左缘放大图 + 量三列盒子。
// 跑法：node tmp/看-三列平分.mjs  [BOOK=《悟空传》（校对版全本）作者：今何在.txt] [AT=0.3]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const 项目根 = resolve(import.meta.dirname, '..');
const 目标文本 =
  process.env.BOOK || '《悟空传》（校对版全本）作者：今何在.txt';
const 位置 = Number(process.env.AT || 0.3);
const 关键词 = process.env.KW || '孙悟空';
const 额外关键词 = process.env.KW2 || '天蓬';
const 临时目录 = mkdtempSync(join(tmpdir(), 'reader-columns-'));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function 取空闲端口(首选) {
  const 试 = async (端口) => {
    const 探测 = createServer();
    try {
      await new Promise((完成, 失败) => {
        探测.once('error', 失败);
        探测.listen(端口, '127.0.0.1', 完成);
      });
      return 探测.address().port;
    } catch {
      return 0;
    } finally {
      await new Promise((完成) => 探测.close(完成));
    }
  };
  return (await 试(首选)) || 试(0);
}

const CDP端口 = await 取空闲端口(9494);
const 站点端口 = await 取空闲端口(15994);
const 地址 = `http://127.0.0.1:${站点端口}/`;

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: 项目根,
  stdio: 'pipe',
});
服务.stdout.resume();
服务.stderr.resume();
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(地址, { signal: AbortSignal.timeout(1000) })).ok) break;
  } catch {}
  await pause(100);
}

const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${临时目录}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
    地址,
  ],
  { stdio: 'ignore' },
);

async function 主() {
  let 目标 = null;
  for (let i = 0; i < 150 && !目标; i++) {
    try {
      const 列表 = await (
        await fetch(`http://127.0.0.1:${CDP端口}/json`)
      ).json();
      目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
    } catch {}
    await pause(200);
  }
  if (!目标) throw new Error('未找到 headless Chrome 页面');

  const ws = new WebSocket(目标.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let 消息号 = 0;
  const 待回复 = new Map();
  ws.addEventListener('message', (事件) => {
    const 消息 = JSON.parse(事件.data);
    if (!消息.id) return;
    const 请求 = 待回复.get(消息.id);
    待回复.delete(消息.id);
    if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
    else 请求.resolve(消息.result);
  });
  function 发送(方法, 参数 = {}) {
    return new Promise((解决, 拒绝) => {
      const 下标 = ++消息号;
      待回复.set(下标, { resolve: 解决, reject: 拒绝 });
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
      throw new Error(
        结果.exceptionDetails.exception?.description ||
          JSON.stringify(结果.exceptionDetails),
      );
    return 结果.result.value;
  }

  for (let i = 0; i < 600; i++) {
    const 就绪 = await 求值(`
      return !!document.querySelector('#内容选择按钮') &&
        (document.querySelector('#载入状态')?.hidden ?? true);
    `);
    if (就绪) break;
    await pause(200);
  }
  await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
  for (let i = 0; i < 150; i++) {
    const 有 = await 求值(`
      return [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
        .some((b) => b.dataset.fileName === ${JSON.stringify(目标文本)});
    `);
    if (有) break;
    await pause(200);
  }
  await 求值(`
    [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
      .find((b) => b.dataset.fileName === ${JSON.stringify(目标文本)}).click();
    return 1;
  `);
  for (let i = 0; i < 600; i++) {
    const 好 = await 求值(`
      const { 状态 } = await import('./js/状态.js');
      return 状态.文件名 === ${JSON.stringify(目标文本)} && 状态.行起点列表.length > 100;
    `);
    if (好) break;
    await pause(200);
  }
  // 用户那套深色配色，与反馈截图一致
  await 求值(`
    const { 设置页面背景色, 设置纸面色 } = await import('./js/字体设置.js');
    设置页面背景色('#4d4d4d', { 静默: true });
    设置纸面色('#000000', { 静默: true });
    return 1;
  `);
  for (const 词 of [关键词, 额外关键词].filter(Boolean)) {
    await 求值(`
      const { 添加关键词标记 } = await import('./js/关键词.js');
      const { 状态 } = await import('./js/状态.js');
      添加关键词标记(${JSON.stringify(词)}, 状态.文本.indexOf(${JSON.stringify(词)}));
      return 1;
    `);
  }
  await 求值(`
    const { 元素 } = await import('./js/状态.js');
    元素.滚动容器.scrollTop = 元素.滚动容器.scrollHeight * ${位置};
    return 1;
  `);
  await pause(900);

  const 度量 = await 求值(`
    const q = (s) => document.querySelector(s);
    const 列盒 = (选择器) => {
      const 元素 = q(选择器);
      if (!元素) return null;
      const b = 元素.getBoundingClientRect();
      return { x: Math.round(b.x * 10) / 10, w: Math.round(b.width * 10) / 10,
        right: Math.round(b.right * 10) / 10, hidden: 元素.hidden };
    };
    return {
      白轴: Math.round(q('#章节轨道').getBoundingClientRect().width * 10) / 10,
      章节列表: (await import('./js/状态.js')).状态.章节列表.length,
      章节刻度: 列盒('#章节刻度'),
      滚动进度: 列盒('#滚动进度'),
      关键词指示器: 列盒('#关键词指示器'),
      悬停指示器: 列盒('#悬停关键词指示器'),
      首字左缘: Math.min(...[...document.querySelectorAll('.正文行')]
        .filter((r) => r.querySelector('.字'))
        .map((r) => r.querySelector('.字').getBoundingClientRect().left)),
    };
  `);
  console.log(JSON.stringify(度量, null, 1));

  const { data } = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 130, height: 1000, scale: 1 },
  });
  writeFileSync(
    resolve(import.meta.dirname, '三列平分-左缘.png'),
    Buffer.from(data, 'base64'),
  );
  const { data: 放大 } = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 250, width: 120, height: 260, scale: 4 },
  });
  writeFileSync(
    resolve(import.meta.dirname, '三列平分-放大.png'),
    Buffer.from(放大, 'base64'),
  );
  console.log('已写 tmp/三列平分-左缘.png、tmp/三列平分-放大.png');
}

let 错误 = null;
try {
  await 主();
} catch (e) {
  错误 = e;
} finally {
  chrome.kill();
  服务.kill();
  await pause(1000);
  rmSync(临时目录, { recursive: true, force: true });
  if (existsSync(临时目录)) {
    console.error('临时浏览器 profile 清理失败，仍存在:', 临时目录);
    process.exitCode = 1;
  } else {
    console.log('临时 profile 已清理:', 临时目录);
  }
}
if (错误) {
  console.error(错误);
  process.exit(1);
}
