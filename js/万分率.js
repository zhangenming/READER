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

/** 本书出现次数：千分位；过万改用「万」，与 格式化倍数 同一口径。
 *  差异榜的「差异最小」列里高频字（的、一、是）完全可能上榜，一本 50 万字的书
 *  「的」能到 1.9 万次，六位括号会把列撑破、把行高顶开。精确次数留在行 title 里。 */
export function 格式化次数(次数) {
  if (!Number.isFinite(次数)) {
    return '—';
  }
  if (次数 >= 10000) {
    return `${(Math.round(次数 / 1000) / 10).toLocaleString('zh-CN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}万`;
  }
  return 次数.toLocaleString('zh-CN');
}

/** 本书是知乎的多少倍：≥1 显示 ×N，<1 显示 ÷N。
 *  接近 1 的那一端要留到两位小数，否则「差异最小」整榜都显示 ×1，看不出谁更接近；
 *  另一端可以大到六位数（知乎计 0 次的字），过万改用「万」免得撑破列宽。 */
export function 格式化倍数(比值) {
  if (!Number.isFinite(比值) || 比值 <= 0) {
    return '—';
  }
  const 前缀 = 比值 >= 1 ? '×' : '÷';
  const 倍数 = 比值 >= 1 ? 比值 : 1 / 比值;
  let 数值;
  if (倍数 >= 10000) {
    数值 = `${(Math.round(倍数 / 1000) / 10).toLocaleString('zh-CN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}万`;
  } else if (倍数 >= 100) {
    数值 = Math.round(倍数).toLocaleString('zh-CN');
  } else {
    const 位数 = 倍数 >= 10 ? 1 : 2;
    数值 = (
      Math.round(倍数 * 10 ** 位数) /
      10 ** 位数
    ).toLocaleString('zh-CN', {
      minimumFractionDigits: 位数,
      maximumFractionDigits: 位数,
    });
  }
  return `${前缀}${数值}`;
}
