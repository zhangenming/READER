// 一次性验证脚本：点击章节标题行跳到下一章，Shift + 点击 跳到上一章。
// 覆盖：标记与悬停提示、单击前进 / Shift 后退、长标题折行的延续行同样可点、
// 末章不越界、双击仍走「复制整行」不抢跳章、标题行内的命中词保持关键词导航、
// 普通正文行点击不跳章。
// 自启 server.mjs + headless Chrome（CDP + Fetch 拦截喂 fixture），
// 按 AGENTS.md 规范清理 reader-* 一次性 profile（截图存项目 tmp/，与 profile 分开）。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const 截图路径 = join(项目根, 'tmp', '章节跳转-悬停提示.png');
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

// 上一次运行若被 SIGKILL/崩溃留下 reader-* 遗留 profile：先清掉确认无进程占用的
const 清理遗留profile = () => {
  for (const 名 of readdirSync(tmpdir())) {
    if (!名.startsWith('reader-')) continue;
    const 路径 = join(tmpdir(), 名);
    try {
      execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
      continue; // 有进程占用，跳过
    } catch {
      // pgrep 无匹配 → 无占用
    }
    rmSync(路径, { recursive: true, force: true });
    if (existsSync(路径)) {
      console.error('遗留 profile 清理失败:', 路径);
      process.exit(1);
    }
  }
};
清理遗留profile();

const 站点端口 = await 取空闲端口();
const CDP端口 = await 取空闲端口();
const 地址 = `http://127.0.0.1:${站点端口}/`;
const profile = mkdtempSync(join(tmpdir(), 'reader-chapter-click-'));
console.log('地址:', 地址, 'CDP:', CDP端口, 'profile:', profile);

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
    '--window-size=1280,900',
    地址,
  ],
  { stdio: 'ignore' },
);

let chrome已退出 = new Promise((r) => chrome.on('exit', r));
let 服务已退出 = new Promise((r) => 服务.on('exit', r));
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
    console.error('profile 清理失败，目录仍存在:', profile);
    process.exitCode = 1;
  } else {
    console.log('profile 已清理:', profile);
  }
}
process.on('exit', () => {
  chrome.kill();
  服务.kill();
});

// fixture：6 章，第 4 章标题长到必然折行；正文每段一句，保证章与章之间隔得开。
// 「潮水」在第 2 章标题与第 6 章正文各出现一次，用来验证标题行内的命中词仍走关键词导航。
const 正文 = (章名, 段数) =>
  Array.from({ length: 段数 }, (_, i) => `${章名}正文第${i + 1}句，用来撑开版面。`).join('\n');
const fixture = [
  ['第1章 起点', 8],
  ['第2章 中段与潮水', 8],
  ['第3章 前段', 8],
  [
    '第4章 这是一个长得必须折成两行才能排下的章节标题用来验证折行之后的延续行同样可以点击跳到下一章这条规则是否成立不成立的话就再加一些字凑够两行',
    8,
  ],
  ['第5章 后段', 8],
  ['第6章 末段', 8],
]
  .map(([标题, 段数], 索引) => {
    const 段落 = 正文(标题.slice(0, 3), 段数);
    return `${标题}\n${索引 === 5 ? 段落 + '\n第六段正文里也提到了潮水一次。' : 段落}`;
  })
  .join('\n\n');

