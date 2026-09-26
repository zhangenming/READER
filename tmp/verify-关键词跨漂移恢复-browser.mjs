// 浏览器实测：把用户真实的（因管道规则升级而长度漂移的）持久化记录注入一个干净的
// Chrome profile，验证关键词是否还能回来。
// 判据来自 tmp/关键词救援-2026-09-26/ 里备份的线上 localStorage。
// 用法：node tmp/verify-关键词跨漂移恢复-browser.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const 项目根 = new URL('..', import.meta.url).pathname;
const 备份 = JSON.parse(
  readFileSync(
    join(项目根, 'tmp/关键词救援-2026-09-26/localStorage-快照-B.json'),
    'utf8',
  ),
);
const 书名 =
  process.env.书名 ??
  '大明王朝1566（上下卷） (刘和平) (z-library.sk, 1lib.sk, z-lib.sk).txt';
const 原记录 = 备份.文本状态[书名];
const 持久化键名 = '原文阅读器:阅读状态:v2';
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

function 端口空闲(端口) {
  return new Promise((resolve) => {
    const s = createServer();
    s.on('error', () => resolve(false));
    s.listen(端口, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}
async function 取空闲端口() {
  for (let 试 = 0; 试 < 20; 试++) {
    const 端口 = 16000 + Math.floor(Math.random() * 3000);
    if (await 端口空闲(端口)) return 端口;
    await pause(150);
  }
  throw new Error('找不到空闲端口');
}
const 清理遗留profile = (跳过) => {
  for (const 名 of readdirSync(tmpdir())) {
    if (!名.startsWith('reader-')) continue;
    const 路径 = join(tmpdir(), 名);
    if (路径 === 跳过) continue;
    try {
      execFileSync('pgrep', ['-f', `user-data-dir=${路径}`], { stdio: 'ignore' });
      continue;
    } catch {}
    rmSync(路径, { recursive: true, force: true });
  }
};

const 站点端口 = await 取空闲端口();
const CDP端口 = await 取空闲端口();
清理遗留profile();
const profile = mkdtempSync(join(tmpdir(), 'reader-drift-restore-'));

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
    `http://127.0.0.1:${站点端口}/txt/`,
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
const 日志 = [];
function 发送(方法, 参数 = {}) {
  return new Promise((resolve, reject) => {
    const 下标 = ++序号;
    const 计时器 = setTimeout(() => {
      待回复.delete(下标);
      reject(new Error(`CDP 超时: ${方法}`));
    }, 60_000);
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

async function 连接页面(路径前缀) {
  for (let n = 0; n < 150; n++) {
    try {
      const 列表 = await (
        await fetch(`http://127.0.0.1:${CDP端口}/json`)
      ).json();
      const 目标 = 列表.find(
        (t) => t.type === 'page' && t.url.includes(路径前缀),
      );
      if (!目标) continue;
      ws = new WebSocket(目标.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener('open', r, { once: true }));
      ws.addEventListener('message', (事件) => {
        const 消息 = JSON.parse(事件.data);
        if (!消息.id) {
          if (消息.method === 'Runtime.consoleAPICalled') {
            日志.push(
              消息.params.args
                .map((a) => a.value ?? a.description ?? '')
                .join(' '),
            );
          }
          return;
        }
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

let 退出码 = 0;

async function 导航到(url, 等待选择器) {
  await 发送('Page.enable');
  const 已加载 = new Promise((resolve) => {
    const 处理 = (事件) => {
      const 消息 = JSON.parse(事件.data);
      if (消息.method === 'Page.loadEventFired') {
        ws.removeEventListener('message', 处理);
        resolve();
      }
    };
    ws.addEventListener('message', 处理);
  });
  await 发送('Page.navigate', { url });
  await 已加载;
  if (等待选择器) {
    await 求值(`return new Promise(r => {
      const t = setInterval(() => {
        if (${等待选择器}) { clearInterval(t); r(1); }
      }, 200);
      setTimeout(() => (clearInterval(t), r(0)), 60000);
    });`);
  }
}

// 跑一轮：注入给定记录 → 载入那本书 → 回报页面与落盘读数
async function 跑一轮(标签, 注入记录) {
  日志.length = 0;
  await 导航到(`http://127.0.0.1:${站点端口}/txt/`);
  await 求值(`
    localStorage.setItem(${JSON.stringify(持久化键名)}, ${JSON.stringify(
      JSON.stringify({ 当前文件名: 书名, 文本状态: { [书名]: 注入记录 } }),
    )});
    return 1;`);
  await 导航到(`http://127.0.0.1:${站点端口}/`);

  const 状态前缀 = 'const { 状态 } = await import("./js/状态.js");';
  let 载入好 = false;
  for (let n = 0; n < 120; n++) {
    if (
      await 求值(`${状态前缀}
        return 状态.行起点列表?.length > 0 &&
          document.querySelector('#载入状态')?.hidden === true;`)
    ) {
      载入好 = true;
      break;
    }
    await pause(1000);
  }
  assert.ok(载入好, `${标签}：正文未在 120 秒内载入`);

  const 读回 = await 求值(`${状态前缀}
    const 词 = 状态.关键词列表;
    return {
      文件名: 状态.文件名,
      当前长度: 状态.文本.length,
      当前指纹: 状态.内容哈希,
      偏移: (await import('./js/持久化.js')).读取阅读位置().阅读偏移,
      词数: 词.length,
      有命中: 词.filter(k => k.命中位置.length > 0).length,
      scrollTop: document.querySelector('#滚动容器').scrollTop,
      漂移日志: (window.__漂移日志 ?? []).join(' | '),
    };`);
  const 落盘 = await 求值(`${状态前缀}
    (await import('./js/持久化.js')).保存持久化状态();
    const 记录 = JSON.parse(localStorage.getItem(${JSON.stringify(
      持久化键名,
    )})).文本状态[状态.文件名];
    return { 长度: 记录.文本长度, 指纹: 记录.内容哈希 ?? null, 词数: 记录.关键词列表.length, 偏移: 记录.阅读偏移 };`);
  console.log(`[${标签}] 页面`, JSON.stringify(读回), '落盘', JSON.stringify(落盘));
  return { 读回, 落盘, 日志: 读回.漂移日志 };
}

try {
  await 连接页面('/txt/');
  await 发送('Page.enable');
  // console.info 的对象参数在 CDP 里只是 preview，直接在页面里把日志收拢成字符串
  await 发送('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__漂移日志 = [];
      const 原info = console.info.bind(console);
      console.info = function (...参数) {
        try {
          window.__漂移日志.push(参数.map(项 =>
            typeof 项 === 'object' && 项 ? JSON.stringify(项) : String(项)).join(' '));
        } catch {}
        return 原info(...参数);
      };`,
  });
  const 词数 = 原记录.关键词列表.length;

  // 轮 1：用户线上那份真实记录 —— 加指纹之前的旧格式，没有 内容哈希，
  // 且文本长度停在 45a85cd 之前（673001），当前管线算出 672998。
  const 旧格式 = await 跑一轮('旧记录·无指纹', 原记录);
  assert.equal(旧格式.读回.文件名, 书名, '应自动载入持久化里的那本书');
  assert.notEqual(
    旧格式.读回.当前长度,
    原记录.文本长度,
    '前置条件：正文长度确实漂移了（否则这条用例是假通过）',
  );
  assert.equal(旧格式.读回.词数, 词数, `无指纹漂移必须带回全部 ${词数} 个关键词`);
  assert.ok(旧格式.读回.有命中 > 词数 * 0.9, '绝大多数关键词都要重扫到命中');
  assert.ok(旧格式.读回.scrollTop > 0, '阅读位置要折算回来，不能回到页首');
  assert.ok(
    旧格式.日志.includes('持久化指纹与当前内容不一致'),
    `漂移要留下可对账的日志，实际：${旧格式.日志 || '（无）'}`,
  );
  assert.ok(
    旧格式.日志.includes('无指纹'),
    `日志要如实标出这是"旧记录没有指纹"，而不是文件换了：${旧格式.日志}`,
  );
  assert.equal(旧格式.落盘.词数, 词数, '落盘不得少一个关键词');
  assert.equal(旧格式.落盘.长度, 旧格式.读回.当前长度, '长度指纹自愈为当前值');
  assert.ok(
    Number.isInteger(旧格式.落盘.指纹) && 旧格式.落盘.指纹 > 0,
    `保存时必须补上内容指纹，实际 ${旧格式.落盘.指纹}`,
  );
  assert.ok(
    Math.abs(旧格式.落盘.偏移 - 原记录.阅读偏移) <= 200,
    `3 个字符的漂移不该挪动阅读偏移，实际 ${旧格式.落盘.偏移} vs ${原记录.阅读偏移}`,
  );

  // 轮 2：同一份文件（指纹正确）但正文长度被人为改错 —— 纯管道变更。
  await 导航到(`http://127.0.0.1:${站点端口}/txt/`);
  const 页内指纹 = await 求值(`
    const 响应 = await fetch(${JSON.stringify('/txt/' + encodeURIComponent(书名))});
    const 文本 = await 响应.text();
    const { 计算内容哈希 } = await import('/js/文本工具.js');
    return 计算内容哈希(文本);`);
  assert.equal(
    页内指纹,
    旧格式.落盘.指纹,
    '页内自算的指纹必须与落盘的指纹一致（否则本轮是假通过）',
  );
  const 管道轮 = await 跑一轮('同一文件·管道改长度', {
    ...原记录,
    内容哈希: 页内指纹,
    文本长度: 旧格式.读回.当前长度 + 4000,
  });
  assert.equal(管道轮.读回.词数, 词数, '同一份文件、只是管道改了长度：词必须全回');
  assert.ok(
    管道轮.日志.includes('管道'),
    `这一轮要被判成「管道」而不是「文件」：${管道轮.日志}`,
  );
  assert.ok(
    !/"漂移类型":"文件"/.test(管道轮.日志),
    `同一份文件绝不该报成换了文件：${管道轮.日志}`,
  );
  assert.ok(
    Math.abs(管道轮.读回.偏移 - 原记录.阅读偏移) <= 200,
    `折算后偏移仍要贴着原位置，实际 ${管道轮.读回.偏移} vs ${原记录.阅读偏移}`,
  );

  console.log(
    `\n结论：${词数} 个关键词在两种漂移下都全部恢复；旧记录补上了内容指纹，` +
      `同一份文件被改长度时判为「管道」而非「文件」，阅读偏移 ${原记录.阅读偏移} 未挪动。`,
  );
} catch (错误) {
  console.error('验证失败:', 错误.message);
  退出码 = 1;
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
    退出码 = 1;
  } else {
    console.log('profile 已清理:', profile);
  }
  清理遗留profile();
}
process.exitCode = 退出码;
console.log(退出码 ? '跨漂移恢复实测：失败' : '跨漂移恢复实测：通过');
