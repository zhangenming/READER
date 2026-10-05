// 一次性验证脚本：悬停某一处命中时，被悬停关键词仍只在光标这一处显示 x/y 徽标，
// 屏上其余关键词的每一处命中都要显示自己的 x/y；移开后收回。
// 覆盖：未悬停只有当前命中与各词首末两端的常驻总数徽标、悬停期间的逐字可见性与所在行放行溢出、
// 换悬停目标时被换掉的组不再铺徽标、移开全部收回、出图供肉眼确认没被相邻行裁掉。
// 自启 server.mjs + headless Chrome（CDP + Fetch 拦截喂 fixture），按 AGENTS.md 清理 reader-* profile。
import assert from 'node:assert/strict';
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
const profile = mkdtempSync(join(tmpdir(), 'reader-hover-badge-'));
console.log('地址:', 地址, 'CDP:', CDP端口);

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
const chrome已退出 = new Promise((r) => chrome.on('exit', r));
const 服务已退出 = new Promise((r) => 服务.on('exit', r));
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

// 12 行，每行 阿尔法×1 贝塔×2 伽马×1，全部落在同一屏内，
// 悬停任意一组时其余两组的徽标都必须铺开，且同行多枚徽标彼此不重叠。
const fixture = Array.from(
  { length: 12 },
  (_, i) => `第${i + 1}行阿尔法遇见贝塔，贝塔又遇见伽马。`,
).join('\n');

