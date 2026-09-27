// 校验「阅读内容」弹窗的表格形态与列头排序：
// 1) 一行一本书、五列各管一个量；行高等宽、不横向溢出、表头吸顶
// 2) 表头文字的右缘压在该列数字的右缘上（左对齐的书名列压左缘）
// 3) 点一次排该列自然序，再点反向；缺值（未统计/无记录）永远钉在尾部
// 4) 点行、聚焦行按 Enter 都能载入那本书
// 5) 点过的「列 + 方向」会落盘：刷新后仍是那一列那一向，再点才反向
// 6) 时间拆成「激活 / 滚动」两列：两列各自对账，且每一行激活 ≥ 滚动
// 7) 标题下不再报「N 个文本」（和书名合计那一格重复），也不再单列「状态」：
//    在读哪本靠行底色 + 左侧色条，读没读过靠两格时间有没有数
// 跑法：node tmp/verify-内容选择表格.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const 项目根 = resolve(import.meta.dirname, '..');
const 临时目录 = mkdtempSync(join(tmpdir(), 'reader-table-'));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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

const CDP端口 = await 取空闲端口(9511);
const 站点端口 = await 取空闲端口(15991);
const 地址 = `http://127.0.0.1:${站点端口}/`;

const 服务 = spawn(process.execPath, ['server.mjs', String(站点端口)], {
  cwd: 项目根,
  stdio: 'pipe',
});
服务.stdout.resume();
服务.stderr.resume();
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(地址, { signal: AbortSignal.timeout(1000) })).ok) break;
  } catch {}
  await pause(100);
}

const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${CDP端口}`,
    `--user-data-dir=${临时目录}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
    地址,
  ],
  { stdio: 'ignore' },
);

