// 左缘进度读数的四条不变量（headless Chrome 实测）：
//   ① 格式 ??.?%（一位小数 + 百分号）
//   ② 横向一行、正红，且排在红色指针线之上（线仍钉在真实进度位置）
//   ③ 数字永远不溢出白轴 —— 轴窄就压字号，绝不压到正文首字上
//   ④ 书首书尾整枚读数夹在轨道内，不被视口裁掉
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

// 一次量全：文本/颜色/字号、数字列盒、读数盒（盒底边 = 红线）、期望锚点、正文首字左缘。
// 期望锚点直接取 更新滚动块位置() 的返回值：轨道高度怎么来的（视口高 / 扣掉两条白线的
// 正文可视高）由 js/滚动条.js 自己定，测试不跟着抄一遍，免得它改了这里就假失败。
const 量读数 = () =>
  求值(`
    const { 状态, 元素 } = await import('./js/状态.js');
    const { 更新滚动块位置 } = await import('./js/滚动条.js');
    const 块 = 更新滚动块位置();
    const 根 = getComputedStyle(document.documentElement);
    const 盒 = (e) => { const b = e.getBoundingClientRect();
      return { 上: b.top, 下: b.bottom, 高: b.height, 左: b.left, 右: b.right, 宽: b.width }; };
    const 首行 = [...document.querySelectorAll('.正文行')].find((r) => r.childElementCount);
    return {
      文本: 元素.滚动百分比.textContent,
      title: 元素.滚动进度.getAttribute('title'),
      valuenow: 元素.滚动进度.getAttribute('aria-valuenow'),
      数字: 盒(元素.滚动百分比),
      读数: 盒(元素.滚动进度),
      期望锚点: 块?.读数中心 ?? null,
      轨道高度: 块?.轨道高度 ?? null,
      进度读数高度: 状态.进度读数高度,
      指针间距: parseFloat(根.getPropertyValue('--进度指针间距')),
      字号: parseFloat(getComputedStyle(元素.滚动进度).fontSize),
      数字色: getComputedStyle(元素.滚动进度).color,
      线色: getComputedStyle(元素.滚动进度, '::before').backgroundColor,
      线top: getComputedStyle(元素.滚动进度, '::before').top,
      竖排: getComputedStyle(元素.滚动百分比).writingMode,
      行高: getComputedStyle(元素.滚动百分比).lineHeight,
      轴宽: 元素.章节轨道.getBoundingClientRect().width,
      首字左: 首行 ? 首行.firstElementChild.getBoundingClientRect().left : null,
    };`);

async function 滚到(比例) {
  await 求值(`
    const { 元素 } = await import('./js/状态.js');
    const 容器 = 元素.滚动容器;
    容器.scrollTop = (容器.scrollHeight - 容器.clientHeight) * ${比例};
    return 容器.scrollTop;`);
  await pause(500);
}

// 四条不变量一起判，返回量到的数据供打印
function 判(名, 量) {
  console.log(
    `${名}: 「${量.文本}」 字号${量.字号} 数字[${量.数字.左.toFixed(1)}→${量.数字.右.toFixed(1)}]×` +
      `[${量.数字.上.toFixed(1)}→${量.数字.下.toFixed(1)}] 轴宽${量.轴宽} 读数盒高${量.读数.高} ` +
      `锚点${量.期望锚点?.toFixed(1)} 线在${量.读数.下.toFixed(1)}`,
  );
  // ① 格式
  assert.match(量.文本, /^\d+\.\d%$/, `${名}：格式应为 ??.?%，实得「${量.文本}」`);
  assert.match(量.title, /^阅读进度 \d+\.\d%$/, `${名}：title 同读数：${量.title}`);
  assert.match(
    量.valuenow,
    /^\d+\.\d$/,
    `${名}：aria-valuenow 不带百分号：${量.valuenow}`,
  );
  // ② 横向 + 正红 + 在线之上
  assert.equal(量.竖排, 'horizontal-tb', `${名}：读数应横向一行`);
  assert.equal(量.数字色, 'rgb(255, 0, 0)', `${名}：数字应正红，实得 ${量.数字色}`);
  assert.equal(量.线色, 'rgb(255, 0, 0)', `${名}：横线应正红，实得 ${量.线色}`);
  assert.ok(
    Math.abs(parseFloat(量.线top) - 量.读数.高) <= 1,
    `${名}：横线应钉在盒底边：top=${量.线top} vs 盒高 ${量.读数.高}`,
  );
  assert.ok(
    量.数字.下 <= 量.读数.下 - 量.指针间距 / 2,
    `${名}：数字要在红线之上：数字底 ${量.数字.下.toFixed(1)} vs 线 ${量.读数.下.toFixed(1)}`,
  );
  // ③ 不溢出白轴、不压正文首字
  assert.ok(
    量.数字.左 >= 量.读数.左 - 0.5 && 量.数字.右 <= 量.读数.右 + 0.5,
    `${名}：数字溢出白轴（会压住正文）：[${量.数字.左.toFixed(1)}, ${量.数字.右.toFixed(1)}] vs 轴 [${量.读数.左}, ${量.读数.右.toFixed(1)}]`,
  );
  if (量.首字左 !== null)
    assert.ok(
      量.数字.右 <= 量.首字左 + 0.5,
      `${名}：数字压到正文首字：${量.数字.右.toFixed(1)} > ${量.首字左.toFixed(1)}`,
    );
  // ④ 夹在轨道内 + 未夹取处红线指在真实进度上
  assert.ok(量.数字.上 >= -0.5, `${名}：数字被视口顶边裁掉：${量.数字.上}`);
  assert.ok(
    量.期望锚点 !== null && 量.轨道高度 !== null,
    `${名}：更新滚动块位置() 没返回读数状态，量不了`,
  );
  assert.ok(
    量.读数.下 <= 量.轨道高度 + 0.5 && 量.读数.上 >= -0.5,
    `${名}：读数越出轨道：[${量.读数.上.toFixed(1)}, ${量.读数.下.toFixed(1)}] vs 轨道高 ${量.轨道高度}`,
  );
  if (量.期望锚点 > 量.进度读数高度 && 量.期望锚点 < 量.轨道高度)
    assert.ok(
      Math.abs(量.读数.下 - 量.期望锚点) <= 1,
      `${名}：红线偏离真实进度：${量.读数.下.toFixed(1)} vs ${量.期望锚点.toFixed(1)}`,
    );
}

