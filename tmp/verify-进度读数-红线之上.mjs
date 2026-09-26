// 左缘进度读数实测：数字整列排在红色指针线之上（不再被横线穿过），
// 且显示格式为 ??.?%（一位小数 + 百分号）。
// 跑法：node tmp/verify-进度读数-红线之上.mjs  [BOOK=从0到1：开启商业与未来的秘密.txt]
// 按 AGENTS.md：profile 路径存下来，成功/异常/超时都走 finally 删除并确认不存在。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const 项目根 = resolve(import.meta.dirname, '..');
const 目标文本 = process.env.BOOK || '从0到1：开启商业与未来的秘密.txt';
const 窗口 = (process.env.SIZE || '1440,1000').split(',').map(Number);

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
  return (await 试(首选)) || (await 试(0));
}

function 清理遗留profile(跳过) {
  for (const 名 of readdirSync(tmpdir())) {
    if (!名.startsWith('reader-')) continue;
    const 路径 = join(tmpdir(), 名);
    if (路径 === 跳过) continue;
    try {
      execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
      continue;
    } catch {}
    rmSync(路径, { recursive: true, force: true });
  }
}

const CDP端口 = await 取空闲端口(9471);
const 站点端口 = await 取空闲端口(15971);
const 地址 = `http://127.0.0.1:${站点端口}/`;
const profile = mkdtempSync(join(tmpdir(), 'reader-progress-readout-'));
清理遗留profile(profile);

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: 项目根,
  stdio: 'ignore',
});
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${窗口[0]},${窗口[1]}`,
    地址,
  ],
  { stdio: 'ignore' },
);
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));
const 控制台错误 = [];
let ws = null;
let 消息号 = 0;
const 待回复 = new Map();

function 发送(方法, 参数 = {}) {
  return new Promise((解决, 拒绝) => {
    const 下标 = ++消息号;
    const 计时器 = setTimeout(() => {
      待回复.delete(下标);
      拒绝(new Error(`CDP 超时: ${方法}`));
    }, 30_000);
    待回复.set(下标, {
      resolve: (v) => (clearTimeout(计时器), 解决(v)),
      reject: (e) => (clearTimeout(计时器), 拒绝(e)),
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
    throw new Error(
      结果.exceptionDetails.exception?.description ||
        JSON.stringify(结果.exceptionDetails),
    );
  return 结果.result.value;
}

async function 连接页面() {
  for (let i = 0; i < 300; i++) {
    try {
      const 列表 = await (
        await fetch(`http://127.0.0.1:${CDP端口}/json`)
      ).json();
      const 目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
      if (!目标) {
        await pause(200);
        continue;
      }
      ws = new WebSocket(目标.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener('open', r, { once: true }));
      ws.addEventListener('message', (事件) => {
        const 消息 = JSON.parse(事件.data);
        if (消息.method === 'Runtime.consoleAPICalled' && 消息.params.type === 'error')
          控制台错误.push(
            消息.params.args.map((a) => a.value ?? a.description).join(' '),
          );
        if (消息.method === 'Log.entryAdded' && 消息.params.entry.level === 'error')
          控制台错误.push(消息.params.entry.text);
        if (!消息.id) return;
        const 请求 = 待回复.get(消息.id);
        待回复.delete(消息.id);
        if (!请求) return;
        if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
        else 请求.resolve(消息.result);
      });
      await 发送('Runtime.enable');
      await 发送('Log.enable');
      return;
    } catch {
      await pause(200);
    }
  }
  throw new Error('headless Chrome 页面未就绪');
}

async function 载入一本书() {
  for (let i = 0; i < 300; i++) {
    if (
      await 求值(`
        return !!document.querySelector('#内容选择按钮') &&
          (document.querySelector('#载入状态')?.hidden ?? true);`)
    )
      break;
    await pause(200);
  }
  await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
  for (let i = 0; i < 200; i++) {
    if (
      await 求值(`
        return [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
          .some((b) => b.dataset.fileName === ${JSON.stringify(目标文本)});`)
    )
      break;
    await pause(200);
  }
  await 求值(`
    [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
      .find((b) => b.dataset.fileName === ${JSON.stringify(目标文本)}).click();
    return 1;`);
  for (let i = 0; i < 900; i++) {
    if (
      await 求值(`
        const { 状态 } = await import('./js/状态.js');
        return 状态.文件名 === ${JSON.stringify(目标文本)} && 状态.行起点列表.length > 100;`)
    )
      return;
    await pause(200);
  }
  throw new Error(`未能载入 ${目标文本}`);
}

