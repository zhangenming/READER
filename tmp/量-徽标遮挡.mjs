// 量：x/y 徽标到底压住多少邻字墨迹（回答「右下角有点遮挡」该往哪挪）。
// 墨迹盒用 canvas measureText 的 actualBoundingBox*（真字形的墨，不是行盒），
// 基线位置按半行距公式 baseline = 盒顶 + (行高 + 字体ascent - 字体descent)/2 还原；
// 徽标盒直接读 ::after 的 used 值（top/right/width/height），换一档候选样式就重算一次交集面积。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

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
const profile = mkdtempSync(join(tmpdir(), 'reader-badge-ink-'));
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
  // 照用户那一屏：深底浅字，字号/行高取默认（30/30）
  await 求值(`${S}
    const 根 = document.documentElement.style;
    根.setProperty('--背景色', '#1d1f21');
    根.setProperty('--正文字色', '#e8e6e3');
    return true;`);

  const 选词 = await 求值(`${S}
    const 计次 = new Map();
    for (let i = 0; i + 2 <= 状态.文本.length; i++) {
      const 组 = 状态.文本.slice(i, i + 2);
      if (!/^[\\u4e00-\\u9fff]{2}$/.test(组)) continue;
      计次.set(组, (计次.get(组) || 0) + 1);
    }
    const 候选 = [];
    for (const [词, 次] of [...计次.entries()].sort((a, b) => b[1] - a[1])) {
      if (候选.length === 2) break;
      if ([...词].some((字) => 候选.some((x) => [...x.词].includes(字)))) continue;
      候选.push({ 词, 次 });
    }
    return { 书名: 状态.文件名, 候选 };`);
  console.log('书名:', 选词.书名, '| 词:', 选词.候选.map((x) => `${x.词}×${x.次}`).join(' / '));

  await 求值(`${S}
    const { 添加关键词标记 } = await import('./js/关键词.js');
    for (const { 词 } of ${JSON.stringify(选词.候选)}) 添加关键词标记(词, 状态.文本.indexOf(词));
    return true;`);
  await pause(1500);
  console.log(
    '排版:',
    await 求值(`${S} return { 字号: 状态.正文字号, 行高: 状态.行高, 屏内命中徽标: document.querySelectorAll('.字.命中[data-hit-position]').length };`),
  );

  // 滚到命中最密的窗口，样本量才够
  const 密窗 = await 求值(`${S}
    const 行高 = 状态.行高;
    const 可视行数 = Math.floor(元素.滚动容器.clientHeight / 行高);
    const 行起点 = 状态.行起点列表;
    const 总行 = 行起点.length;
    const 所在行 = (偏移) => {
      let 低 = 0;
      let 高 = 总行 - 1;
      while (低 < 高) {
        const 中 = (低 + 高 + 1) >> 1;
        if (行起点[中] <= 偏移) 低 = 中;
        else 高 = 中 - 1;
      }
      return 低;
    };
    const 每行命中 = new Int32Array(总行);
    for (const 词 of 状态.关键词列表)
      for (const 偏移 of 词.命中位置) 每行命中[所在行(偏移)] += 1;
    let 最佳行 = 0;
    let 最佳分 = -1;
    let 累 = 0;
    for (let 行 = 0; 行 < 总行; 行++) {
      累 += 每行命中[行];
      if (行 >= 可视行数) 累 -= 每行命中[行 - 可视行数];
      if (行 >= 可视行数 - 1 && 累 > 最佳分) {
        最佳分 = 累;
        最佳行 = 行 - 可视行数 + 1;
      }
    }
    元素.滚动容器.scrollTop = (最佳行 + 2) * 行高;
    return { 最佳行, 命中数: 最佳分, 可视行数 };`);
  console.log('密窗:', 密窗);
  await pause(600);
  console.log(
    '屏内徽标数:',
    await 求值(`${S} return document.querySelectorAll('.字.命中[data-hit-position]').length;`),
  );

  // 墨迹测量 + 候选档对比，全在一次求值里跑完（几何随注入样式即时重算）
  const 报告 = await 求值(`${S}
    const 强制铺开 = ".字.命中[data-hit-position]::after{transition:none!important;opacity:1!important;visibility:visible!important}";
    const 候选档 = ${JSON.stringify([
      { 名: '现状 9fs/10lh/pad1×2/b1 top-7 r-3', css: '' },
      { 名: 'h12 pad0×2 lh10 top-8', css: 'padding:0 2px;top:-8px' },
      { 名: 'h12 pad0×2 lh10 top-8.5', css: 'padding:0 2px;top:-8.5px' },
      { 名: 'h12 pad0×2 lh10 top-9', css: 'padding:0 2px;top:-9px' },
      { 名: 'h12 pad0×2 lh10 top-9.5', css: 'padding:0 2px;top:-9.5px' },
      { 名: 'h12 pad0×2 lh10 top-10', css: 'padding:0 2px;top:-10px' },
      { 名: 'h11 pad0×2 lh9 top-8', css: 'padding:0 2px;line-height:9px;top:-8px' },
      { 名: 'h11 pad0×2 lh9 top-8.5', css: 'padding:0 2px;line-height:9px;top:-8.5px' },
      { 名: 'h11 pad0×2 lh9 top-9', css: 'padding:0 2px;line-height:9px;top:-9px' },
      { 名: 'h11 pad0×1 lh9 top-9', css: 'padding:0 1px;line-height:9px;top:-9px' },
      { 名: 'h11 pad0×2 lh9 top-9 r-2', css: 'padding:0 2px;line-height:9px;top:-9px;right:-2px' },
      { 名: 'h11 pad0×2 lh9 top-9 r-1', css: 'padding:0 2px;line-height:9px;top:-9px;right:-1px' },
      { 名: 'h10 pad0×2 lh8 top-8', css: 'padding:0 2px;line-height:8px;top:-8px' },
      { 名: 'h10 pad0×2 lh8 top-8.5', css: 'padding:0 2px;line-height:8px;top:-8.5px' },
    ])};
    const 样式 = document.createElement('style');
    document.head.append(样式);
    const 量 = (字) => {
      const 样 = getComputedStyle(字, '::after');
      const 盒 = 字.getBoundingClientRect();
      const px = (v) => parseFloat(v) || 0;
      // ::after 是 content-box：算出的 width/height 还要加回 padding 与边框
      const 宽 = px(样.width) + px(样.paddingLeft) + px(样.paddingRight) + px(样.borderLeftWidth) + px(样.borderRightWidth);
      const 高 = px(样.height) + px(样.paddingTop) + px(样.paddingBottom) + px(样.borderTopWidth) + px(样.borderBottomWidth);
      const 影 = (样.boxShadow && 样.boxShadow !== 'none' ? 样.boxShadow.match(/(-?[\\d.]+)px (-?[\\d.]+)px ([\\d.]+)px/) : null) || [0, 0, 0, 0];
      return {
        文本: 样.content,
        宽,
        高,
        影y: parseFloat(影[2]) || 0,
        影糊: parseFloat(影[3]) || 0,
        右: 盒.right - px(样.right),
        左: 盒.right - px(样.right) - 宽,
        上: 盒.top + px(样.top),
        下: 盒.top + px(样.top) + 高,
      };
    };
    // 每个字的墨迹盒：canvas actualBoundingBox + 半行距还原基线
    const 量字 = (() => {
      const 画 = document.createElement('canvas').getContext('2d');
      const 缓存 = new Map();
      return (字) => {
        const 样 = getComputedStyle(字);
        const 文 = 字.textContent;
        const 字体串 = 样.fontStyle + ' ' + 样.fontVariant + ' ' + 样.fontWeight + ' ' + 样.fontSize + ' ' + 样.fontFamily;
        const 键 = 字体串 + '|' + 文;
        let 墨 = 缓存.get(键);
        if (!墨) {
          画.font = 字体串;
          const m = 画.measureText(文);
          const fm = 画.measureText('中');
          墨 = {
            上: m.actualBoundingBoxAscent,
            下: m.actualBoundingBoxDescent,
            左: m.actualBoundingBoxLeft,
            右: m.actualBoundingBoxRight,
            as: fm.fontBoundingBoxAscent,
            de: fm.fontBoundingBoxDescent,
          };
          缓存.set(键, 墨);
        }
        const 盒 = 字.getBoundingClientRect();
        const 基线 = 盒.top + (盒.height + 墨.as - 墨.de) / 2;
        return {
          文本: 文,
          上: 基线 - 墨.上,
          下: 基线 + 墨.下,
          左: 盒.left - 墨.左,
          右: 盒.left + 墨.右,
        };
      };
    })();
    const 交 = (a, b) =>
      Math.max(0, Math.min(a.右, b.右) - Math.max(a.左, b.左)) *
      Math.max(0, Math.min(a.下, b.下) - Math.max(a.上, b.上));
    const 屏内字 = [...document.querySelectorAll('.正文行 .字')].map((字) => ({
      字,
      墨: 量字(字),
      行顶: Math.round(字.closest('.正文行').getBoundingClientRect().top),
      左: 字.getBoundingClientRect().left,
    }));
    const 出 = [];
    for (const 档 of 候选档) {
      样式.textContent = 强制铺开 + '.字.命中[data-hit-position]::after{' + 档.css + '}';
      const 徽标 = [...document.querySelectorAll('.字.命中[data-hit-position]')]
        .filter((字) => {
          const 样 = getComputedStyle(字, '::after');
          return 样.visibility === 'visible' && Number(样.opacity) > 0.5;
        })
        .map((字) => {
          const 徽 = 量(字);
          const 锚项 = 屏内字.find((项) => 项.字 === 字);
          const 分 = { 压锚字: 0, 压右邻: 0, 压左邻: 0, 压上行: 0, 压下行: 0 };
          // 阴影往下糊 偏移+模糊 那么深，量它扎进锚字墨多深
          const 影深 = Math.max(0, 徽.下 + 徽.影y + 徽.影糊 - 锚项.墨.上);
          for (const 项 of 屏内字) {
            const 面 = 交(徽, 项.墨);
            if (!面) continue;
            if (项 === 锚项) 分.压锚字 += 面;
            else if (项.行顶 === 锚项.行顶)
              项.左 > 锚项.左 ? (分.压右邻 += 面) : (分.压左邻 += 面);
            else if (项.行顶 < 锚项.行顶) 分.压上行 += 面;
            else 分.压下行 += 面;
          }
          return {
            内容: 徽.文本,
            宽: +徽.宽.toFixed(1),
            高: +徽.高.toFixed(1),
            影深: +影深.toFixed(1),
            ...分,
          };
        });
      const 合 = (k) => 徽标.reduce((s, x) => s + x[k], 0);
      const 总 = 合('压锚字') + 合('压右邻') + 合('压左邻') + 合('压上行') + 合('压下行');
      const 最深影 = 徽标.reduce((m, x) => Math.max(m, x.影深), 0);
      出.push({
        档: 档.名,
        枚数: 徽标.length,
        压锚字: +合('压锚字').toFixed(0),
        压右邻: +合('压右邻').toFixed(0),
        压左邻: +合('压左邻').toFixed(0),
        压上行: +合('压上行').toFixed(0),
        压下行: +合('压下行').toFixed(0),
        合计: +总.toFixed(0),
        每枚: +(总 / Math.max(1, 徽标.length)).toFixed(1),
        阴影深: 最深影,
        徽标尺寸: 徽标[0] ? 徽标[0].宽 + '×' + 徽标[0].高 : '-',
        样本: 徽标.slice(0, 2),
      });
    }
    样式.remove();
    return 出;`);
  console.table(
    报告.map((档) => ({
      档: 档.档,
      枚数: 档.枚数,
      徽标: 档.徽标尺寸,
      压锚字: 档.压锚字,
      压右邻: 档.压右邻,
      压左邻: 档.压左邻,
      压上行: 档.压上行,
      压下行: 档.压下行,
      合计: 档.合计,
      每枚: 档.每枚,
      阴影深: 档.阴影深,
    })),
  );
  console.log('样本徽标几何（现状）:', JSON.stringify(报告[0].样本));

  // A/B 出图：同一屏、同一批徽标，一档旧几何一档新几何
  const 截图 = async (名) => {
    const 图 = await 发送('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(项目根, 'tmp', 名), Buffer.from(图.data, 'base64'));
    console.log('已写入 tmp/' + 名);
  };
  const 铺 = (档css) =>
    求值(`
      document.querySelector('#量-遮挡档')?.remove();
      const s = document.createElement('style');
      s.id = '量-遮挡档';
      s.textContent = '.字.命中[data-hit-position]::after{transition:none!important;opacity:1!important;visibility:visible!important}' +
        '.字.命中[data-hit-position]::after{' + ${JSON.stringify(档css)} + '}';
      document.head.append(s);
      return true;`);
  await 铺('padding:0 2px;line-height:9px;top:-9px;box-shadow:0 1px 3px rgb(0 0 0 / 28%)');
  await pause(120);
  await 截图('徽标遮挡-收位后.png');
  await 铺('padding:1px 2px;line-height:10px;top:-7px;box-shadow:0 2px 7px rgb(0 0 0 / 42%)');
  await pause(120);
  await 截图('徽标遮挡-收位前.png');
  await 求值(`document.querySelector('#量-遮挡档')?.remove(); return true;`);
  ws.close();
} finally {
  await 收尾();
}
