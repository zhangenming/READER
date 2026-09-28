import { 状态 } from './状态.js';
import { 开始可见时段, 结束可见时段 } from './可见时段.js';

// 前台以 Page Visibility 为准：可见且载入了书就算「页面开着」，不依赖滚动或焦点。
//
// 本模块现在只做一件事——管住「可见时段」这本账的开关会话（js/可见时段.js，按书拆开）。
// 时长不再另记一本毫秒账：几点到几点就是账本本身，读了多久由时段求和得来
// （见 js/统计展示.js 的 书籍时间账 与 js/阅读统计.js 的 时间账表）。
//
// 旧版本在这里按书、按日记毫秒数（书籍每日前台毫秒）。那些老日子没有时段可回溯，
// 所以本模块仍然把旧毫秒读回来、原样写回去，只作为「没有时段的日期」的回落值，
// 不再新增任何一笔。
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

// 唯一的开关入口：可见且有名有书 → 开一段；否则封口。重复通知不重复记账。
// 换书要断段——时段是按书记的，同一段时间不能同时算进两本书的账。
// （旧版换书不断段，因为那时只问"开没开着页面"；现在还要回答"开着在哪本书上"。）
export function 更新前台停留计时(
  文件名 = 状态.文件名,
  可见 = document.visibilityState === 'visible',
  现在 = Date.now(),
) {
  const 新书名 = 文件名 && 可见 ? 文件名 : null;
  const 旧书名 = 会话?.文件名 ?? null;
  if (旧书名 !== 新书名) {
    if (旧书名) 结束可见时段(现在);
    if (新书名) 开始可见时段(现在, 新书名);
  }
  会话 = 新书名 ? { 文件名: 新书名, 上次时刻: 现在 } : null;
}

// 旧毫秒账原样序列化回持久化：不再新增，但不能在下一次保存时把它丢掉。
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
