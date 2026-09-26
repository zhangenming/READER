// 白轴只剩一列之后的实测：章节刻度已撤下、黑（选中词）与蓝（悬停词）并成同一列，
// 并且左缘白轴吃掉「不足一字的余量」，正文内容宽度正好是正文字号的整数倍。
// 跑法：node tmp/verify-白轴一列.mjs  [BOOK=谁动了我的奶酪.txt] [KW=蒙古] [KW2=奶酪]
// 按 AGENTS.md：profile 路径存下来，成功/异常/超时都走 finally 删除并确认不存在。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const 项目根 = resolve(import.meta.dirname, '..');
const 目标文本 = process.env.BOOK || '从0到1：开启商业与未来的秘密.txt';
const 关键词 = process.env.KW || '商业';
const 悬停词 = process.env.KW2 || '未来';
const 窗口 = (process.env.SIZE || '1440,1000').split(',').map(Number);

async function 取空闲端口(首选) {
  const 试 = async (端口) => {
    const 探测 = createServer();
    try {
      await new Promise((完成, 失败) => {
        探测.once('error', 失败);
        探测.listen(端口, '127.0.0.1', 完成);
      });
      return 探测.address().port;
    } catch {
      return 0;
    } finally {
      await new Promise((完成) => 探测.close(完成));
    }
  };
  return (await 试(首选)) || (await 试(0));
}

// 只清本项目 reader-* 且确认无进程占用的遗留 profile
function 清理遗留profile(跳过) {
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
}

const CDP端口 = await 取空闲端口(9466);
const 站点端口 = await 取空闲端口(15966);
const 地址 = `http://127.0.0.1:${站点端口}/`;
const profile = mkdtempSync(join(tmpdir(), 'reader-rail-1col-'));
清理遗留profile(profile);

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
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
    `--window-size=${窗口[0]},${窗口[1]}`,
    地址,
  ],
  { stdio: 'ignore' },
);
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));
const 控制台错误 = [];
let ws = null;
let 消息号 = 0;
const 待回复 = new Map();

