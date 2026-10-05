// 实测：首次出现的 ◀ 已撤下，改为常驻「总数」徽标（落点与其他 x/y 徽标同一枚）。
// 断言：屏内无 .首处标记；首处末字带 首处总数 + data-hit-total，::after 静止即可见且内容只有 y；
// 其余各处仍是 x/y 且静止时隐藏；带常驻徽标的行放行了溢出。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
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
const profile = mkdtempSync(join(tmpdir(), 'reader-first-total-'));
const 服务 = spawn('node', ['server.mjs', String(站点端口)], {
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
      const 列表 = await (
        await fetch(`http://127.0.0.1:${CDP端口}/json`)
      ).json();
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

  // 现取两个多命中的二字组（彼此不共用字），不硬编码正文词
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
  console.log('书名:', 选词.书名, '词:', 选词.候选.map((x) => `${x.词}×${x.次}`).join(' / '));

  await 求值(`${S}
    const { 添加关键词标记 } = await import('./js/关键词.js');
    for (const { 词 } of ${JSON.stringify(选词.候选)}) 添加关键词标记(词, 状态.文本.indexOf(词));
    return 状态.关键词列表.map((w) => w.文本 + '×' + w.命中位置.length).join(' / ');`);
  await pause(1600);

  // 把某一处首起徽标滚到屏中部（离顶边至少 4 行），否则常驻徽标溢出到视口外拍不到
  const 滚动 = await 求值(`${S}
    const 首字 = document.querySelector('.字.命中.首处总数');
    if (!首字) return null;
    const 行 = 首字.closest('.正文行');
    const 行顶 = 行.getBoundingClientRect().top + 元素.滚动容器.scrollTop;
    元素.滚动容器.scrollTop = Math.max(0, 行顶 - 4 * 状态.行高);
    return { 行顶: Math.round(行顶), scrollTop: Math.round(元素.滚动容器.scrollTop) };`);
  console.log('滚动:', 滚动);
  await pause(500);

  const 结果 = await 求值(`${S}
    const 样 = (字) => getComputedStyle(字, '::after');
    const 屏内 = (字) => {
      const 盒 = 字.getBoundingClientRect();
      return 盒.top > 0 && 盒.bottom < window.innerHeight && 盒.left > 0;
    };
    const 首处 = [...document.querySelectorAll('.字.命中.首处总数')].filter(屏内)
      .map((字) => ({
        词: 状态.关键词列表.find((w) => String(w.id) === 字.dataset.keywordId)?.文本,
        总数: 字.dataset.hitTotal,
        命中位置: 字.dataset.hitPosition,
        内容: 样(字).content,
        可见: 样(字).visibility === 'visible' && Number(样(字).opacity) > 0.5,
        行类: 字.closest('.正文行').className,
        行溢出: getComputedStyle(字.closest('.正文行')).overflow,
        徽标盒: (() => { const b = 字.getBoundingClientRect(); return { top: Math.round(b.top), right: Math.round(b.right) }; })(),
      }));
    const 其余 = [...document.querySelectorAll('.字.命中[data-hit-position]:not(.首处总数)')].filter(屏内)
      .filter((字) => !字.classList.contains('当前命中'))
      .map((字) => ({ 内容: 样(字).content, 可见: 样(字).visibility === 'visible' && Number(样(字).opacity) > 0.5 }));
    return {
      首处三角数: document.querySelectorAll('.首处标记').length,
      末处叉号数: document.querySelectorAll('.末处标记').length,
      末处叉号文本: [...document.querySelectorAll('.末处标记')].map((标) => 标.textContent),
      首处, 其余,
      关键词账: 状态.关键词列表.map((w) => w.文本 + '×' + w.命中位置.length).join(' / '),
    };`);
  console.log(JSON.stringify(结果, null, 2));

  assert.equal(结果.首处三角数, 0, '屏内不应再有 ◀ 首处标记');
  assert.ok(
    结果.末处叉号文本.every((文) => 文 === '×'),
    `末处标记应是右下角那枚 ×，实得 ${JSON.stringify(结果.末处叉号文本)}`,
  );
  assert.ok(结果.首处.length > 0, '屏内要有常驻的首处总数徽标');
  for (const 项 of 结果.首处) {
    assert.equal(项.内容, `"${项.总数}"`, `${项.词} 首处徽标内容应只有总数 y`);
    assert.equal(项.命中位置, `1/${项.总数}`, `${项.词} 首处的 x/y 仍是 1/N`);
    assert.ok(项.可见, `${项.词} 首处徽标要静止可见`);
    assert.match(项.行类, /含首处徽标/, '所在行要带 含首处徽标');
    assert.equal(项.行溢出, 'visible', '所在行要放行溢出，徽标才不被相邻行盖掉');
  }
  for (const 项 of 结果.其余) {
    assert.match(项.内容, /^"\d+\/\d+"$/, `其余各处仍是 x/y，实得 ${项.内容}`);
    assert.equal(项.可见, false, `静止时其余 x/y 不该露出（${项.内容}）`);
  }
  console.log('末处 × 数量:', 结果.末处叉号数, '| 关键词:', 结果.关键词账);

  // 悬停到首处那一处：徽标仍只报总数（x 恒为 1）
  const 首处字 = await 求值(`${S}
    const 字 = document.querySelector('.字.命中.首处总数');
    const 盒 = 字.getBoundingClientRect();
    return { x: 盒.left + 盒.width / 2, y: 盒.top + 盒.height / 2 };`);
  await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 960 });
  await pause(60);
  await 发送('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 首处字.x,
    y: 首处字.y,
  });
  await pause(320);
  const 悬停后 = await 求值(`${S}
    const 出 = (字) => { const 样 = getComputedStyle(字, '::after'); return { 内容: 样.content, 可见: 样.visibility === 'visible' && Number(样.opacity) > 0.5 }; };
    const 首处 = document.querySelector('.字.命中.首处总数');
    const 其余 = [...document.querySelectorAll('.字.命中[data-hit-position]:not(.首处总数)')].filter((字) => { const 盒 = 字.getBoundingClientRect(); return 盒.top > 0 && 盒.bottom < window.innerHeight; });
    return { 悬停词: 状态.悬停关键词id, 首处: 出(首处), 其余: 其余.map(出) };`);
  console.log('悬停首处后:', JSON.stringify(悬停后));
  assert.match(悬停后.首处.内容, /^"\d+"$/, '悬停首处时也只报总数');
  if (!悬停后.其余.some((x) => x.可见))
    console.warn('提示：屏内没有别的关键词命中，悬停揭示这一项未验到');

  const 图 = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(
    join(项目根, 'tmp', '首处总数徽标-悬停中.png'),
    Buffer.from(图.data, 'base64'),
  );
  await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 960 });
  await pause(320);
  const 静止图 = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(
    join(项目根, 'tmp', '首处总数徽标-静止.png'),
    Buffer.from(静止图.data, 'base64'),
  );
  console.log('已写入 tmp/首处总数徽标-{静止,悬停中}.png');
  ws.close();
} finally {
  await 收尾();
}
