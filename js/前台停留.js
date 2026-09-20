import { 状态, 本地日期串 } from './状态.js';
import { 开始激活时段, 结束激活时段 } from './激活时段.js';

// 前台以 Page Visibility 为准：可见即计时（含手动阅读和弹窗），不依赖滚动或焦点。
// 按书、按日记录是唯一数据源，今日与累计均从中汇总，避免多份计数漂移。
// 累计时长之外，会话的开关同时记一条「页面激活时段」（js/激活时段.js），供统计弹窗画到时间轴上。
export const 书籍每日前台毫秒 = new Map();
let 会话 = null;

export function 载入前台停留统计(数据) {
  会话 = null;
  书籍每日前台毫秒.clear();
  const 每日 = 数据?.前台停留统计?.每日书籍毫秒;
  if (!每日 || typeof 每日 !== 'object' || Array.isArray(每日)) return;
  for (const [文件名, 日期表] of Object.entries(每日)) {
    if (!日期表 || typeof 日期表 !== 'object' || Array.isArray(日期表)) continue;
    const 有效记录 = Object.entries(日期表).filter(
      ([日期, 毫秒]) => /^\d{4}-\d{2}-\d{2}$/.test(日期) && Number.isFinite(毫秒) && 毫秒 > 0,
    );
    if (有效记录.length) 书籍每日前台毫秒.set(文件名, new Map(有效记录));
  }
}

// 先结清上一段，再切换书籍/可见状态；重复通知不会重复记账。
export function 更新前台停留计时(
  文件名 = 状态.文件名,
  可见 = document.visibilityState === 'visible',
  现在 = Date.now(),
) {
  结转前台停留时长(现在);
  会话 = 文件名 && 可见 ? { 文件名, 上次时刻: 现在 } : null;
  // 时段只看「有没有激活」，换书不算离开，所以轴上是一条连续的浅色带，不会因切书断开。
  if (会话) 开始激活时段(现在);
  else 结束激活时段(现在);
}

export function 结转前台停留时长(现在 = Date.now()) {
  if (!会话) return;
  let 起点 = 会话.上次时刻;
  会话.上次时刻 = 现在;
  if (现在 <= 起点) return;
  let 日期表 = 书籍每日前台毫秒.get(会话.文件名);
  if (!日期表) {
    日期表 = new Map();
    书籍每日前台毫秒.set(会话.文件名, 日期表);
  }
  // 本地午夜分段；用日历递增兼容夏令时的 23/25 小时日。
  while (起点 < 现在) {
    const 日期 = new Date(起点);
    const 次日 = new Date(日期.getFullYear(), 日期.getMonth(), 日期.getDate() + 1).getTime();
    const 终点 = Math.min(现在, 次日);
    const 日期串 = 本地日期串(日期);
    日期表.set(日期串, (日期表.get(日期串) ?? 0) + 终点 - 起点);
    起点 = 终点;
  }
}

export function 前台停留统计快照() {
  return {
    每日书籍毫秒: Object.fromEntries(
      [...书籍每日前台毫秒].map(([名, 日期表]) => [名, Object.fromEntries(日期表)]),
    ),
  };
}

export function 获取书籍前台毫秒(文件名) {
  return [...(书籍每日前台毫秒.get(文件名)?.values() ?? [])].reduce(
    (总数, 毫秒) => 总数 + 毫秒,
    0,
  );
}

export function 获取今日前台毫秒(今天 = 本地日期串(new Date())) {
  return [...书籍每日前台毫秒.values()].reduce(
    (总数, 日期表) => 总数 + (日期表.get(今天) ?? 0),
    0,
  );
}