function 发送(方法, 参数 = {}) {
  return new Promise((解决, 拒绝) => {
    const 下标 = ++消息号;
    const 计时器 = setTimeout(() => {
      待回复.delete(下标);
      拒绝(new Error(`CDP 超时: ${方法}`));
    }, 30_000);
    待回复.set(下标, {
      resolve: (v) => (clearTimeout(计时器), 解决(v)),
      reject: (e) => (clearTimeout(计时器), 拒绝(e)),
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

async function 连接页面() {
  for (let i = 0; i < 300; i++) {
    try {
      const 列表 = await (
        await fetch(`http://127.0.0.1:${CDP端口}/json`)
      ).json();
      const 目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
      if (!目标) {
        await pause(200);
        continue;
      }
      ws = new WebSocket(目标.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener('open', r, { once: true }));
      ws.addEventListener('message', (事件) => {
        const 消息 = JSON.parse(事件.data);
        if (消息.method === 'Runtime.consoleAPICalled' && 消息.params.type === 'error')
          控制台错误.push(
            消息.params.args.map((a) => a.value ?? a.description).join(' '),
          );
        if (消息.method === 'Log.entryAdded' && 消息.params.entry.level === 'error')
          控制台错误.push(消息.params.entry.text);
        if (!消息.id) return;
        const 请求 = 待回复.get(消息.id);
        待回复.delete(消息.id);
        if (!请求) return;
        if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
        else 请求.resolve(消息.result);
      });
      await 发送('Runtime.enable');
      await 发送('Log.enable');
      return;
    } catch {
      await pause(200);
    }
  }
  throw new Error('headless Chrome 页面未就绪');
}

async function 载入一本书() {
  for (let i = 0; i < 300; i++) {
    if (
      await 求值(`
        return !!document.querySelector('#内容选择按钮') &&
          (document.querySelector('#载入状态')?.hidden ?? true);`)
    )
      break;
    await pause(200);
  }
  await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
  for (let i = 0; i < 200; i++) {
    if (
      await 求值(`
        return [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
          .some((b) => b.dataset.fileName === ${JSON.stringify(目标文本)});`)
    )
      break;
    await pause(200);
  }
  await 求值(`
    [...document.querySelectorAll('#内容选择列表 button[data-file-name]')]
      .find((b) => b.dataset.fileName === ${JSON.stringify(目标文本)}).click();
    return 1;`);
  for (let i = 0; i < 900; i++) {
    if (
      await 求值(`
        const { 状态 } = await import('./js/状态.js');
        return 状态.文件名 === ${JSON.stringify(目标文本)} && 状态.行起点列表.length > 100;`)
    )
      return;
    await pause(200);
  }
  throw new Error(`未能载入 ${目标文本}`);
}

async function 截(名字, x, 宽度, 高度, scale = 4) {
  const { data } = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x, y: 0, width: 宽度, height: 高度, scale },
  });
  writeFileSync(resolve(import.meta.dirname, 名字), Buffer.from(data, 'base64'));
}

const 量白轴 = () =>
  求值(`
    const { 状态, 元素 } = await import('./js/状态.js');
    const 根 = getComputedStyle(document.documentElement);
    const 变量 = (名) => parseFloat(根.getPropertyValue(名));
    const 盒 = (e) => { const b = e.getBoundingClientRect();
      return { x: Math.round(b.x * 100) / 100, w: Math.round(b.width * 100) / 100 }; };
    const 行 = [...document.querySelectorAll('.正文行')].filter((r) => r.childElementCount);
    const 末字右 = Math.max(...行.map((r) => r.lastElementChild.getBoundingClientRect().right));
    const 首字左 = Math.min(...行.map((r) => r.firstElementChild.getBoundingClientRect().left));
    const 字号 = 变量('--正文字号');
    return {
      视口宽: document.documentElement.clientWidth,
      字号,
      正文左留白: 变量('--正文左留白'),
      // --行首标记留白 / --白轴总宽 / --关键词宽度 都是 calc()，未注册的自定义属性
      // 读不到求值结果，只能按定义式自己折一遍，再拿实测几何对账。
      行首标记留白: 字号 * 变量('--末处标记留白比例'),
      轨道宽度: 变量('--章节轨道宽度'),
      内容宽度: parseFloat(状态.换行键.split('|')[0]) || null,
      章节刻度存在: !!document.querySelector('#章节刻度'),
      悬停画布存在: !!document.querySelector('#悬停关键词指示器'),
      轨道: 盒(元素.章节轨道), 画布: 盒(元素.关键词指示器),
      数字: 盒(元素.滚动进度), 首字左, 末字右,
      画布隐藏: 元素.关键词指示器.hidden,
    };`);

// 读画布上出现最多的不透明颜色：选中词应为纯黑，悬停词应为该词配色
const 读画布主色 = () =>
  求值(`
    const { 元素 } = await import('./js/状态.js');
    const c = 元素.关键词指示器;
    if (c.hidden || !c.width) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const 计数 = new Map();
    let 有墨行数 = 0;
    for (let y = 0; y < c.height; y++) {
      let 有墨 = false;
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] < 40) continue;
        有墨 = true;
        const 键 = [d[i], d[i + 1], d[i + 2], Math.round(d[i + 3] / 40) * 40].join(',');
        计数.set(键, (计数.get(键) ?? 0) + 1);
      }
      if (有墨) 有墨行数++;
    }
    const 排序 = [...计数].sort((a, b) => b[1] - a[1]);
    return { 主色: 排序[0]?.[0] ?? null, 次色: 排序[1]?.[0] ?? null, 有墨行数, 高: c.height, 宽: c.width };`);

let 失败 = null;
try {
  await 连接页面();
  await 载入一本书();
  await 求值(`
    const { 添加关键词标记 } = await import('./js/关键词.js');
    const { 状态 } = await import('./js/状态.js');
    添加关键词标记(${JSON.stringify(关键词)}, 状态.文本.indexOf(${JSON.stringify(关键词)}));
    return 1;`);
  await 求值(`
    const { 添加关键词标记 } = await import('./js/关键词.js');
    const { 状态 } = await import('./js/状态.js');
    添加关键词标记(${JSON.stringify(悬停词)}, 状态.文本.indexOf(${JSON.stringify(悬停词)}));
    return 1;`);
  await 求值(`
    const { 元素, 状态 } = await import('./js/状态.js');
    状态.当前关键词id = 状态.关键词列表.find((k) => k.文本 === ${JSON.stringify(关键词)}).id;
    元素.滚动容器.scrollTop = 元素.滚动容器.scrollHeight * 0.3;
    状态.悬停关键词id = null;
    (await import('./js/指示器.js')).更新关键词指示器();
    return 1;`);
  await pause(800);

  // —— 1. 只剩一列 ——
  const 一列 = await 量白轴();
  const 白轴 = 一列.轨道宽度 + 一列.正文左留白 + 一列.行首标记留白;
  console.log('白轴:', JSON.stringify(一列), '白轴(按定义式):', 白轴);
  assert.equal(一列.章节刻度存在, false, '章节刻度画布应已撤下');
  assert.equal(一列.悬停画布存在, false, '悬停关键词独立画布应已并入同一列');
  assert.equal(一列.画布.x, 0, '关键词刻度铺满白轴、贴屏幕左缘');
  assert.ok(
    Math.abs(一列.画布.w - 一列.轨道.w) <= 0.5,
    `刻度列铺满白轴：${一列.画布.w} vs ${一列.轨道.w}`,
  );
  assert.ok(
    Math.abs(一列.轨道.w - 白轴) <= 0.5,
    `白轴宽 = 余量列 + 行首留白：${一列.轨道.w} vs ${白轴}`,
  );
  assert.ok(
    一列.轨道宽度 >= 0 && 一列.轨道宽度 < 一列.字号,
    `余量列应落在 0~一字号之间：${一列.轨道宽度}`,
  );
  assert.equal(一列.画布隐藏, false, '选中关键词有命中，刻度列应显示');

  // —— 2. 正文正好整数个字、末字贴右缘 ——
  assert.ok(一列.内容宽度 > 0, '状态.排版.内容宽度 应已写入');
  const 字数 = 一列.内容宽度 / 一列.字号;
  assert.ok(
    Math.abs(字数 - Math.round(字数)) < 1e-6,
    `内容宽度应是正文字号的整数倍：${一列.内容宽度} / ${一列.字号} = ${字数}`,
  );
  assert.ok(
    Math.abs(一列.末字右 - 一列.视口宽) <= 1.5,
    `满行末字要贴着视口右缘：${一列.末字右} vs ${一列.视口宽}`,
  );
  assert.ok(
    一列.首字左 >= 一列.轨道.w - 1.5,
    `首字不许伸进白轴：${一列.首字左} vs ${一列.轨道.w}`,
  );
  assert.ok(
    Math.abs(一列.首字左 - 一列.轨道.w) <= 1.5,
    `首字应紧贴白轴右缘：${一列.首字左} vs ${一列.轨道.w}`,
  );
  console.log(`PASS 一列 + 整数字数（每行 ${Math.round(字数)} 字）`);

  const 黑 = await 读画布主色();
  console.log('选中词画布:', JSON.stringify(黑));
  assert.ok(黑 && /^0,0,0,/.test(黑.主色), `选中关键词刻度应为纯黑：${黑?.主色}`);
  await 截('白轴一列-选中词.png', 0, 一列.轨道.w + 60, 窗口[1]);
  await 截('白轴一列-整页.png', 0, 一列.视口宽, 窗口[1], 1);

  // —— 3. 悬停别的词：同一列整列换成那个词 ——
  await 求值(`
    const { 状态 } = await import('./js/状态.js');
    状态.悬停关键词id = 状态.关键词列表.find((k) => k.文本 === ${JSON.stringify(悬停词)}).id;
    (await import('./js/指示器.js')).更新关键词指示器();
    return 1;`);
  await pause(400);
  const 彩 = await 读画布主色();
  const 悬停盒 = await 量白轴();
  console.log('悬停时画布:', JSON.stringify(彩), '几何:', JSON.stringify(悬停盒.画布));
  assert.ok(彩, '悬停时同一列仍要有刻度');
  assert.ok(
    !/^0,0,0,/.test(彩.主色),
    `悬停别的关键词时整列只显那个词（不再是纯黑）：${彩.主色} / ${彩.次色}`,
  );
  assert.deepEqual(悬停盒.画布, 一列.画布, '悬停不新增列、几何不变');
  await 截('白轴一列-悬停词.png', 0, 一列.轨道.w + 60, 窗口[1]);
  await 求值(`
    const { 状态 } = await import('./js/状态.js');
    状态.悬停关键词id = null;
    (await import('./js/指示器.js')).更新关键词指示器();
    return 1;`);
  await pause(300);
  assert.match((await 读画布主色()).主色, /^0,0,0,/, '移开鼠标回到选中词的纯黑');

  // —— 4. 换字号 / 改视口宽之后仍然整数字数 ——
  for (const 字号 of [16, 24, 44]) {
    await 求值(`
      document.documentElement.style.setProperty('--正文字号', '${字号}px');
      document.documentElement.style.setProperty('--行高', '${字号}px');
      const { 重建行索引 } = await import('./js/排版引擎.js');
      重建行索引();
      return 1;`);
    await pause(1200);
    const 量 = await 量白轴();
    const n = 量.内容宽度 / 量.字号;
    assert.ok(
      Math.abs(n - Math.round(n)) < 1e-6,
      `字号 ${字号} 下内容宽度 ${量.内容宽度} 不是整数倍（${n}）`,
    );
    assert.ok(
      Math.abs(量.末字右 - 量.视口宽) <= 1.5,
      `字号 ${字号} 下末字没贴右缘：${量.末字右} vs ${量.视口宽}`,
    );
    console.log(`PASS 字号 ${字号}：${Math.round(n)} 字/行，白轴 ${量.轨道.w}px`);
  }
  await 求值(`
    document.documentElement.style.removeProperty('--正文字号');
    document.documentElement.style.removeProperty('--行高');
    (await import('./js/排版引擎.js')).重建行索引();
    return 1;`);
  await pause(1200);

  await 发送('Emulation.setDeviceMetricsOverride', {
    width: 900,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await 求值(`window.dispatchEvent(new Event('resize')); return 1;`);
  await pause(1600);
  const 窄 = await 量白轴();
  const 窄字数 = 窄.内容宽度 / 窄.字号;
  assert.ok(
    Math.abs(窄字数 - Math.round(窄字数)) < 1e-6,
    `900px 视口下不再是整数倍：${窄.内容宽度} / ${窄.字号}`,
  );
  assert.ok(
    Math.abs(窄.末字右 - 窄.视口宽) <= 1.5,
    `900px 视口下末字没贴右缘：${窄.末字右} vs ${窄.视口宽}`,
  );
  console.log(`PASS 视口 900px：${Math.round(窄字数)} 字/行，白轴 ${窄.轨道.w}px`);
  await 截('白轴一列-窄视口.png', 0, 窄.轨道.w + 60, 800);
  await 发送('Emulation.clearDeviceMetricsOverride');

  // 诊断：chapter-browser 在「右下三钮左右有序且不越界」这条上失败，顺手量一下
  const 右下 = await 求值(`
    const r = ['内容选择按钮','章节目录按钮','阅读统计按钮','自动滚动按钮','当前时间'].map((id) => {
      const e = document.getElementById(id);
      if (!e) return { id, 缺失: true };
      const b = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return { id, 左: Math.round(b.left), 右: Math.round(b.right),
        上: Math.round(b.top), 可见: s.visibility, 显示: s.display, 尺寸: s.width };
    });
    return { 视口: innerWidth, r, 正文右缘: Math.max(...[...document.querySelectorAll('.正文行')]
      .filter((x) => x.childElementCount).map((x) => x.lastElementChild.getBoundingClientRect().right)) };`);
  console.log('右下控件:', JSON.stringify(右下, null, 1));

  // 语音订阅会去连本机 wss://localhost:15941，没起那个服务时必然报错，与本次改动无关
  const 噪音 = (条) => /wss:\/\/localhost:15941|ERR_CERT_AUTHORITY_INVALID/.test(条);
  const 真错误 = 控制台错误.filter((条) => !噪音(条));
  assert.deepEqual(真错误, [], `控制台不应报错：${真错误.join(' | ')}`);
  console.log('\n全部通过：白轴一列、整数字数、悬停换色、字号与视口联动');
} catch (错误) {
  失败 = 错误;
  console.error(错误);
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  服务.kill();
  await Promise.race([
    Promise.all([
      new Promise((r) => chrome.on('exit', r)),
      new Promise((r) => 服务.on('exit', r)),
    ]),
    pause(4000),
  ]);
  chrome.kill('SIGKILL');
  服务.kill('SIGKILL');
  await pause(500);
  rmSync(profile, { recursive: true, force: true });
  if (existsSync(profile)) {
    console.error('profile 清理失败，目录仍存在:', profile);
    失败 ??= new Error('profile 未清理');
  } else {
    console.log('profile 已清理:', profile);
  }
  清理遗留profile(null);
}
process.exitCode = 失败 ? 1 : 0;
