import { 元素 } from './状态.js';
import { 格式化次数, 格式化倍数, 格式化万分率 } from './万分率.js';
import { 取知乎序号, 取知乎万分率 } from './知乎字频.js';

// 字频差异榜：词频对照右侧的独立模块，三列各 30 行，一次渲染完，
// 不进 虚拟列表、也不跟主表共享滚动容器（主表滚多少都与它无关）。
//
// 差异口径 = 本书万分之 ÷ 知乎万分之 的倍数（按 |log2| 排序）。
// 不用绝对差是因为：绝对差的最大端永远是「的了是一」这些高频虚词，
// 最小端永远是两边都几乎不出现的生僻字，两头都没有信息量。
// 本书出现过的每个字都入榜，不做次数门槛；但知乎那一侧必须有数：
// 计 0 次或压根未收录的字没有分母，属于「没有数据」而不是「差异极大」，
// 折算成 1 次会把它们顶到榜首（×6,117 那种），所以直接排除并在说明里报数量。

const 榜长 = 30;

function 计算差异行(分析) {
  const 行列表 = [];
  let 无现代数据字数 = 0;
  for (const 项 of 分析.列表[1]) {
    const 现代显示 = 取知乎万分率(项.文本); // 未收录为 undefined，显示要与主表一致
    const 现代 = 现代显示 ?? 0;
    if (现代 <= 0) {
      无现代数据字数 += 1;
      continue;
    }
    const 本书万分之 = (项.数量 / 分析.汉字总数) * 10000;
    const 比值 = 本书万分之 / 现代;
    行列表.push({
      文本: 项.文本,
      现代显示,
      现代,
      本书万分之,
      比值,
      对数差: Math.abs(Math.log2(比值)),
      本书次数: 项.数量,
      现代名次: 取知乎序号(项.文本),
    });
  }
  return { 行列表, 无现代数据字数 };
}

function 排序取榜(行列表, 取最大) {
  return 行列表.slice().sort(function 比较差异(左, 右) {
    const 差 = 取最大 ? 右.对数差 - 左.对数差 : 左.对数差 - 右.对数差;
    if (差 !== 0) {
      return 差;
    }
    // 差异相同（如互为倒数、或都是知乎未收录）时按常用度排，保证结果稳定可复现
    return (
      右.现代 - 左.现代 ||
      右.本书次数 - 左.本书次数 ||
      左.文本.localeCompare(右.文本, 'zh-CN')
    );
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
    现代格.textContent = 格式化万分率(行.现代显示);
    // 本书格：万分之后面跟上真实次数。万分之是相对量，2.8 万字的书和 50 万字的书
    // 同一个数完全不是一回事；括号里的个数让人一眼看出这个差异站在多少字上。
    本书格.textContent = 格式化万分率(行.本书万分之);
    const 个数 = document.createElement('span');
    个数.className = '本书个数';
    个数.textContent = ` (${行.本书次数.toLocaleString('zh-CN')})`;
    本书格.append(个数);
    倍数格.textContent = 格式化倍数(行.比值);
    倍数格.classList.add(行.比值 >= 1 ? '字频偏本书' : '字频偏知乎');
    节点.title =
      `知乎万分之 ${行.现代显示 === undefined ? '未收录' : 行.现代.toFixed(6)}` +
      `（${行.现代名次 === undefined ? '现代字频表未收录' : `第 ${行.现代名次} 名`}）· ` +
      `本书万分之 ${行.本书万分之.toFixed(4)} · 出现 ${行.本书次数.toLocaleString('zh-CN')} 次`;
    节点.append(字格, 现代格, 本书格, 倍数格);
    片段.append(节点);
  }
  表体.replaceChildren(片段);
}

export function 渲染字频差异榜(分析) {
  const { 行列表, 无现代数据字数 } = 计算差异行(分析);
  // 「差异最大」按方向拆成两列：× 是本书远比现代常用，÷ 是本书远比现代少用。
  // 混在一列里时两端会互相挤掉，看不出这本书到底是回避还是偏爱某类字。
  const 偏多 = 排序取榜(行列表.filter((行) => 行.比值 > 1), true).slice(0, 榜长);
  const 偏少 = 排序取榜(行列表.filter((行) => 行.比值 < 1), true).slice(0, 榜长);
  const 最小 = 排序取榜(行列表, false).slice(0, 榜长);
  填列(元素.字频差异偏多列表, 偏多);
  填列(元素.字频差异偏少列表, 偏少);
  填列(元素.字频差异最小列表, 最小);
  元素.字频差异说明.textContent =
    `本书万分之 ÷ 知乎万分之 · 按 |log₂ 倍数| 分向排成三列 · ` +
    `本书列括号内为出现次数 · ` +
    `本书 ${分析.去重汉字数.toLocaleString('zh-CN')} 字中 ` +
    `${行列表.length.toLocaleString('zh-CN')} 字入榜，知乎计 0 次或未收录的 ` +
    `${无现代数据字数.toLocaleString('zh-CN')} 字无数据、不入榜`;
  元素.字频差异偏多标题.textContent = `偏本书 ×${偏多.length}`;
  元素.字频差异偏少标题.textContent = `偏知乎 ÷${偏少.length}`;
  元素.字频差异最小标题.textContent = `差异最小 ${最小.length}`;
}
