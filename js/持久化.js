import { 持久化键, 旧持久化键 } from './常量.js';
import {
  外观,
  奇偶行颜色,
  字体粗细设置,
  字体设置,
  字体颜色设置,
  引文背景色,
  状态,
  统计,
} from './状态.js';
import { 查找偏移所在行 } from './排版引擎.js';
import { 获取静止滚动位置 } from './跳转动画.js';
import { 结转未入账滚动毫秒 } from './自动滚动.js';

export function 读取持久化数据() {
  const 原始数据 = localStorage.getItem(持久化键);
  if (原始数据) {
    const 数据 = JSON.parse(原始数据);
    if (
      !数据 ||
      typeof 数据 !== 'object' ||
      typeof 数据.当前文件名 !== 'string' ||
      !数据.文本状态 ||
      typeof 数据.文本状态 !== 'object' ||
      Array.isArray(数据.文本状态)
    ) {
      throw new TypeError('持久化的文本状态数据库格式无效');
    }
    return 数据;
  }

  const 旧数据 = localStorage.getItem(旧持久化键);
  if (!旧数据) {
    return { 当前文件名: '', 文本状态: {} };
  }
  const 旧状态 = JSON.parse(旧数据);
  if (!旧状态 || typeof 旧状态 !== 'object') {
    throw new TypeError('旧版持久化阅读状态格式无效');
  }
  if (!是有效文本文件名(旧状态.文件名)) {
    return { 当前文件名: '', 文本状态: {} };
  }
  return {
    当前文件名: 旧状态.文件名,
    文本状态: { [旧状态.文件名]: 旧状态 },
  };
}

export function 安排保存持久化状态() {
  window.clearTimeout(状态.保存计时器);
  状态.保存计时器 = window.setTimeout(保存持久化状态, 120);
}

export function 保存持久化状态() {
  if (!状态.文件名 || !状态.行起点列表.length) {
    return;
  }

  window.clearTimeout(状态.保存计时器);
  状态.保存计时器 = 0;
  结转未入账滚动毫秒();
  const 阅读位置 = 读取阅读位置();
  const 持久化数据 = 读取持久化数据();
  持久化数据.当前文件名 = 状态.文件名;
  持久化数据.自动滚动统计 = {
    日期: 统计.今日滚动日期,
    今日毫秒: 统计.今日滚动毫秒,
    书籍毫秒: Object.fromEntries(统计.今日书籍滚动毫秒),
  };
  持久化数据.文本状态[状态.文件名] = {
    文件名: 状态.文件名,
    文本长度: 状态.文本.length,
    ...阅读位置,
    总滚动毫秒: 统计.书籍滚动毫秒.get(状态.文件名) ?? 0,
    当前关键词id: 状态.当前关键词id,
    关键词排序: 状态.关键词排序,
    关键词面板展开: 状态.关键词面板展开,
    自动滚动速度: 状态.自动滚动速度,
    字号: 状态.字号,
    行高: 状态.行高,
    当前字体标签: 外观.当前字体标签,
    字体: { 引号内: 字体设置.引号内, 引号外: 字体设置.引号外 },
    字体粗细: {
      引号内: 字体粗细设置.引号内,
      引号外: 字体粗细设置.引号外,
    },
    字体颜色: {
      引号内: 字体颜色设置.引号内,
      引号外: 字体颜色设置.引号外,
    },
    内置字词颜色: 外观.内置字词颜色,
    关键词样式: { 颜色: 外观.关键词颜色, 粗细: 外观.关键词粗细 },
    奇偶行颜色: { ...奇偶行颜色 },
    页面背景色: 外观.页面背景色,
    纸面色: 外观.纸面色,
    引文背景色启用: 外观.引文背景色启用,
    引文背景色: { ...引文背景色 },
    引文边框启用: 外观.引文边框启用,
    换行标记启用: 外观.换行标记启用,
    阶梯段落启用: 外观.阶梯段落启用,
    关键词列表: 状态.关键词列表
      .filter(function 排除临时关键词(关键词) {
        return !关键词.临时;
      })
      .map(function 序列化关键词(关键词) {
        return {
          id: 关键词.id,
          文本: 关键词.文本,
          当前命中idx: 关键词.当前命中idx,
          配色idx: 关键词.配色idx,
        };
      }),
  };
  localStorage.setItem(持久化键, JSON.stringify(持久化数据));
}

export function 读取阅读位置() {
  const 行位置 = 获取静止滚动位置() / 状态.行高;
  const 顶部行idx = Math.min(状态.行起点列表.length - 1, Math.floor(行位置));
  return {
    阅读偏移: 状态.行起点列表[顶部行idx],
    行内比例: 行位置 - 顶部行idx,
  };
}

export function 计算阅读位置(阅读位置) {
  const 阅读偏移 = Math.min(状态.文本.length, Math.max(0, 阅读位置.阅读偏移));
  const 行内比例 = Math.min(1, Math.max(0, 阅读位置.行内比例));
  return (查找偏移所在行(阅读偏移) + 行内比例) * 状态.行高;
}
