import { 主线程时间片毫秒 } from './常量.js';

export async function 按需让出主线程(时间片开始) {
  if (performance.now() - 时间片开始 < 主线程时间片毫秒) {
    return 时间片开始;
  }
  await scheduler.yield();
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