async function 截(名字, x, 宽度, 高度, scale = 4) {
  const { data } = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x, y: 0, width: 宽度, height: 高度, scale },
  });
  writeFileSync(resolve(import.meta.dirname, 名字), Buffer.from(data, 'base64'));
}

// 一次量全：读数文本、数字列盒、读数盒（=红线所在）、期望锚点、轨道可视高
const 量读数 = () =>
  求值(`
    const { 状态, 元素 } = await import('./js/状态.js');
    const { 读取滚动条度量, 滚动位置转轨道中心 } = await import('./js/滚动条.js');
    const 容器 = 元素.滚动容器;
    const 轨道高度 = 容器.clientHeight;
    const 度量 = 读取滚动条度量(轨道高度, 容器.clientHeight, 容器.scrollHeight);
    const 进度 = Math.min(1, Math.max(0, 容器.scrollTop / 度量.最大滚动位置));
    const 期望锚点 = 滚动位置转轨道中心(容器.scrollTop, 度量);
    const 根 = getComputedStyle(document.documentElement);
    const 盒 = (e) => { const b = e.getBoundingClientRect();
      return { 上: b.top, 下: b.bottom, 高: b.height, 左: b.left, 宽: b.width }; };
    return {
      文本: 元素.滚动百分比.textContent,
      title: 元素.滚动进度.getAttribute('title'),
      valuenow: 元素.滚动进度.getAttribute('aria-valuenow'),
      数字: 盒(元素.滚动百分比),
      读数: 盒(元素.滚动进度),
      期望锚点, 轨道高度,
      进度读数高度: 状态.进度读数高度,
      指针间距: parseFloat(根.getPropertyValue('--进度指针间距')),
      线top: getComputedStyle(元素.滚动进度, '::before').top,
      线高: getComputedStyle(元素.滚动进度, '::before').height,
      竖排: getComputedStyle(元素.滚动百分比).writingMode,
    };`);

async function 滚到(比例) {
  await 求值(`
    const { 元素 } = await import('./js/状态.js');
    const 容器 = 元素.滚动容器;
    容器.scrollTop = (容器.scrollHeight - 容器.clientHeight) * ${比例};
    return 容器.scrollTop;`);
  await pause(500);
}