try {
  async function 等待目标() {
    for (let i = 0; i < 150; i++) {
      try {
        const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
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
          (消息.params.exceptionDetails.exception?.description || 消息.params.exceptionDetails.text),
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
  const 失败 = (说明) => `${说明}\n页面日志:\n${页面日志.slice(-8).join('\n')}`;
  const S = 'const { 状态, 元素 } = await import("./js/状态.js");';

  await 发送('Page.enable');
  await 发送('Runtime.enable');
  await 发送('Fetch.enable', {
    patterns: [{ urlPattern: '*txt/*.txt', requestStage: 'Request' }],
  });
  await 发送('Page.reload', { ignoreCache: true });
  for (let n = 0; n < 200; n++) {
    try {
      if (
        (await 求值(
          'return document.querySelector("#载入状态")?.hidden && !!(await import("./js/状态.js")).状态.文件名',
        ))
      )
        break;
    } catch {}
    await pause(100);
  }
  await pause(300);

  // 三个多命中关键词：阿尔法 12 处、贝塔 24 处、伽马 12 处；最后加的伽马是当前关键词组
  await 求值(`${S}
    const { 添加关键词标记 } = await import('./js/关键词.js');
    for (const 词 of ['阿尔法', '贝塔', '伽马']) 添加关键词标记(词, 状态.文本.indexOf(词));`);
  await pause(400);
  assert.equal(await 求值(`${S} return 状态.关键词列表.length;`), 3, 失败('应标记出 3 个关键词'));
  assert.deepEqual(
    await 求值(`${S} return 状态.关键词列表.map((词) => 词.命中位置.length);`),
    [12, 24, 12],
    失败('fixture 命中数应为 12/24/12'),
  );

  // 读每处徽标的可见性与所在行的溢出放行，外加容器状态
  const 读徽标 = () =>
    求值(`${S}
      const 出 = [];
      for (const 字 of document.querySelectorAll('.字.命中[data-hit-position]')) {
        const 样 = getComputedStyle(字, '::after');
        const 行 = 字.closest('.正文行');
        出.push({
          词id: 字.dataset.keywordId,
          idx: Number(字.dataset.hitIndex),
          序号: 字.dataset.hitPosition,
          可见: 样.visibility === 'visible' && Number(样.opacity) > 0.5,
          两端: 字.classList.contains('总数徽标'),
          内容: 样.content,
          行放行: getComputedStyle(行).overflow === 'visible',
          当前: 字.classList.contains('当前命中'),
          悬停: 字.classList.contains('悬停命中'),
          同组: 字.classList.contains('同组悬停'),
        });
      }
      return {
        列表: 出,
        揭示中: 元素.可见内容.classList.contains('悬停揭示中'),
        悬停词id: 状态.悬停关键词id,
      };`);

  async function 移到(x, y) {
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 860 });
    await pause(40);
    await 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await pause(220);
  }
  // 取某一处命中的「终点字」中心坐标——徽标就画在终点字右上角
  const 命中坐标 = (词序号, idx) =>
    求值(`${S}
      const 词 = 状态.关键词列表[${词序号}];
      const 字 = document.querySelector(
        '.字.命中[data-keyword-id="' + 词.id + '"][data-hit-index="' + ${idx} + '"]',
      );
      if (!字) return null;
      const 盒 = 字.getBoundingClientRect();
      return { x: 盒.left + 盒.width / 2, y: 盒.top + 盒.height / 2, 在屏: 盒.top > 24 && 盒.bottom < window.innerHeight - 20 };`);

  const 按词分组 = (列表) => {
    const 出 = {};
    for (const 项 of 列表) {
      出[项.词id] ??= { 可见: 0, 总数: 0 };
      出[项.词id].总数 += 1;
      if (项.可见) 出[项.词id].可见 += 1;
    }
    return 出;
  };

  // ① 未悬停：只有「当前命中」与每个词首处的常驻总数徽标露出，其余全部收回
  const 静止 = await 读徽标();
  assert.equal(静止.揭示中, false, 失败('① 未悬停时容器不应处于 悬停揭示中'));
  assert.equal(
    静止.列表.filter((项) => 项.可见 && !项.两端).length,
    静止.列表.filter((项) => 项.当前 && !项.两端).length,
    失败(`① 未悬停时只该有当前命中显示 x/y，实际可见 ${静止.列表.filter((项) => 项.可见 && !项.两端).length} 处`),
  );
  const 两端们 = 静止.列表.filter((项) => 项.两端);
  assert.equal(两端们.length, 6, 失败(`① 三个词各该有首末两枚常驻总数徽标，实际 ${两端们.length} 枚`));
  assert.ok(
    两端们.every((项) => 项.可见 && 项.内容 === `"${项.序号.split('/')[1]}"` && 项.行放行),
    失败(`① 两端徽标要静止可见、只写总数 y 且所在行放行溢出：${JSON.stringify(两端们)}`),
  );

  // ② 悬停「阿尔法」第 6 处：阿尔法只有这一处显示，贝塔/伽马全部显示
  const 甲 = await 命中坐标(0, 6);
  assert.ok(甲 && 甲.在屏, 失败('② 阿尔法第 7 处应在屏内'));
  await 移到(甲.x, 甲.y);
  const 悬停甲 = await 读徽标();
  assert.equal(悬停甲.揭示中, true, 失败('② 悬停命中后容器应进入 悬停揭示中'));
  const 甲id = 悬停甲.悬停词id;
  const 分组甲 = 按词分组(悬停甲.列表);
  const 词序号到id = await 求值(`${S} return 状态.关键词列表.map((词) => 词.id);`);
  const [阿尔法id, 贝塔id, 伽马id] = 词序号到id;
  assert.equal(分组甲[阿尔法id].可见, 3, 失败(`② 被悬停关键词只该有光标这一处 + 首末两枚常驻，实际 ${分组甲[阿尔法id].可见}`));
  const 悬停处 = 悬停甲.列表.find((项) => 项.悬停);
  assert.ok(悬停处 && 悬停处.可见 && 悬停处.序号 === '7/12', 失败(`② 光标这一处应显示 7/12，实际 ${悬停处?.序号} 可见=${悬停处?.可见}`));
  assert.equal(分组甲[贝塔id].可见, 24, 失败(`② 贝塔 24 处都该显示序号，实际 ${分组甲[贝塔id].可见}`));
  assert.equal(分组甲[伽马id].可见, 12, 失败(`② 伽马（当前关键词组）12 处都该显示序号，实际 ${分组甲[伽马id].可见}`));
  const 该显示 = 悬停甲.列表.filter((项) => 项.可见);
  assert.ok(
    该显示.every((项) => 项.行放行),
    失败('② 每一处可见徽标所在行都必须放行溢出，否则上溢的 9px 会被相邻行裁掉'),
  );
  assert.ok(
    悬停甲.列表.filter((项) => 项.同组 && !项.悬停 && !项.两端).every((项) => !项.可见),
    失败('② 被悬停关键词的其余命中不该冒出序号'),
  );
  // 同行多枚徽标不许互相压字：量一下横向是否有重叠（徽标宽度取伪元素的实际用值）
  const 重叠数 = await 求值(`${S}
    const 盒列表 = [];
    for (const 字 of document.querySelectorAll('.字.命中[data-hit-position]')) {
      const 样 = getComputedStyle(字, '::after');
      if (样.visibility !== 'visible' || Number(样.opacity) <= 0.5) continue;
      const 盒 = 字.getBoundingClientRect();
      const 数 = (v) => parseFloat(v) || 0;
      // ::after 是 content-box：横向要加回 padding 与边框才是实际占宽
      const 宽 = 数(样.width) + 数(样.paddingLeft) + 数(样.paddingRight) + 数(样.borderLeftWidth) + 数(样.borderRightWidth);
      const 外 = 数(样.right); // right: -3px —— 徽标右缘比字盒右缘再向外 3px
      盒列表.push({ 行: Math.round(盒.top), 左: 盒.right + 外 - 宽, 右: 盒.right + 外, 文本: 字.dataset.hitPosition });
    }
    盒列表.sort((a, b) => a.行 - b.行 || a.左 - b.左);
    function 同一行(x, y) {
      return Math.abs(x.行 - y.行) < 2;
    }
    let 重叠 = 0;
    const 样本 = [];
    for (let i = 1; i < 盒列表.length; i++) {
      if (同一行(盒列表[i], 盒列表[i - 1]) && 盒列表[i].左 < 盒列表[i - 1].右) {
        重叠++;
        样本.push(盒列表[i - 1].文本 + '@' + 盒列表[i - 1].行 + ' 与 ' + 盒列表[i].文本);
      }
    }
    return { 重叠, 样本, 枚数: 盒列表.length };`);
  assert.equal(重叠数.重叠, 0, 失败(`② 同一行的徽标不许互相重叠 ${重叠数.枚数} 枚，实际 ${重叠数.重叠} 处：${重叠数.样本.join(' | ')}`));

  // ③ 换目标到「贝塔」第 9 处：阿尔法收回、贝塔只留这一处、伽马继续全显示
  const 乙 = await 命中坐标(1, 8);
  assert.ok(乙 && 乙.在屏, 失败('③ 贝塔第 9 处应在屏内'));
  await 移到(乙.x, 乙.y);
  const 悬停乙 = await 读徽标();
  assert.notEqual(悬停乙.悬停词id, 甲id, 失败('③ 悬停目标应切到贝塔'));
  const 分组乙 = 按词分组(悬停乙.列表);
  assert.equal(分组乙[阿尔法id].可见, 12, 失败(`③ 阿尔法现在是「其余关键词」，12 处都该显示序号，实际 ${分组乙[阿尔法id].可见}`));
  assert.equal(分组乙[贝塔id].可见, 3, 失败(`③ 贝塔只该留光标这一处 + 首末两枚常驻，实际 ${分组乙[贝塔id].可见}`));
  assert.equal(分组乙[伽马id].可见, 12, 失败(`③ 伽马仍该全部显示，实际 ${分组乙[伽马id].可见}`));

  // ④ 移开：全部收回，只剩当前命中与各词首处的常驻总数徽标
  await 移到(600, 860);
  const 收回 = await 读徽标();
  assert.equal(收回.揭示中, false, 失败('④ 移开后容器应退出 悬停揭示中'));
  assert.equal(
    收回.列表.filter((项) => 项.可见 && !项.两端).length,
    收回.列表.filter((项) => 项.当前 && !项.两端).length,
    失败(`④ 移开后只该剩当前命中，实际可见 ${收回.列表.filter((项) => 项.可见 && !项.两端).length}`),
  );
  assert.equal(
    收回.列表.filter((项) => 项.两端 && !项.可见).length,
    0,
    失败('④ 首末两端的常驻总数徽标不该随悬停收回而消失'),
  );
  assert.equal(
    收回.列表.filter((项) => 项.同组).length,
    0,
    失败('④ 移开后不该残留 同组悬停'),
  );

  // ⑤ 悬停期间虚拟列表强制重绘：新建的行元素要靠渲染路径重新放行徽标溢出，
  //    容器的 悬停揭示中 也要在渲染时对齐全屏状态。
  await 移到(甲.x, 甲.y);
  assert.equal((await 读徽标()).揭示中, true, 失败('⑤ 复悬停应进入揭示态'));
  await 求值(`${S}
    const { 渲染可见行 } = await import('./js/虚拟渲染.js');
    渲染可见行(true);`);
  await pause(200);
  const 重绘后 = await 读徽标();
  const 分组重绘 = 按词分组(重绘后.列表);
  assert.equal(重绘后.揭示中, true, 失败('⑤ 重绘后容器应仍是 悬停揭示中'));
  assert.equal(分组重绘[阿尔法id].可见, 3, 失败(`⑤ 重绘后阿尔法仍只留光标这一处 + 首末两枚常驻，实际 ${分组重绘[阿尔法id].可见}`));
  assert.equal(分组重绘[贝塔id].可见, 24, 失败(`⑤ 重绘后贝塔 24 处都该显示，实际 ${分组重绘[贝塔id].可见}`));
  assert.ok(
    重绘后.列表.filter((项) => 项.可见).every((项) => 项.行放行),
    失败('⑤ 重绘后新行也必须放行徽标的溢出，否则序号会被上一行底色盖掉'),
  );

  // 出图：① 静止态 / ② 悬停阿尔法（其余两组满屏序号）
  const 截图 = async (名) => {
    const 图 = await 发送('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(项目根, 'tmp', 名), Buffer.from(图.data, 'base64'));
  };
  await 移到(600, 860);
  await 截图('悬停揭示序号-静止.png');
  await 移到(甲.x, 甲.y);
  await 截图('悬停揭示序号-悬停阿尔法.png');
  console.log('已写入 tmp/悬停揭示序号-静止.png 与 tmp/悬停揭示序号-悬停阿尔法.png');

  await 移到(600, 860);
  console.log(
    '\nOK：悬停时只光标那一处显示该词序号，其余关键词的每一处命中都显示 x/y，移开收回',
  );
  ws.close();
} finally {
  await 收尾();
}
