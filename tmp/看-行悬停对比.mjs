// 一次性看图脚本：正文行悬停高亮「改前 / 改后」对比（浅色纸面 + 深色纸面各一组），
// 并对悬停行 / 邻行做像素取样，给出量化差。产物在 tmp/。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';

const 项目根 = new URL('..', import.meta.url).pathname;
const pause = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

// —— 极简 PNG 解码（8 位 RGB/RGBA，非隔行）：只为像素取样，不追求通用 ——
function 解码PNG(缓冲) {
  let 偏移 = 8;
  let 宽 = 0;
  let 高 = 0;
  let 位深 = 0;
  let 色型 = 0;
  const 数据块 = [];
  while (偏移 < 缓冲.length) {
    const 长度 = 缓冲.readUInt32BE(偏移);
    const 类型 = 缓冲.toString('ascii', 偏移 + 4, 偏移 + 8);
    const 数据 = 缓冲.subarray(偏移 + 8, 偏移 + 8 + 长度);
    if (类型 === 'IHDR') {
      宽 = 数据.readUInt32BE(0);
      高 = 数据.readUInt32BE(4);
      位深 = 数据[8];
      色型 = 数据[9];
    } else if (类型 === 'IDAT') {
      数据块.push(数据);
    }
    偏移 += 12 + 长度;
  }
  if (位深 !== 8) throw new Error(`位深 ${位深} 不支持`);
  const 通道数 = { 0: 1, 2: 3, 4: 2, 6: 4 }[色型];
  if (!通道数) throw new Error(`色型 ${色型} 不支持`);
  const 原始 = inflateSync(Buffer.concat(数据块));
  const 每行字节 = 宽 * 通道数;
  const 图 = Buffer.alloc(宽 * 高 * 通道数);
  let 上一行 = Buffer.alloc(每行字节);
  for (let y = 0; y < 高; y++) {
    const 行首 = y * (每行字节 + 1);
    const 滤波 = 原始[行首];
    const 行 = Buffer.from(原始.subarray(行首 + 1, 行首 + 1 + 每行字节));
    for (let x = 0; x < 每行字节; x++) {
      const 左 = x >= 通道数 ? 行[x - 通道数] : 0;
      const 上 = 上一行[x];
      const 左上 = x >= 通道数 ? 上一行[x - 通道数] : 0;
      let 值 = 行[x];
      if (滤波 === 1) 值 += 左;
      else if (滤波 === 2) 值 += 上;
      else if (滤波 === 3) 值 += (左 + 上) >> 1;
      else if (滤波 === 4) {
        const p = 左 + 上 - 左上;
        const pa = Math.abs(p - 左);
        const pb = Math.abs(p - 上);
        const pc = Math.abs(p - 左上);
        值 += pa <= pb && pa <= pc ? 左 : pb <= pc ? 上 : 左上;
      }
      行[x] = 值 & 0xff;
    }
    行.copy(图, y * 每行字节);
    上一行 = 行;
  }
  return { 宽, 高, 通道数, 图 };
}

function 区域均色(png, x0, y0, x1, y1) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(png.高, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(png.宽, x1); x++) {
      const i = (y * png.宽 + x) * png.通道数;
      r += png.图[i];
      g += png.图[i + 1];
      b += png.图[i + 2];
      n++;
    }
  }
  const 十六 = (v) =>
    Math.round(v / n)
      .toString(16)
      .padStart(2, '0');
  return `#${十六(r)}${十六(g)}${十六(b)}`;
}

const 相对亮度 = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i + 1, i + 3), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

