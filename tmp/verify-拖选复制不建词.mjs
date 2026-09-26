// 一次性验证脚本：拖拉文字过程中按 Ctrl/Command + C（或右键菜单复制），松手后不再增删关键词。
// 覆盖：不复制的拖选仍建词（回归）、按住期间 Ctrl+C 不建词、按住期间 Command+C 不建词、
// 按住期间菜单式复制（execCommand 同一条 copy 路径）不建词、复制标记不跨会话
// （复制之后的新拖选仍建词）、已有关键词不因复制被删、松手后单独按复制键不影响下次建词、
// 双击复制整行的老行为不变；并检查以上都不移动阅读位置、不清空原生选区以外的状态。
//
// 关于「怎么造拖选」：headless CDP 的 mouseMoved 序列无法稳定复现原生拖选（实测要么
// 从文档首开始扩选、要么直接折叠），因此这里用真实的 mousePressed / mouseReleased 夹住
// 一段页内 Range 造选区 —— 应用读到的仍是同一条 window.getSelection() 与同一次拖选会话，
// 复制走的是浏览器原生 copy 事件，与被测逻辑等价。
//
// 自启 server.mjs + headless Chrome（CDP + Fetch 拦截喂 fixture），
// 按 AGENTS.md 规范清理 reader-* 一次性 profile。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
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
const profile = mkdtempSync(join(tmpdir(), 'reader-copy-drag-'));
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

