// 一次性验证脚本：右下角时间浮层贴角 + 正文滚进浮层下方时自动隐藏。
// 自启 server.mjs + headless Chrome（一次性 profile），量真实几何并真滚动验证：
//   1) 时间浮层右缘/底缘与视口右下角贴合（≤0.6px）；
//   2) 底部行有字滚进浮层下方 → 浮层挂 .被正文遮挡（visibility:hidden）；
//   3) 滚到空行落在浮层下方 → 浮层恢复显示；
//   4) 浮层加宽（滚动读数两行）时不与右下按钮组重叠；
//   5) 出图供肉眼复核。
// profile 清理遵循 AGENTS.md：reader- 前缀 + try/finally 停进程后 rm，收尾前确认已删除。
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const 站点端口 = Number(process.env.SITE_PORT || 16117);
const CDP端口 = Number(process.env.VERIFY_CDP_PORT || 9517);
const 地址 = `http://127.0.0.1:${站点端口}/`;
const 项目根 = new URL('..', import.meta.url).pathname;

const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

// —— 开跑前：清掉本项目遗留且无进程占用的 reader-* 一次性 profile（AGENTS.md）——
let 遗留已清 = 0;
for (const 名字 of readdirSync(tmpdir())) {
  if (!名字.startsWith('reader-')) continue;
  const 路径 = join(tmpdir(), 名字);
  let 被占用 = false;
  try {
    execFileSync('pgrep', ['-f', 名字], { stdio: 'pipe' });
    被占用 = true;
  } catch {
    被占用 = false; // pgrep 无命中即退出码 1
  }
  if (被占用) continue;
  rmSync(路径, { recursive: true, force: true });
  遗留已清 += 1;
}
if (遗留已清) console.log(`已清理本项目遗留 profile：${遗留已清} 个`);

const 服务 = spawn('node', ['server.mjs', String(站点端口)], {
  cwd: 项目根,
  stdio: 'ignore',
});
const profile = mkdtempSync(join(tmpdir(), 'reader-clock-occlusion-'));
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    '--force-color-profile=srgb',
    地址,
  ],
  { stdio: 'ignore' },
);

// —— 收尾：先停进程并等待退出，再删 profile，最后确认不存在（AGENTS.md 强制）——
// Chrome 的辅助进程（crashpad 等）会在主进程死后短暂回写 profile，
// 所以要按 profile 名等全部相关进程退出，rm 再带重试。
let 已收尾 = false;
function 收尾并校验() {
  if (已收尾) return;
  已收尾 = true;
  try {
    for (const 子进程 of [chrome, 服务]) {
      if (子进程.exitCode === null && 子进程.signalCode === null) {
        子进程.kill();
        子进程.kill('SIGKILL');
      }
    }
    const profile名 = profile.split('/').pop();
    for (let i = 0; i < 20; i += 1) {
      try {
        execFileSync('pgrep', ['-f', profile名], { stdio: 'pipe' });
      } catch {
        break; // pgrep 无命中即退出码 1：相关进程全部退出
      }
      const wait直到 = Date.now() + 100;
      while (Date.now() < wait直到) {}
    }
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    if (existsSync(profile)) {
      console.log(`❌ profile 清理失败，目录仍存在：${profile}`);
      process.exitCode = 1;
    } else {
      console.log(`✅ profile 已删除：${profile}`);
    }
  } catch (错误) {
    console.log(`❌ profile 清理异常：${错误?.message ?? 错误}`);
    process.exitCode = 1;
  }
}
process.on('exit', 收尾并校验);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

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
    待回复.set(下标, { resolve, reject });
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
      结果.exceptionDetails.exception?.description || JSON.stringify(结果.exceptionDetails),
    );
  return 结果.result.value;
}

