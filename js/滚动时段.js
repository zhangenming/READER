import {
  滚动时段合并间隙秒,
  滚动时段每日段数上限,
  滚动时段最短记录秒,
  滚动时段保留天数,
} from './常量.js';
import { 本地日期串 } from './状态.js';

// 滚动时间段：把每一次「持续滚动」记成一段墙钟起止时刻（精确到秒），而不是只累加时长。
// 与 时长统计（状态.js 的 统计.书籍每日滚动毫秒）并存：时长回答「读了多久」，
// 时间段回答「几点读到几点」，统计弹窗按天渲染成一条共用时间轴。
// 数据不按书拆分（全部书籍合并成一条作息轴），因此只以本地日期为键。
// 一次持续滚动就是一段，不区分它是自动滚动还是按住按键滚出来的：同一个功能，只是触发方式不同。
// 旧版持久化数据每段带第 3 位「种类」（0 自动 / 1 按键），读取时忽略即可，不迁移、不丢段。
//
// 依赖：仅 常量.js 与 状态.js 的 本地日期串（与 前台停留.js 同层，同为叶子记账模块）。
// 持久化「写」由 持久化.js 取 滚动时段统计快照()，「读」由 app.js 传入 载入滚动时段统计(数据)，
// 本模块不 import 持久化/自动滚动，避免成环。

const 每日秒数 = 86400;

// 日期串 -> [[起当日秒, 止当日秒], ...]，按起点有序且间隙内已合并
export const 每日滚动时段 = new Map();
let 进行中时段 = null; // 起点毫秒；同一时刻至多一段

// —— 纯计算（无 DOM、无模块状态，供单测直接调用）——

// 把一段墙钟毫秒区间按本地午夜切分，返回 [日期串, 起当日秒, 止当日秒]。
// 止当日秒可为 86400（正好结束于次日午夜），用日历递增兼容 23/25 小时日。
export function 切分跨日区间(起点毫秒, 终点毫秒) {
  const 起 = Math.floor(Math.min(起点毫秒, 终点毫秒) / 1000);
  const 止 = Math.max(起, Math.round(Math.max(起点毫秒, 终点毫秒) / 1000));
  const 结果 = [];
  let 当前 = 起;
  while (当前 < 止) {
    const 日期 = new Date(当前 * 1000);
    const 当日零点 = new Date(
      日期.getFullYear(),
      日期.getMonth(),
      日期.getDate(),
    ).getTime();
    const 次日零点 = new Date(
      日期.getFullYear(),
      日期.getMonth(),
      日期.getDate() + 1,
    ).getTime();
    const 段终点 = Math.min(止, Math.floor(次日零点 / 1000));
    结果.push([
      本地日期串(日期),
      当前 - Math.floor(当日零点 / 1000),
      段终点 - Math.floor(当日零点 / 1000),
    ]);
    当前 = 段终点;
  }
  return 结果;
}

// 排序后合并间隙不超过 间隙秒 的相邻段（误触暂停又继续不留碎片）；
// 段数超上限时反复合并间隙最小的一对，仍超限则丢弃最短的段。
export function 合并时段列表(段列表, 间隙秒 = 滚动时段合并间隙秒, 上限段数 = 滚动时段每日段数上限) {
  const 段们 = 段列表.map(([起, 止]) => [起, 止]).sort((左, 右) => 左[0] - 右[0] || 左[1] - 右[1]);
  const 结果 = [];
  for (const 段 of 段们) {
    const 上一段 = 结果[结果.length - 1];
    // 间隙在阈值内（重叠时间隙为负，同样命中）→ 并入上一段
    if (上一段 && 段[0] - 上一段[1] <= 间隙秒) {
      上一段[1] = Math.max(上一段[1], 段[1]);
      continue;
    }
    结果.push(段);
  }
  while (结果.length > 上限段数) {
    const 可合并idx = 寻找可合并对(结果);
    if (可合并idx === -1) {
      // 无可并的相邻对（只剩一段仍超限）→ 丢弃最短的一段保证收敛
      let 最短idx = 0;
      for (let idx = 1; idx < 结果.length; idx += 1) {
        if (结果[idx][1] - 结果[idx][0] < 结果[最短idx][1] - 结果[最短idx][0]) 最短idx = idx;
      }
      结果.splice(最短idx, 1);
      continue;
    }
    const [起, 止] = 结果[可合并idx];
    结果.splice(可合并idx, 2, [起, Math.max(止, 结果[可合并idx + 1][1])]);
  }
  return 结果;

  function 寻找可合并对(列表) {
    let 最佳idx = -1;
    let 最佳间隙 = Infinity;
    for (let idx = 0; idx < 列表.length - 1; idx += 1) {
      const 间隙 = 列表[idx + 1][0] - 列表[idx][1];
      if (间隙 < 最佳间隙) {
        最佳间隙 = 间隙;
        最佳idx = idx;
      }
    }
    return 最佳idx;
  }
}

