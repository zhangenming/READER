import { 主线程时间片毫秒 } from './常量.js';

// scheduler.yield 仅 Chrome 系支持；缺失时回退 setTimeout(0) 宏任务让出，
// 保证非 Chromium 浏览器与 Node 环境下管线仍可运行（只是让出粒度变粗）。
async function 让出主线程() {
  if (typeof scheduler !== 'undefined' && typeof scheduler.yield === 'function') {
    await scheduler.yield();
  } else {
    await new Promise((解决) => setTimeout(解决, 0));
  }
}

export async function 按需让出主线程(时间片开始) {
  if (performance.now() - 时间片开始 < 主线程时间片毫秒) {
    return 时间片开始;
  }
  await 让出主线程();
  return performance.now();
}

export async function 创建Uint32Array(数组, 任务仍然有效) {
  const 结果 = new Uint32Array(数组.length);
  let 时间片开始 = performance.now();
  for (let idx = 0; idx < 数组.length; idx += 1) {
    结果[idx] = 数组[idx];
    if ((idx & 4095) === 4095) {
      时间片开始 = await 按需让出主线程(时间片开始);
      if (!任务仍然有效()) {
        return null;
      }
    }
  }
  return 任务仍然有效() ? 结果 : null;
}

export async function 创建Uint8Array(数组, 任务仍然有效) {
  const 结果 = new Uint8Array(数组.length);
  let 时间片开始 = performance.now();
  for (let idx = 0; idx < 数组.length; idx += 1) {
    结果[idx] = 数组[idx];
    if ((idx & 4095) === 4095) {
      时间片开始 = await 按需让出主线程(时间片开始);
      if (!任务仍然有效()) {
        return null;
      }
    }
  }
  return 任务仍然有效() ? 结果 : null;
}
