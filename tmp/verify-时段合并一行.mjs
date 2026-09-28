// 一次性验证：时段轴「不分书、一天一行」——当天全部书籍并到同一条轴上。
// 判据：一天一行且日期不重复；合并行的三笔账用本文件自带的区间代数独立复算；
// 列头合计＝各行显示值竖着相加；重叠时刻只算一次；悬停日期能查回各本书。
// 跑法：node tmp/verify-时段合并一行.mjs
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const 秒 = (h, m, s = 0) => h * 3600 + m * 60 + s;
const 到分 = (总输入) => {
  const 总 = Math.floor(总输入);
  if (总 > 0 && 总 < 60) return '不足 1 分钟';
  const 分钟 = Math.floor(总 / 60);
  return 分钟 < 60 ? `${分钟} 分` : `${Math.floor(分钟 / 60)} 小时 ${分钟 % 60} 分`;
};
// 合计走「各行显示值相加」口径：每行只到分、秒舍掉（不足 1 分钟那一档显示出来不足 1 分，
// 但相加时按 0 分算，与界面竖着加这一列的结果一致）
const 显示分 = (文本) => {
  const 分 = 文本.match(/(?:(\d+) 小时 )?(\d+) 分/);
  return 分 ? Number(分[1] ?? 0) * 60 + Number(分[2]) : 0;
};
// —— 本文件自带的区间代数（独立口径，不复用被测模块的函数）——
function 并段(...组们) {
  const 段 = 组们
    .flat()
    .filter(([起, 止]) => 止 > 起)
    .map(([起, 止]) => [起, 止])
    .sort((左, 右) => 左[0] - 右[0] || 左[1] - 右[1]);
  const 出 = [];
  for (const [起, 止] of 段) {
    const 末 = 出[出.length - 1];
    if (末 && 起 <= 末[1]) 末[1] = Math.max(末[1], 止);
    else 出.push([起, 止]);
  }
  return 出;
}
function 减段(被减, 减) {
  const 出 = [];
  for (const [起, 止] of 被减) {
    let 当前 = 起;
    for (const [减起, 减止] of 减) {
      if (减止 <= 当前 || 减起 >= 止) continue;
      if (减起 > 当前) 出.push([当前, 减起]);
      当前 = Math.max(当前, 减止);
    }
    if (当前 < 止) 出.push([当前, 止]);
  }
  return 出;
}
const 总秒 = (段) => 段.reduce((总, [起, 止]) => 总 + 止 - 起, 0);

const 滚动账 = {
  '2026-09-23': {
    '甲.txt': [[秒(8, 0), 秒(8, 10)], [秒(11, 30), 秒(11, 33)]],
    '乙.txt': [[秒(20, 0), 秒(20, 6)]],
  },
  '2026-09-22': {},
  '2026-09-21': { '': [[秒(13, 0), 秒(13, 20)]] }, // 旧数据：整天不分书
  '2026-09-20': { '甲.txt': [[秒(3, 0), 秒(3, 20)]] }, // 只有滚动没有可见段
};
const 可见账 = {
  '2026-09-23': {
    '甲.txt': [[秒(7, 50), 秒(12, 0)]],
    '乙.txt': [[秒(19, 40), 秒(20, 30)]],
  },
  '2026-09-22': { '甲.txt': [[秒(10, 0), 秒(11, 0)]], '乙.txt': [[秒(10, 30), 秒(11, 30)]] },
  '2026-09-21': { '': [[秒(12, 50), 秒(14, 0)]] },
  '2026-09-20': {},
};
// 09-19 一段都没有，只有旧毫秒账 → 不许出现在这张表里
const 旧滚动每日毫秒 = { '甲.txt': { '2026-09-19': 900_000 } };

