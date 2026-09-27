// 一次性验证：时段轨道改成三档底色 —— 白＝未激活、灰＝页面激活（撑满整行）、
// 黑＝自动滚动（70% 高、上下居中），并撤掉每天之间的分割线。
// 跑法：node tmp/跑-浏览器回归.mjs tmp/verify-时段轨道三档底色.mjs
// 产出 tmp/时段轨道三档-截图.png（给人看）+ 下面的断言（给机器量）。
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const port = process.env.CDP_PORT;
const 站点 = 'http://127.0.0.1:15921';
const 目标列表 = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const 目标 = 目标列表.find((t) => t.type === 'page' && t.url.startsWith(站点));
const ws = new WebSocket(目标.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let 序号 = 0;
const 待回复 = new Map();
ws.addEventListener('message', (事件) => {
  const 消息 = JSON.parse(事件.data);
  const 请求 = 待回复.get(消息.id);
  if (!请求) return;
  待回复.delete(消息.id);
  消息.error ? 请求.reject(new Error(JSON.stringify(消息.error))) : 请求.resolve(消息.result);
});
const 发送 = (方法, 参数 = {}) =>
  new Promise((解决, 拒绝) => {
    const 下标 = ++序号;
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
async function 求值(代码) {
  const 结果 = await 发送('Runtime.evaluate', {
    expression: `(async () => { ${代码} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (结果.exceptionDetails)
    throw new Error(
      结果.exceptionDetails.exception?.description || JSON.stringify(结果.exceptionDetails),
    );
  return 结果.result.value;
}
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

await 发送('Page.enable');
await 发送('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
// js/ 子模块不带版本号，必须 ignoreCache 重载才拿得到最新的 styles.css 与 阅读统计.js
await 发送('Page.reload', { ignoreCache: true });
for (let n = 0; n < 200; n++) {
  await pause(100);
  if (await 求值('return document.querySelector("#载入状态")?.hidden === true')) break;
}

const 量 = await 求值(`
  const { 创建阅读统计内容 } = await import('./js/阅读统计.js');
  const 秒 = (h, m, s = 0) => h * 3600 + m * 60 + s;
  const 每日时段 = {
    // 带内两根滚动：用来量「黑块 70% 居中、上下露出灰带」
    '2026-09-23': [[秒(8, 0), 秒(8, 10)], [秒(11, 30), 秒(11, 33)], [秒(20, 0), 秒(20, 6)]],
    // 只有激活、没有滚动：整行该是一根撑满的灰带 + 两侧留白
    '2026-09-22': [],
    '2026-09-21': [[秒(1, 0), 秒(1, 4)]],
  };
  const 每日激活时段 = {
    '2026-09-23': [[秒(7, 50), 秒(12, 0)], [秒(19, 40), 秒(20, 20)]],
    '2026-09-22': [[秒(0, 30), 秒(23, 30)]],
    '2026-09-21': [[秒(0, 0), 秒(2, 0)], [秒(23, 0), 秒(23, 59)]],
  };
  const 内容 = document.querySelector('#阅读统计内容');
  内容.textContent = '';
  内容.append(创建阅读统计内容({
    书籍: [['x.txt', { 总滚动毫秒: 0, 总前台毫秒: 0 }]],
    文件名: 'x.txt', 进度: 0, 每日时段, 每日激活时段, 今天: '2026-09-23',
  }));
  document.querySelector('#阅读统计弹窗').showModal();
  // 计算样式里的 oklch / color-mix 拿不到通道值，画到 1×1 画布上读回真实 RGB 再比亮度
  const 画布 = document.createElement('canvas');
  画布.width = 画布.height = 1;
  const ctx = 画布.getContext('2d', { willReadFrequently: true });
  const RGB = (色串) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = 色串;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, 串: 色串 };
  };
  const 盒 = (节点) => { const b = 节点.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const 表 = document.querySelector('.统计时段表');
  const 轨道们 = [...表.querySelectorAll('tbody tr')].map((行) => {
    const 轨道 = 行.querySelector('.统计时段轨道');
    const 格 = 行.querySelector('td');
    const 样式 = getComputedStyle(格);
    const 轨道样式 = getComputedStyle(轨道);
    return {
      日期: 行.querySelector('.统计时段日期').textContent,
      轨道: 盒(轨道),
      轨道底色: RGB(轨道样式.backgroundColor),
      块: [...轨道.children].map((块) => ({
        激活: 块.classList.contains('统计时段块-激活'),
        盒: 盒(块),
        底色: RGB(getComputedStyle(块).backgroundColor),
        标题: 块.title,
      })),
      下边框宽: 样式.borderBottomWidth,
      下边框样式: 样式.borderBottomStyle,
    };
  });
  const 书籍表行 = document.querySelector('.阅读统计内容 table:not(.统计时段表) tbody tr');
  return {
    弹窗底色: RGB(getComputedStyle(document.querySelector('.阅读统计弹窗')).backgroundColor),
    墨色: RGB(getComputedStyle(document.querySelector('.统计当前标记')).backgroundColor),
    时段区块: 盒(document.querySelector('.统计时段')),
    轨道们,
    书籍表下边框宽: 书籍表行
      ? getComputedStyle(书籍表行.querySelector('td')).borderBottomWidth
      : null,
  };
`);

const { data } = await 发送('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
  clip: {
    x: 量.时段区块.x - 6,
    y: 量.时段区块.y - 6,
    width: 量.时段区块.w + 12,
    height: 量.时段区块.h + 12,
    scale: 2,
  },
});
writeFileSync(
  resolve(import.meta.dirname, '时段轨道三档-截图.png'),
  Buffer.from(data, 'base64'),
);
const 亮度 = (色) => +(0.2126 * 色.r + 0.7152 * 色.g + 0.0722 * 色.b).toFixed(1);

// —— 判据 1：几何三档（激活撑满、滚动 70% 居中） ——
assert.equal(量.轨道们.length, 3, '3 天 3 行');
for (const 行 of 量.轨道们) {
  for (const 块 of 行.块) {
    const 比 = 块.盒.h / 行.轨道.h;
    const 中心差 = Math.abs(块.盒.y + 块.盒.h / 2 - (行.轨道.y + 行.轨道.h / 2));
    if (块.激活) {
      assert.ok(Math.abs(比 - 1) < 0.02, `激活带没撑满轨道：${行.日期} ${比.toFixed(3)}`);
      assert.ok(块.盒.y - 行.轨道.y < 0.5, `激活带顶边没贴轨道顶：${行.日期}`);
    } else {
      assert.ok(Math.abs(比 - 0.7) < 0.02, `滚动块不是 70% 高：${行.日期} ${比.toFixed(3)}`);
      assert.ok(中心差 <= 0.6, `滚动块没在轨道里居中：${行.日期} 偏 ${中心差.toFixed(2)}px`);
    }
  }
}

// —— 判据 2：底色三档 白 > 灰 > 黑，灰要真是中性灰 ——
const 激活们 = 量.轨道们.flatMap((行) => 行.块.filter((块) => 块.激活));
const 滚动们 = 量.轨道们.flatMap((行) => 行.块.filter((块) => !块.激活));
assert.ok(激活们.length >= 4 && 滚动们.length >= 4, '两类样本都得有');
const 白 = 亮度(量.弹窗底色);
const 黑 = 亮度(量.墨色);
for (const 行 of 量.轨道们) {
  assert.equal(亮度(行.轨道底色), 白, `未激活的轨道底不是留白：${行.日期} ${行.轨道底色.串}`);
}
for (const 块 of 激活们) {
  const L = 亮度(块.底色);
  assert.ok(L < 白 - 30, `激活带不够灰（离白太近）：${块.底色.串} 亮度 ${L} vs 白 ${白}`);
  assert.ok(L > 黑 + 60, `激活带压成黑了：${块.底色.串} 亮度 ${L} vs 黑 ${黑}`);
  assert.ok(
    Math.max(块.底色.r, 块.底色.g, 块.底色.b) - Math.min(块.底色.r, 块.底色.g, 块.底色.b) <= 20,
    `激活带该是中性（暖）灰，色偏太大：${JSON.stringify(块.底色)}`,
  );
}
for (const 块 of 滚动们) {
  assert.equal(亮度(块.底色), 黑, `滚动块不是墨色：${块.底色.串}`);
}
console.log('三档底色与几何判据通过', { 白, 黑 });

// —— 判据 3：每天之间的分割线撤掉，书籍明细表那条不动 ——
for (const 行 of 量.轨道们) {
  assert.equal(行.下边框宽, '0px', `每天之间的分割线还在：${行.日期}`);
  assert.equal(行.下边框样式, 'none', `下边框样式没撤干净：${行.日期}`);
}
assert.equal(量.书籍表下边框宽, '1px', '书籍明细表的行线被误伤了');
console.log('每天之间的分割线已撤，书籍明细表行线保留');

console.log(JSON.stringify({
  弹窗底色: 量.弹窗底色,
  墨色: 量.墨色,
  灰带: 激活们[0].底色,
  轨道高与块高: 量.轨道们.map((行) => [
    行.日期,
    行.轨道.h,
    行.块.map((块) => [块.激活 ? '激活' : '滚动', +块.盒.h.toFixed(1), 亮度(块.底色)]),
  ]),
}, null, 1));
console.log('已写 tmp/时段轨道三档-截图.png');
ws.close();
process.exit(0);
