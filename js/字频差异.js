import { 元素 } from './状态.js';
import { 格式化倍数, 格式化万分率 } from './万分率.js';
import { 取知乎序号, 取知乎万分率 } from './知乎字频.js';

// 字频差异榜：词频对照右侧的独立模块，固定 30 + 30 行，一次渲染完，
// 不进 虚拟列表、也不跟主表共享滚动容器（主表滚多少都与它无关）。
//
// 差异口径 = 本书万分之 ÷ 知乎万分之 的倍数（按 |log2| 排序）。
// 不用绝对差是因为：绝对差的最大端永远是「的了是一」这些高频虚词，
// 最小端永远是两边都几乎不出现的生僻字，两头都没有信息量。
// 入榜门槛（本书至少出现几次、知乎至少多常用）是为了滤掉单次出现的噪声，
// 门槛值直接写在榜的说明行里，口径可核对。

const 榜长 = 30;
const 本书最少次数 = 5;
const 知乎最少万分之 = 1;

function 计算差异行(分析) {
  const 行列表 = [];
  for (const 项 of 分析.列表[1]) {
    if (项.数量 < 本书最少次数) {
      continue;
    }
    const 现代万分之 = 取知乎万分率(项.文本);
    if (现代万分之 === undefined || 现代万分之 < 知乎最少万分之) {
      continue;
    }
    const 本书万分之 = (项.数量 / 分析.汉字总数) * 10000;
    行列表.push({
      文本: 项.文本,
      现代万分之,
      本书万分之,
      比值: 本书万分之 / 现代万分之,
      对数差: Math.abs(Math.log2(本书万分之 / 现代万分之)),
      现代名次: 取知乎序号(项.文本),
    });
  }
  return 行列表;
}

function 排序取榜(行列表, 取最大) {
  return 行列表.slice().sort(function 比较差异(左, 右) {
    const 差 = 取最大 ? 右.对数差 - 左.对数差 : 左.对数差 - 右.对数差;
    if (差 !== 0) {
      return 差;
    }
    // 差异相同（如互为倒数）时按现代常用度排，保证结果稳定可复现
    return 右.现代万分之 - 左.现代万分之 || 左.文本.localeCompare(右.文本, 'zh-CN');
  });
}

function 填列(表体, 行列表) {
  const 片段 = document.createDocumentFragment();
  for (const 行 of 行列表) {
    const 节点 = document.createElement('tr');
    const 字格 = document.createElement('td');
    const 现代格 = document.createElement('td');
    const 本书格 = document.createElement('td');
    const 倍数格 = document.createElement('td');
    字格.textContent = 行.文本;
    现代格.textContent = 格式化万分率(行.现代万分之);
    本书格.textContent = 格式化万分率(行.本书万分之);
    倍数格.textContent = 格式化倍数(行.比值);
    倍数格.classList.add(行.比值 >= 1 ? '字频偏本书' : '字频偏知乎');
    节点.title =
      `知乎万分之 ${行.现代万分之.toFixed(4)}（第 ${行.现代名次} 名）· ` +
      `本书万分之 ${行.本书万分之.toFixed(4)}`;
    节点.append(字格, 现代格, 本书格, 倍数格);
    片段.append(节点);
  }
  表体.replaceChildren(片段);
}

export function 渲染字频差异榜(分析) {
  const 行列表 = 计算差异行(分析);
  填列(元素.字频差异最大列表, 排序取榜(行列表, true).slice(0, 榜长));
  填列(元素.字频差异最小列表, 排序取榜(行列表, false).slice(0, 榜长));
  元素.字频差异说明.textContent =
    `本书万分之 ÷ 知乎万分之，按倍数差异排 |log₂| · ` +
    `只统计本书 ≥${本书最少次数} 次且知乎 ≥${知乎最少万分之} 的字（候选 ` +
    `${行列表.length.toLocaleString('zh-CN')} 字）`;
  元素.字频差异最大标题.textContent = `差异最大 ${Math.min(榜长, 行列表.length)}`;
  元素.字频差异最小标题.textContent = `差异最小 ${Math.min(榜长, 行列表.length)}`;
}
