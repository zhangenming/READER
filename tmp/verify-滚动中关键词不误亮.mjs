// 一次性验证脚本：自动滚动进行中，正文从静止的指针下方掠过，掠过的关键词不得点亮。
// 用户视角：滚动时鼠标已经藏起来了（body.自动滚动中 → cursor:none），但指针没动、
// 字在动，浏览器仍会为「掠过」重算 hover → 黑底整组铺开 + x/y 徽标 + 左缘换列 + 标题行变红。
// 修复：styles.css 的 `body.自动滚动中 .字.命中 / .正文行.章节标题行 { pointer-events:none }`
// —— 让指针穿过这两类元素，JS 悬停与 CSS :hover 一起安静；停止滚动后立刻恢复。
// 用例里带一枚「反向对照」：把 pointer-events 强行改回 auto 再滚一遍，必须重新亮起来，
// 否则说明这条断言根本没在量它声称的东西。
// 按 AGENTS.md：自己创建的 reader-* profile 在 finally 里停进程后删除。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const 站点端口 = Number(process.env.SITE_PORT || 16131);
const CDP端口 = Number(process.env.VERIFY_CDP_PORT || 9631);
const 书名 = '原则.txt';
const 地址 = `http://127.0.0.1:${站点端口}/`;
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

async function 等端口空闲(端口, 说明) {
  for (let n = 0; n < 50; n++) {
    const 空闲 = await new Promise((resolve) => {
      const s = createServer();
      s.on('error', () => resolve(false));
      s.listen(端口, '127.0.0.1', () => s.close(() => resolve(true)));
    });
    if (空闲) return;
    await pause(200);
  }
  throw new Error(`${说明} ${端口} 一直被占用`);
}

function 清理遗留profile(跳过) {
  for (const 名 of readdirSync(tmpdir())) {
    if (!名.startsWith('reader-')) continue;
    const 路径 = join(tmpdir(), 名);
    if (路径 === 跳过) continue;
    try {
      execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
      continue; // 还有进程占着，留给下一次
    } catch {}
    rmSync(路径, { recursive: true, force: true });
  }
}

await 等端口空闲(站点端口, '站点端口');
await 等端口空闲(CDP端口, 'CDP端口');
const profile = mkdtempSync(join(tmpdir(), 'reader-hover-verify-'));
清理遗留profile(profile);

const 服务 = spawn('node', ['server.mjs', String(站点端口)], {
  cwd: 项目根,
  stdio: 'ignore',
});
服务.stdout?.resume();
服务.stderr?.resume();
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
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

let ws = null;
let 序号 = 0;
const 待回复 = new Map();
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
    throw new Error(
      结果.exceptionDetails.exception?.description ||
        JSON.stringify(结果.exceptionDetails),
    );
  return 结果.result.value;
}
async function 按键(key, code, keyCode, 修饰 = 0) {
  const 基 = {
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers: 修饰,
  };
  await 发送('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...基 });
  await 发送('Input.dispatchKeyEvent', { type: 'keyUp', ...基 });
  await pause(150);
}
async function 移动鼠标(x, y) {
  await 发送('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    buttons: 0,
  });
  await pause(160);
}

async function 连接页面() {
  for (let n = 0; n < 150; n++) {
    try {
      const 列表 = await (
        await fetch(`http://127.0.0.1:${CDP端口}/json`)
      ).json();
      const 目标 = 列表.find(
        (t) => t.type === 'page' && t.url.startsWith(地址),
      );
      if (!目标) continue;
      ws = new WebSocket(目标.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener('open', r, { once: true }));
      ws.addEventListener('message', (事件) => {
        const 消息 = JSON.parse(事件.data);
        if (!消息.id) return;
        const 请求 = 待回复.get(消息.id);
        待回复.delete(消息.id);
        if (!请求) return;
        if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
        else 请求.resolve(消息.result);
      });
      await 发送('Runtime.enable');
      return;
    } catch {}
    await pause(300);
  }
  throw new Error('headless Chrome 页面未就绪');
}

async function 载入一本书() {
  await 求值(`
    const { 打开内容选择弹窗 } = await import("./js/内容选择弹窗.js");
    打开内容选择弹窗();
    return 1;`);
  for (let n = 0; n < 60; n++) {
    if (await 求值(`const {状态}=await import("./js/状态.js"); return !!状态.文件名;`))
      return;
    const 点到 = await 求值(`
      const 按钮 = [...document.querySelectorAll('#内容选择列表 [data-file-name]')]
        .find(b => b.dataset.fileName === ${JSON.stringify(书名)})
        ?? document.querySelector('#内容选择列表 [data-file-name]');
      if (!按钮) return false;
      按钮.click();
      return true;`);
    await pause(点到 ? 800 : 400);
  }
  throw new Error(`未能载入 ${书名}`);
}

