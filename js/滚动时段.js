import {
  滚动时段每日段数上限,
  滚动时段最短记录秒,
  滚动时段保留天数,
} from './常量.js';
import { 本地日期串 } from './状态.js';
import { 规范时段, 时段总秒, 按间隙合并 } from './时段集合.js';

// 时间段记账工厂与滚动时间段本体。
//
// 形状：本地日期 -> 书名 -> [[起当日秒, 止当日秒], ...]。两类时段（滚动、页面可见）
// 都按书拆开，「书籍明细」和「页面激活与滚动」两张表因此吃同一份数据：
// 时长 = 段求和，不再另记一本毫秒账（旧版那本毫秒账只读回来当历史回落）。
//
// 写入只做无损合并（并掉重叠与首尾相接）；不足 滚动时段最短记录秒 的段丢弃（点击即停不留痕）。
// 一次持续滚动就是一段，不区分它是自动滚动还是按住方向键滚出来的：同一个功能，只是触发方式不同。
// 旧版数据每段带第 3 位「种类」（0 自动 / 1 按键），读取时忽略即可，不迁移、不丢段。
//
// 依赖：常量.js、状态.js 的 本地日期串、时段集合.js（纯代数），三者都是叶子层。
// 持久化「写」由 持久化.js 取 滚动时段统计快照()，「读」由 app.js 传入 载入滚动时段统计(数据)，
// 本模块不 import 持久化/自动滚动/前台停留，避免成环。

const 每日秒数 = 86400;

// 旧数据不分书：整天的段合成一条，读回来挂在它下面。展示层显示成「未分书（旧数据）」。
export const 未分书键 = '';

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

