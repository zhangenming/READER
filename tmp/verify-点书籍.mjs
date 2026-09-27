// 复现用户现场：关键词/章节数都在、按钮组被撑宽时，「书籍」按钮能否 hover + 真实点击。
// 用法：node tmp/verify-点书籍.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const 项目根 = new URL('..', import.meta.url).pathname;
const CDP端口 = 15934;
const 书名 = '从0到1：开启商业与未来的秘密.txt';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function 端口空闲(端口) {
  return new Promise((resolve) => {
    const s = createServer();
    s.on('error', () => resolve(false));
    s.listen(端口, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}
const 清理遗留 = (跳过) => {
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

const profile = mkdtempSync(join(tmpdir(), 'reader-click-'));
let ws = null, 序号 = 0;
const 待回复 = new Map();
function 发送(方法, 参数 = {}) {
  return new Promise((resolve, reject) => {
    const 下标 = ++序号;
    const t = setTimeout(() => (待回复.delete(下标), reject(new Error('CDP 超时 ' + 方法))), 30_000);
    待回复.set(下标, { resolve: (v) => (clearTimeout(t), resolve(v)), reject: (e) => (clearTimeout(t), reject(e)) });
    ws.send(JSON.stringify({ id: 下标, method: 方法, params: 参数 }));
  });
}
async function 求值(代码) {
  const r = await 发送('Runtime.evaluate', { expression: `(async () => { ${代码} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const 移动 = (x, y) => 发送('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
async function 真点击(x, y) {
  await 移动(x, y);
  await pause(60);
  await 发送('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await pause(40);
  await 发送('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await pause(250);
}

try {
  for (let n = 0; n < 100 && !(await 端口空闲(CDP端口)); n++) await pause(200);
  清理遗留(profile);
  const 站点 = await new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
  const 服务 = spawn('node', ['server.mjs', String(站点)], { cwd: 项目根, stdio: 'ignore' });
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', `--remote-debugging-port=${CDP端口}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1440,900',
    `http://127.0.0.1:${站点}/`,
  ], { stdio: 'ignore' });
  process.on('exit', () => { chrome.kill(); 服务.kill(); });
  try {
    for (let n = 0; n < 150; n++) {
      try {
        const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
        const 目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${站点}/`));
        if (!目标) { await pause(300); continue; }
        ws = new WebSocket(目标.webSocketDebuggerUrl);
        await new Promise((r) => ws.addEventListener('open', r, { once: true }));
        ws.addEventListener('message', (e) => {
          const m = JSON.parse(e.data);
          if (!m.id) return;
          const q = 待回复.get(m.id);
          待回复.delete(m.id);
          if (!q) return;
          m.error ? q.reject(new Error(JSON.stringify(m.error))) : q.resolve(m.result);
        });
        await 发送('Runtime.enable');
        break;
      } catch { await pause(300); }
    }
    if (!ws) throw new Error('页面未就绪');

    await 求值(`
      const { 打开内容选择弹窗 } = await import('./js/内容选择弹窗.js');
      打开内容选择弹窗(); return 1;`);
    for (let n = 0; n < 80; n++) {
      if (await 求值(`const { 状态 } = await import('./js/状态.js'); return !!状态.文件名;`)) break;
      await 求值(`const b=[...document.querySelectorAll('#内容选择列表 [data-file-name]')]
        .find(x=>x.dataset.fileName===${JSON.stringify(书名)}) ?? document.querySelector('#内容选择列表 [data-file-name]');
        b?.click(); return 1;`);
      await pause(700);
    }
    await 求值(`document.querySelector('#内容选择弹窗')?.close(); return 1;`);
    await pause(500);

    // 造出用户现场：关键词面板可见且计数四位数、章节目录有数量
    const 现场 = await 求值(`
      const { 添加关键词标记 } = await import('./js/关键词.js');
      const { 渲染关键词面板 } = await import('./js/面板.js');
      const { 状态 } = await import('./js/状态.js');
      for (let i = 0; i < 3; i++) 添加关键词标记('测试关键词' + i, [100 + i, 900 + i, 1500 + i]);
      渲染关键词面板();
      // 面板开关文案改成四位数，模拟「关键词 1203」的宽度
      const 开关 = document.querySelector('#关键词面板开关');
      开关.textContent = '关键词 1203';
      document.querySelector('#章节数量').textContent = '217';
      await new Promise(r => requestAnimationFrame(r));
      const 组 = document.querySelector('.右下按钮组').getBoundingClientRect();
      const b = document.querySelector('#内容选择按钮').getBoundingClientRect();
      return { 面板隐藏: document.querySelector('#关键词面板').hidden,
        组: {left: Math.round(组.left), right: Math.round(组.right), top: Math.round(组.top), bottom: Math.round(组.bottom)},
        书籍: {left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom)},
        innerWidth, innerHeight };`);
    console.log('现场:', JSON.stringify(现场));

    const 显示中 = () => 求值(`return document.body.classList.contains('右下控件显示');`);
    const 命中名 = (x, y) => 求值(`const el=document.elementFromPoint(${x},${y});
      return el ? (el.closest('button')?.id ?? el.closest('[class]')?.className ?? el.tagName) : 'null';`);
    async function 走位(名, 路径) {
      await 移动(60, 60);
      await pause(90);
      for (const [x, y] of 路径) { await 移动(Math.round(x), Math.round(y)); await pause(60); }
      await pause(140);
      const 在 = await 显示中();
      const 末 = 路径[路径.length - 1];
      console.log(`${在 ? 'OK  ' : 'FAIL'} ${名} 末点=(${Math.round(末[0])},${Math.round(末[1])}) 命中=${await 命中名(末[0], 末[1])}`);
      return 在;
    }
    const { 书籍: s, innerWidth: W, innerHeight: H } = 现场;
    const 中x = (s.left + s.right) / 2, 中y = (s.top + s.bottom) / 2;
    let 通过 = true;
    通过 = (await 走位('从左水平进入书籍', [[s.left - 120, 中y], [s.left - 60, 中y], [s.left - 20, 中y], [s.left + 4, 中y]])) && 通过;
    通过 = (await 走位('从下方进入书籍图标', [[s.left + 8, H - 6], [s.left + 8, s.bottom - 4], [s.left + 6, 中y]])) && 通过;
    通过 = (await 走位('从右下角斜插到书籍', [[W - 40, H - 20], [W - 120, H - 40], [中x, 中y]])) && 通过;
    通过 = (await 走位('停在书籍正中', [[中x, 中y]])) && 通过;
    通过 = (await 走位('从正文竖直向下插到书籍', [[中x, s.top - 200], [中x, s.top - 60], [中x, s.top - 6], [中x, 中y]])) && 通过;
    通过 = (await 走位('从书籍左上斜穿图标', [[s.left - 40, s.top - 30], [s.left - 10, s.top + 6], [s.left + 5, 中y]])) && 通过;
    // 中途掠过组外再回来（真实手抖）：宽限期内不该消失
    await 移动(60, 60); await pause(90);
    await 移动(中x, 中y); await pause(120);
    await 移动(s.left - 60, s.top - 80); await pause(80);
    await 移动(中x, 中y); await pause(120);
    const 手抖后 = await 显示中();
    console.log(`${手抖后 ? 'OK  ' : 'FAIL'} 伸手途中抖出热区又回来 → 仍显示=${手抖后}`);
    通过 = 手抖后 && 通过;

    // 真实点击：指针先进热区让按钮显形，再点
    await 求值(`document.querySelector('#内容选择弹窗').close?.(); return 1;`).catch(() => {});
    await 移动(60, 60); await pause(120);
    await 真点击(中x, 中y);
    const 开了 = await 求值(`return document.querySelector('#内容选择弹窗').open;`);
    // 停在按钮上时自动滚动停止（撤掉 强制显示）→ 不该把指针底下的按钮抽走
    await 求值(`document.querySelector('#内容选择弹窗').open && document.querySelector('#内容选择弹窗').close();
      document.activeElement && document.activeElement.blur(); return 1;`);
    await pause(200);
    await 移动(60, 60); await pause(500);
    await 移动(中x, 中y); await pause(150);
    const 强制撤 = await 求值(`
      const m = await import('./js/右下控件.js');
      m.设置右下强制显示(true); m.设置右下强制显示(false);
      return document.body.classList.contains('右下控件显示');`);
    console.log(`${强制撤 ? 'OK  ' : 'FAIL'} 停在书籍上时自动滚动停止 → 仍显示=${强制撤}`);

    // 反向对照：真的走开（超过宽限期）必须隐藏
    // 上一步真点击让按钮拿到焦点（关弹窗时焦点还回按钮）→ 聚焦本身就该保持显示，先撤焦
    await 求值(`document.activeElement && document.activeElement.blur(); return 1;`);
    await 移动(300, 200); await pause(700);
    const 走开 = await 显示中();
    console.log(`${走开 ? 'FAIL: 走开后仍显示（宽限期没收）' : 'OK   走开 700ms 后已隐藏'}`);

    // 伸手途中抖出热区又回来（<宽限期）：不该消失
    await 移动(中x, 中y); await pause(150);
    await 移动(s.left - 80, s.top - 90); await pause(60); // 抖出去，只停 60ms
    await 移动(中x, 中y); await pause(60);
    const 抖动 = await 显示中();
    await 移动(中x, 中y); await pause(600);
    const 抖动后 = await 显示中();
    console.log(`${抖动 && 抖动后 ? 'OK  ' : 'FAIL'} 途中抖出热区 60ms 又回来 → 仍显示=${抖动}（停稳后=${抖动后}）`);
    console.log(`${开了 ? 'OK  ' : 'FAIL'} 直接点击书籍 → 弹窗打开=${开了}（一次 mousemove 都没预先发的情况下）`);
    console.log(通过 && 开了 && 强制撤 && !走开 && 抖动 && 抖动后 ? 'PASS: 书籍可悬停且可点击' : 'FAIL: 仍有进不去/点不上的情况');

    // 交给用户粘进控制台的同款自检：合成一次落在书籍中心的 mousemove，看运行中的页面判不判为热区
    const 自检 = await 求值(`
      return (async()=>{const b=document.querySelector('#内容选择按钮').getBoundingClientRect();
        const x=(b.left+b.right)/2,y=(b.top+b.bottom)/2;
        document.body.classList.remove('右下控件显示');
        dispatchEvent(new MouseEvent('mousemove',{clientX:x,clientY:y,bubbles:true}));
        await new Promise(r=>setTimeout(r,400));
        const 显示=document.body.classList.contains('右下控件显示');
        const c=await import('/js/常量.js');
        const s=await fetch('/js/右下控件.js').then(r=>r.text());
        return {运行中代码: 显示?'新':(s.includes('在右下热区')?'文件新/页面旧':'文件旧/页面旧'),
          热区宽:c.右下热区宽度, 外扩:c.右下控件外扩, 宽限:c.右下出区宽限毫秒,
          书籍中心:[Math.round(x),Math.round(y)], 视口:[innerWidth,innerHeight],
          组左缘距右: Math.round(innerWidth-document.querySelector('.右下按钮组').getBoundingClientRect().left)};})()`);
    console.log('自检输出:', JSON.stringify(自检));
    console.log(自检.运行中代码 === '新' ? 'PASS: 自检判定为运行新代码' : 'FAIL: 自检判定页面仍是旧代码');
  } finally {
    ws?.close(); ws = null;
    chrome.kill(); 服务.kill();
    await Promise.race([Promise.all([new Promise(r => chrome.on('exit', r)), new Promise(r => 服务.on('exit', r))]), pause(3000)]);
    chrome.kill('SIGKILL'); 服务.kill('SIGKILL');
  }
} finally {
  rmSync(profile, { recursive: true, force: true });
  if (existsSync(profile)) { console.error('profile 清理失败:', profile); process.exitCode = 1; }
  else console.log('profile 已清理:', profile);
  清理遗留(profile);
}