// 所有行共用一条时间轴的窗口、色块几何与时刻格式化，都归展示层 js/阅读统计.js（纯函数、可直接单测）。

// —— 记账（模块状态）——

export function 开始滚动时段(现在 = Date.now()) {
  if (进行中时段) return; // 已在滚（换了触发方式也算连续滚动），不重开一段
  进行中时段 = 现在;
}

export function 结束滚动时段(现在 = Date.now()) {
  if (!进行中时段) return;
  const 起点毫秒 = 进行中时段;
  进行中时段 = null;
  记录滚动时段(起点毫秒, Math.max(起点毫秒, 现在));
}

export function 获取进行中时段() {
  return 进行中时段;
}

export function 记录滚动时段(起点毫秒, 终点毫秒) {
  for (const [日期, 起, 止] of 切分跨日区间(起点毫秒, 终点毫秒)) {
    if (止 - 起 < 滚动时段最短记录秒) continue;
    const 原列表 = 每日滚动时段.get(日期) ?? [];
    每日滚动时段.set(日期, 合并时段列表([...原列表, [起, 止]]));
  }
  裁剪超龄时段();
}

export function 获取当日时段(日期) {
  return 每日滚动时段.get(日期) ?? [];
}

export function 获取时段总秒数(段列表) {
  return 段列表.reduce((总数, [起, 止]) => 总数 + Math.max(0, 止 - 起), 0);
}

function 裁剪超龄时段() {
  if (每日滚动时段.size <= 滚动时段保留天数) return;
  const 截止日期 = new Date();
  截止日期.setDate(截止日期.getDate() - 滚动时段保留天数);
  const 截止 = 本地日期串(截止日期);
  for (const 日期 of [...每日滚动时段.keys()]) {
    if (日期 < 截止) 每日滚动时段.delete(日期);
  }
}

// —— 持久化 ——

export function 载入滚动时段统计(数据) {
  进行中时段 = null;
  每日滚动时段.clear();
  const 每日时段 = 数据?.自动滚动统计?.每日时段;
  if (每日时段 === undefined) return;
  if (!每日时段 || typeof 每日时段 !== 'object' || Array.isArray(每日时段)) {
    console.error('[阅读器] 持久化的滚动时间段格式无效，已忽略');
    return;
  }
  for (const [日期, 段列表] of Object.entries(每日时段)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(日期) || !Array.isArray(段列表)) continue;
    const 有效段 = [];
    for (const 段 of 段列表) {
      if (!Array.isArray(段) || 段.length < 2) continue;
      const [起, 止] = 段; // 旧数据可能带第 3 位「种类」，一律忽略
      if (
        !Number.isInteger(起) ||
        !Number.isInteger(止) ||
        起 < 0 ||
        止 > 每日秒数 ||
        止 <= 起
      ) {
        continue;
      }
      有效段.push([起, 止]);
    }
    if (有效段.length) 每日滚动时段.set(日期, 合并时段列表(有效段));
  }
  裁剪超龄时段();
}

// 快照包含未封口的进行中段（以当前时刻封口），页面被强杀也最多丢掉一个防抖窗口。
export function 滚动时段统计快照(现在 = Date.now()) {
  const 每日时段 = Object.fromEntries(
    [...每日滚动时段].map(([日期, 段列表]) => [日期, 段列表.map((段) => [...段])]),
  );
  if (进行中时段) {
    for (const [日期, 起, 止] of 切分跨日区间(
      进行中时段,
      Math.max(进行中时段, 现在),
    )) {
      if (止 - 起 < 滚动时段最短记录秒) continue;
      每日时段[日期] = 合并时段列表([...(每日时段[日期] ?? []), [起, 止]]);
    }
  }
  return { 每日时段 };
}
