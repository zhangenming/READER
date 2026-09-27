// 出图脚本（真书）：悬停某一处命中时的满屏 x/y 徽标长什么样。
// 载入默认真书 → 现取三个多命中的中文词做关键词 → 悬停其中一个的第 N 处 → 截屏。
// 自启 headless Chrome（CDP），按 AGENTS.md 清理 reader-* profile。
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
const 清理遗留profile = () => {
  for (const 名 of readdirSync(tmpdir())) {
    if (!名.startsWith('reader-')) continue;
    const 路径 = join(tmpdir(), 名);
    try {
      execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
      continue;
    } catch {}
    rmSync(路径, { recursive: true, force: true });
  }
};
清理遗留profile();

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
  if (existsSync(profile)) {
    console.error('profile 清理失败:', profile);
    process.exitCode = 1;
  } else {
    console.log('profile 已清理:', profile);
  }
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

  // 现取三个词：全书高频二字组、彼此不共用字（避免命中框叠在一起），
  // 再找一个三词同时出现的窗口滚过去，保证截图里三组词都在屏内。
  const 选词 = await 求值(`${S}
    const 计次 = new Map();
    const 文本 = 状态.文本;
    for (let i = 0; i + 2 <= 文本.length; i++) {
      const 组 = 文本.slice(i, i + 2);
      if (!/^[\\u4e00-\\u9fff]{2}$/.test(组)) continue;
      计次.set(组, (计次.get(组) || 0) + 1);
    }
    const 榜 = [...计次.entries()].sort((a, b) => b[1] - a[1]);
    const 候选 = [];
    for (const [词] of 榜) {
      if (候选.length === 3) break;
      if ([...词].some((字) => 候选.some((x) => [...x.词].includes(字)))) continue;
      候选.push({ 词, 次: 计次.get(词) });
    }
    return { 书名: 状态.文件名, 候选 };`);
  console.log('书名:', 选词.书名, '候选词:', 选词.候选.map((x) => `${x.词}×${x.次}`).join(' / '));

  const 关键词账 = await 求值(`${S}
    const { 添加关键词标记 } = await import('./js/关键词.js');
    for (const { 词 } of ${JSON.stringify(选词.候选.map((x) => x))}) 添加关键词标记(词, 状态.文本.indexOf(词));
    return 状态.关键词列表.map((词) => 词.文本 + '×' + 词.命中位置.length).join(' / ');`);
  console.log('关键词:', 关键词账);
  // 等添加关键词引发的跳行动画落定，否则手动 scrollTop 会和它互相回弹
  await pause(1500);

  // 找一个「至少两组关键词同时有命中」的行窗口，滚过去再截图
  const 滚动 = await 求值(`${S}
    const 可见行数 = Math.floor(元素.滚动容器.clientHeight / 状态.行高);
    const 行起点列表 = 状态.行起点列表;
    const 总行数 = 行起点列表.length;
    function 所在行(偏移) {
      let 低 = 0;
      let 高 = 总行数 - 1;
      while (低 < 高) {
        const 中 = (低 + 高 + 1) >> 1;
        if (行起点列表[中] <= 偏移) 低 = 中;
        else 高 = 中 - 1;
      }
      return 低;
    }
    // 差分数组：某词的命中落在 [起点, 起点+可见行数) 窗口内即算这窗口有它
    function 窗口覆盖(行列表) {
      const 标记 = new Int32Array(总行数 + 2);
      for (const 行 of 行列表) {
        标记[Math.max(0, 行 - 可见行数 + 1)] += 1;
        标记[行 + 1] -= 1;
      }
      const 有 = new Uint8Array(总行数);
      let 累 = 0;
      for (let 行 = 0; 行 < 总行数; 行++) {
        累 += 标记[行];
        有[行] = 累 > 0 ? 1 : 0;
      }
      return 有;
    }
    const 每词 = 状态.关键词列表.map((词) => 词.命中位置.map(所在行));
    const 词数 = new Int32Array(总行数);
    for (const 行列表 of 每词) {
      const 有 = 窗口覆盖(行列表);
      for (let 行 = 0; 行 < 总行数; 行++) 词数[行] += 有[行];
    }
    const 命中数 = 窗口覆盖(每词.flat());
    let 最佳行 = 0;
    let 最佳分 = -1;
    for (let 行 = 0; 行 < 总行数; 行++) {
      const 分 = 词数[行] * 1000 + 命中数[行];
      if (分 > 最佳分) {
        最佳分 = 分;
        最佳行 = 行;
      }
    }
    元素.滚动容器.scrollTop = 最佳行 * 状态.行高;
    return { 最佳行, 词数: 词数[最佳行], 命中数: 命中数[最佳行], 可见行数 };`);
  console.log('已滚到多词共现窗口:', 滚动);
  await pause(400);
  // 取屏内最靠中间的一枚徽标末字当悬停目标（贴边的会被白线浮层挡住）
  const 目标字 = await 求值(`${S}
    const 中线 = window.innerHeight / 2;
    let 最好 = null;
    for (const 字 of document.querySelectorAll('.字.命中[data-hit-position]')) {
      const 盒 = 字.getBoundingClientRect();
      const 中心 = 盒.top + 盒.height / 2;
      if (中心 < 90 || 中心 > window.innerHeight - 90) continue;
      if (!最好 || Math.abs(中心 - 中线) < Math.abs(最好.中心 - 中线)) {
        最好 = { x: 盒.left + 盒.width / 2, y: 中心, 中心, 文本: 字.textContent, 序号: 字.dataset.hitPosition };
      }
    }
    return 最好;`);
  console.log('悬停目标:', 目标字 && `${目标字.文本} ${目标字.序号} @y=${Math.round(目标字.中心)}`);
  async function 移到(x, y) {
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 960 });
    await pause(50);
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await pause(260);
  }
  const 截图 = async (名) => {
    const 图 = await 发送('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(项目根, 'tmp', 名), Buffer.from(图.data, 'base64'));
    console.log('已写入 tmp/' + 名);
  };
  await 移到(1200, 960);
  await 截图('悬停揭示序号-真书-静止.png');
  if (目标字) {
    await 移到(目标字.x, 目标字.y);
    console.log(
      '悬停后:',
      await 求值(`${S}
        let 可见 = 0;
        let 总数 = 0;
        for (const 字 of document.querySelectorAll('.字.命中[data-hit-position]')) {
          总数++;
          const 样 = getComputedStyle(字, '::after');
          if (样.visibility === 'visible' && Number(样.opacity) > 0.5) 可见++;
        }
        return { 悬停词: 状态.悬停关键词id, 揭示中: 元素.可见内容.classList.contains('悬停揭示中'), 可见, 总数 };`),
    );
    await 截图('悬停揭示序号-真书-悬停中.png');
  } else {
    console.error('屏内没找到带 data-hit-position 的命中末字，只出了静止图');
  }
  ws.close();
} finally {
  await 收尾();
}