async function 主() {
  let 目标 = null;
  for (let i = 0; i < 150 && !目标; i++) {
    try {
      const 列表 = await (
        await fetch(`http://127.0.0.1:${CDP端口}/json`)
      ).json();
      目标 = 列表.find((t) => t.type === 'page' && t.url.startsWith(地址));
    } catch {}
    await pause(200);
  }
  if (!目标) throw new Error('未找到 headless Chrome 页面');

  const ws = new WebSocket(目标.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let 消息号 = 0;
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
    return new Promise((解决, 拒绝) => {
      const 下标 = ++消息号;
      待回复.set(下标, { resolve: 解决, reject: 拒绝 });
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

  await 等待就绪();

  async function 等待就绪() {
    for (let i = 0; i < 600; i++) {
      let 就绪 = false;
      try {
        就绪 = await 求值(`
          return !!document.querySelector('#内容选择按钮') &&
            (document.querySelector('#载入状态')?.hidden ?? true);
        `);
      } catch {
        // 导航中的执行上下文已销毁，下一轮再问
      }
      if (就绪) return;
      await pause(200);
    }
    throw new Error('页面未就绪');
  }

  async function 还在统计字数() {
    return 求值(`
      const 行列表 = [...document.querySelectorAll('#内容选择列表 tbody tr')];
      return {
        行数: 行列表.length,
        卡住: 行列表
          .filter((行) => 行.children[1].textContent.trim() === '…')
          .map((行) => 行.dataset.fileName),
      };
    `);
  }

  async function 等待字数统计() {
    let 状态读数 = { 行数: 0, 卡住: [] };
    for (let i = 0; i < 300; i++) {
      状态读数 = await 还在统计字数();
      if (状态读数.行数 > 10 && !状态读数.卡住.length) break;
      await pause(500);
    }
    assert.deepEqual(状态读数.卡住, [], '字数应已全部回填');
    assert.ok(状态读数.行数 > 10, `表格没有渲染出行：${状态读数.行数}`);
  }

  await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
  await pause(1200);

  // —— 结构与几何 ——
  const 几何 = await 求值(`
    const 列表 = document.querySelector('#内容选择列表');
    const 表格 = 列表.querySelector('table.内容表格');
    const 行列表 = [...表格.querySelectorAll('tbody tr')];
    const 内容右缘 = (格) => {
      const 算 = getComputedStyle(格);
      return 格.getBoundingClientRect().right
        - parseFloat(算.paddingRight) - parseFloat(算.borderRightWidth);
    };
    const 内容左缘 = (格) => {
      const 算 = getComputedStyle(格);
      return 格.getBoundingClientRect().left
        + parseFloat(算.paddingLeft) + parseFloat(算.borderLeftWidth);
    };
    const 表头 = [...表格.querySelectorAll('thead th')];
    const 文字框 = (节点) => {
      const 域 = document.createRange();
      域.selectNodeContents(节点);
      return 域.getBoundingClientRect();
    };
    const 内容宽 = (格) => {
      const 算 = getComputedStyle(格);
      return 格.getBoundingClientRect().width
        - parseFloat(算.paddingLeft) - parseFloat(算.paddingRight)
        - parseFloat(算.borderLeftWidth) - parseFloat(算.borderRightWidth);
    };
    const 合计格 = (列) =>
      表头[列].querySelector('.内容表头合计');
    return {
      有摘要节点: !!document.querySelector('#内容选择摘要'),
      标题栏高: Math.round(
        document
          .querySelector('#内容选择弹窗 .内容选择标题栏')
          .getBoundingClientRect().height,
      ),
      弹窗宽: Math.round(document.querySelector('#内容选择弹窗').getBoundingClientRect().width),
      表头文字: 表头.map((格) => 格.querySelector('.内容排序按钮').textContent),
      表头合计: 表头.map((格) => [
        格.dataset.排序,
        格.querySelector('.内容表头合计')?.textContent ?? '',
        格.title,
      ]),
      表头高: Math.round(表头[0].getBoundingClientRect().height),
      各表头高: [...new Set(表头.map((格) => Math.round(格.getBoundingClientRect().height)))],
      时间列: 行列表.map((行) => [
        行.children[2].textContent.trim(),
        行.children[3].textContent.trim(),
      ]),
      合计对齐: {
        本数左缘: Math.round(文字框(合计格(0)).left),
        书名内容左缘: Math.round(内容左缘(表头[0])),
        激活右缘: Math.round(文字框(合计格(2)).right),
        激活列右缘: Math.round(内容右缘(表头[2])),
        激活溢出: Math.round(文字框(合计格(2)).width - 内容宽(表头[2])),
        滚动右缘: Math.round(文字框(合计格(3)).right),
        滚动列右缘: Math.round(内容右缘(表头[3])),
        滚动溢出: Math.round(文字框(合计格(3)).width - 内容宽(表头[3])),
        本数溢出: Math.round(文字框(合计格(0)).width - 内容宽(表头[0])),
        合计底缘: Math.round(合计格(2).getBoundingClientRect().bottom),
        表头底缘: Math.round(表头[2].getBoundingClientRect().bottom),
      },
      排序属性: 表头.map((格) => 格.getAttribute('aria-sort')),
      条目数: 行列表.length,
      行高: [...new Set(行列表.slice(0, 6).map((行) => Math.round(行.getBoundingClientRect().height)))],
      每行格数: [...new Set(行列表.map((行) => 行.children.length))],
      横向溢出: 列表.scrollWidth - 列表.clientWidth,
      列对齐: 表头.map((格, i) => ({
        列: i,
        表头: i === 0 ? Math.round(内容左缘(格)) : Math.round(内容右缘(格)),
        数据: i === 0
          ? Math.round(内容左缘(行列表[0].children[i]))
          : Math.round(内容右缘(行列表[0].children[i])),
      })),
      当前行数: 行列表.filter((行) => 行.classList.contains('当前')).length,
      可聚焦: 行列表.every((行) => 行.tabIndex === 0),
    };
  `);
  console.log('几何:', JSON.stringify(几何, null, 2));
  assert.equal(几何.有摘要节点, false, '标题下那行「N 个文本」要撤掉，本数看书名合计');
  assert.ok(几何.标题栏高 >= 44, `撤掉摘要后标题栏塌了：${几何.标题栏高}px`);
  assert.deepEqual(几何.表头文字, ['书名', '万字', '激活', '滚动', '进度']);
  assert.deepEqual(几何.排序属性, [
    'ascending',
    'none',
    'none',
    'none',
    'none',
  ]);
  assert.deepEqual(几何.行高, [34], '行高要全部相等');
  assert.deepEqual(几何.每行格数, [5], '每行要恰好五个格子');
  assert.ok(几何.条目数 >= 10, `条目过少：${几何.条目数}`);
  assert.ok(几何.横向溢出 <= 0, `表格横向溢出 ${几何.横向溢出}px`);
  assert.equal(几何.当前行数, 1, '要且只要一行标为当前');
  assert.ok(几何.可聚焦, '每行要能用键盘聚焦');
  for (const 列 of 几何.列对齐) {
    assert.ok(
      Math.abs(列.表头 - 列.数据) <= 1,
      `第 ${列.列 + 1} 列表头与数字没对齐：${列.表头} vs ${列.数据}`,
    );
  }

  // —— 表头合计：只有书名/激活/滚动三列有，格式「共 X」，口径进悬停 ——
  assert.deepEqual(
    几何.表头合计.map(([键, 文本]) => [键, /^共 .+$/.test(文本)]),
    [
      ['书名', true],
      ['字数', false],
      ['激活', true],
      ['滚动', true],
      ['进度', false],
    ],
    '合计只跟在书名与两列时间的标题下面',
  );
  const 本数 = Number(几何.表头合计[0][1].match(/\d+/)[0]);
  assert.equal(
    本数,
    几何.条目数,
    '撤掉摘要后书名合计是本数的唯一出口，要等于行数',
  );
  assert.match(几何.表头合计[0][2], /＝/, '书名合计的口径要写进悬停提示');
  assert.match(几何.表头合计[2][2], /页面可见/, '激活合计要说明是页面可见时长');
  assert.match(几何.表头合计[3][2], /自动滚动/, '滚动合计要说明是自动滚动时长');
  for (const 列 of [2, 3]) {
    assert.match(
      几何.表头合计[列][2],
      /各行相加/,
      '时间合计要说明是各行相加',
    );
  }
  assert.deepEqual(几何.各表头高, [几何.表头高], '五列表头要等高');
  assert.ok(
    几何.表头高 >= 45 && 几何.表头高 <= 58,
    `两行表头高度异常：${几何.表头高}px`,
  );
  assert.ok(
    Math.abs(几何.合计对齐.本数左缘 - 几何.合计对齐.书名内容左缘) <= 1,
    '本数合计要压在书名列左缘上',
  );
  assert.ok(
    Math.abs(几何.合计对齐.激活右缘 - 几何.合计对齐.激活列右缘) <= 1,
    '激活合计的右缘要压在该列数字右缘上',
  );
  assert.ok(
    Math.abs(几何.合计对齐.滚动右缘 - 几何.合计对齐.滚动列右缘) <= 1,
    '滚动合计的右缘要压在该列数字右缘上',
  );
  assert.ok(
    几何.合计对齐.激活溢出 <= 0,
    `激活合计撑破了列宽 ${几何.合计对齐.激活溢出}px`,
  );
  assert.ok(
    几何.合计对齐.滚动溢出 <= 0,
    `滚动合计撑破了列宽 ${几何.合计对齐.滚动溢出}px`,
  );
  assert.ok(
    几何.合计对齐.本数溢出 <= 0,
    `本数合计撑破了书名列 ${几何.合计对齐.本数溢出}px`,
  );
  assert.ok(
    Math.abs(几何.合计对齐.合计底缘 - 几何.合计对齐.表头底缘) <= 1,
    '合计要贴住表头下缘',
  );

  // 表头吸顶：滚到底部时表头仍贴在容器上缘
  const 吸顶 = await 求值(`
    const 列表 = document.querySelector('#内容选择列表');
    列表.scrollTop = 400;
    await new Promise((r) => requestAnimationFrame(r));
    const 表头 = document.querySelector('#内容选择列表 thead th');
    return {
      差: Math.round(表头.getBoundingClientRect().top - 列表.getBoundingClientRect().top),
      可见首行: document.querySelector('#内容选择列表 tbody tr').dataset.fileName,
    };
  `);
  assert.ok(Math.abs(吸顶.差) <= 1, `表头没吸顶，偏了 ${吸顶.差}px`);
  await 求值(
    `document.querySelector('#内容选择列表').scrollTop = 0; return 1;`,
  );
  await pause(200);

  // —— 排序 ——
  async function 读列(列序号) {
    return 求值(`
      return [...document.querySelectorAll('#内容选择列表 tbody tr')]
        .map((行) => [行.children[${列序号}].textContent.trim(), 行.dataset.fileName]);
    `);
  }
  async function 点表头(键) {
    await 求值(
      `document.querySelector('.内容排序列[data-排序=${JSON.stringify(键)}]')
        .querySelector('.内容排序按钮').click(); return 1;`,
    );
    await pause(250);
    return 求值(`
      return [...document.querySelectorAll('#内容选择列表 thead th')].map((格) =>
        [格.dataset.排序, 格.getAttribute('aria-sort')]);
    `);
  }
  // 合计那一行也在表头格子里：点它要同样排序，不能是死区
  async function 点表头合计(键) {
    await 求值(`
      document.querySelector('.内容排序列[data-排序=${JSON.stringify(键)}] .内容表头合计')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return 1;
    `);
    await pause(250);
    return 求值(
      `return document.querySelector('.内容排序列[data-排序=${JSON.stringify(键)}]')
        .getAttribute('aria-sort');`,
    );
  }
  function 断言单调(值列表, 说明, 允许降) {
    for (let i = 1; i < 值列表.length; i++) {
      const 前 = 值列表[i - 1];
      const 后 = 值列表[i];
      const 坏 = 允许降 ? 后 > 前 : 后 < 前;
      assert.ok(
        !坏,
        `${说明}：第 ${i} 行 ${后} 比上一行 ${前} 更${允许降 ? '大' : '小'}`,
      );
    }
  }
  function 拆值(行列表) {
    const 有值 = [];
    const 缺值 = [];
    for (const [文字] of 行列表) {
      const 数 = Number(文字.replace(/[^\d.]/g, ''));
      (文字 && Number.isFinite(数) ? 有值 : 缺值).push(数);
    }
    return { 有值, 缺值个数: 缺值.length };
  }

  // 冷启动的临时 profile 里没有任何阅读记录，两列时间「进度」会全空、排不出顺序。
  // 照 App 自己写出的形状造三本「读过一点」的书（不含当前这本，它由 App 自己记账）：
  // 滚动落在持久化的 文本状态 上，激活落在 前台停留 的按书内存账上（那才是页面真开着的时长）。
  const 造好的 = await 求值(`
    const { 持久化键 } = await import('./js/常量.js');
    const { 状态, 本地日期串 } = await import('./js/状态.js');
    const { 书籍每日前台毫秒 } = await import('./js/前台停留.js');
    const 行列表 = [...document.querySelectorAll('#内容选择列表 tbody tr')]
      .map((行) => 行.dataset.fileName);
    const 数据 = JSON.parse(localStorage.getItem(持久化键)
      ?? '{"当前文件名":"","文本状态":{}}');
    const 目标 = 行列表.filter((名) => 名 !== 状态.文件名).slice(0, 3);
    const 今天 = 本地日期串(new Date());
    目标.forEach((名, i) => {
      数据.文本状态[名] = {
        文件名: 名,
        文本长度: 100_000,
        阅读偏移: (i + 1) * 21_000,
        行内比例: 0,
        总滚动毫秒: (i + 1) * 3_600_000,
      };
      // 激活故意排成 7h/6h/5h：和滚动的 1h/2h/3h 正好反序，两列各排各的才验得出来
      书籍每日前台毫秒.set(名, new Map([[今天, (7 - i) * 3_600_000]]));
    });
    localStorage.setItem(持久化键, JSON.stringify(数据));
    return 目标;
  `);
  assert.equal(造好的.length, 3, '应造出三本有阅读记录的书');
  await 求值(`
    document.querySelector('#内容选择弹窗').close();
    document.querySelector('#内容选择按钮').click();
    return 1;
  `);
  await pause(1200);

  // 等字数统计回填（万字列不再是「…」），排序要按真实字数比
  await 等待字数统计();

  // —— 合计对账：表头那个数要等于这一列各行显示值相加；两列时间都要成立 ——
  for (const [列序号, 列名] of [
    [2, '激活'],
    [3, '滚动'],
  ]) {
    const 合计对账 = await 求值(`
      const 表头 = [...document.querySelectorAll('#内容选择列表 thead th')];
      const 合计 = 表头[${列序号}].querySelector('.内容表头合计').textContent;
      const 各行 = [...document.querySelectorAll('#内容选择列表 tbody tr')]
        .map((行) => 行.children[${列序号}].textContent.trim())
        .filter(Boolean)
        .map((文字) => Number(文字.replace('h', '')));
      return {
        合计,
        各行,
        相加: Number(各行.reduce((总, 值) => 总 + 值, 0).toFixed(1)),
      };
    `);
    assert.ok(
      合计对账.各行.length >= 3,
      `${列名}列没回填出阅读记录：${合计对账.各行.length}`,
    );
    assert.equal(
      Number(合计对账.合计.replace(/[^\d.]/g, '')),
      合计对账.相加,
      `${列名}合计要等于各行相加：${合计对账.合计} vs ${合计对账.各行.join('+')}=${合计对账.相加}`,
    );
  }

  // —— 两列同一本账：滚动必然发生在页面开着的时候，激活不许小于滚动 ——
  const 时间列对账 = await 求值(`
    return [...document.querySelectorAll('#内容选择列表 tbody tr')]
      .map((行) => [
        行.children[2].textContent.trim(),
        行.children[3].textContent.trim(),
      ]);
  `);
  for (const [激活文字, 滚动文字] of 时间列对账) {
    const 激活 = Number(激活文字.replace('h', '')) || 0;
    const 滚动 = Number(滚动文字.replace('h', '')) || 0;
    assert.ok(
      激活 + 0.05 >= 滚动,
      `激活 ${激活文字} 小于滚动 ${滚动文字}，两列不是同一本账`,
    );
  }

  // 造出记录后回量宽屏：两位数的合计仍撑不破列宽，格子里也不许出现「0.0h」这种杂讯
  const 宽屏合计 = await 求值(`
    const 表头 = [...document.querySelectorAll('#内容选择列表 thead th')];
    const 文字框 = (节点) => {
      const 域 = document.createRange();
      域.selectNodeContents(节点);
      return 域.getBoundingClientRect();
    };
    const 内容宽 = (格) => {
      const 算 = getComputedStyle(格);
      return 格.getBoundingClientRect().width
        - parseFloat(算.paddingLeft) - parseFloat(算.paddingRight);
    };
    const 溢出 = (列) =>
      Math.round(
        文字框(表头[列].querySelector('.内容表头合计')).width - 内容宽(表头[列]),
      );
    return {
      合计文本: [2, 3].map((列) =>
        表头[列].querySelector('.内容表头合计').textContent),
      激活溢出: 溢出(2),
      滚动溢出: 溢出(3),
      零读数: [...document.querySelectorAll('#内容选择列表 tbody tr')]
        .flatMap((行) => [行.children[2], 行.children[3]])
        .filter((格) => 格.textContent.trim() === '0.0h').length,
    };
  `);
  console.log('宽屏合计:', 宽屏合计);
  assert.ok(
    宽屏合计.激活溢出 <= 0,
    `两位数合计撑破激活列 ${宽屏合计.激活溢出}px（${宽屏合计.合计文本[0]}）`,
  );
  assert.ok(
    宽屏合计.滚动溢出 <= 0,
    `两位数合计撑破滚动列 ${宽屏合计.滚动溢出}px（${宽屏合计.合计文本[1]}）`,
  );
  assert.equal(宽屏合计.零读数, 0, '不到半小时的读数要留白，不写 0.0h');

  const 万字排序 = await 点表头('字数');
  assert.deepEqual(
    万字排序,
    [
      ['书名', 'none'],
      ['字数', 'descending'],
      ['激活', 'none'],
      ['滚动', 'none'],
      ['进度', 'none'],
    ],
    '点万字要按万字降序',
  );
  {
    const 行列表 = await 读列(1);
    const { 有值 } = 拆值(行列表);
    assert.ok(有值.length >= 5, `可比的字数太少：${有值.length}`);
    断言单调(有值, '万字降序', true);
    assert.ok(有值[0] > 有值[有值.length - 1], '降序首尾要真的拉开');
  }
  await 点表头('字数');
  {
    const { 有值 } = 拆值(await 读列(1));
    断言单调(有值, '万字升序', false);
  }

  const 滚动排序 = await 点表头('滚动');
  assert.equal(
    滚动排序[3][1],
    'descending',
    '滚动首点为降序（读得最久的在前）',
  );
  const 滚动序书名 = [];
  {
    const 行列表 = await 读列(3);
    const { 有值 } = 拆值(行列表);
    assert.deepEqual(有值, [3, 2, 1], '三本造过记录的书要按 3h/2h/1h 排在最前');
    滚动序书名.push(...行列表.filter(([文字]) => 文字).map(([, 名]) => 名));
    const 首个空白 = 行列表.findIndex(([文字]) => !文字);
    const 最后有值 = 行列表.findLastIndex(([文字]) => 文字);
    assert.ok(
      首个空白 > 最后有值,
      '没读过的书（空白）要钉在尾部，不随方向跳到最前',
    );
  }

  // 激活是另一本账：造数时故意排成与滚动反序，排出来的行序也要真的掉个头
  const 激活排序 = await 点表头('激活');
  assert.equal(
    激活排序[2][1],
    'descending',
    '激活首点为降序（页面开得最久的在前）',
  );
  {
    const 行列表 = await 读列(2);
    const { 有值 } = 拆值(行列表);
    assert.deepEqual(有值, [7, 6, 5], '激活列要按 7h/6h/5h 排在最前');
    const 激活序书名 = 行列表
      .filter(([文字]) => 文字)
      .map(([, 名]) => 名);
    assert.deepEqual(
      激活序书名,
      [...滚动序书名].reverse(),
      '激活与滚动反序时行序要掉头，不能两列排出一样的结果',
    );
  }

  const 进度排序 = await 点表头('进度');
  assert.equal(进度排序[4][1], 'descending');
  {
    const 列 = (await 读列(4)).map(([文字]) => Number(文字.replace('%', '')));
    const 有值 = 列.filter((数) => Number.isFinite(数) && 数 > 0);
    assert.ok(有值.length >= 3, `有进度的书太少：${有值.length}`);
    断言单调(有值, '进度降序', true);
    // 没读过的行（两格时间都空白）不许混进有进度的一头
    const 行列表 = await 读列(4);
    const 首个空白 = 行列表.findIndex(([文字]) => !文字);
    const 最后有值 = 行列表.findLastIndex(([文字]) => 文字);
    assert.ok(首个空白 > 最后有值 || 首个空白 === -1, '空白进度要钉在尾部');
  }

  // 从别的列切回书名 = 回到该列自然序（升），再点才是降序
  const 书名排序 = await 点表头('书名');
  assert.equal(书名排序[0][1], 'ascending', '切到书名要按自然序（拼音升序）');
  const 升序书名 = (await 读列(0)).map(([, 名]) => 名);
  assert.equal(
    await 点表头('书名').then((列) => 列[0][1]),
    'descending',
    '再点书名要反向',
  );
  const 降序书名 = (await 读列(0)).map(([, 名]) => 名);
  assert.deepEqual(降序书名, [...升序书名].reverse(), '书名降序应是升序的镜像');

  // 表头第二行的合计不是死区：点它同样反向
  assert.equal(
    await 点表头合计('书名'),
    'ascending',
    '点书名表头的合计那一行要反向为升序',
  );
  assert.deepEqual(
    (await 读列(0)).map(([, 名]) => 名),
    升序书名,
    '点合计行反向后要回到那一份升序',
  );
  await 点表头('书名'); // 停在降序：下面的持久化断言要的是「书名 + 降」

  // —— 排序方式要持久化：点定的「列 + 方向」刷新后仍是那一个 ——
  await pause(600); // 等 安排保存持久化状态 的 120ms 防抖落盘
  assert.deepEqual(
    await 求值(`
      const { 持久化键 } = await import('./js/常量.js');
      return JSON.parse(localStorage.getItem(持久化键)).内容排序;
    `),
    { 键: '书名', 方向: '降' },
    '点过的列与方向要写进持久化数据',
  );
  await 发送('Page.enable');
  await 发送('Page.reload');
  await 等待就绪();
  await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
  // 只等表格出来：书名序不依赖万字回填，而 58 本书重新统计字数要一分多钟
  for (let i = 0; i < 200; i++) {
    const 行数 = await 求值(
      `return document.querySelectorAll('#内容选择列表 tbody tr').length;`,
    );
    if (行数 > 10) break;
    await pause(200);
  }
  const 刷新后 = await 求值(`
    return {
      排序属性: [...document.querySelectorAll('#内容选择列表 thead th')].map((格) =>
        [格.dataset.排序, 格.getAttribute('aria-sort')]),
      书名序: [...document.querySelectorAll('#内容选择列表 tbody tr')]
        .map((行) => 行.dataset.fileName),
    };
  `);
  assert.deepEqual(
    刷新后.排序属性,
    [
      ['书名', 'descending'],
      ['字数', 'none'],
      ['激活', 'none'],
      ['滚动', 'none'],
      ['进度', 'none'],
    ],
    '刷新后表头仍标在书名列的降序上',
  );
  assert.deepEqual(
    刷新后.书名序,
    降序书名,
    '刷新后的行顺序要和刷新前那一次降序完全一致',
  );
  // 恢复的是「列 + 方向」两个量：再点一次书名要反向，不能退回默认序
  assert.equal(
    (await 点表头('书名'))[0][1],
    'ascending',
    '刷新后再点书名要回到升序',
  );
  assert.deepEqual(
    (await 读列(0)).map(([, 名]) => 名),
    升序书名,
    '再点后的升序要和刷新前一致',
  );
  await 点表头('书名'); // 停在降序：后面「书名序」截图那一步会再点一次回到升序

  // —— 载入 ——
  const 目标书名 = 升序书名[3];
  await 求值(
    `document.querySelector('#内容选择列表 tr[data-file-name=${JSON.stringify(目标书名)}]')
      .click(); return 1;`,
  );
  let 已载入 = false;
  for (let i = 0; i < 200; i++) {
    await pause(200);
    已载入 =
      (await 求值(
        `const { 状态 } = await import('./js/状态.js'); return 状态.文件名;`,
      )) === 目标书名;
    if (已载入) break;
  }
  assert.ok(已载入, `点行应载入 ${目标书名}`);
  assert.equal(
    await 求值(`return document.querySelector('#内容选择弹窗').open;`),
    false,
    '载入后弹窗要关闭',
  );

  // 键盘：聚焦某行按 Enter
  await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
  await pause(1200);
  const 键盘书名 = await 求值(
    `return [...document.querySelectorAll('#内容选择列表 tbody tr')]
        .map((行) => 行.dataset.fileName)[6];`,
  );
  await 求值(
    `document.querySelector('#内容选择列表 tr[data-file-name=${JSON.stringify(键盘书名)}]')
      .focus();
     document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
       key: 'Enter', bubbles: true, cancelable: true }));
     return 1;`,
  );
  let 键盘载入 = false;
  for (let i = 0; i < 200; i++) {
    await pause(200);
    键盘载入 =
      (await 求值(
        `const { 状态 } = await import('./js/状态.js'); return 状态.文件名;`,
      )) === 键盘书名;
    if (键盘载入) break;
  }
  assert.ok(键盘载入, `聚焦行按 Enter 应载入 ${键盘书名}`);

  // 截图留证：默认书名序 + 一次万字降序
  await 求值(`document.querySelector('#内容选择按钮').click(); return 1;`);
  await 等待字数统计();
  await pause(1200);
  async function 截图(文件名) {
    const 框 = await 求值(`
      const 弹窗 = document.querySelector('#内容选择弹窗').getBoundingClientRect();
      return [弹窗.x, 弹窗.y, 弹窗.width, 弹窗.height];
    `);
    const { data } = await 发送('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 框[0], y: 框[1], width: 框[2], height: 框[3], scale: 2 },
    });
    writeFileSync(resolve(项目根, 'tmp', 文件名), Buffer.from(data, 'base64'));
    console.log('已写 tmp/' + 文件名);
  }
  await 点表头('书名');
  await 截图('阅读内容-表格-书名序.png');
  // 当前那本书：左侧色条 + 状态用选中色，滚进视口单独留一张证
  const 当前行 = await 求值(`
    const 列表 = document.querySelector('#内容选择列表');
    const 行 = 列表.querySelector('.内容行.当前');
    const 框 = 行.getBoundingClientRect();
    const 容器 = 列表.getBoundingClientRect();
    列表.scrollTop += 框.top - 容器.top - 60;
    await new Promise((r) => requestAnimationFrame(r));
    const 算 = getComputedStyle(行.children[0]);
    return {
      书名: 行.dataset.fileName,
      色条: 算.boxShadow,
      末列文字: 行.lastElementChild.textContent,
      末列色: getComputedStyle(行.lastElementChild).color,
      底色: getComputedStyle(行).backgroundColor,
      aria: 行.getAttribute('aria-current'),
    };
  `);
  console.log('当前行:', 当前行);
  // 「状态」那一列撤了：在读哪本只剩行底色 + 左侧色条 + aria-current 三处出口
  assert.equal(当前行.aria, 'true', '当前这本要靠 aria-current 说给读屏');
  assert.match(当前行.色条, /inset/, '当前行要有左侧色条');
  assert.notEqual(当前行.底色, 'rgba(0, 0, 0, 0)', '当前行要有行底色');
  assert.notEqual(
    当前行.末列色,
    'rgb(0, 0, 0)',
    '撤掉状态列后末列（进度）只是普通读数，不该再被选中色染黑',
  );
  await 截图('阅读内容-表格-当前行.png');
  await 求值(
    `document.querySelector('#内容选择列表').scrollTop = 0; return 1;`,
  );
  await 点表头('字数');
  await 截图('阅读内容-表格-万字降序.png');

  // 窄屏：列压不破容器，书名仍然是最后被挤的那一个
  await 发送('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await pause(500);
  const 窄屏 = await 求值(`
    const 列表 = document.querySelector('#内容选择列表');
    const 首行 = document.querySelector('#内容选择列表 tbody tr');
    const 表头 = [...document.querySelectorAll('#内容选择列表 thead th')];
    const 文字框 = (节点) => {
      const 域 = document.createRange();
      域.selectNodeContents(节点);
      return 域.getBoundingClientRect();
    };
    const 内容宽 = (格) => {
      const 算 = getComputedStyle(格);
      return 格.getBoundingClientRect().width
        - parseFloat(算.paddingLeft) - parseFloat(算.paddingRight);
    };
    const 合计溢出 = (列) =>
      Math.round(
        文字框(表头[列].querySelector('.内容表头合计')).width - 内容宽(表头[列]),
      );
    return {
      弹窗宽: Math.round(document.querySelector('#内容选择弹窗').getBoundingClientRect().width),
      横向溢出: 列表.scrollWidth - 列表.clientWidth,
      书名列宽: Math.round(首行.children[0].getBoundingClientRect().width),
      进度列宽: Math.round(首行.children[4].getBoundingClientRect().width),
      行高: Math.round(首行.getBoundingClientRect().height),
      合计文本: [2, 3].map((列) =>
        表头[列].querySelector('.内容表头合计').textContent),
      激活合计溢出: 合计溢出(2),
      滚动合计溢出: 合计溢出(3),
    };
  `);
  console.log('窄屏:', 窄屏);
  assert.ok(窄屏.横向溢出 <= 0, `窄屏表格横向溢出 ${窄屏.横向溢出}px`);
  assert.ok(窄屏.书名列宽 >= 120, `窄屏书名列只剩 ${窄屏.书名列宽}px`);
  assert.equal(窄屏.行高, 34, '窄屏行高要不变');
  assert.ok(
    窄屏.激活合计溢出 <= 0,
    `窄屏激活合计撑破列宽 ${窄屏.激活合计溢出}px（${窄屏.合计文本[0]}）`,
  );
  assert.ok(
    窄屏.滚动合计溢出 <= 0,
    `窄屏滚动合计撑破列宽 ${窄屏.滚动合计溢出}px（${窄屏.合计文本[1]}）`,
  );
  await 截图('阅读内容-表格-窄屏.png');
}

let 错误 = null;
try {
  await 主();
} catch (e) {
  错误 = e;
} finally {
  chrome.kill();
  服务.kill();
  await pause(1000);
  rmSync(临时目录, { recursive: true, force: true });
  if (existsSync(临时目录)) {
    console.error('临时浏览器 profile 清理失败，仍存在:', 临时目录);
    process.exitCode = 1;
  } else {
    console.log('临时 profile 已清理:', 临时目录);
  }
}
if (错误) {
  console.error(错误);
  process.exit(1);
}
