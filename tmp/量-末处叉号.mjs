// 量：末次出现右下角那枚 × 该钉在哪。
// 标记是真元素，直接读它的 rect；墨迹盒用 canvas actualBoundingBox（真字形墨，不是行盒）。
// 逐档注入候选 right/bottom，报：压锚字墨、压右邻墨、压下行墨、被行盒 overflow 裁掉的宽度，
// 另外报「行尾那一格」的右缝宽——挂出超过缝宽就会被行盒裁成残角（旧 ▶ 就是这么只剩尾羽）。
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
const profile = mkdtempSync(join(tmpdir(), 'reader-last-mark-'));
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
    根.setProperty('--正文字色', '#e8e6e3');
    return true;`);

  // 找一个命中数 3~8 的三字组：末处好找、屏内也看得见。argv[2] 换第几个候选词
  const 第几 = Number(process.argv[2] || 0);
  const 选词 = await 求值(`${S}
    const 计次 = new Map();
    for (let i = 0; i + 3 <= 状态.文本.length; i++) {
      const 组 = 状态.文本.slice(i, i + 3);
      if (!/^[\\u4e00-\\u9fff]{3}$/.test(组)) continue;
      计次.set(组, (计次.get(组) || 0) + 1);
    }
    const 够格 = [...计次.entries()].filter(
      ([词, 次]) => 次 >= 3 && 次 <= 8 && !/^[一二三四五六七八九十的了一是我不也就在]./.test(词),
    );
    const [词, 次] = 够格[${第几} * 37] || 够格[0];
    return { 书名: 状态.文件名, 词, 次 };`);
  console.log('书名:', 选词.书名, '| 词:', 选词.词, '×' + 选词.次);

  await 求值(`${S}
    const { 添加关键词标记 } = await import('./js/关键词.js');
    添加关键词标记(${JSON.stringify(选词.词)}, 状态.文本.indexOf(${JSON.stringify(选词.词)}));
    return true;`);
  await pause(1500);

  // 滚到末处命中那一行，让它落在屏中部（上下都还有行，才量得到压下行）
  const 滚动 = await 求值(`${S}
    const 词 = 状态.关键词列表.find((w) => w.文本 === ${JSON.stringify(选词.词)});
    const 末偏移 = 词.命中位置[词.命中位置.length - 1];
    const 行起点 = 状态.行起点列表;
    let 行 = 0;
    for (let i = 0; i < 行起点.length; i++) if (行起点[i] <= 末偏移) 行 = i; else break;
    const 可视行数 = Math.floor(元素.滚动容器.clientHeight / 状态.行高);
    元素.滚动容器.scrollTop = Math.max(0, (行 - Math.floor(可视行数 / 2)) * 状态.行高);
    return { 行, 末偏移 };`);
  await pause(700);
  const 有标记 = await 求值(`return document.querySelectorAll('.末处标记').length`);
  console.log('滚到末处:', 滚动, '| 屏内 .末处标记:', 有标记);
  if (!有标记) throw new Error('屏内没有末处标记，检查命中或滚动位置');

  const 报告 = await 求值(`${S}
    const 档列表 = ${JSON.stringify([
      { 名: 'A 角内 right0 bottom0', css: 'right:0;bottom:0' },
      { 名: 'B 角内 bottom .12em', css: 'right:0;bottom:0.12em' },
      { 名: 'C 角内 right .08em bottom .08em', css: 'right:0.08em;bottom:0.08em' },
      { 名: 'D 挂右 .2em bottom0', css: 'right:-0.2em;bottom:0' },
      { 名: 'E 挂右 .34em bottom0', css: 'right:-0.34em;bottom:0' },
      { 名: 'F 挂右 .2em + bottom .12em', css: 'right:-0.2em;bottom:0.12em' },
      { 名: 'G 收小 .5em 角内', css: 'right:0;bottom:0;font-size:0.5em' },
      { 名: 'H 收小 .48em 角内 bottom .1em', css: 'right:0;bottom:0.1em;font-size:0.48em' },
      { 名: 'I 旧法 居中挂右 .58em', css: 'top:50%;bottom:auto;transform:translateY(-50%);right:-0.58em' },
    ])};
    const 样式 = document.createElement('style');
    document.head.append(样式);
    const 画 = document.createElement('canvas').getContext('2d');
    const 缓存 = new Map();
    const 墨盒 = (字) => {
      const 样 = getComputedStyle(字);
      // 锚字里挂着标记 span，量它的墨只能取自己那段文本
      const 文 = 字.firstChild && 字.firstChild.nodeType === 3 ? 字.firstChild.textContent : 字.textContent;
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
      return { 文本: 文, 上: 基线 - 墨.上, 下: 基线 + 墨.下, 左: 盒.left - 墨.左, 右: 盒.left + 墨.右 };
    };
    const 标记 = document.querySelector('.末处标记');
    const 锚 = 标记.closest('.字');
    const 锚墨 = 墨盒(锚);
    const 行元素 = 锚.closest('.正文行');
    const 行末字 = [...行元素.querySelectorAll('.字')].pop();
    const 右缝 = Math.round(
      (行元素.getBoundingClientRect().right - 行末字.getBoundingClientRect().right) * 10,
    ) / 10;
    const 取 = (v) => Math.round(v * 10) / 10;
    const 出 = [];
    for (const 档 of 档列表) {
      样式.textContent = '.字.命中 > .末处标记{' + 档.css + '}';
      const 墨 = 墨盒(标记);
      const 行盒 = 行元素.getBoundingClientRect();
      出.push({
        档: 档.名,
        叉墨: [取(墨.左), 取(墨.上), 取(墨.右), 取(墨.下)],
        挂出锚字: 取(墨.右 - 锚墨.右),
        越行盒: 取(Math.max(0, 墨.右 - 行盒.right) + Math.max(0, 墨.下 - 行盒.bottom)),
        字号: getComputedStyle(标记).fontSize,
      });
    }
    // 行尾探针：挑「写满到右缘」的那一行（缝最小），挂上去量每档被 overflow 裁掉多少
    let 行尾字 = null;
    let 行尾缝 = 1e9;
    for (const 行 of document.querySelectorAll('.正文行')) {
      const 字们 = [...行.querySelectorAll('.字')];
      const 末 = 字们[字们.length - 1];
      if (!末 || !末.textContent.trim()) continue;
      const 缝 = 行.getBoundingClientRect().right - 末.getBoundingClientRect().right;
      if (缝 < 行尾缝) {
        行尾缝 = 缝;
        行尾字 = 末;
      }
    }
    const 探针 = [];
    if (行尾字) {
      const 标 = document.createElement('span');
      标.className = '末处标记';
      标.textContent = '×';
      const 原类 = 行尾字.className;
      行尾字.classList.add('命中');
      行尾字.append(标);
      const 行盒 = 行尾字.closest('.正文行').getBoundingClientRect();
      for (const 档 of 档列表) {
        样式.textContent = '.字.命中 > .末处标记{' + 档.css + '}';
        const 墨 = 墨盒(标);
        探针.push({ 档: 档.名, 裁掉: Math.round(Math.max(0, 墨.右 - 行盒.right) * 10) / 10 });
      }
      标.remove();
      行尾字.className = 原类;
    }
    样式.remove();
    return {
      右缝,
      探针字: 行尾字 ? 行尾字.textContent : null,
      探针缝: Math.round(行尾缝 * 10) / 10,
      探针,
      锚字: 锚.textContent,
      锚墨: [取(锚墨.左), 取(锚墨.上), 取(锚墨.右), 取(锚墨.下)],
      出,
    };`);
  console.log('右缝(行盒右缘 - 行末字右缘):', 报告.右缝, 'px | 锚字:', 报告.锚字, '锚字墨盒:', 报告.锚墨);
  console.log(
    '行尾探针（缝=该字右缘到行盒右缘，裁掉 > 0 就会被行盒 overflow 切缺）:',
    报告.探针字,
    '缝',
    报告.探针缝,
    JSON.stringify(报告.探针),
  );
  writeFileSync(join(项目根, 'tmp', '末处叉号-档' + 第几 + '.json'), JSON.stringify(报告.出));
  writeFileSync(join(项目根, 'tmp', '末处叉号-档.json'), JSON.stringify(报告.出));

  // 底片：把叉号藏了再拍一张，逐档用它自己的墨盒去数压了多少字墨
  // （叉是稀疏笔画，拿元素方框算交集会高估好几倍）
  await 求值(`${S}
    const s = document.createElement('style');
    s.id = '量-藏叉';
    s.textContent = '.末处标记{visibility:hidden!important}';
    document.head.append(s);
    return true;`);
  await pause(150);
  const 底片 = await 发送('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(项目根, 'tmp', '末处叉号-底片' + 第几 + '.png'), Buffer.from(底片.data, 'base64'));
  console.log('已写入 tmp/末处叉号-底片' + 第几 + '.png 与 tmp/末处叉号-档' + 第几 + '.json');
  await 求值(`document.getElementById('量-藏叉')?.remove(); return true;`);
  const 截图 = async (名) => {
    const 图 = await 发送('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(项目根, 'tmp', 名), Buffer.from(图.data, 'base64'));
    console.log('已写入 tmp/' + 名);
  };
  await 截图('末处叉号-带叉' + 第几 + '.png');
  ws.close();
} finally {
  await 收尾();
}