// 排序后并掉间隙不超过 间隙秒 的相邻段；段数超上限时反复合并间隙最小的一对，
// 仍超限则丢弃最短的段。账本写入用默认 0（无损），上限只是撑爆存储时的保险阀。
export function 合并时段列表(
  段列表,
  间隙秒 = 0,
  上限段数 = 滚动时段每日段数上限,
) {
  const 结果 = 按间隙合并(段列表, 间隙秒);
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

// —— 时段存储工厂：同一套「按书的起止时刻」，滚动与页面可见各持一份 ——
// 两者的形状、无损合并、上限、按龄裁剪、快照含进行中段完全一致，只差开关会话的入口不同。
export function 创建时段存储({
  读取持久化,
  上限段数 = 滚动时段每日段数上限,
  保留天数 = 滚动时段保留天数,
  名称 = '滚动时间段',
}) {
  // 日期 -> 书名 -> 段列表（每本书自己那几条已经规范过，互不重叠）
  const 每日时段 = new Map();
  let 进行中 = null; // { 起点, 书名 }

  function 取当日(日期) {
    let 按书 = 每日时段.get(日期);
    if (!按书) {
      按书 = new Map();
      每日时段.set(日期, 按书);
    }
    return 按书;
  }

  function 记入(日期, 书名, 段) {
    const 按书 = 取当日(日期);
    const 合并后 = 合并时段列表([...(按书.get(书名) ?? []), 段], 0, 上限段数);
    if (合并后.length) 按书.set(书名, 合并后);
    else 按书.delete(书名);
    if (!按书.size) 每日时段.delete(日期);
  }

  function 记录(起点毫秒, 终点毫秒, 书名 = 未分书键) {
    for (const [日期, 起, 止] of 切分跨日区间(起点毫秒, 终点毫秒)) {
      if (止 - 起 < 滚动时段最短记录秒) continue;
      记入(日期, 书名, [起, 止]);
    }
    裁剪超龄时段();
  }

  function 开始(现在 = Date.now(), 书名 = 未分书键) {
    if (进行中) {
      // 同一本书再次触发（自动滚动途中改按方向键）：同一段，不切断
      if (进行中.书名 === 书名) return;
      结束(现在); // 换书：旧书那段就地封口，新书另起一段
    }
    进行中 = { 起点: 现在, 书名 };
  }

  function 结束(现在 = Date.now()) {
    if (!进行中) return;
    const { 起点, 书名 } = 进行中;
    进行中 = null;
    记录(起点, Math.max(起点, 现在), 书名);
  }

  function 获取当日(日期) {
    return 每日时段.get(日期) ?? new Map();
  }

  function 获取当日按书(日期, 书名) {
    return 每日时段.get(日期)?.get(书名) ?? [];
  }

  // 某一天的总秒数（全部书籍相加），带上进行中的那段；右下角读数每帧走这里。
  function 当日总秒(日期, 现在 = Date.now()) {
    let 总 = 0;
    for (const 段列表 of 获取当日(日期).values()) 总 += 时段总秒(段列表);
    if (进行中) {
      for (const [段日期, 起, 止] of 切分跨日区间(进行中.起点, Math.max(进行中.起点, 现在))) {
        if (段日期 === 日期) 总 += 止 - 起;
      }
    }
    return 总;
  }

  function 本书当日总秒(书名, 日期, 现在 = Date.now()) {
    let 总 = 时段总秒(获取当日按书(日期, 书名));
    if (进行中 && 进行中.书名 === 书名) {
      for (const [段日期, 起, 止] of 切分跨日区间(进行中.起点, Math.max(进行中.起点, 现在))) {
        if (段日期 === 日期) 总 += 止 - 起;
      }
    }
    return 总;
  }

  function 裁剪超龄时段() {
    if (每日时段.size <= 保留天数) return;
    const 截止日期 = new Date();
    截止日期.setDate(截止日期.getDate() - 保留天数);
    const 截止 = 本地日期串(截止日期);
    for (const 日期 of [...每日时段.keys()]) {
      if (日期 < 截止) 每日时段.delete(日期);
    }
  }

  // 读一条段的列表：新形状是 { 书名: [[起,止]] }，旧形状是 [[起,止]]（整天的段不分书）。
  function 解析按书(值) {
    const 按书 = new Map();
    const 收集 = (书名, 段列表) => {
      if (!Array.isArray(段列表)) return;
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
      if (有效段.length) 按书.set(书名, 合并时段列表(有效段, 0, 上限段数));
    };
    if (Array.isArray(值)) 收集(未分书键, 值);
    else if (值 && typeof 值 === 'object') {
      for (const [书名, 段列表] of Object.entries(值)) 收集(书名, 段列表);
    } else return 按书;
    for (const [书名, 段列表] of [...按书]) if (!段列表.length) 按书.delete(书名);
    return 按书;
  }

  function 载入(数据) {
    进行中 = null;
    每日时段.clear();
    const 持久化每日时段 = 读取持久化(数据);
    if (持久化每日时段 === undefined) return;
    if (
      !持久化每日时段 ||
      typeof 持久化每日时段 !== 'object' ||
      Array.isArray(持久化每日时段)
    ) {
      console.error(`[阅读器] 持久化的${名称}格式无效，已忽略`);
      return;
    }
    for (const [日期, 值] of Object.entries(持久化每日时段)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(日期)) continue;
      const 按书 = 解析按书(值);
      if (按书.size) 每日时段.set(日期, 按书);
    }
    裁剪超龄时段();
  }

  // 快照包含未封口的进行中段（以当前时刻封口），页面被强杀也最多丢掉一个防抖窗口。
  function 快照(现在 = Date.now()) {
    const 每日时段对象 = {};
    const 并段 = (日期, 书名, 段列表) => {
      const 按书 = 每日时段对象[日期] ?? (每日时段对象[日期] = {});
      按书[书名] = 合并时段列表(
        [...(按书[书名] ?? []), ...段列表],
        0,
        上限段数,
      );
    };
    for (const [日期, 按书] of 每日时段) {
      for (const [书名, 段列表] of 按书) 并段(日期, 书名, 段列表);
    }
    if (进行中) {
      for (const [日期, 起, 止] of 切分跨日区间(
        进行中.起点,
        Math.max(进行中.起点, 现在),
      )) {
        if (止 - 起 < 滚动时段最短记录秒) continue;
        并段(日期, 进行中.书名, [[起, 止]]);
      }
    }
    for (const [日期, 按书] of Object.entries(每日时段对象)) {
      for (const [书名, 段列表] of Object.entries(按书)) {
        if (!段列表.length) delete 按书[书名];
      }
      if (!Object.keys(按书).length) delete 每日时段对象[日期];
    }
    return { 每日时段: 每日时段对象 };
  }

  return {
    每日时段,
    开始,
    结束,
    记录,
    获取当日,
    获取当日按书,
    当日总秒,
    本书当日总秒,
    载入,
    快照,
    获取进行中: () => 进行中,
    获取进行中起点: () => 进行中?.起点 ?? null,
  };
}

// —— 滚动时间段：自动滚动与按键滚动同算一段 ——

const 滚动时段存储 = 创建时段存储({
  读取持久化: (数据) => 数据?.自动滚动统计?.每日时段,
});

export const 每日滚动时段 = 滚动时段存储.每日时段;
export const 开始滚动时段 = 滚动时段存储.开始;
export const 结束滚动时段 = 滚动时段存储.结束;
export const 记录滚动时段 = 滚动时段存储.记录;
export const 获取当日滚动时段 = 滚动时段存储.获取当日;
export const 获取当日按书滚动时段 = 滚动时段存储.获取当日按书;
export const 滚动当日总秒 = 滚动时段存储.当日总秒;
export const 本书滚动当日总秒 = 滚动时段存储.本书当日总秒;
export const 载入滚动时段统计 = 滚动时段存储.载入;
export const 滚动时段统计快照 = 滚动时段存储.快照;
export const 获取进行中滚动时段 = 滚动时段存储.获取进行中;

// 兼容旧调用名（tests/scroll-segments-browser.mjs 与 app.js 里按「当日时段」称呼它）
export const 获取当日时段 = 滚动时段存储.获取当日;

export { 时段总秒, 规范时段 };
