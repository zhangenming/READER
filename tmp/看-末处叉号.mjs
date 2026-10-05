// 看：末处那枚 × 到底被谁压住，以及各档加粗法的真实笔画宽。
// 判覆盖用 elementFromPoint（先把标记的 pointer-events 打开，否则命中测试会跳过它）。
// 加粗候选同时量「平均笔画宽」= 不透明像素 / (2.83 × 墨宽)（× 是两条对角笔画）。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

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
const profile = mkdtempSync(join(tmpdir(), 'reader-cross-look-'));
const 服务 = spawn('node', ['server.mjs', String(站点端口)], { cwd: 项目根, stdio: 'ignore' });
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
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
  console.log(existsSync(profile) ? 'profile 清理失败' : 'profile 已清理');
}

try {
  let 目标 = null;
  for (let i = 0; i < 150 && !目标; i++) {
    try {
      const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
      目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
    } catch {}
    if (!目标) await pause(200);
  }
  if (!目标) throw new Error('未找到 headless Chrome 页面');
  const ws = new WebSocket(目标.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let 序号 = 0;
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
    return new Promise((resolve, reject) => {
      const 下标 = ++序号;
      const 计时器 = setTimeout(() => {
        待回复.delete(下标);
        reject(new Error(`CDP 超时: ${方法}`));
      }, 30_000);
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
      throw new Error(结果.exceptionDetails.exception?.description || '');
    return 结果.result.value;
  }
  const S = 'const { 状态, 元素 } = await import("./js/状态.js");';
  await 发送('Page.enable');
  await 发送('Runtime.enable');
  await 发送('Page.reload', { ignoreCache: true });
  for (let n = 0; n < 300; n++) {
    try {
      if (
        await 求值(
          'return document.querySelector("#载入状态")?.hidden && !!(await import("./js/状态.js")).状态.文件名',
        )
      )
        break;
    } catch {}
    await pause(100);
  }
  await pause(500);
  await 求值(`${S}
    const 根 = document.documentElement.style;
    根.setProperty('--背景色', '#1d1f21');
    根.setProperty('--正文字色', '#c9c5bd');
    return true;`);

  // 先加被测词、再加另一个词当「当前关键词」：被测词的命中就是普通彩字，
  // × 才会压在邻字笔画上（当前关键词组是白底实块，本来就没人压它）
  const 选词 = await 求值(`${S}
    const 计次 = new Map();
    for (let i = 0; i + 2 <= 状态.文本.length; i++) {
      const 组 = 状态.文本.slice(i, i + 2);
      if (!/^[\\u4e00-\\u9fff]{2}$/.test(组)) continue;
      计次.set(组, (计次.get(组) || 0) + 1);
    }
    const 榜 = [...计次.entries()].sort((a, b) => b[1] - a[1]);
    return { 书名: 状态.文件名, 被测: 榜[30][0], 当前: 榜[0][0] };`);
  console.log('书名:', 选词.书名, '| 被测词:', 选词.被测, '| 当前词:', 选词.当前);
  await 求值(`${S}
    const { 添加关键词标记 } = await import('./js/关键词.js');
    添加关键词标记(${JSON.stringify(选词.被测)}, 状态.文本.indexOf(${JSON.stringify(选词.被测)}));
    return true;`);
  await pause(900);
  await 求值(`${S}
    const { 添加关键词标记 } = await import('./js/关键词.js');
    添加关键词标记(${JSON.stringify(选词.当前)}, 状态.文本.indexOf(${JSON.stringify(选词.当前)}));
    return true;`);
  await pause(1400);

  const 滚动 = await 求值(`${S}
    const 词 = 状态.关键词列表.find((w) => w.文本 === ${JSON.stringify(选词.被测)});
    const 末偏移 = 词.命中位置[词.命中位置.length - 1];
    const 行起点 = 状态.行起点列表;
    let 行 = 0;
    for (let i = 0; i < 行起点.length; i++) if (行起点[i] <= 末偏移) 行 = i; else break;
    const 可视 = Math.floor(元素.滚动容器.clientHeight / 状态.行高);
    元素.滚动容器.scrollTop = Math.max(0, (行 - Math.floor(可视 / 2)) * 状态.行高);
    return { 行, 末偏移, 命中数: 词.命中位置.length };`);
  await pause(700);
  console.log('滚到末处:', 滚动);

  const 现场 = await 求值(`${S}
    const 标 = document.querySelector('.末处标记');
    if (!标) return null;
    const 锚 = 标.closest('.字');
    const 次 = 锚.nextElementSibling;
    const 上一 = 锚.previousElementSibling;
    const 样 = (字) => {
      const s = getComputedStyle(字);
      return { 类: 字.className, z: s.zIndex, 位: s.position, 色: s.color, 字色: s.color };
    };
    // 命中测试要能看见标记：临时开 pointer-events
    const 试 = document.createElement('style');
    试.id = '看-可点';
    试.textContent = '.末处标记{pointer-events:auto!important}';
    document.head.append(试);
    const 盒 = 标.getBoundingClientRect();
    // 沿 × 的两条对角笔画各取 7 个点（盒子右下角本来没墨，打那儿不算数）
    const 内 = getComputedStyle(标);
    const 点 = (x, y) => {
      const e = document.elementFromPoint(x, y);
      if (!e) return 'null';
      return e === 标 ? '叉' : (e.className || e.tagName);
    };
    const 交 = [];
    for (let i = 1; i <= 7; i++) {
      const k = i / 8;
      交.push(点(盒.left + 盒.width * k, 盒.top + 盒.height * k));
      交.push(点(盒.right - 盒.width * k, 盒.top + 盒.height * k));
    }
    const 顶 = {
      对角命中: 交.join(' · '),
      叉占: 交.filter((x) => x === '叉').length + '/' + 交.length,
    };
    // 抬整枚锚字层级能不能救（关系词首字那档的先例）——指针仍开着，才测得准
    const 逐点 = () => {
      const 出 = [];
      for (let i = 1; i <= 7; i++) {
        const k = i / 8;
        出.push(点(盒.left + 盒.width * k, 盒.top + 盒.height * k));
        出.push(点(盒.right - 盒.width * k, 盒.top + 盒.height * k));
      }
      return 出;
    };
    const 抬档 = [];
    for (const z of [1, 2, 3, 11, 20]) {
      const 抬 = document.createElement('style');
      抬.id = '看-抬';
      抬.textContent = '.字:has(> .末处标记){z-index:' + z + '}';
      document.head.append(抬);
      const 列 = 逐点();
      抬档.push({ z, 叉占: 列.filter((x) => x === '叉').length + '/' + 列.length, 其余: [...new Set(列.filter((x) => x !== '叉'))].join(' | ') });
      抬.remove();
    }
    试.remove();
    return {
      标记: { 文本: 标.textContent, 字号: 内.fontSize, 字重: 内.fontWeight, z: 内.zIndex, 行高: 内.lineHeight, 墨: [盒.left, 盒.top, 盒.right, 盒.bottom].map((v) => Math.round(v * 10) / 10) },
      锚: 样(锚),
      次字: 次 ? { ...样(次), 文本: 次.textContent.trim() } : null,
      上一字: 上一 ? 样(上一) : null,
      顶点命中: 顶,
      抬档,
    };`);
  console.log('现场:', JSON.stringify(现场, null, 2));
  // 回归闸：× 的两条对角笔画一处都不许被邻字压住（引文行里 .字 是 isolate 层叠上下文）
  if (现场) {
    const 列 = 现场.顶点命中.对角命中.split(' · ');
    const 输 = 列.filter((x) => x !== '叉');
    assert.equal(输.length, 0, '末处 × 被邻字压住 ' + 输.length + '/' + 列.length + ' 个点：' + 输.join(' | '));
  }

  // 加粗候选：真实笔画宽 = 不透明像素 / (2.83 × 墨宽)（× 两条对角笔画）
  const 加粗 = await 求值(`${S}
    const 档列表 = ${JSON.stringify([
      { 名: '成品 w700（当前）', css: 'font-weight:700' },
      { 名: 'w900', css: 'font-weight:900' },
      { 名: 'w900 + 描边0.6', css: 'font-weight:900;-webkit-text-stroke:0.6px currentColor' },
      { 名: 'w900 + 描边0.8', css: 'font-weight:900;-webkit-text-stroke:0.8px currentColor' },
      { 名: 'w900 + 描边1', css: 'font-weight:900;-webkit-text-stroke:1px currentColor' },
      { 名: 'w900 + 描边1.2', css: 'font-weight:900;-webkit-text-stroke:1.2px currentColor' },
    ])};
    const 画 = document.createElement('canvas').getContext('2d');
    const 标 = document.querySelector('.末处标记');
    const 样式 = document.createElement('style');
    document.head.append(样式);
    const 出 = [];
    for (const 档 of 档列表) {
      样式.textContent =
        '.字.命中 > .末处标记{' + 档.css + '}' + (档.z ? '.字.命中 > .末处标记{z-index:' + 档.z + '}' : '');
      const 样 = getComputedStyle(标);
      const 字体串 = 样.fontStyle + ' ' + 样.fontVariant + ' ' + 样.fontWeight + ' ' + 样.fontSize + ' ' + 样.fontFamily;
      画.font = 字体串;
      const m = 画.measureText('×');
      const 描 = parseFloat(样.webkitTextStrokeWidth) || 0;
      const 余 = Math.ceil(描 / 2) + 1;
      const 宽 = Math.max(1, Math.ceil(m.actualBoundingBoxRight + m.actualBoundingBoxLeft)) + 余 * 2;
      const 高 = Math.max(1, Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)) + 余 * 2;
      const c = document.createElement('canvas');
      c.width = 宽;
      c.height = 高;
      const g = c.getContext('2d');
      g.font = 字体串;
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#000';
      g.fillText('×', 余 + m.actualBoundingBoxLeft, 余 + m.actualBoundingBoxAscent);
      // -webkit-text-stroke 是「描一圈居中的笔画」，canvas 里要照做才量得到加粗后的墨
      if (描) {
        g.lineWidth = 描;
        g.strokeStyle = '#000';
        g.strokeText('×', 余 + m.actualBoundingBoxLeft, 余 + m.actualBoundingBoxAscent);
      }
      const 数据 = g.getImageData(0, 0, 宽, 高).data;
      let 实 = 0;
      for (let i = 3; i < 数据.length; i += 4) if (数据[i] > 90) 实++;
      const 盒 = 标.getBoundingClientRect();
      const 出推 = {
        档: 档.名,
        墨: 宽 - 余 * 2 + 'x' + (高 - 余 * 2),
        笔画宽: Math.round((实 / (2.83 * (宽 - 余 * 2))) * 100) / 100,
        挂出锚字: Math.round((盒.right - 标.closest('.字').getBoundingClientRect().right) * 10) / 10,
      };
      出.push(出推);
    }
    样式.remove();
    return 出;`);
  console.table(加粗);

  const 图 = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(
    join(项目根, 'tmp', '看-末处叉号.png'),
    Buffer.from(图.data, 'base64'),
  );
  if (现场) {
    const [l, t, r, b] = 现场.标记.墨;
    console.log('已写入 tmp/看-末处叉号.png | 标记墨盒', [l, t, r, b].join(','));
    writeFileSync(join(项目根, 'tmp', '看-末处叉号.json'), JSON.stringify({ 标记: 现场.标记, 加粗 }));
  }
  ws.close();
} finally {
  await 收尾();
}
