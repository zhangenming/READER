// 校验：右侧滚动轴整体已删除 —— 页面上不存在轨道/滚动块/进度指针，正文铺到视口右缘，
// 右缘任意高度都命中正文；滚动条语义（role/tab/aria/拖动/滚轮/键盘）搬到左缘那枚竖排读数上。
// 跑法：node tmp/verify-右侧白竖条.mjs  [BOOK=解放战争（套装共6册）.txt] [AT=0.3]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const 项目根 = resolve(import.meta.dirname, '..');
const 目标文本 = process.env.BOOK || '解放战争（套装共6册）.txt';
const 位置 = Number(process.env.AT || 0.3);
const 临时目录 = mkdtempSync(join(tmpdir(), 'reader-railbg-'));
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

const CDP端口 = await 取空闲端口(9492);
const 站点端口 = await 取空闲端口(15992);
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

  // 用户那套配色：页面背景中灰、纸面全黑 —— 右缘只要还剩一条通道就会显形
  await 求值(`
    const { 设置页面背景色, 设置纸面色 } = await import('./js/字体设置.js');
    设置页面背景色('#4d4d4d', { 静默: true });
    设置纸面色('#000000', { 静默: true });
    return 1;
  `);
  await 求值(`
    const { 元素 } = await import('./js/状态.js');
    元素.滚动容器.scrollTop = 元素.滚动容器.scrollHeight * ${位置};
    return 1;
  `);
  await pause(800);

  const 度量 = await 求值(`
    const q = (s) => document.querySelector(s);
    const 画布 = q('#虚拟画布').getBoundingClientRect();
    const 读数盒 = q('#滚动进度');
    const 读数 = 读数盒.getBoundingClientRect();
    const 描述 = (e) =>
      e ? (e.tagName + '.' + (e.id || e.className)).slice(0, 60) : null;
    return {
      视口: [innerWidth, innerHeight],
      轨道节点: ['自定义滚动条', '滚动块', '进度指针'].filter((id) => q('#' + id)),
      阅读区域右内边距: getComputedStyle(q('.阅读区域')).paddingRight,
      画布右缘: Math.round(画布.right),
      读数: {
        x: Math.round(读数.x + 读数.width / 2),
        y: Math.round(读数.y + 读数.height / 2),
        role: 读数盒.getAttribute('role'),
        tabindex: 读数盒.getAttribute('tabindex'),
        valuenow: 读数盒.getAttribute('aria-valuenow'),
        title: 读数盒.getAttribute('title'),
        文本: q('#滚动百分比').textContent,
      },
    };
  `);
  console.log(JSON.stringify(度量, null, 1));
  assert.deepEqual(度量.轨道节点, [], '右侧轨道、滚动块、镜像指针都不再存在');
  assert.equal(度量.阅读区域右内边距, '0px', '右侧不预留通道');
  assert.equal(
    度量.画布右缘,
    度量.视口[0],
    `正文纸面必须铺到视口右缘：${度量.画布右缘} vs ${度量.视口[0]}`,
  );
  assert.equal(度量.读数.role, 'scrollbar', '滚动条语义搬到左缘读数');
  assert.equal(度量.读数.tabindex, '0', '读数可聚焦');
  assert.match(度量.读数.valuenow ?? '', /^\d+\.\d$/, 'aria-valuenow 随进度更新（一位小数）');
  assert.match(度量.读数.title ?? '', /^阅读进度 \d+\.\d%$/, '单位仍在悬停提示里');

  // 轨道覆盖区在任意高度都不接事件：命中测试要落到正文
  for (const 比例 of [0.15, 0.5, 0.85]) {
    const 命中 = await 求值(`
      const e = document.elementFromPoint(innerWidth - 10, Math.round(innerHeight * ${比例}));
      return e ? (e.tagName + '.' + (e.id || e.className)).slice(0, 60) : null;
    `);
    assert.ok(
      !/自定义滚动条|滚动块|进度指针/.test(命中 ?? ''),
      `右缘 ${比例}H 要命中正文：${命中}`,
    );
    console.log(`右缘 ${比例}H 命中:`, 命中);
  }

  // 拖动进度：左缘读数按下拖动要改变 scrollTop
  const 读数指针 = (轴, 类型, 按下) =>
    求值(`
      document.querySelector('#滚动进度').dispatchEvent(new PointerEvent(${JSON.stringify(类型)}, {
        pointerId: 11, clientX: ${度量.读数.x}, clientY: ${轴}, bubbles: true, isPrimary: true,
        buttons: ${按下 ? 1 : 0}, button: 0 }));
      return 1;
    `);
  const 拖前 = await 求值(
    `return (await import('./js/状态.js')).元素.滚动容器.scrollTop;`,
  );
  await 读数指针(度量.读数.y, 'pointerdown', true);
  await 读数指针(Math.round(度量.视口[1] * 0.8), 'pointermove', true);
  await 读数指针(Math.round(度量.视口[1] * 0.8), 'pointerup', false);
  await pause(400);
  const 拖后 = await 求值(
    `return (await import('./js/状态.js')).元素.滚动容器.scrollTop;`,
  );
  assert.ok(
    Math.abs(拖后 - 拖前) > 100,
    `左缘读数要能拖动滚动：${拖前} → ${拖后}`,
  );

  // 滚轮落在读数上也要滚
  await 求值(`
    const { 元素 } = await import('./js/状态.js');
    元素.滚动容器.scrollTop = 元素.滚动容器.scrollHeight * ${位置};
    return 1;
  `);
  await pause(300);
  const 滚前 = await 求值(
    `return (await import('./js/状态.js')).元素.滚动容器.scrollTop;`,
  );
  await 求值(`
    document.querySelector('#滚动进度').dispatchEvent(new WheelEvent('wheel', {
      deltaY: 600, bubbles: true, cancelable: true }));
    return 1;
  `);
  await pause(300);
  const 滚后 = await 求值(
    `return (await import('./js/状态.js')).元素.滚动容器.scrollTop;`,
  );
  assert.ok(滚后 > 滚前, `读数上的滚轮要能滚动正文：${滚前} → ${滚后}`);

  // 键盘：聚焦读数按 End 跳到书尾
  await 求值(`document.querySelector('#滚动进度').focus(); return 1;`);
  await 求值(`
    document.querySelector('#滚动进度').dispatchEvent(new KeyboardEvent('keydown', {
      key: 'End', bubbles: true, cancelable: true }));
    return 1;
  `);
  await pause(300);
  const 末尾 = await 求值(`
    const { 元素 } = await import('./js/状态.js');
    return { 顶: 元素.滚动容器.scrollTop,
      最大: 元素.滚动容器.scrollHeight - 元素.滚动容器.clientHeight };
  `);
  assert.ok(
    Math.abs(末尾.顶 - 末尾.最大) <= 2,
    `读数聚焦时 End 要跳到书尾：${JSON.stringify(末尾)}`,
  );

  // 读数与章节刻度在书首书尾都不被视口裁掉
  for (const [说明, 顶] of [['书首', 0], ['书尾', 1e9]]) {
    await 求值(
      `(await import('./js/状态.js')).元素.滚动容器.scrollTop = ${顶}; return 1;`,
    );
    await pause(400);
    const 端点 = await 求值(`
      const b = (await import('./js/状态.js')).元素.滚动百分比.getBoundingClientRect();
      return { 上: Math.round(b.top), 下: Math.round(b.bottom), 视口高: innerHeight };
    `);
    assert.ok(
      端点.上 >= -1 && 端点.下 <= 端点.视口高 + 1,
      `${说明}读数被视口裁掉：${JSON.stringify(端点)}`,
    );
  }

  await 求值(`
    const { 元素 } = await import('./js/状态.js');
    元素.滚动容器.scrollTop = 元素.滚动容器.scrollHeight * ${位置};
    return 1;
  `);
  await pause(600);
  const { data } = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: {
      x: 度量.视口[0] - 160,
      y: 0,
      width: 160,
      height: 度量.视口[1],
      scale: 1,
    },
  });
  writeFileSync(
    resolve(import.meta.dirname, '右侧白竖条-深色.png'),
    Buffer.from(data, 'base64'),
  );
  console.log('已写 tmp/右侧白竖条-深色.png');
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