/* 造一枚**密**的关键词：先统计全文二元组词频，再从已渲染的正文里挑一枚全局出现最多的。
   命中稀（一本书十处）的话，指针下方几十屏都碰不到一枚字，用例就什么也没量到。 */
async function 造关键词() {
  return 求值(`
    const { 状态 } = await import("./js/状态.js");
    const { 添加关键词标记 } = await import("./js/关键词.js");
    const { 关闭内容选择弹窗 } = await import("./js/内容选择弹窗.js");
    关闭内容选择弹窗();
    const 全文 = 状态.文本;
    const 词频 = new Map();
    for (let i = 0; i + 2 <= 全文.length; i++) {
      const 串 = 全文.slice(i, i + 2);
      if (!/^[\u4e00-\u9fa5]{2}$/.test(串)) continue;
      词频.set(串, (词频.get(串) ?? 0) + 1);
    }
    const 可见 = document.querySelector('#可见内容').textContent;
    let 最佳 = null;
    for (let i = 0; i + 2 <= 可见.length; i++) {
      const 串 = 可见.slice(i, i + 2);
      const 次 = 词频.get(串);
      if (!次) continue;
      if (!最佳 || 次 > 最佳.次) 最佳 = { 串, 次 };
    }
    if (!最佳) return null;
    添加关键词标记(最佳.串, -1);
    return { 词: 最佳.串, 全文次数: 最佳.次, 命中数: 状态.关键词列表.find(k => k.文本 === 最佳.串).命中位置.length };
  `);
}

const 悬停样态 = () =>
  求值(`
    const { 状态 } = await import("./js/状态.js");
    return {
      自动滚动中: document.body.classList.contains('自动滚动中'),
      同组悬停数: document.querySelectorAll('.字.命中.同组悬停').length,
      悬停命中数: document.querySelectorAll('.字.命中.悬停命中').length,
      揭示中: document.querySelector('#可见内容').classList.contains('悬停揭示中'),
      徽标行数: document.querySelectorAll('.正文行.含悬停徽标').length,
      悬停关键词id: 状态.悬停关键词id,
      悬停章节索引: 状态.悬停章节索引,
      标题行悬停: document.querySelectorAll('.正文行.章节标题行:hover').length,
      命中悬停: document.querySelectorAll('.字.命中:hover').length,
    };
  `);

/* 让一枚命中字真的从静止的指针下方掠过，回来报告每一帧的悬停样态。
   指针落点不是随便挑的：先在屏上找一枚位于指针下方的命中字，把指针按它的 X、
   再按「它滚到屏中段时所在的位置」定 Y —— 这样正文滚过 目标提前量 时，这一枚必然压在指针点上。
   掠过与否按几何判定（rect 是否覆盖指针点），不能用 elementFromPoint：
   它读的正是 pointer-events，那正是被测对象。 */