try {
  async function 等待目标() {
    for (let i = 0; i < 150; i++) {
      try {
        const 列表 = await (
          await fetch(`http://127.0.0.1:${CDP端口}/json`)
        ).json();
        const 目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
        if (目标) return 目标;
      } catch {}
      await pause(200);
    }
    throw new Error('未找到 headless Chrome 页面');
  }

  const 目标 = await 等待目标();
  const ws = new WebSocket(目标.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let 序号 = 0;
  const 待回复 = new Map();
  const 页面日志 = [];
  ws.addEventListener('message', async (事件) => {
    const 消息 = JSON.parse(事件.data);
    if (消息.id) {
      const 请求 = 待回复.get(消息.id);
      待回复.delete(消息.id);
      if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
      else 请求.resolve(消息.result);
    } else if (消息.method === 'Runtime.consoleAPICalled') {
      页面日志.push(
        [消息.params.type, ...消息.params.args.map((a) => a.value ?? a.description ?? '')].join(' '),
      );
    } else if (消息.method === 'Runtime.exceptionThrown') {
      页面日志.push(
        'EXCEPTION: ' +
          (消息.params.exceptionDetails.exception?.description ||
            消息.params.exceptionDetails.text),
      );
    } else if (消息.method === 'Fetch.requestPaused') {
      await 发送('Fetch.fulfillRequest', {
        requestId: 消息.params.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'Content-Type', value: 'text/plain; charset=utf-8' },
        ],
        body: Buffer.from(fixture).toString('base64'),
      });
    }
  });
  function 发送(方法, 参数 = {}) {
    return new Promise((resolve, reject) => {
      const 下标 = ++序号;
      const 计时器 = setTimeout(() => {
        待回复.delete(下标);
        reject(new Error(`CDP 超时: ${方法}`));
      }, 20_000);
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
  const 失败 = (说明) =>
    `${说明}\n页面日志:\n${页面日志.slice(-8).join('\n')}`;

  await 发送('Page.enable');
  await 发送('Runtime.enable');
  await 发送('Fetch.enable', {
    patterns: [{ urlPattern: '*txt/*.txt', requestStage: 'Request' }],
  });
  await 发送('Page.reload', { ignoreCache: true });

  async function 等待就绪() {
    for (let n = 0; n < 200; n++) {
      try {
        const 好 = await 求值(
          'return document.querySelector("#载入状态")?.hidden && !!(await import("./js/状态.js")).状态.文件名',
        );
        if (好) return;
      } catch {}
      await pause(100);
    }
    throw new Error('阅读器载入超时');
  }
  await 等待就绪();

  const 状态前缀 = 'const { 状态, 元素 } = await import("./js/状态.js");';
  const 章节数 = await 求值(`${状态前缀} return 状态.章节列表.length;`);
  assert.equal(章节数, 6, 失败('fixture 应识别出 6 个章节标题'));

  async function 滚到(位置) {
    await 求值(`${状态前缀} 元素.滚动容器.scrollTop = ${位置};`);
    await pause(120);
  }
  const 滚动位置 = () => 求值(`${状态前缀} return 元素.滚动容器.scrollTop;`);
  const 当前索引 = () =>
    求值(
      `const { 读取当前章节 } = await import("./js/章节目录.js"); ${状态前缀} 元素.滚动容器.scrollTop; return 读取当前章节().索引;`,
    );
  const 章节行高 = () => 求值(`${状态前缀} return 状态.行高;`);
  const 期望顶部 = (索引) =>
    求值(`${状态前缀}
      const { 查找偏移所在行 } = await import("./js/排版引擎.js");
      return 查找偏移所在行(状态.章节列表[${索引}].偏移) * 状态.行高;`);

  // 取某章标题的第 n 个显示行的可点坐标（点第一个字，避开行首留白）
  function 取标题行(索引, 第几行 = 0) {
    return 求值(`${状态前缀}
      const 行列表 = [...document.querySelectorAll('.正文行[data-chapter-index="${索引}"]')];
      const 行 = 行列表[${第几行}];
      if (!行) return null;
      const 字 = 行.querySelector('.字');
      const 盒 = (字 || 行).getBoundingClientRect();
      const 强调探针 = document.createElement('span');
      强调探针.style.cssText = 'position:absolute;left:-9999px;color:var(--强调色)';
      document.body.append(强调探针);
      const 结果 = {
        x: 盒.left + 盒.width / 2,
        y: 盒.top + 盒.height / 2,
        类: 行.className,
        提示: getComputedStyle(行, '::after').content,
        提示透明度: getComputedStyle(行, '::after').opacity,
        提示色: getComputedStyle(行, '::after').color,
        光标: getComputedStyle(行).cursor,
        字色: 字 ? getComputedStyle(字).color : '',
        下划线: 字 ? getComputedStyle(字).textDecorationLine : '',
        强调色: getComputedStyle(强调探针).color,
        视口内: 盒.top >= 0 && 盒.bottom <= 元素.滚动容器.clientHeight + 元素.滚动容器.getBoundingClientRect().top,
      };
      强调探针.remove();
      return 结果;`);
  }

  async function 移动鼠标到(x, y) {
    await 发送('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    });
    await pause(220); // :hover 过渡 120ms
  }
  async function 点击(x, y, 修饰 = 0, 次数 = 1) {
    const 基 = { x, y, button: 'left', clickCount: 次数, modifiers: 修饰 };
    await 发送('Input.dispatchMouseEvent', { type: 'mousePressed', ...基 });
    await 发送('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...基,
    });
    await pause(次数 > 1 ? 60 : 0);
  }
  async function 等待动画结束(说明) {
    for (let n = 0; n < 80; n++) {
      if (await 求值(`${状态前缀} return !状态.滚动动画目标`)) {
        await pause(60);
        return;
      }
      await pause(50);
    }
    throw new Error(失败(`${说明}：跳转动画未在 4s 内结束`));
  }
  // 单击 → 150ms 判定延迟 + 动画；等到位置稳定
  async function 等待落位(说明) {
    await pause(220);
    await 等待动画结束(说明);
  }

  // ① 标记与提示：首章标题行带 章节标题行、指针光标、悬停提示文案
  await 滚到(0);
  const 首行 = await 取标题行(0);
  assert.ok(首行, 失败('① 第 1 章标题行应已渲染'));
  assert.ok(首行.类.includes('章节标题行'), 失败(`① 标题行应带标记类名：${首行.类}`));
  assert.equal(首行.光标, 'pointer', 失败('① 标题行光标应为 pointer'));
  assert.ok(首行.提示.includes('下一章'), 失败(`① 悬停提示应为「下一章 →」：${首行.提示}`));
  assert.equal(首行.提示透明度, '0', 失败('① 未悬停时提示应完全透明'));
  assert.notEqual(首行.字色, 首行.强调色, 失败(`① 未悬停时标题字色不应是强调色：${首行.字色}`));
  assert.ok(
    !/underline/.test(首行.下划线),
    失败(`① 未悬停时不应有下划线：${首行.下划线}`),
  );
  // 普通正文行不带标记
  const 普通行 = await 求值(`${状态前缀}
    const 行 = [...document.querySelectorAll('.正文行')].find(r => !r.dataset.chapterIndex && r.textContent);
    return { 类: 行.className, 光标: getComputedStyle(行).cursor };`);
  assert.ok(!普通行.类.includes('章节标题行'), 失败('① 普通正文行不应被标记为标题行'));
  assert.equal(普通行.光标, 'auto', 失败(`① 普通正文行光标应保持默认：${普通行.光标}`));

  // ② 悬停高亮：整条标题转强调色 + 下划线，行尾提示浮出并同色
  await 移动鼠标到(首行.x, 首行.y);
  const 悬停后 = await 取标题行(0);
  assert.ok(
    Number(悬停后.提示透明度) > 0.5,
    失败(`② 悬停后提示应浮出，实际透明度 ${悬停后.提示透明度}`),
  );
  assert.equal(悬停后.提示透明度, '1', 失败(`② 悬停后提示应完全不透明：${悬停后.提示透明度}`));
  assert.equal(悬停后.提示色, 悬停后.强调色, 失败(`② 提示应与标题同为强调色：${悬停后.提示色} vs ${悬停后.强调色}`));
  assert.equal(悬停后.字色, 悬停后.强调色, 失败(`② 悬停后标题字色应为强调色：${悬停后.字色}`));
  assert.ok(
    /underline/.test(悬停后.下划线),
    失败(`② 悬停后标题应有下划线：${悬停后.下划线}`),
  );
  // 移出后应退回原样（不残留高亮）
  await 移动鼠标到(悬停后.x, 悬停后.y - 300);
  const 移出后 = await 取标题行(0);
  assert.notEqual(移出后.字色, 移出后.强调色, 失败('② 移出后标题字色应退回正文色'));
  await 移动鼠标到(首行.x, 首行.y);
  await pause(200);
  const 截图 = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(截图路径, Buffer.from(截图.data, 'base64'));
  console.log('悬停提示截图已写入:', 截图路径);

  // ③ 单击跳到下一章，逐章前进
  for (const 起点索引 of [0, 1, 2]) {
    await 滚到(await 期望顶部(起点索引));
    const 行 = await 取标题行(起点索引);
    assert.ok(行 && 行.视口内, 失败(`③ 第 ${起点索引 + 1} 章标题行应在视口内`));
    await 点击(行.x, 行.y);
    await 等待落位('③ 单击跳章');
    const 位置 = await 滚动位置();
    const 期望 = await 期望顶部(起点索引 + 1);
    assert.ok(
      Math.abs(位置 - 期望) < 1,
      失败(`③ 单击第 ${起点索引 + 1} 章应跳到第 ${起点索引 + 2} 章顶部：期望 ${期望}，实际 ${位置}`),
    );
    assert.equal(
      await 当前索引(),
      起点索引 + 1,
      失败(`③ 单击后当前章节索引应为 ${起点索引 + 1}`),
    );
  }

  // ④ 长标题折行：延续行同样可点，且不带悬停提示（首行已写满行宽）
  await 滚到(await 期望顶部(3));
  const 折行首行 = await 取标题行(3, 0);
  const 折行延续行 = await 取标题行(3, 1);
  assert.ok(折行首行 && 折行延续行, 失败('④ 第 4 章标题应折成两个显示行'));
  assert.ok(折行延续行.类.includes('章节标题行'), 失败(`④ 延续行也应可点：${折行延续行.类}`));
  assert.ok(折行延续行.类.includes('折行句'), 失败('④ 延续行应带折行句标记'));
  assert.ok(
    !折行延续行.提示.includes('下一章'),
    失败(`④ 折行标题不应浮出提示：${折行延续行.提示}`),
  );
  await 点击(折行延续行.x, 折行延续行.y);
  await 等待落位('④ 点延续行跳章');
  assert.ok(
    Math.abs((await 滚动位置()) - (await 期望顶部(4))) < 1,
    失败(`④ 点折行延续行应跳到第 5 章，实际 ${await 滚动位置()}`),
  );

  // ⑤ Shift + 单击 回到上一章
  await 滚到(await 期望顶部(4));
  const 第五章行 = await 取标题行(4);
  assert.ok(第五章行 && 第五章行.视口内, 失败('⑤ 第 5 章标题行应在视口内'));
  await 点击(第五章行.x, 第五章行.y, 8); // 8 = Shift
  await 等待落位('⑤ Shift 单击跳章');
  assert.ok(
    Math.abs((await 滚动位置()) - (await 期望顶部(3))) < 1,
    失败(`⑤ Shift+单击应回到第 4 章，实际 ${await 滚动位置()}`),
  );
  assert.equal(await 当前索引(), 3, 失败('⑤ Shift+单击后当前章节索引应为 3'));

  // ⑥ 末章没有下一章：保持原位
  await 滚到(await 期望顶部(5));
  const 末章行 = await 取标题行(5);
  assert.ok(末章行 && 末章行.视口内, 失败('⑥ 末章标题行应在视口内'));
  assert.ok(
    !末章行.提示.includes('下一章'),
    失败(`⑥ 末章提示不应写「下一章」：${末章行.提示}`),
  );
  const 末章位置 = await 滚动位置();
  await 点击(末章行.x, 末章行.y);
  await pause(400);
  assert.equal(await 滚动位置(), 末章位置, 失败('⑥ 末章单击不应移动阅读位置'));
  // 但 Shift 回上一章可用
  await 点击(末章行.x, 末章行.y, 8);
  await 等待落位('⑥ 末章 Shift 回上一章');
  assert.ok(
    Math.abs((await 滚动位置()) - (await 期望顶部(4))) < 1,
    失败(`⑥ 末章 Shift+单击应回到第 5 章，实际 ${await 滚动位置()}`),
  );

  // ⑦ 双击标题行：仍是「选中并复制整行」，不抢跳章
  await 滚到(await 期望顶部(1));
  const 第二章行 = await 取标题行(1);
  const 双击前 = await 滚动位置();
  await 点击(第二章行.x, 第二章行.y, 0, 1);
  await 点击(第二章行.x, 第二章行.y, 0, 2);
  await pause(500);
  assert.equal(await 滚动位置(), 双击前, 失败('⑦ 双击标题行不应跳章'));
  const 选中 = await 求值(`const 选择 = window.getSelection();
    return { 折叠: 选择.isCollapsed, 文本: 选择.toString() };`);
  assert.ok(!选中.折叠, 失败('⑦ 双击标题行应仍选中整行'));
  assert.ok(选中.文本.includes('第2章'), 失败(`⑦ 选中内容应为该行：${选中.文本}`));

  // ⑧ 标题行内的命中词：单击仍走关键词导航（跳到该词的下一处命中），不跳章
  await 求值(`${状态前缀}
    const { 添加关键词标记 } = await import("./js/关键词.js");
    添加关键词标记('潮水', 状态.文本.indexOf('潮水'));`);
  await pause(200);
  await 滚到(await 期望顶部(1));
  const 命中坐标 = await 求值(`${状态前缀}
    const 行 = document.querySelector('.正文行[data-chapter-index="1"]');
    const 字 = [...行.querySelectorAll('.字.命中')][0];
    if (!字) return null;
    const 盒 = 字.getBoundingClientRect();
    return { x: 盒.left + 盒.width / 2, y: 盒.top + 盒.height / 2, 命中数: 状态.关键词列表[0].命中位置.length };`);
  assert.ok(命中坐标, 失败('⑧ 第 2 章标题行内应出现命中字'));
  assert.equal(命中坐标.命中数, 2, 失败('⑧ fixture 应让「潮水」出现两次'));
  // 悬停标题行时，命中字不参与强调色（它自带黑底白字，叠色只会更花）
  await 移动鼠标到(命中坐标.x, 命中坐标.y);
  const 命中字样式 = await 求值(`${状态前缀}
    const 行 = document.querySelector('.正文行[data-chapter-index="1"]');
    const 命中字 = 行.querySelector('.字.命中');
    const 普通字 = [...行.querySelectorAll('.字')].find((字) => !字.classList.contains('命中'));
    const 探针 = document.createElement('span');
    探针.style.cssText = 'position:absolute;left:-9999px;color:var(--强调色)';
    document.body.append(探针);
    const 结果 = {
      命中色: getComputedStyle(命中字).color,
      普通色: getComputedStyle(普通字).color,
      强调色: getComputedStyle(探针).color,
      命中下划线: getComputedStyle(命中字).textDecorationLine,
    };
    探针.remove();
    return 结果;`);
  assert.notEqual(命中字样式.命中色, 命中字样式.强调色, 失败(`⑧ 悬停时命中字不应变强调色：${命中字样式.命中色}`));
  assert.equal(命中字样式.普通色, 命中字样式.强调色, 失败(`⑧ 悬停时标题普通字应变强调色：${命中字样式.普通色}`));
  assert.ok(!/underline/.test(命中字样式.命中下划线), 失败('⑧ 命中字不应被压上下划线'));
  await 点击(命中坐标.x, 命中坐标.y);
  await 等待落位('⑧ 标题内命中词单击');
  assert.notEqual(
    await 当前索引(),
    1,
    失败('⑧ 点击标题内命中词后不应仍停在第 2 章（说明走到了跳章分支）'),
  );
  assert.equal(
    await 当前索引(),
    5,
    失败('⑧ 点击标题内命中词应跳到该词的下一处命中（第 6 章正文）'),
  );
  assert.ok(
    Math.abs((await 滚动位置()) - (await 期望顶部(2))) >
      (await 章节行高()) * 3,
    失败('⑧ 命中词导航不应等于「跳到下一章」的位置'),
  );

  // ⑨ 普通正文行单击不跳章
  await 求值(`${状态前缀}
    const { 删除关键词标记 } = await import("./js/关键词.js");
    for (const 关键词 of [...状态.关键词列表]) 删除关键词标记(关键词.id);`);
  await pause(150);
  await 滚到(await 期望顶部(2));
  const 正文坐标 = await 求值(`${状态前缀}
    const 行 = [...document.querySelectorAll('.正文行')].find(r => !r.dataset.chapterIndex && r.textContent.includes('正文'));
    const 字 = 行.querySelector('.字');
    const 盒 = 字.getBoundingClientRect();
    return { x: 盒.left + 盒.width / 2, y: 盒.top + 盒.height / 2 };`);
  const 正文前 = await 滚动位置();
  await 点击(正文坐标.x, 正文坐标.y);
  await pause(400);
  assert.equal(await 滚动位置(), 正文前, 失败('⑨ 普通正文行单击不应跳章'));

  // ⑩ 行首留白上的 Shift + 点击也要能跳章（原生扩选需被压掉，否则选区非折叠会吞掉跳转）
  await 滚到(await 期望顶部(2));
  const 留白坐标 = await 求值(`${状态前缀}
    const 行 = document.querySelector('.正文行[data-chapter-index="2"]');
    const 盒 = 行.getBoundingClientRect();
    return { x: 盒.left + 3, y: 盒.top + 盒.height / 2 };`);
  await 点击(留白坐标.x, 留白坐标.y, 8);
  await 等待落位('⑩ 行首留白 Shift 单击');
  assert.ok(
    Math.abs((await 滚动位置()) - (await 期望顶部(1))) < 1,
    失败(`⑩ 点标题行行首留白 Shift+单击应回到第 2 章，实际 ${await 滚动位置()}`),
  );

  console.log(
    '\nOK：点击章节标题行跳下一章、Shift+点击 跳上一章；折行标题整段可点；末章不越界；双击与命中词行为不变',
  );
  ws.close();
} finally {
  await 收尾();
}