async function 取空闲端口() {
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
const profile = mkdtempSync(join(tmpdir(), 'reader-rowhover-'));
const 服务 = spawn('node', ['server.mjs', String(站点端口)], {
  cwd: 项目根,
  stdio: 'ignore',
});
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
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
process.on('exit', () => {
  chrome.kill();
  服务.kill();
});

const fixture = [
  '第1章 黄河归故斗争',
  '花园口决堤与黄河改道，南京会谈争取救济物资，工地上人来车往，昼夜不停。'.repeat(
    3,
  ),
  '“今年一定要把口子堵上，”他对身边的警卫员说，“上头催得很紧。”'.repeat(3),
  '警卫员点点头，没有接话，只把马灯往前面挪了挪。'.repeat(4),
  '第2章 合龙',
  '解放区迅速恢复生产秩序，各县的粮食开始往工地调运。'.repeat(3),
].join('\n\n');

try {
  async function 等待目标() {
    for (let i = 0; i < 150; i++) {
      try {
        const 列表 = await (
          await fetch(`http://127.0.0.1:${CDP端口}/json`)
        ).json();
        const 目标 = 列表.find(
          (t) => t.type === 'page' && t.url.startsWith(地址),
        );
        if (目标) return 目标;
      } catch {}
      await pause(200);
    }
    throw new Error('未找到页面');
  }
  const 目标 = await 等待目标();
  const ws = new WebSocket(目标.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let 序号 = 0;
  const 待回复 = new Map();
  ws.addEventListener('message', async (事件) => {
    const 消息 = JSON.parse(事件.data);
    if (消息.id) {
      const 请求 = 待回复.get(消息.id);
      待回复.delete(消息.id);
      if (消息.error) 请求.reject(new Error(JSON.stringify(消息.error)));
      else 请求.resolve(消息.result);
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
        await 求值(
          'return document.querySelector("#载入状态")?.hidden && !!(await import("./js/状态.js")).状态.文件名',
        )
      )
        break;
    } catch {}
    await pause(100);
  }
  await pause(500);

  // 造一个命中词，检查命中块与色带同框时的观感
  await 求值(`${S}
    const { 添加关键词标记 } = await import("./js/关键词.js");
    添加关键词标记('警卫员', 状态.文本.indexOf('警卫员'));
    return true;`);
  await pause(500);

  async function 定位悬停行(模式 = '引文') {
    // 悬停普通叙述行（无引文条、无命中、非标题），最能反映色带本身的观感
    return 求值(`${S}
      const 模式 = ${JSON.stringify(模式)};
      元素.滚动容器.scrollTop = 0;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const 行们 = [...document.querySelectorAll('.正文行')];
      const 目标行 = 行们.find((r) =>
        !r.classList.contains('章节标题行') &&
        (模式 === '引文' ? r.querySelector('.字.引文内容') && !r.querySelector('.字.命中') : r.querySelector('.字.命中')) &&
        r.querySelectorAll('.字').length > 6,
      ) || 行们[3];
      const 容器 = 元素.滚动容器.getBoundingClientRect();
      const 自身 = 目标行.getBoundingClientRect();
      return { x: 自身.left + 300, y: 自身.top + 自身.height / 2, 文本: 目标行.textContent.slice(0, 14),
        行顶: 自身.top, 行高: 自身.height, 容器左: 容器.left, 容器宽: 容器.width };`);
  }

  async function 拍一组(前缀, 模式 = '引文') {
    for (const 用旧样式 of [false, true]) {
      await 发送('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 900,
        deviceScaleFactor: 3,
        mobile: false,
      });
      const 位置 = await 定位悬停行(模式);
      await 求值(
        用旧样式
          ? `let 旧 = document.getElementById('旧样式');
           if (!旧) { 旧 = document.createElement('style'); 旧.id = '旧样式'; document.head.append(旧); }
           旧.textContent = '.正文行:hover::after{background:transparent!important;box-shadow:none!important} body:not(.行高亮暂停中) .正文行:hover{filter:brightness(0.94)!important}';
           return true;`
          : `document.getElementById('旧样式')?.remove(); return true;`,
      );
      await pause(150);
      await 发送('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: 位置.x,
        y: 位置.y - 200,
      });
      await pause(150);
      await 发送('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: 位置.x,
        y: 位置.y,
      });
      await pause(350);
      // 断言：悬停的确实是我们选中的那一行
      const 核对 =
        await 求值(`const 行 = document.querySelector('.正文行:hover');
        return { 命中: !!行, 文本: 行 ? 行.textContent.slice(0, 14) : null };`);
      if (!核对.命中 || 核对.文本 !== 位置.文本) {
        throw new Error(`悬停行不符: 期望「${位置.文本}」实际「${核对.文本}」`);
      }
      const 位置2 = await 定位悬停行(模式);
      const clip = {
        x: Math.round(位置2.容器左),
        y: Math.round(位置2.行顶 - 位置2.行高 * 1.5),
        width: Math.round(位置2.容器宽),
        height: Math.round(位置2.行高 * 4),
        scale: 1,
      };
      const 图 = await 发送('Page.captureScreenshot', { format: 'png', clip });
      const 名 = `${前缀}-${用旧样式 ? '旧' : '新'}.png`;
      const 缓冲 = Buffer.from(图.data, 'base64');
      writeFileSync(join(项目根, 'tmp', 名), 缓冲);
      // 众数取色：悬停行 / 上一行各自行盒内的主色（字形占比高也抗干扰）
      const png = 解码PNG(缓冲);
      const 比例 = png.宽 / clip.width;
      const 主色 = (行内y) => {
        const 计数 = new Map();
        for (
          let y = Math.round(行内y * 比例);
          y < Math.round((行内y + 位置2.行高 * 0.8) * 比例);
          y++
        ) {
          for (
            let x = Math.round(60 * 比例);
            x < png.宽 - Math.round(60 * 比例);
            x++
          ) {
            const i = (y * png.宽 + x) * png.通道数;
            const 键 =
              ((png.图[i] >> 3) << 10) |
              ((png.图[i + 1] >> 3) << 5) |
              (png.图[i + 2] >> 3);
            计数.set(键, (计数.get(键) || 0) + 1);
          }
        }
        let 最佳 = 0;
        let 最佳键 = 0;
        for (const [键, 数] of 计数) {
          if (数 > 最佳) {
            最佳 = 数;
            最佳键 = 键;
          }
        }
        const 十六 = (v) =>
          (((最佳键 >> v) & 31) * 8 + 4).toString(16).padStart(2, '0');
        return `#${十六(10)}${十六(5)}${十六(0)}`;
      };
      const 悬停色 = 主色(位置2.行高 * 1.5 + 2);
      const 邻行色 = 主色(位置2.行高 * 0.5 + 2);
      const 差 = Math.abs(相对亮度(悬停色) - 相对亮度(邻行色));
      console.log(
        `${名}  悬停行=${悬停色}  邻行=${邻行色}  亮度差=${(差 * 100).toFixed(1)}%`,
      );
      await 发送('Emulation.clearDeviceMetricsOverride');
      await pause(120);
    }
  }

  await 拍一组('行悬停-浅纸');

  await 求值(`const 字体 = await import("./js/字体设置.js");
    字体.设置纸面色('#141414', { 静默: true });
    字体.设置页面背景色('#0e0f10', { 静默: true });
    字体.设置奇偶行颜色('奇数', '#1c1f22', { 静默: true });
    字体.设置奇偶行颜色('偶数', '#22252a', { 静默: true });
    return true;`);
  await pause(500);
  await 拍一组('行悬停-深纸');

  ws.close();
} finally {
  chrome.kill();
  服务.kill();
  await Promise.race([Promise.all([chrome已退出, 服务已退出]), pause(3000)]);
  rmSync(profile, { recursive: true, force: true });
  console.log(existsSync(profile) ? 'profile 清理失败' : 'profile 已清理');
}