async function 滚过指针(说明) {
  /* 指针落点：找一枚位于指针下方的命中字，把指针钉在它的 X、以及它滚到屏中段时所在的 Y 上。
     命中不够密时屏下可能一枚都没有，就就地往下翻几屏再找。 */
  const 找指针 = () =>
    求值(`
      const 容器 = document.querySelector('#滚动容器');
      const r = 容器.getBoundingClientRect();
      const 指针Y = Math.round(r.top + r.height * 0.45);
      let 目标 = null;
      for (const 字 of document.querySelectorAll('.字.命中')) {
        const b = 字.getBoundingClientRect();
        const 提前量 = b.top + b.height / 2 - 指针Y;
        if (提前量 < 140 || 提前量 > 1400) continue;
        if (!目标 || 提前量 < 目标.提前量) 目标 = { 提前量, x: b.left + b.width / 2 };
      }
      return 目标 ? { x: Math.round(目标.x), y: 指针Y, 提前量: Math.round(目标.提前量) } : null;
    `);
  let 指针 = await 找指针();
  for (let k = 0; k < 12 && !指针; k++) {
    await 求值(`document.querySelector('#滚动容器').scrollTop += 700; return 1;`);
    await pause(300);
    指针 = await 找指针();
  }
  if (process.env.DEBUG_HOVER)
    console.log('调试:', await 求值(`
      const 容器 = document.querySelector('#滚动容器');
      const r = 容器.getBoundingClientRect();
      return {
        容器: [Math.round(r.top), Math.round(r.height)],
        scrollTop: 容器.scrollTop,
        命中: [...document.querySelectorAll('.字.命中')].map((字) => {
          const b = 字.getBoundingClientRect();
          return [字.textContent, Math.round(b.top), Math.round(b.bottom), Math.round(b.left), Math.round(b.width)];
        }),
        正文行数: document.querySelectorAll('.正文行').length,
      };
    `));
  assert.ok(指针, `${说明}：屏上找不到可供指针掠过的一枚命中字，样本无效`);
  await 求值(`
    const { 状态 } = await import("./js/状态.js");
    const { 更新自动滚动速度 } = await import("./js/自动滚动.js");
    状态.自动滚动速度 = 90; // 默认 36 像素/秒太慢，一枚字压在指针上不到 0.8 秒就滚完
    更新自动滚动速度();
    return 1;`);
  const 起始 = await 求值(
    `return document.querySelector('#滚动容器').scrollTop;`,
  );
  await 按键('d', 'KeyD', 68, 2); // 先起一次，确保会话已激活
  assert.equal(
    await 求值(`
      const { 自动滚动进行中 } = await import("./js/自动滚动.js");
      return 自动滚动进行中();
    `),
    true,
    `${说明}：Ctrl+D 应启动自动滚动`,
  );
  await 移动鼠标(指针.x, 指针.y); // 落指针（顺带停掉滚动）
  await 按键('d', 'KeyD', 68, 2); // 重新滚动，指针就位
  await pause(250);

  const 样态列表 = [];
  let 掠过帧数 = 0;
  let 位移 = 0;
  for (let n = 0; n < 120; n++) {
    const 数据 = await 求值(`
      const { 状态 } = await import("./js/状态.js");
      const 容器 = document.querySelector('#滚动容器');
      let 掠过 = 0;
      for (const 字 of document.querySelectorAll('.字.命中')) {
        const b = 字.getBoundingClientRect();
        if (b.left <= ${指针.x} && b.right >= ${指针.x} && b.top <= ${指针.y} && b.bottom >= ${指针.y}) 掠过++;
      }
      return { 样态: {
          自动滚动中: document.body.classList.contains('自动滚动中'),
          同组悬停数: document.querySelectorAll('.字.命中.同组悬停').length,
          悬停命中数: document.querySelectorAll('.字.命中.悬停命中').length,
          揭示中: document.querySelector('#可见内容').classList.contains('悬停揭示中'),
          徽标行数: document.querySelectorAll('.正文行.含悬停徽标').length,
          悬停关键词id: 状态.悬停关键词id,
          悬停章节索引: 状态.悬停章节索引,
          标题行悬停: document.querySelectorAll('.正文行.章节标题行:hover').length,
          命中悬停: document.querySelectorAll('.字.命中:hover').length,
        },
        掠过,
        滚动位置: 容器.scrollTop,
      };
    `);
    样态列表.push({ ...数据.样态, 掠过: 数据.掠过 });
    if (数据.掠过 > 0) 掠过帧数++;
    位移 = 数据.滚动位置 - 起始;
    if (位移 > 指针.提前量 + 90) break; // 目标已滚过指针点，再滚只是重复取样
    await pause(45);
  }
  await 按键('d', 'KeyD', 68, 2); // 停
  await pause(200);
  return {
    样态列表,
    掠过帧数,
    位移,
    指针,
  };
}