// —— 期望：一天一行，当天全部书籍并起来算 ——
const 期望行 = [
  ['今天', '2026-09-23'],
  ['9月22日', '2026-09-22'],
  ['9月21日', '2026-09-21'],
  ['9月20日', '2026-09-20'],
].map(([标签, 日期]) => {
  const 滚动 = 并段(...Object.values(滚动账[日期] ?? {}));
  const 总计 = 并段(
    ...Object.values(可见账[日期] ?? {}),
    ...Object.values(滚动账[日期] ?? {}),
  );
  const 激活 = 总秒(减段(总计, 滚动));
  const 书 = [...new Set([...Object.keys(滚动账[日期] ?? {}), ...Object.keys(可见账[日期] ?? {})])];
  return {
    标签,
    日期,
    滚动段数: 滚动.length,
    滚动列: 滚动.length ? `${滚动.length} 段·${到分(总秒(滚动))}` : '',
    滚动文本: 滚动.length ? 到分(总秒(滚动)) : '',
    激活文本: 激活 ? 到分(激活) : '',
    总计文本: 到分(总秒(总计)),
    总计段: 总计,
    滚动段: 滚动,
    书名们: 书.map((名) => 名 || '未分书（旧数据）'),
  };
});
const 加显示值 = (取) => 期望行.reduce((总, 项) => 总 + 显示分(取(项)), 0);
const 期望合计 = {
  滚动: `共 ${期望行.reduce((总, 项) => 总 + 项.滚动段数, 0)} 段 · ${到分(加显示值((项) => 项.滚动文本) * 60)}`,
  激活: `共 ${到分(加显示值((项) => 项.激活文本) * 60)}`,
  总计: `共 ${到分(加显示值((项) => 项.总计文本) * 60)}`,
};
// 共用轴：全部日期全部段的最早起点 ~ 最晚终点
const 全部段 = 期望行.flatMap((项) => [...项.总计段, ...项.滚动段]);
const 窗口 = {
  起秒: Math.min(...全部段.map(([起]) => 起)),
  止秒: Math.max(...全部段.map(([, 止]) => 止)),
};

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
  return (await 试(首选)) || 试(0);
}
const CDP端口 = await 取空闲端口(9471);
const 站点端口 = await 取空闲端口(15971);
const 地址 = `http://127.0.0.1:${站点端口}/`;
const profile = mkdtempSync(join(tmpdir(), 'reader-merge-'));

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: resolve(import.meta.dirname, '..'),
  stdio: ['ignore', 'pipe', 'pipe'],
});
服务.stdout.resume();
服务.stderr.on('data', (块) => console.error('[server]', String(块).trim()));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(地址, { signal: AbortSignal.timeout(1000) })).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1400',
    地址,
  ],
  { stdio: 'ignore' },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
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
      const 列表 = await (await fetch(`http://127.0.0.1:${CDP端口}/json`)).json();
      const 目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
      if (!目标) continue;
      ws = new WebSocket(目标.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener('open', r, { once: true }));
      ws.addEventListener('message', (事件) => {
        const 消息 = JSON.parse(事件.data);
        if (!消息.id) return;
        const 请求 = 待回复.get(消息.id);
        待回复.delete(消息.id);
        消息.error ? 请求.reject(new Error(JSON.stringify(消息.error))) : 请求.resolve(消息.result);
      });
      await 发送('Page.enable');
      await 发送('Runtime.enable');
      return;
    } catch {}
    await pause(200);
  }
  throw new Error('未找到 headless Chrome 页面');
}
async function 等页面就绪() {
  for (let i = 0; i < 600; i++) {
    const 就绪 = await 求值(`
      if (!location.href.startsWith(${JSON.stringify(地址)})) {
        location.href = ${JSON.stringify(地址)};
        return false;
      }
      return !!document.querySelector('#阅读统计按钮') &&
        (document.querySelector('#载入状态')?.hidden ?? true);`);
    if (就绪) return;
    await pause(200);
  }
  throw new Error('页面始终没载入 ' + 地址);
}