try {
  for (let i = 0; i < 200; i++) {
    const 行数 = await 求值(`return document.querySelectorAll('.正文行').length;`);
    if (行数 > 20) break;
    await pause(200);
  }

  // —— 1) 贴角：浮层右缘 = 视口右缘，底缘 = 视口底缘 ——
  // 先强制显形再量（若已被遮挡，visibility:hidden 不影响几何，但为稳妥仍先摘掉类）
  const 贴角 = await 求值(`
    const 浮层 = document.querySelector('.时间信息');
    浮层.classList.remove('被正文遮挡');
    const r = 浮层.getBoundingClientRect();
    const 时钟 = document.querySelector('#当前时间').getBoundingClientRect();
    return {
      右间隙: +(innerWidth - r.right).toFixed(2),
      底间隙: +(innerHeight - r.bottom).toFixed(2),
      时钟右间隙: +(innerWidth - 时钟.right).toFixed(2),
      宽: +r.width.toFixed(1),
      高: +r.height.toFixed(1),
    };
  `);
  console.log('贴角:', JSON.stringify(贴角));

  // —— 行几何信息：从行索引表里挑候选行 ——
  const 行信息 = await 求值(`
    const { 状态 } = await import('./js/状态.js');
    const 行高 = 状态.行高;
    const 视口高 = innerHeight;
    const 密行 = [];
    const 疏行 = [];
    for (let idx = 40; idx < Math.min(600, 状态.行起点列表.length); idx += 1) {
      const 长 = 状态.行终点列表[idx] - 状态.行起点列表[idx];
      if (长 >= 20) 密行.push([idx, 长]);
      if (长 === 0) 疏行.push(idx);
    }
    // 满行才会伸到右缘时钟下方：按长度降序，先试最接近满容量的行
    密行.sort((a, b) => b[1] - a[1]);
    return {
      行高,
      视口高,
      密行: 密行.map(([idx]) => idx),
      最长: 密行[0]?.[1] ?? 0,
      疏行,
      总行数: 状态.行起点列表.length,
    };
  `);
  console.log(
    `行高=${行信息.行高} 总行数=${行信息.总行数} 最长行=${行信息.最长}字 密行候选=${行信息.密行.length} 疏行候选=${行信息.疏行.length}`,
  );

  // 用 scroll 事件真跑判定链路（监听 → rAF → 命中测试），不直接调模块函数
  async function 滚到并等稳定(scrollTop) {
    await 求值(`
      document.querySelector('#滚动容器').scrollTop = ${scrollTop};
      return true;
    `);
    await pause(350); // 渲染 rAF + 遮挡判定 rAF + 子像素合成都该落定
  }

  // 探针：浮层矩形采样点下是否真有 .字（独立于模块实现，交叉验证）
  async function 探针() {
    return 求值(`
      const r = document.querySelector('.时间信息').getBoundingClientRect();
      const 列数 = Math.max(2, Math.ceil(r.width / 12) + 1);
      const 命中点 = [];
      for (let 行序 = 0; 行序 < 3; 行序 += 1) {
        const y = Math.round(r.top + ((r.height - 1) * 行序) / 2);
        for (let 列序 = 0; 列序 < 列数; 列序 += 1) {
          const x = Math.round(r.left + ((r.width - 1) * 列序) / (列数 - 1));
          const 有字 = document.elementsFromPoint(x, y).some((n) => n.classList?.contains('字'));
          if (有字) 命中点.push([x, y]);
        }
      }
      return {
        隐藏: document.querySelector('.时间信息').classList.contains('被正文遮挡'),
        采样命中数: 命中点.length,
        可见性: getComputedStyle(document.querySelector('.时间信息')).visibility,
      };
    `);
  }

  const 失败 = [];
  if (贴角.右间隙 > 0.6 || 贴角.底间隙 > 0.6)
    失败.push(`未贴角：右间隙 ${贴角.右间隙}px 底间隙 ${贴角.底间隙}px`);
  if (Math.abs(贴角.时钟右间隙) > 0.6) 失败.push(`时钟未贴右缘：${贴角.时钟右间隙}px`);

  // —— 2) 有字滚进浮层下方 → 隐藏。逐个密行候选试，探针确认字确实在浮层下方才算数 ——
  let 遮挡成立 = false;
  for (const idx of 行信息.密行.slice(0, 12)) {
    await 滚到并等稳定((idx + 1) * 行信息.行高 - 行信息.视口高);
    const 状态A = await 探针();
    if (状态A.采样命中数 === 0) continue; // 该行碰巧是段尾短行，字没到右缘，换下一个
    if (状态A.隐藏 && 状态A.可见性 === 'hidden') {
      遮挡成立 = true;
      console.log(`遮挡成立（行 ${idx}，采样命中 ${状态A.采样命中数} 点）`);
      break;
    }
    失败.push(`行 ${idx}：浮层下有字（${状态A.采样命中数} 点）但浮层未隐藏`);
    break;
  }
  if (!遮挡成立 && !失败.length) 失败.push('所有密行候选都没验证到遮挡');

  // 截图 A：遮挡态（浮层应不可见）
  const 截图A = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 900, y: 780, width: 380, height: 120, scale: 3 },
  });
  writeFileSync(
    join(项目根, 'tmp', '时钟遮挡-有字隐藏.png'),
    Buffer.from(截图A.data, 'base64'),
  );

  // —— 3) 空行落在浮层下方 → 恢复显示 ——
  let 恢复成立 = false;
  for (const idx of 行信息.疏行.slice(0, 12)) {
    await 滚到并等稳定((idx + 1) * 行信息.行高 - 行信息.视口高);
    const 状态B = await 探针();
    if (状态B.采样命中数 !== 0) continue; // 候选不干净（时钟竖带跨到了别的字行），换下一个
    if (!状态B.隐藏 && 状态B.可见性 === 'visible') {
      恢复成立 = true;
      console.log(`恢复成立（行 ${idx}，采样无命中）`);
      break;
    }
    失败.push(`行 ${idx}：浮层下无字但未恢复显示（visibility=${状态B.可见性}）`);
    break;
  }
  if (!恢复成立 && !失败.length) 失败.push('所有空行候选都没验证到恢复显示');

  // 截图 B：露出态（右下角应看到时钟贴角）
  const 截图B = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 900, y: 780, width: 380, height: 120, scale: 3 },
  });
  writeFileSync(
    join(项目根, 'tmp', '时钟遮挡-空行露出.png'),
    Buffer.from(截图B.data, 'base64'),
  );

  // —— 4) 两行读数全开（自动滚动中形态）时不与右下按钮组重叠 ——
  const 重叠 = await 求值(`
    document.querySelector('#已滚动时间行').hidden = false;
    document.querySelector('#剩余滚动时间行').hidden = false;
    const 浮层 = document.querySelector('.时间信息').getBoundingClientRect();
    const 按钮 = document.querySelector('.右下按钮组').getBoundingClientRect();
    return { 浮层左: +浮层.left.toFixed(1), 按钮右: +按钮.right.toFixed(1) };
  `);
  console.log('加宽检查:', JSON.stringify(重叠));
  if (重叠.浮层左 < 重叠.按钮右)
    失败.push(`两行读数压到按钮组：浮层 left=${重叠.浮层左} < 按钮组 right=${重叠.按钮右}`);

  if (失败.length) {
    console.log('❌ 失败:');
    for (const f of 失败) console.log('  -', f);
    process.exitCode = 1;
  } else {
    console.log('✅ 全部通过');
  }
} finally {
  收尾并校验();
  ws.close();
}