let 失败 = null;
try {
  await 连接页面();
  await 载入一本书();
  await pause(600);

  // —— 1. 五档进度：格式 / 横向 / 正红 / 线之上 / 不裁 ——
  for (const [比例, 名] of [
    [0, '书首'],
    [0.03, '3%'],
    [0.35, '35%'],
    [0.999, '文末前'],
    [1, '书尾'],
  ]) {
    await 滚到(比例);
    判(名, await 量读数());
  }

  const 中 = await 量读数();
  await 滚到(0.35);
  await 截('进度读数-横向-35.png', 0, 中.读数.宽 + 60, 窗口[1]);

  // —— 2. 视口扫一遍：轴宽随视口跳，字号必须跟着压、且始终不溢出 ——
  const 轴宽集 = new Set();
  for (const [宽, 高] of [
    [1440, 1000],
    [1200, 900],
    [980, 820],
    [760, 700],
    [520, 700],
    [375, 780],
  ]) {
    await 发送('Emulation.setDeviceMetricsOverride', {
      width: 宽,
      height: 高,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await 求值(`window.dispatchEvent(new Event('resize')); return 1;`);
    await pause(1200);
    await 滚到(0.42);
    const 量 = await 量读数();
    轴宽集.add(Math.round(量.轴宽));
    判(`视口 ${宽}×${高}`, 量);
    assert.ok(
      量.字号 <= 12 + 1e-6,
      `视口 ${宽}：字号不该超过上限 12px，实得 ${量.字号}`,
    );
    assert.ok(
      量.字号 <= 量.轴宽 / 3.9 + 0.01,
      `视口 ${宽}：字号没跟着轴宽压（${量.字号} vs 轴宽 ${量.轴宽}）`,
    );
  }
  await 发送('Emulation.clearDeviceMetricsOverride');
  await 求值(`window.dispatchEvent(new Event('resize')); return 1;`);
  await pause(1200);
  console.log('扫过的白轴宽度:', [...轴宽集].sort((a, b) => a - b).join('px, ') + 'px');

  // —— 3. 字号档位扫一遍（走 重建行索引，和白轴一列那条用例同一路子）——
  for (const 字号 of [16, 24, 44]) {
    await 求值(`
      document.documentElement.style.setProperty('--正文字号', '${字号}px');
      document.documentElement.style.setProperty('--行高', '${字号}px');
      (await import('./js/排版引擎.js')).重建行索引();
      return 1;`);
    await pause(1400);
    await 滚到(0.42);
    const 量 = await 量读数();
    判(`正文字号 ${字号}`, 量);
  }
  await 求值(`
    document.documentElement.style.removeProperty('--正文字号');
    document.documentElement.style.removeProperty('--行高');
    (await import('./js/排版引擎.js')).重建行索引();
    return 1;`);
  await pause(1400);

  // —— 4. 最窄那一档留一张放大图，肉眼确认「小但不遮字」 ——
  await 发送('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 780,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await 求值(`window.dispatchEvent(new Event('resize')); return 1;`);
  await pause(1400);
  await 滚到(0.42);
  const 窄 = await 量读数();
  判('窄视口留图', 窄);
  await 截('进度读数-横向-窄375.png', 0, 窄.读数.宽 + 60, 780);
  await 发送('Emulation.clearDeviceMetricsOverride');

  const 噪音 = (条) => /wss:\/\/localhost:15941|ERR_CERT_AUTHORITY_INVALID/.test(条);
  const 真错误 = 控制台错误.filter((条) => !噪音(条));
  assert.deepEqual(真错误, [], `控制台不应报错：${真错误.join(' | ')}`);
  console.log(
    '\n全部通过：??.?% 横向正红、排在红线之上、字号随轴宽压小、任何档位都不溢出白轴压正文',
  );
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