let 失败 = null;
try {
  await 连接页面();
  await 载入一本书();
  await pause(600);

  const 格式 = /^\d+\.\d%$/;
  const 用例 = [
    [0, '书首'],
    [0.03, '3%'],
    [0.35, '35%'],
    [0.999, '文末前'],
    [1, '书尾'],
  ];
  const 记录 = [];
  for (const [比例, 名] of 用例) {
    await 滚到(比例);
    const 量 = await 量读数();
    记录.push([名, 量]);
    console.log(
      `${名}: 文本=${量.文本} 数字[${量.数字.上.toFixed(1)}, ${量.数字.下.toFixed(1)}] ` +
        `读数盒[${量.读数.上.toFixed(1)}, ${量.读数.下.toFixed(1)}] 锚点=${量.期望锚点.toFixed(1)} ` +
        `线top=${量.线top} 状态高=${量.进度读数高度}`,
    );

    // —— 1. 格式 ??.?% ——
    assert.match(量.文本, 格式, `${名}：进度读数格式应为 ??.?%，实得「${量.文本}」`);
    assert.match(
      量.title ?? '',
      /^阅读进度 \d+\.\d%$/,
      `${名}：title 应带同一份读数：${量.title}`,
    );
    assert.match(
      量.valuenow ?? '',
      /^\d+\.\d$/,
      `${名}：aria-valuenow 应为不带百分号的一位小数：${量.valuenow}`,
    );
    assert.equal(量.竖排, 'vertical-rl', `${名}：读数仍是竖排 upright 一列`);

    // —— 2. 数字整列在红线之上 ——
    const 红线中心 = 量.读数.下; // ::before 在盒底边、translateY(-50%) 居中
    assert.ok(
      Math.abs(parseFloat(量.线top) - 量.读数.高) <= 1,
      `${名}：横线应钉在读数盒底边：top=${量.线top} vs 盒高 ${量.读数.高}`,
    );
    assert.ok(
      量.数字.下 <= 红线中心 - 量.指针间距 / 2,
      `${名}：数字底缘要留在红线之上，实得数字底 ${量.数字.下.toFixed(1)} vs 线 ${红线中心.toFixed(1)}`,
    );
    assert.ok(
      Math.abs(量.读数.高 - (量.数字.高 + 量.指针间距)) <= 1,
      `${名}：读数盒高应 = 数字列高 + 指针间距：${量.读数.高} vs ${量.数字.高}+${量.指针间距}`,
    );

    // —— 3. 不被视口裁掉、且锚在轨道内 ——
    assert.ok(量.数字.上 >= -0.5, `${名}：数字顶部被裁：${量.数字.上}`);
    assert.ok(
      量.读数.下 <= 量.轨道高度 + 0.5,
      `${名}：读数底边越过轨道：${量.读数.下} vs ${量.轨道高度}`,
    );
    assert.ok(量.读数.上 >= -0.5, `${名}：读数盒顶越过轨道顶：${量.读数.上}`);

    // —— 4. 未夹取时红线仍指在真实进度上 ——
    const 夹住 = 量.期望锚点 < 量.进度读数高度 || 量.期望锚点 > 量.轨道高度;
    if (!夹住) {
      assert.ok(
        Math.abs(量.读数.下 - 量.期望锚点) <= 1,
        `${名}：红线偏离真实进度 ${量.读数.下} vs ${量.期望锚点}`,
      );
    }
  }

  // 中间档截一张左缘放大图，肉眼确认「数字在上、红线在下」
  await 滚到(0.35);
  const 中 = await 量读数();
  const 截图高 = Math.min(窗口[1], 中.读数.下 + 40);
  await 截('进度读数-红线之上-35.png', 0, 中.读数.宽 + 40, 截图高);
  await 滚到(1);
  const 尾 = await 量读数();
  await 截('进度读数-红线之上-100.png', 0, 尾.读数.宽 + 40, Math.min(窗口[1], 尾.读数.下 + 40));
  await 滚到(0);
  const 首 = await 量读数();
  await 截('进度读数-红线之上-0.png', 0, 首.读数.宽 + 40, Math.min(窗口[1], 首.读数.下 + 40));
  await 截('进度读数-红线之上-整页.png', 0, 窗口[0], 窗口[1], 1);

  const 噪音 = (条) => /wss:\/\/localhost:15941|ERR_CERT_AUTHORITY_INVALID/.test(条);
  const 真错误 = 控制台错误.filter((条) => !噪音(条));
  assert.deepEqual(真错误, [], `控制台不应报错：${真错误.join(' | ')}`);
  console.log('\n全部通过：格式 ??.?%、数字整列在红线之上、两端不被裁、红线钉在真实进度');
} catch (错误) {
  失败 = 错误;
  console.error(错误);
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  服务.kill();
  await Promise.race([
    Promise.all([
      new Promise((r) => chrome.on('exit', r)),
      new Promise((r) => 服务.on('exit', r)),
    ]),
    pause(4000),
  ]);
  chrome.kill('SIGKILL');
  服务.kill('SIGKILL');
  await pause(500);
  rmSync(profile, { recursive: true, force: true });
  if (existsSync(profile)) {
    console.error('profile 清理失败，目录仍存在:', profile);
    失败 ??= new Error('profile 未清理');
  } else {
    console.log('profile 已清理:', profile);
  }
  清理遗留profile(null);
}
process.exitCode = 失败 ? 1 : 0;