// fixture：每行一句、足够短，保证一行只折成一个显示行（拖选不跨行）。
// 各行文字共用后半个尾巴，用来验证「自动扩展」会把词扩到整段尾巴（记录实际词即可）。
const fixture = Array.from(
  { length: 12 },
  (_, i) => `第${i + 1}行的句子用来测试拖选与复制互不干扰`,
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
        [
          消息.params.type,
          ...消息.params.args.map((a) => a.value ?? a.description ?? ''),
        ].join(' '),
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
  // 测试自己的 copy 计数：证明复制真的发生了，而不是「事件没派发所以没建词」的假通过
  await 求值(`window.__复制次数 = 0;
    window.__按键 = null;
    window.addEventListener('keydown', (e) => {
      window.__按键 = { 键: e.key, ctrl: e.ctrlKey, meta: e.metaKey };
    }, true);
    document.addEventListener('copy', (e) => {
      window.__复制次数++;
      window.__复制文本 = window.getSelection().toString();
    });`);

  const 关键词列表 = () => 求值(`${状态前缀} return 状态.关键词列表.map(k => k.文本);`);
  const 复制次数 = () => 求值(`return window.__复制次数;`);
  const 复制文本 = () => 求值(`return window.__复制文本 ?? null;`);
  const 选区状态 = () =>
    求值(`const s = window.getSelection();
      return { 折叠: s.isCollapsed, 文本: s.toString() };`);
  const 滚动位置 = () => 求值(`${状态前缀} return 元素.滚动容器.scrollTop;`);
  const 清关键词 = () =>
    求值(`${状态前缀}
      const { 删除关键词标记 } = await import("./js/关键词.js");
      for (const 关键词 of [...状态.关键词列表]) 删除关键词标记(关键词.id);
      window.getSelection().removeAllRanges();
      return 状态.关键词列表.length;`);

  // 第 n 个有字的显示行中，第 [起, 止] 个字素的中心坐标
  function 取字坐标(行序号, 起, 止) {
    return 求值(`${状态前缀}
      const 行列表 = [...document.querySelectorAll('.正文行')].filter(r => r.querySelector('.字'));
      const 行 = 行列表[${行序号}];
      const 字列表 = [...行.querySelectorAll('.字')];
      const 中心 = (字) => { const 盒 = 字.getBoundingClientRect();
        return { x: 盒.left + 盒.width / 2, y: 盒.top + 盒.height / 2 }; };
      return { a: 中心(字列表[${起}]), b: 中心(字列表[${止}]),
        片头: 字列表[${起}].textContent, 行文本: 行.textContent,
        字数: 字列表.length };`);
  }

  async function 鼠标(type, 参数) {
    await 发送('Input.dispatchMouseEvent', { type, ...参数 });
  }

  // 按住 Ctrl / Command 的 c 键一次（修饰：2 = Ctrl，4 = Meta）
  async function 按下复制键(修饰) {
    await 求值(`window.__按键 = null; return 1;`);
    const 键 = 修饰 === 4 ? { key: 'Meta', code: 'MetaLeft', vk: 93 } : { key: 'Control', code: 'ControlLeft', vk: 17 };
    const 发 = (类型, 参数) =>
      发送('Input.dispatchKeyEvent', {
        type: 类型,
        modifiers: 参数.修饰,
        key: 参数.键,
        code: 参数.码,
        windowsVirtualKeyCode: 参数.vk,
        ...(参数.文本 ? { text: 参数.文本, unmodifiedText: 参数.文本 } : {}),
      });
    await 发('rawKeyDown', { 键: 键.key, 码: 键.code, vk: 键.vk, 修饰 });
    await 发('rawKeyDown', { 键: 'c', 码: 'KeyC', vk: 67, 修饰, 文本: 'c' });
    await 发('keyUp', { 键: 'c', 码: 'KeyC', vk: 67, 修饰 });
    await 发('keyUp', { 键: 键.key, 码: 键.code, vk: 键.vk, 修饰: 0 });
  }

  /* 完整一次拖选：真按下 → 造出与拖选等价的单行选区 →（按住期间复制）→ 真松手。
     期间: undefined 不复制 | 'ctrl' | 'meta' | 'menu'（execCommand 复制，右键菜单同一条事件路径） */
  async function 拖选(行序号, 起, 止, 期间) {
    const { a, b } = await 取字坐标(行序号, 起, 止);
    await 鼠标('mouseMoved', { x: a.x, y: a.y });
    await 鼠标('mousePressed', { x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
    const 选区 = await 求值(`${状态前缀}
      const 行列表 = [...document.querySelectorAll('.正文行')].filter(r => r.querySelector('.字'));
      const 字列表 = [...行列表[${行序号}].querySelectorAll('.字')];
      const 范围 = document.createRange();
      范围.setStart(字列表[${起}].firstChild, 0);
      范围.setEnd(字列表[${止}].firstChild, 字列表[${止}].textContent.length);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(范围);
      return s.toString();`);
    const 复制前 = await 复制次数();
    if (期间 === 'ctrl') {
      await 按下复制键(2);
    } else if (期间 === 'meta') {
      await 按下复制键(4);
    } else if (期间 === 'menu') {
      assert.ok(
        await 求值(`return document.execCommand('copy');`),
        失败('execCommand 复制应成功'),
      );
    }
    const 复制后 = await 复制次数();
    const 松手前拖选会话 = await 求值(`${状态前缀} return !!状态.拖选状态;`);
    await 鼠标('mouseReleased', { x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
    await pause(160);
    return {
      选区,
      复制次数增量: 复制后 - 复制前,
      松手时仍在拖选: 松手前拖选会话,
      页面按键: 期间 ? await 求值('return window.__按键 ?? null') : null,
    };
  }

  /* 触摸 / 笔松手那条分支（处理非鼠标选择结束）：真实的 mousePressed 打开拖选会话 +
     页内造选区 +（按住期间复制）+ 派发 pointerType='touch' 的 pointerup。
     CDP 的合成触摸不会补发兼容 mousedown，触摸会话无从建立，所以这里用真实按下 +
     合成 pointerup 精确覆盖该分支的判定逻辑。 */
  async function 触摸选择结束(行序号, 起, 止, 期间) {
    const { a, b } = await 取字坐标(行序号, 起, 止);
    await 鼠标('mouseMoved', { x: a.x, y: a.y });
    await 鼠标('mousePressed', { x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
    const 选区 = await 求值(`${状态前缀}
      const 行列表 = [...document.querySelectorAll('.正文行')].filter(r => r.querySelector('.字'));
      const 字列表 = [...行列表[${行序号}].querySelectorAll('.字')];
      const 范围 = document.createRange();
      范围.setStart(字列表[${起}].firstChild, 0);
      范围.setEnd(字列表[${止}].firstChild, 字列表[${止}].textContent.length);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(范围);
      return s.toString();`);
    const 会话在 = await 求值(`${状态前缀} return !!状态.拖选状态;`);
    const 复制前 = await 复制次数();
    if (期间 === 'menu') {
      await 求值(`return document.execCommand('copy');`);
    }
    await 求值(`${状态前缀}
      const 行列表 = [...document.querySelectorAll('.正文行')].filter(r => r.querySelector('.字'));
      const 目标 = 行列表[${行序号}].querySelectorAll('.字')[${止}];
      目标.dispatchEvent(new PointerEvent('pointerup', {
        pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true,
      }));
      return true;`);
    const 复制增量 = (await 复制次数()) - 复制前;
    await pause(160);
    const 松手词 = await 关键词列表();
    await 鼠标('mouseReleased', { x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
    await pause(160);
    return { 会话在, 选区, 复制增量, 松手词, 补松手词: await 关键词列表() };
  }

  // ① 回归：不复制的拖选仍然建词，并清掉选区
  await 清关键词();
  const 位置0 = await 滚动位置();
  const 拖1 = await 拖选(2, 4, 10);
  assert.ok(拖1.松手时仍在拖选, 失败('① 松手前应仍处于拖选会话'));
  assert.ok(拖1.选区.includes('句子用来'), 失败(`① 选区应为拖选内容：${拖1.选区}`));
  assert.equal(拖1.复制次数增量, 0, 失败('① 没有复制就不该有 copy 事件'));
  const 建词1 = await 关键词列表();
  assert.equal(建词1.length, 1, 失败(`① 拖选应建 1 个关键词，实际 ${JSON.stringify(建词1)}`));
  assert.ok((await 选区状态()).折叠, 失败('① 建词后应清掉选区'));
  assert.equal(await 滚动位置(), 位置0, 失败('① 拖选建词不该移动阅读位置'));

  // ② 按住期间 Ctrl + C：松手不建词。headless 不保证为合成快捷键派发 copy 事件，
  //    所以这里以「页面确实收到了 ctrl+c 的 keydown」为真实信号（copy 事件若也到了更好）。
  await 清关键词();
  const 拖2 = await 拖选(2, 4, 10, 'ctrl');
  assert.deepEqual(
    拖2.页面按键,
    { 键: 'c', ctrl: true, meta: false },
    失败(`② 页面应收到按住 Ctrl 的 c 键，实际 ${JSON.stringify(拖2.页面按键)}（否则本用例是假通过）`),
  );
  assert.ok(拖2.松手时仍在拖选, 失败('② 复制时仍处于拖选会话'));
  assert.deepEqual(await 关键词列表(), [], 失败('② 拖选中复制后不该建词'));
  assert.ok((await 选区状态()).折叠, 失败('② 复制收尾后应清掉选区'));
  assert.equal(await 滚动位置(), 位置0, 失败('② 按住期间复制不该移动阅读位置'));
  assert.ok(
    页面日志.some((l) => l.includes('拖选期间已复制，跳过关键词增删')),
    失败('② 应留下一条「跳过关键词增删」的日志'),
  );

  // ③ 按住期间 Command + C（macOS 原生快捷键；Ctrl↔Win 对调环境下物理 Ctrl 也以 Meta 送达）
  await 清关键词();
  const 拖3 = await 拖选(4, 4, 10, 'meta');
  assert.deepEqual(
    拖3.页面按键,
    { 键: 'c', ctrl: false, meta: true },
    失败(`③ 页面应收到按住 Meta 的 c 键，实际 ${JSON.stringify(拖3.页面按键)}`),
  );
  assert.deepEqual(await 关键词列表(), [], 失败('③ 按住期间复制后不该建词'));
  assert.equal(await 滚动位置(), 位置0, 失败('③ Command+C 不该触发关键词导航而挪动正文'));

  // ④ 按住期间走右键菜单「复制」：真实 copy 事件路径（execCommand 会派发 copy 并写剪贴板）
  await 清关键词();
  const 拖4 = await 拖选(6, 4, 10, 'menu');
  assert.equal(拖4.复制次数增量, 1, 失败('④ 菜单复制应派发 copy 事件'));
  assert.ok((await 复制文本()).includes('句子用来'), 失败(`④ copy 时应带着选区文本：${await 复制文本()}`));
  assert.deepEqual(await 关键词列表(), [], 失败('④ 按住期间菜单复制后不该建词'));

  // ⑤ 标记不跨会话：复制之后的新拖选照常建词
  const 拖5 = await 拖选(6, 4, 10);
  const 建词5 = await 关键词列表();
  assert.equal(拖5.复制次数增量, 0, 失败('⑤ 这次拖选没有复制'));
  assert.equal(建词5.length, 1, 失败(`⑤ 复制之后的新拖选应能建词，实际 ${JSON.stringify(建词5)}`));

  // ⑥ 已有关键词：拖选同一段文字并复制，既不该建也不该删
  await 清关键词();
  await 拖选(8, 4, 10);
  const 建词6 = await 关键词列表();
  assert.equal(建词6.length, 1, 失败('⑥ 前置：应先建好关键词'));
  await 拖选(8, 4, 10, 'ctrl');
  assert.deepEqual(await 关键词列表(), 建词6, 失败('⑥ 按住期间复制不该删掉已有关键词'));
  await 拖选(8, 4, 10, 'ctrl');
  assert.deepEqual(await 关键词列表(), 建词6, 失败('⑥ 反复复制都不该删词'));
  await 拖选(8, 4, 10); // 对照：不复制时同一段文字会删词
  assert.deepEqual(await 关键词列表(), [], 失败('⑥ 对照不成立：不复制的再次拖选应删词'));

  // ⑦ 没有选区时按 Ctrl+C：不该把下一次的建词也吞掉
  await 清关键词();
  await 按下复制键(2);
  assert.deepEqual(
    await 求值('return window.__按键 ?? null'),
    { 键: 'c', ctrl: true, meta: false },
    失败('⑦ 前置：Ctrl+C 的 keydown 应真的到达页面'),
  );
  await 拖选(10, 4, 10);
  assert.equal((await 关键词列表()).length, 1, 失败('⑦ 空选区的复制键不该吞掉下一次建词'));

  // ⑧ 双击复制整行的老行为不变：不建词，仍选中整行
  await 清关键词();
  const { a: 双击点 } = await 取字坐标(10, 4, 4);
  const 第十一行 = (await 取字坐标(10, 0, 0)).行文本;
  for (const 次数 of [1, 2]) {
    await 鼠标('mousePressed', { x: 双击点.x, y: 双击点.y, button: 'left', buttons: 1, clickCount: 次数 });
    await 鼠标('mouseReleased', { x: 双击点.x, y: 双击点.y, button: 'left', buttons: 0, clickCount: 次数 });
    if (次数 === 1) await pause(30);
  }
  await pause(320);
  assert.deepEqual(await 关键词列表(), [], 失败('⑧ 双击不该建词'));
  const 双击选区 = await 选区状态();
  assert.ok(!双击选区.折叠, 失败('⑧ 双击应仍选中整行'));
  assert.ok(
    双击选区.文本.replace(/\s/g, '') === 第十一行.replace(/\s/g, ''),
    失败(`⑧ 双击选中内容应为整行：${双击选区.文本} vs ${第十一行}`),
  );
  assert.equal(await 滚动位置(), 位置0, 失败('⑧ 双击不该移动阅读位置'));

  // ⑨ 触摸 / 笔松手分支：不复制时照旧建词（回归），按住期间复制则不建词
  await 清关键词();
  const 触摸不复制 = await 触摸选择结束(2, 4, 10);
  assert.ok(触摸不复制.会话在, 失败('⑨ 按住时应处于拖选会话'));
  assert.equal(触摸不复制.复制增量, 0, 失败('⑨ 对照：这次没有复制'));
  assert.equal(
    触摸不复制.松手词.length,
    1,
    失败(`⑨ 触摸松手不复制时仍应建词，实际 ${JSON.stringify(触摸不复制.松手词)}`),
  );
  assert.ok(触摸不复制.选区.includes('句子用来'), 失败(`⑨ 造选区没成功：${触摸不复制.选区}`));
  await 清关键词();
  const 触摸复制 = await 触摸选择结束(4, 4, 10, 'menu');
  assert.equal(触摸复制.复制增量, 1, 失败('⑨ 触摸分支：复制应派发 copy 事件'));
  assert.deepEqual(触摸复制.松手词, [], 失败('⑨ 触摸按住期间复制后不该建词'));
  assert.deepEqual(触摸复制.补松手词, [], 失败('⑨ 随后的鼠标松手也不该补建词'));

  console.log(
    '\nOK：拖选期间的复制（Ctrl/Command + C、菜单复制）会取消接下来的关键词增删；' +
      '不复制的拖选、双击、复制之后的新拖选都保持原行为',
  );
  await 清关键词();
  ws.close();
} finally {
  await 收尾();
}
