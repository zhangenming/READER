// 校验：行尾不留空隙 —— 正文最后一个字紧贴视口右缘，原先 0.42em 的右留白挪到了行首。
// 同时确认折行句竖条 / 首处标记 ◀ 在加宽的行首留白里没被裁掉，排版内容宽度与 padding 同步。
// 行首留白已整体划给左缘白轴：#章节轨道 白底吞下这段，首字应紧贴白轴右缘，中间不再露出段落色带。
// 跑法：node tmp/verify-行尾空隙.mjs  [BOOK=解放战争（套装共6册）.txt] [AT=0.3]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const 项目根 = resolve(import.meta.dirname, '..');
const 目标文本 = process.env.BOOK || '解放战争（套装共6册）.txt';
const 位置 = Number(process.env.AT || 0.3);
const 临时目录 = mkdtempSync(join(tmpdir(), 'reader-edgegap-'));
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

const CDP端口 = await 取空闲端口(9493);
const 站点端口 = await 取空闲端口(15993);
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
  // 用户那套配色：纸面全黑，右缘裁图里非黑像素即正文墨迹
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
  await pause(900);

  const 度量 = await 求值(`
    const q = (s) => document.querySelector(s);
    const 变量 = (名) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(名));
    // calc() 形式的自定义属性 parseFloat 不动（返回 NaN），用探针元素量出实际像素
    const 变量px = (名) => {
      const 探针 = document.createElement('div');
      探针.style.cssText = 'position:absolute;visibility:hidden;width:var(' + 名 + ');';
      document.body.append(探针);
      const 宽 = 探针.getBoundingClientRect().width;
      探针.remove();
      return 宽;
    };
    const 列盒 = (选择器) => {
      const 元素 = q(选择器);
      if (!元素) return null;
      const b = 元素.getBoundingClientRect();
      return {
        x: Math.round(b.x * 10) / 10,
        w: Math.round(b.width * 10) / 10,
        right: Math.round(b.right * 10) / 10,
        hidden: 元素.hidden,
      };
    };
    const 行样式 = getComputedStyle(q('.正文行'));
    const 行们 = [...document.querySelectorAll('.可见内容 .正文行')].filter(
      (r) => r.getBoundingClientRect().bottom > 0 && r.getBoundingClientRect().top < innerHeight,
    );
    let 最右末字 = 0, 最左首字 = Infinity, 满行末字 = [];
    let 行尾标记 = 0, 出界标记 = 0;
    for (const 行 of 行们) {
      const 字 = [...行.querySelectorAll('.字')];
      if (!字.length) continue;
      const 末 = 字[字.length - 1];
      const 末盒 = 末.getBoundingClientRect();
      最右末字 = Math.max(最右末字, 末盒.right);
      最左首字 = Math.min(最左首字, 字[0].getBoundingClientRect().left);
      满行末字.push(Math.round(末盒.right));
      const 标记 = 末.querySelector('.末处标记');
      if (标记) {
        行尾标记++;
        if (标记.getBoundingClientRect().right > innerWidth + 0.5) 出界标记++;
      }
    }
    满行末字.sort((a, b) => b - a);
    return {
      视口: [innerWidth, innerHeight],
      正文字号: 变量('--正文字号'),
      正文左留白: 变量('--正文左留白'),
      标记留白比例: 变量('--末处标记留白比例'),
      行内边距: { 左: 行样式.paddingLeft, 右: 行样式.paddingRight },
      章节轨道宽度: Math.round(q('#章节轨道').getBoundingClientRect().width),
      章节轨道变量: 变量px('--章节轨道宽度'),
      章节刻度: 列盒('#章节刻度'),
      滚动进度: 列盒('#滚动进度'),
      关键词指示器: 列盒('#关键词指示器'),
      行盒右缘: Math.round(q('.正文行').getBoundingClientRect().right),
      最右末字: Math.round(最右末字),
      最左首字: Math.round(最左首字),
      末字右缘前三档: 满行末字.slice(0, 3),
      行尾标记数: 行尾标记,
      标记出屏数: 出界标记,
      可见行数: 行们.length,
    };
  `);
  console.log(JSON.stringify(度量, null, 1));

  const 容差 = 3;
  assert.equal(度量.行内边距.右, '0px', '行尾不留 padding');
  assert.equal(度量.行盒右缘, 度量.视口[0], '行内容盒必须铺到视口右缘');
  assert.ok(
    度量.最右末字 >= 度量.视口[0] - 度量.正文字号 - 容差,
    `满行的最后一个字要紧贴右缘（余量不足一个字号）：${度量.最右末字} vs ${度量.视口[0]}`,
  );
  const 期望左留白 = 度量.正文左留白 + 度量.正文字号 * 度量.标记留白比例;
  assert.ok(
    Math.abs(parseFloat(度量.行内边距.左) - 期望左留白) <= 1,
    `行首留白应等于「正文左留白 + 0.42em」，与 padding 同步：${度量.行内边距.左} vs ${期望左留白}`,
  );
  const 期望轨道右缘 =
    度量.章节轨道变量 + 度量.正文左留白 + 度量.正文字号 * 度量.标记留白比例;
  assert.ok(
    Math.abs(度量.章节轨道宽度 - 期望轨道右缘) <= 1,
    `白轴应吞下行首留白、右缘顶到首字：${度量.章节轨道宽度} vs ${期望轨道右缘}`,
  );
  assert.ok(
    度量.最左首字 >= 度量.章节轨道宽度 - 2,
    `首字应紧贴白轴右缘，中间不再有段落色带黑边：${度量.最左首字} vs ${度量.章节轨道宽度}`,
  );

  // 三列平分白轴：章节刻度 [0, W/3]、进度数字 [W/3, 2W/3]、关键词 [2W/3, W]
  const 列宽 = 度量.章节轨道宽度 / 3;
  const 近似 = (实际, 期望, 说明) =>
    assert.ok(
      Math.abs(实际 - 期望) <= 1.5,
      `${说明}：${实际} vs ${期望}（白轴 ${度量.章节轨道宽度}px）`,
    );
  for (const [名, 期望x] of [
    ['章节刻度', 0],
    ['滚动进度', 列宽],
    ['关键词指示器', 列宽 * 2],
  ]) {
    const 盒子 = 度量[名];
    if (!盒子 || 盒子.hidden || 盒子.w === 0) {
      console.log(`（${名}当前隐藏，跳过平分断言）`);
      continue;
    }
    近似(盒子.x, 期望x, `${名}列起点应落在平分线上`);
    近似(盒子.w, 列宽, `${名}列宽应为白轴的三分之一`);
  }
  近似(
    度量.滚动进度.x + 度量.滚动进度.w,
    列宽 * 2,
    '进度数字列右缘应压在第二条平分线上',
  );

  const { data } = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 度量.视口[0] - 160, y: 0, width: 160, height: 度量.视口[1], scale: 1 },
  });
  writeFileSync(
    resolve(import.meta.dirname, '行尾空隙-右缘.png'),
    Buffer.from(data, 'base64'),
  );
  const { data: 左 } = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 260, height: 度量.视口[1], scale: 1 },
  });
  writeFileSync(resolve(import.meta.dirname, '行尾空隙-左缘.png'), Buffer.from(左, 'base64'));
  const { data: 放大 } = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: {
      x: 0,
      y: 度量.视口[1] * 0.3,
      width: 110,
      height: 220,
      scale: 4,
    },
  });
  writeFileSync(
    resolve(import.meta.dirname, '行首白轴-放大.png'),
    Buffer.from(放大, 'base64'),
  );
  console.log('已写 tmp/行尾空隙-右缘.png、tmp/行尾空隙-左缘.png、tmp/行首白轴-放大.png');
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