try {
  await 连接页面();
  await 载入一本书();
  console.log(
    '已载入:',
    await 求值(`
      const { 状态 } = await import("./js/状态.js");
      return { 文件名: 状态.文件名, 章节数: 状态.章节列表?.length ?? '无', 文本长度: 状态.文本.length };
    `),
  );
  const 词 = await 造关键词();
  const 在屏命中 = await 求值(
    'return document.querySelectorAll(".字.命中").length;',
  );
  console.log('关键词:', 词, '屏上命中字:', 在屏命中);
  assert.ok(词 && 词.命中数 >= 40, `需要一枚多处命中（≥40）的关键词，实际 ${JSON.stringify(词)}`);
  assert.ok(在屏命中 > 0, '屏上应至少有一处命中字，否则指针无从掠过');

  const 视口 = await 求值('return {w: innerWidth, h: innerHeight};');

  // ① 静止时悬停仍照常工作（这条不通，后面的「不许亮」就没有意义）
  const 基线 = await 求值(`
    const 命中列表 = [...document.querySelectorAll('.字.命中')];
    const 字 = 命中列表.find((x) => { const b = x.getBoundingClientRect(); return b.top > 120 && b.bottom < innerHeight - 120 && b.width > 0; }) ?? 命中列表[0];
    const b = 字.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), 词: 字.textContent };
  `);
  await 移动鼠标(12, 12); // 先挪开：悬停挂起后要靠一次真正的移动才恢复
  await 移动鼠标(基线.x, 基线.y);
  await 移动鼠标(基线.x + 1, 基线.y + 1);
  const 静止样态 = await 悬停样态();
  console.log('静止悬停:', 静止样态);
  assert.ok(
    静止样态.同组悬停数 > 0 && 静止样态.揭示中,
    `指针停在命中上应点亮整组（同组悬停=${静止样态.同组悬停数} 揭示中=${静止样态.揭示中}）`,
  );

  // ② 修复后：自动滚动中掠过指针，一处都不许亮
  const 修复后 = await 滚过指针('修复后');
  console.log(
    `滚动中（修复后）: 指针=${JSON.stringify(修复后.指针)} 位移=${Math.round(修复后.位移)} 帧=${修复后.样态列表.length} 掠过帧=${修复后.掠过帧数}`,
    '\n  掠过指针的那几帧:',
    修复后.样态列表.filter((f) => f.掠过 > 0),
  );
  assert.ok(
    修复后.位移 > 修复后.指针.提前量,
    `正文应真的滚到指针那一行：位移 ${Math.round(修复后.位移)} 提前量 ${修复后.指针.提前量}`,
  );
  assert.ok(修复后.掠过帧数 >= 1, `指针下应确实有命中字掠过，只有 ${修复后.掠过帧数} 帧，样本无效`);
  for (const [i, 样态] of 修复后.样态列表.entries()) {
    assert.equal(样态.自动滚动中, true, `第 ${i} 帧应仍在自动滚动中`);
    assert.equal(样态.同组悬停数, 0, `第 ${i} 帧不得有 同组悬停：${JSON.stringify(样态)}`);
    assert.equal(样态.悬停命中数, 0, `第 ${i} 帧不得有 悬停命中`);
    assert.equal(样态.徽标行数, 0, `第 ${i} 帧不得有 含悬停徽标 行`);
    assert.equal(样态.揭示中, false, `第 ${i} 帧 .可见内容 不得挂 悬停揭示中`);
    assert.equal(样态.悬停关键词id, null, `第 ${i} 帧 状态.悬停关键词id 应为 null`);
    assert.equal(样态.命中悬停, 0, `第 ${i} 帧 命中 不得进入 :hover`);
    assert.equal(样态.标题行悬停, 0, `第 ${i} 帧 章节标题行 不得进入 :hover`);
  }

  // ③ 反向对照：把命中测试改回去，同一套断言必须失败（说明这条断言真的在量 pointer-events）
  await 求值(`
    const 样式 = document.createElement('style');
    样式.id = '对照-放开命中测试';
    样式.textContent = 'body.自动滚动中 .字.命中, body.自动滚动中 .正文行.章节标题行 { pointer-events: auto !important; }';
    document.head.appendChild(样式);
    return 1;`);
  const 对照 = await 滚过指针('对照');
  console.log(
    `滚动中（放开命中测试）: 指针=${JSON.stringify(对照.指针)} 位移=${Math.round(对照.位移)} 帧=${对照.样态列表.length} 掠过帧=${对照.掠过帧数}`,
    '\n  掠过指针的那几帧:',
    对照.样态列表.filter((f) => f.掠过 > 0),
  );
  const 对照亮帧 = 对照.样态列表.filter(
    (s) => s.同组悬停数 > 0 || s.揭示中 || s.命中悬停 > 0,
  ).length;
  assert.ok(
    对照亮帧 > 0,
    '对照失败：即使把命中测试放开也不亮 —— 说明 ② 的通过不是这套机制挡住的，断言无效',
  );
  await 求值(`document.getElementById('对照-放开命中测试').remove(); return 1;`);

  // ④ 停止滚动后，指针移到命中上应立刻恢复点亮
  await 移动鼠标(Math.round(视口.w / 2), Math.round(视口.h / 4));
  const 目标 = await 求值(`
    const 命中列表 = [...document.querySelectorAll('.字.命中')];
    const 字 = 命中列表.find((x) => { const b = x.getBoundingClientRect(); return b.top > 120 && b.bottom < innerHeight - 120; }) ?? 命中列表[0];
    const b = 字.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  `);
  await 移动鼠标(12, 12);
  await 移动鼠标(目标.x, 目标.y);
  await 移动鼠标(目标.x + 1, 目标.y + 1);
  const 恢复样态 = await 悬停样态();
  console.log('停止后悬停:', 恢复样态);
  assert.equal(恢复样态.自动滚动中, false, '鼠标移动应停止自动滚动');
  assert.ok(
    恢复样态.同组悬停数 > 0 && 恢复样态.揭示中,
    `停止后悬停必须恢复（同组悬停=${恢复样态.同组悬停数} 揭示中=${恢复样态.揭示中}）`,
  );

  // ⑤ 机制本身：类挂上时指针必须穿过这两类元素，类卸下时必须还能指到（② 的前提）。
  // 命中字与章节标题行各测一次——跳章之后屏上未必还有命中字，同一屏凑不齐两样。
  const 判指针穿不穿 = async (选择器) =>
    求值(`
      const 探针 = (元素) => {
        const b = 元素.getBoundingClientRect();
        const 指到 = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return !!指到 && (指到 === 元素 || 元素.contains(指到));
      };
      const 在屏 = () =>
        [...document.querySelectorAll(${JSON.stringify(选择器)})].find((元素) => {
          const b = 元素.getBoundingClientRect();
          return b.width > 0 && b.top > 4 && b.bottom < innerHeight - 4;
        }) ?? null;
      const 取样 = (类) => {
        document.body.classList.toggle('自动滚动中', 类);
        const 元素 = 在屏();
        return 元素 ? 探针(元素) : '屏上无';
      };
      const 平时 = 取样(false);
      const 滚动中 = 取样(true);
      document.body.classList.remove('自动滚动中');
      return { 平时, 滚动中 };
    `);

  const 命中穿 = await 判指针穿不穿('.字.命中');
  console.log('指针落点判定（命中字）:', 命中穿);
  assert.equal(命中穿.平时, true, '平时指针应指得到命中字（否则探针无效）');
  assert.equal(命中穿.滚动中, false, '自动滚动中指针必须穿过命中字');

  console.log(
    '跳到章节:',
    await 求值(`
      const { 状态 } = await import("./js/状态.js");
      const 章 = 状态.章节列表[Math.floor(状态.章节列表.length / 2)];
      if (!章) return null;
      let 行idx = 0;
      for (let i = 0; i < 状态.行起点列表.length; i++) {
        if (状态.行起点列表[i] <= 章.偏移) 行idx = i;
        else break;
      }
      const 容器 = document.querySelector('#滚动容器');
      容器.scrollTop = Math.max(0, 行idx * 状态.行高 - 容器.clientHeight * 0.42);
      return { 标题: 章.标题, 行idx };
    `),
  );
  await pause(360);
  const 标题穿 = await 判指针穿不穿('.正文行.章节标题行');
  console.log('指针落点判定（章节标题行）:', 标题穿);
  assert.equal(标题穿.平时, true, '平时指针应指得到章节标题行（否则探针无效）');
  assert.equal(标题穿.滚动中, false, '自动滚动中指针必须穿过章节标题行');

  // ⑥ 不许扩大打击面：正文之外的东西，挂不挂这个类的命中测试结果必须一模一样
  //     （右下角按钮组自己就有「隐藏时 pointer-events:none」的规则，不能拿它当尺子）
  const 控件 = await 求值(`
    const 取 = (选择器) => {
      const 元素 = document.querySelector(选择器);
      return 元素 ? getComputedStyle(元素).pointerEvents : '缺失';
    };
    const 量 = () => ({
      面板开关: 取('.关键词面板开关'),
      白轴: 取('#滚动进度'),
      正文行: 取('.正文行'),
      普通字: 取('.正文行 > .字'),
    });
    document.body.classList.remove('自动滚动中');
    const 平时 = 量();
    document.body.classList.add('自动滚动中');
    const 滚动中 = 量();
    document.body.classList.remove('自动滚动中');
    return { 平时, 滚动中 };
  `);
  console.log('控件命中测试:', 控件);
  for (const [名称, 值] of Object.entries(控件.滚动中))
    assert.equal(值, 控件.平时[名称], `「${名称}」不该受这个类影响：平时 ${控件.平时[名称]}，滚动中 ${值}`);

  console.log('\nOK：自动滚动掠过指针不再点亮关键词与标题行；静止与停止后悬停照常');
  ws.close();
} catch (错误) {
  console.error('验证失败:', 错误);
  process.exitCode = 1;
} finally {
  ws?.close();
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
    console.error('profile 清理失败，目录仍存在:', profile);
    process.exitCode = 1;
  }
}