let 退出码 = 0;
try {
  await 连接页面();
  await 等页面就绪();
  const 结果 = await 求值(`
    const { 创建阅读统计内容, 汇总书籍时间账 } = await import('./js/阅读统计.js');
    const 时间账 = 汇总书籍时间账({
      滚动账: ${JSON.stringify(滚动账)},
      可见账: ${JSON.stringify(可见账)},
      旧滚动每日毫秒: ${JSON.stringify(旧滚动每日毫秒)},
    });
    const 内容 = document.querySelector('#阅读统计内容');
    内容.textContent = '';
    内容.append(创建阅读统计内容({
      书籍: [['甲.txt', {}], ['乙.txt', {}]],
      文件名: '甲.txt', 进度: 0, 今天: '2026-09-23', 时间账,
    }));
    document.querySelector('#阅读统计弹窗').showModal();
    const 表 = document.querySelector('.统计时段表');
    const 到秒 = (串) => 串.split(':').map(Number).reduce((总, 段) => 总 * 60 + 段, 0);
    const 行们 = [...表.querySelectorAll('tbody tr')].map((行) => {
      const 轨道 = 行.querySelector('.统计时段轨道');
      const 轨 = 轨道.getBoundingClientRect();
      const 日期格 = 行.querySelector('.统计时段日期');
      return {
        日期: 日期格.textContent.trim(),
        日期悬停: 日期格.title,
        滚动: 行.querySelector('.统计时段滚动格').textContent.trim(),
        激活: 行.querySelector('.统计时段激活格').textContent.trim(),
        总计: 行.querySelector('.统计时段总计格').textContent.trim(),
        轨道宽: Math.round(轨.width),
        轨道左: Math.round(轨.left),
        日期格宽: Math.round(日期格.getBoundingClientRect().width),
        读数溢出: ['统计时段滚动格', '统计时段激活格', '统计时段总计格'].some((类) => {
          const 格 = 行.querySelector('.' + 类);
          return 格.scrollWidth > 格.clientWidth + 1;
        }),
        表溢出: Math.round(表.getBoundingClientRect().right -
          document.querySelector('.阅读统计内容').getBoundingClientRect().right),
        块: [...轨道.children].map((块) => {
          const [起, 止] = 块.title.split(' · ')[0].split(' → ');
          const b = 块.getBoundingClientRect();
          return {
            总计: 块.classList.contains('统计时段块-总计'),
            起: 到秒(起), 止: 到秒(止),
            左: Math.round(b.left), 宽: Math.round(b.width),
          };
        }),
        朗读: 轨道.getAttribute('aria-label'),
      };
    });
    return {
      列头: [...表.querySelectorAll('.统计时段表头名')].map((项) => 项.textContent.trim()),
      合计: [...表.querySelectorAll('.统计时段合计')].map((项) => 项.textContent.trim()),
      标题提示: 表.querySelector('caption').title,
      图例说明: document.querySelector('.统计时段图例说明').textContent,
      上表列头: [...document.querySelectorAll(
        '.阅读统计内容 table:not(.统计时段表) thead tr:first-child th')].map((项) => 项.textContent.trim()),
      行们,
    };`);

  const 行 = 结果.行们;
  assert.deepEqual(
    结果.列头,
    ['日期', '滚动', '激活', '总计'],
    `第一列改成日期：${JSON.stringify(结果.列头)}`,
  );
  assert.deepEqual(
    结果.上表列头.slice(0, 1),
    ['书籍'],
    '上表「书籍明细」仍按书拆行，只有轴合并',
  );
  assert.deepEqual(
    行.map((项) => 项.日期),
    期望行.map((项) => 项.标签),
    '一天一行、日期不重复，没有段的老日子不出现',
  );
  assert.deepEqual(
    结果.合计,
    [期望合计.滚动, 期望合计.激活, 期望合计.总计],
    `列头合计＝各行显示值相加：${JSON.stringify(结果.合计)}`,
  );

  let 下标 = 0;
  for (const 项 of 行) {
    下标 += 1;
    const 期 = 期望行[下标 - 1];
    const 段们 = 项.块.filter((块) => !块.总计);
    const 带们 = 项.块.filter((块) => 块.总计);
    assert.equal(项.滚动, 期.滚动列, `${期.标签} 滚动列`);
    assert.equal(项.激活, 期.激活文本, `${期.标签} 激活列`);
    assert.equal(项.总计, 期.总计文本, `${期.标签} 总计列`);
    assert.deepEqual(
      带们.map((块) => [块.起, 块.止]),
      期.总计段,
      `${期.标签} 灰带＝当天全部书籍并成的一条（重叠只算一次）`,
    );
    assert.deepEqual(
      段们.map((块) => [块.起, 块.止]),
      期.滚动段,
      `${期.标签} 深色块＝并起来的滚动段`,
    );
    for (const 块 of 带们) {
      const 应宽 = ((块.止 - 块.起) / (窗口.止秒 - 窗口.起秒)) * 项.轨道宽;
      assert.ok(
        Math.abs(块.宽 - 应宽) <= 2,
        `${期.标签} 灰带宽 ${块.宽}px，按轴该是 ${应宽.toFixed(1)}px`,
      );
    }
    const 灰总宽 = 带们.reduce((总, 块) => 总 + 块.宽, 0);
    const 黑总宽 = 段们.reduce((总, 块) => 总 + 块.宽, 0);
    assert.ok(
      Math.abs(灰总宽 - 黑总宽 - ((总秒(减段(期.总计段, 期.滚动段)) / (窗口.止秒 - 窗口.起秒)) * 项.轨道宽)) <= 3,
      `${期.标签} 露出来的灰＝激活列：灰 ${灰总宽} − 黑 ${黑总宽}`,
    );
    for (const 名 of 期.书名们)
      assert.ok(项.日期悬停.includes(名), `${期.标签} 悬停日期要能查回「${名}」：${项.日期悬停}`);
    assert.ok(!项.读数溢出, `${期.标签} 读数横向溢出`);
    assert.ok(项.表溢出 <= 1, `${期.标签} 表格超出弹窗 ${项.表溢出}px`);
  }
  // 09-22 两本书重叠 30 分钟：合并后总计 1 小时 30 分，而不是各本书相加的 2 小时
  assert.equal(行[1].总计, '1 小时 30 分', '重叠时刻只算一次');
  assert.equal(行[1].滚动, '', '当天没滚过就整格留白');
  assert.equal(行[1].激活, '1 小时 30 分', '全没滚时激活就是总计');
  // 09-20 只有滚动没有可见段：黑块底下不许踩白轨
  assert.deepEqual(
    行[3].块.filter((块) => 块.总计).map((块) => [块.起, 块.止]),
    行[3].块.filter((块) => !块.总计).map((块) => [块.起, 块.止]),
    '缺可见段时灰带跟着滚动段铺，黑块不踩白',
  );
  assert.deepEqual(
    行[2].日期悬停.split('\n').slice(1),
    ['未分书（旧数据） 1 小时 10 分'],
    '旧数据那本仍然叫「未分书（旧数据）」，只是不再占一行',
  );
  assert.ok(!结果.图例说明.includes('换书'), `图例不再宣称换书断段：${结果.图例说明}`);
  assert.ok(结果.标题提示.includes('一天一行'), `轴标题口径：${结果.标题提示}`);
  assert.ok(行[0].日期格宽 < 90, `日期列太宽：${行[0].日期格宽}px`);
  assert.ok(行[0].轨道宽 > 500, `轴没拿到腾出来的宽度：${行[0].轨道宽}px`);

  const 盒 = await 求值(`
    const b = document.querySelector('.统计时段').getBoundingClientRect();
    return { x: Math.round(b.x) - 6, y: Math.round(b.y) - 6,
      w: Math.round(b.width) + 12, h: Math.round(b.height) + 12 };`);
  const { data } = await 发送('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 盒.x, y: 盒.y, width: 盒.w, height: 盒.h, scale: 2 },
  });
  writeFileSync(resolve(import.meta.dirname, '时段合并一行.png'), Buffer.from(data, 'base64'));
  console.log('已写 tmp/时段合并一行.png', JSON.stringify(结果.合计));
} catch (错误) {
  退出码 = 1;
  console.error(错误);
} finally {
  ws?.close();
  chrome.kill();
  服务.kill();
  const 等退出 = (子) =>
    子.exitCode !== null || 子.signalCode !== null
      ? Promise.resolve()
      : new Promise((r) => 子.on('exit', r));
  await Promise.race([
    Promise.all([等退出(chrome), 等退出(服务)]),
    pause(3000).then(() => {
      chrome.kill('SIGKILL');
      服务.kill('SIGKILL');
      return Promise.all([等退出(chrome), 等退出(服务)]);
    }),
  ]);
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  if (existsSync(profile)) {
    console.error('profile 清理失败，目录仍存在:', profile);
    退出码 = 1;
  } else {
    console.log('profile 已清理:', profile);
  }
}
process.exitCode = 退出码;
