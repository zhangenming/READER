// 主线复核探针（临时，不属于常规回归）：
// 1) 调整行高在文档深处被旧画布钳制 → scrollTop 回跳（字体设置.js:753-754 顺序问题）
// 2) 自动滚动进行中，语音翻页走 翻页整屏 → 下一帧被 rAF 循环按 浮点位置 写回（app.js:739-740 缺分支）
// 跑法：node tmp/跑-浏览器回归.mjs tmp/verify-主线复核-browser.mjs
import assert from 'node:assert/strict';

const 站点 = 'http://127.0.0.1:15921';
const 目标列表 = await (
  await fetch(`http://127.0.0.1:${process.env.CDP_PORT}/json`)
).json();
const 目标 = 目标列表.find((t) => t.type === 'page' && t.url.startsWith(站点));
assert.ok(目标, 'reader tab');
const ws = new WebSocket(目标.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let 序号 = 0;
const 待回复 = new Map();
ws.addEventListener('message', (事件) => {
  const 消息 = JSON.parse(事件.data);
  const 请求 = 待回复.get(消息.id);
  if (!请求) return;
  待回复.delete(消息.id);
  消息.error
    ? 请求.reject(new Error(JSON.stringify(消息.error)))
    : 请求.resolve(消息.result);
});
const 发送 = (方法, 参数 = {}) =>
  new Promise((解决, 拒绝) => {
    const 下标 = ++序号;
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
async function evaluate(代码) {
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
const wait = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

await 发送('Page.enable');

// —— 探针 1：调整行高的钳制回跳 ——
{
  const 前 = await evaluate(`
    const { 状态, 元素 } = await import('./js/状态.js');
    const { 调整行高 } = await import('./js/字体设置.js');
    const 容器 = 元素.滚动容器;
    const 旧行高 = 状态.行高;
    容器.scrollTop = 容器.scrollHeight - 容器.clientHeight; // 压到底：钳制必然触发
    const 原scrollTop = 容器.scrollTop;
    const 新值 = 旧行高 + 4;
    调整行高(新值);
    const 期望 = Math.min(
      容器.scrollHeight - 容器.clientHeight,
      原scrollTop * (新值 / 旧行高),
    );
    return {
      旧行高, 新值, 原scrollTop, 期望,
      实际: 容器.scrollTop,
      行数: 状态.行起点列表.length,
    };
  `);
  const 损失行数 = (前.期望 - 前.实际) / 前.新值;
  console.log(
    `探针1 调行高：原 ${Math.round(前.原scrollTop)} → 期望 ${Math.round(前.期望)}，实际 ${Math.round(前.实际)}，回跳约 ${Math.round(损失行数)} 行（行数 ${前.行数}）`,
  );
  assert.ok(
    前.实际 < 前.期望 - 前.新值,
    'BUG 复现：调大行距时 scrollTop 被旧画布钳制，阅读位置回跳',
  );
  // 还原行高，别影响探针 2 的换算
  await evaluate(`
    const { 调整行高 } = await import('./js/字体设置.js');
    调整行高(${JSON.stringify(前.旧行高)});
  `);
}

// —— 探针 2：自动滚动中语音翻页被 rAF 回滚 ——
{
  const 数据 = await evaluate(`
    const { 元素, 状态 } = await import('./js/状态.js');
    const { 自动滚动进行中 } = await import('./js/自动滚动.js');
    const { 语音事件 } = await import('./js/常量.js');
    const 容器 = 元素.滚动容器;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true }));
    await new Promise((r) => setTimeout(r, 400));
    if (!自动滚动进行中()) return { 启动失败: true };
    const 记录前 = 容器.scrollTop;
    window.dispatchEvent(new CustomEvent(语音事件.翻页, { detail: { 指令: '下一页' } }));
    const 翻页后立刻 = 容器.scrollTop;
    await new Promise((r) => setTimeout(r, 500));
    const 半秒后 = 容器.scrollTop;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true }));
    return {
      速度参考: 状态.自动滚动速度,
      记录前, 翻页后立刻, 半秒后,
      一屏: 元素.滚动容器.clientHeight,
    };
  `);
  assert.ok(!数据.启动失败, 'Ctrl+D 应能启动自动滚动');
  const 立刻增量 = 数据.翻页后立刻 - 数据.记录前;
  const 回退量 = 数据.翻页后立刻 - 数据.半秒后;
  console.log(
    `探针2 语音翻页：翻页瞬间前移 ${Math.round(立刻增量)}px（约 ${(立刻增量 / 数据.一屏).toFixed(2)} 屏），500ms 后回落到 ${Math.round(数据.半秒后)}（较峰值回落 ${Math.round(回退量)}px；自动滚动速度 ${Math.round(数据.速度参考)}px/s）`,
  );
  assert.ok(
    回退量 > 数据.一屏 * 0.5,
    'BUG 复现：语音翻页在自动滚动下先跳一屏、随后被 rAF 按内部位置写回',
  );
}

console.log('✓ 主线复核探针：两个高危 bug 均在真实浏览器复现');

ws.close();
