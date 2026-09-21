// 万分之口径的显示函数，纯计算、无依赖。
// 词频弹窗的主表和右侧差异榜共用，保证同一数字在两处显示完全一致。

/** 万分之：≥10 向下取整（源表「的」403.89 → 403），其余取 3 位有效数字；查不到为「—」 */
export function 格式化万分率(值) {
  if (值 === undefined) {
    return '—';
  }
  if (值 === 0) {
    return '0';
  }
  if (值 >= 10) {
    return String(Math.floor(值));
  }
  return 值.toPrecision(3);
}

/** 名次：千分位；查不到为「—」 */
export function 显示名次(值) {
  return 值 === undefined ? '—' : 值.toLocaleString('zh-CN');
}

/** 本书是知乎的多少倍：≥1 显示 ×N，<1 显示 ÷N。
 *  接近 1 的那一端要留到两位小数，否则「差异最小」整榜都显示 ×1，看不出谁更接近 */
export function 格式化倍数(比值) {
  if (!Number.isFinite(比值) || 比值 <= 0) {
    return '—';
  }
  const 前缀 = 比值 >= 1 ? '×' : '÷';
  const 倍数 = 比值 >= 1 ? 比值 : 1 / 比值;
  const 位数 = 倍数 >= 100 ? 0 : 倍数 >= 10 ? 1 : 2;
  return `${前缀}${(Math.round(倍数 * 10 ** 位数) / 10 ** 位数).toLocaleString(
    'zh-CN',
    { minimumFractionDigits: 位数, maximumFractionDigits: 位数 },
  )}`;
}
