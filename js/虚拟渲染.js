import {
  不渲染引号集合,
  关系连词类别映射,
  显示引号过滤模式,
  当前命中位置提示时长,
} from './常量.js';
import {
  是安全字素码,
  是数字字素,
  是方块字素码,
  是西文字素,
  是西文范围,
  查找字素终点,
} from './文本工具.js';
import { 元素, 状态 } from './状态.js';
import { 是混合盒命中 } from './排版引擎.js';
import { 获取关键词配色, 查找首个相交命中 } from './搜索.js';

export function 渲染可见行(强制渲染 = false, 视口高度 = null) {
  if (!状态.行起点列表.length) {
    return;
  }

  const 缓冲行数 = 12;
  const 可见起点 = Math.max(
    0,
    Math.floor(元素.滚动容器.scrollTop / 状态.行高) - 缓冲行数,
  );
  const 实际视口高度 = 视口高度 ?? 元素.滚动容器.clientHeight;
  const 可见终点 = Math.min(
    状态.行起点列表.length,
    Math.ceil((元素.滚动容器.scrollTop + 实际视口高度) / 状态.行高) + 缓冲行数,
  );

  if (!强制渲染 && 可见起点 === 状态.渲染起点 && 可见终点 === 状态.渲染终点) {
    return;
  }

  const 原渲染起点 = 状态.渲染起点;
  const 原渲染终点 = 状态.渲染终点;
  const 有重叠范围 =
    !强制渲染 && 可见起点 < 原渲染终点 && 可见终点 > 原渲染起点;

  if (有重叠范围) {
    const 原渲染行数 = 原渲染终点 - 原渲染起点;
    if (元素.可见内容.children.length !== 原渲染行数) {
      throw new Error(
        `虚拟列表 DOM 行数 ${元素.可见内容.children.length} 与渲染状态 ${原渲染行数} 不一致`,
      );
    }

    const 保留起点 = Math.max(可见起点, 原渲染起点);
    const 保留终点 = Math.min(可见终点, 原渲染终点);
    const 前置片段 =
      可见起点 < 保留起点 ? 创建行片段(可见起点, 保留起点) : null;
    const 后置片段 =
      保留终点 < 可见终点 ? 创建行片段(保留终点, 可见终点) : null;

    for (let idx = 原渲染起点; idx < 保留起点; idx += 1) {
      元素.可见内容.firstElementChild.remove();
    }
    for (let idx = 保留终点; idx < 原渲染终点; idx += 1) {
      元素.可见内容.lastElementChild.remove();
    }
    if (前置片段) {
      元素.可见内容.prepend(前置片段);
    }
    if (后置片段) {
      元素.可见内容.append(后置片段);
    }
  } else {
    元素.可见内容.replaceChildren(创建行片段(可见起点, 可见终点));
  }

  // 虚拟窗口只做合成位移，避免逐行更新 top 触发布局与 Layout Shift。
  元素.可见内容.style.transform = `translateY(${可见起点 * 状态.行高}px)`;
  状态.渲染起点 = 可见起点;
  状态.渲染终点 = 可见终点;

  function 创建行片段(创建起点, 创建终点) {
    const 片段 = document.createDocumentFragment();
    const 关键词游标列表 = 状态.关键词列表.map(function 创建关键词游标(关键词) {
      return {
        关键词,
        idx: 查找首个相交命中(关键词, 状态.行起点列表[创建起点]),
      };
    });
    let 引文idx = 查找首个未结束引文(状态.行起点列表[创建起点]);

    for (let idx = 创建起点; idx < 创建终点; idx += 1) {
      const 行起点 = 状态.行起点列表[idx];
      const 行终点 = 状态.行终点列表[idx];
      const 行文本 = 状态.文本.slice(行起点, 行终点);
      const 本行引文跨行状态 = new Map();
      const 行元素 = document.createElement('div');
      行元素.className = '正文行';
      const 段落idx = 状态.行段落索引[idx];
      if (行文本) {
        行元素.classList.add(段落idx % 2 === 0 ? '段落底色一' : '段落底色二');
      } else {
        const 上一行idx = idx - 1;
        if (
          上一行idx >= 0 &&
          状态.行终点列表[上一行idx] > 状态.行起点列表[上一行idx]
        ) {
          行元素.classList.add(
            状态.行段落索引[上一行idx] % 2 === 0
              ? '上接段落底色一'
              : '上接段落底色二',
          );
        }
        const 下一行idx = idx + 1;
        if (
          下一行idx < 状态.行起点列表.length &&
          状态.行终点列表[下一行idx] > 状态.行起点列表[下一行idx]
        ) {
          行元素.classList.add(
            状态.行段落索引[下一行idx] % 2 === 0
              ? '下接段落底色一'
              : '下接段落底色二',
          );
        }
      }
      行元素.dataset.start = String(行起点);
      行元素.dataset.end = String(行终点);
      // 折行句：同一逻辑行（原文一行 = 一句话）占了多个显示行（前后相邻行逻辑索引相同），
      // 每个显示行加 .折行句，行首留白里画竖条表明同属一句；
      // 再按组内位置加 .折行句首 / .折行句尾，样式据此把上下各行的竖条
      // 连成一整根（首行上端、尾行下端各留空白，中间无缝相接）。
      const 本行逻辑idx = 状态.行逻辑索引[idx];
      const 承接上行 = idx > 0 && 状态.行逻辑索引[idx - 1] === 本行逻辑idx;
      const 延续下行 =
        idx + 1 < 状态.行逻辑索引.length &&
        状态.行逻辑索引[idx + 1] === 本行逻辑idx;
      if (承接上行 || 延续下行) {
        行元素.classList.add('折行句');
        if (!承接上行) {
          行元素.classList.add('折行句首');
        }
        if (!延续下行) {
          行元素.classList.add('折行句尾');
        }
      }
      行元素.setAttribute(
        'aria-label',
        行文本.replace(显示引号过滤模式, '') || '空行',
      );
      // 阶梯段落：按行索引记录的层级在行首补缩进（每级 2em，与测量宽度扣减一致）。
      const 本行阶梯层 = 状态.行阶梯索引 ? 状态.行阶梯索引[idx] : 0;
      if (本行阶梯层 > 0 && 行文本) {
        行元素.style.paddingLeft = `calc(var(--正文左留白, 0px) + ${
          本行阶梯层 * 2
        }em)`;
      }

      for (const 关键词游标 of 关键词游标列表) {
        while (
          关键词游标.idx < 关键词游标.关键词.命中位置.length &&
          关键词游标.关键词.命中位置[关键词游标.idx] +
            关键词游标.关键词.文本.length <=
            行起点
        ) {
          关键词游标.idx += 1;
        }
      }

      const 片段边界 = 收集片段边界(行起点, 行终点, 行文本, 关键词游标列表);
      for (let 边界idx = 0; 边界idx < 片段边界.length - 1; 边界idx += 1) {
        const 字起点 = 片段边界[边界idx];
        const 字终点 = 片段边界[边界idx + 1];
        const 原字文本 = 状态.文本.slice(字起点, 字终点);
        const 字文本 = 原字文本.replace(显示引号过滤模式, '');
        if (!字文本) {
          continue;
        }
        const 字命中详情 = [];
        const 字元素 = document.createElement('span');
        字元素.className = '字';
        字元素.classList.toggle('西文', 是西文字素(字文本));
        字元素.classList.toggle('数字', 是数字字素(字文本));
        字元素.classList.toggle('代词字母', '我他你'.includes(字文本));
        字元素.dataset.start = String(字起点);
        字元素.dataset.end = String(字终点);
        字元素.setAttribute('aria-hidden', 'true');
        if (字文本 === '的' || 字文本 === '了') {
          const 特殊字形 = document.createElement('span');
          特殊字形.className = '特殊字形';
          特殊字形.textContent = 字文本;
          字元素.append(特殊字形);
        } else {
          // 显示层替换：正文「我」渲染为 W、「他」渲染为 T、「你」渲染为 N
          // （书本 .txt 原文件与 状态.文本 均不变，仅可见字形）。
          字元素.textContent =
            字文本 === '我'
              ? 'W'
              : 字文本 === '他'
                ? 'T'
                : 字文本 === '你'
                  ? 'N'
                  : 字文本;
        }
        if (状态.全文单字.has(字文本)) {
          const 全文单字标记 = document.createElement('span');
          全文单字标记.className = '全文单字标记';
          全文单字标记.setAttribute('aria-hidden', 'true');
          字元素.append(全文单字标记);
          行元素.classList.add('含全文单字');
        }

        // 「不」字：叠加浅黑色 ✕ 遮罩（见 .字.否定叉 样式）；
        // 但「不过」是凝固连词而非否定，排除其首字以免误标。
        if (字文本 === '不' && 状态.文本[字终点] !== '过') {
          字元素.classList.add('否定叉');
          const 否定叉标记 = document.createElement('span');
          否定叉标记.className = '否定叉标记';
          字元素.append(否定叉标记);
        }

        // 人称代词：单字、指定复数及「自己、本人」使用同一醒目样式
        if (
          '你我您他她它咱'.includes(字文本) ||
          (字文本 === '们' &&
            '你我您他她它咱'.includes(状态.文本[字起点 - 1])) ||
          (字文本 === '自' && 状态.文本[字终点] === '己') ||
          (字文本 === '己' && 状态.文本[字起点 - 1] === '自') ||
          (字文本 === '本' && 状态.文本[字终点] === '人') ||
          (字文本 === '人' && 状态.文本[字起点 - 1] === '本')
        ) {
          字元素.classList.add('人称代词');
        }

        if (
          '已经但是却又而且虽然所以如果即使也则乃既甚最更太很还着仍只才就便连或因其之把被者该必仅刚正每在为跟使将定再至于乎这那怎么竟都和亦'.includes(
            字文本,
          )
        ) {
          字元素.classList.add('关系字特殊');
          const 关系字标记 = document.createElement('span');
          关系字标记.className = '关系字标记';
          关系字标记.setAttribute('aria-hidden', 'true');
          字元素.append(关系字标记);
        }

        // 关系连词：只查询当前字与前后邻字组成的两个词，避免每个可见字扫描整张词表。
        const 后接关系类别 = 关系连词类别映射.get(
          字文本 + (状态.文本[字终点] ?? ''),
        );
        if (后接关系类别) {
          字元素.classList.add(...后接关系类别, '关系词首字');
        }
        const 前接关系类别 = 关系连词类别映射.get(
          (状态.文本[字起点 - 1] ?? '') + 字文本,
        );
        if (前接关系类别) {
          字元素.classList.add(...前接关系类别);
        }

        while (
          引文idx < 状态.引文边界列表.length &&
          状态.引文边界列表[引文idx + 1] < 字起点
        ) {
          引文idx += 2;
        }
        if (引文idx < 状态.引文边界列表.length) {
          const 引文起点 = 状态.引文边界列表[引文idx];
          const 引文终点 = 状态.引文边界列表[引文idx + 1];
          const 是引文内容 = 引文起点 <= 字起点 && 字终点 <= 引文终点;
          if (是引文内容) {
            let 引文跨行状态 = 本行引文跨行状态.get(引文idx);
            if (!引文跨行状态) {
              const 上一行起点 = idx > 0 ? 状态.行起点列表[idx - 1] : 行起点;
              const 上一行终点 = idx > 0 ? 状态.行终点列表[idx - 1] : 行起点;
              const 下一行起点 =
                idx + 1 < 状态.行起点列表.length
                  ? 状态.行起点列表[idx + 1]
                  : 行终点;
              const 下一行终点 =
                idx + 1 < 状态.行终点列表.length
                  ? 状态.行终点列表[idx + 1]
                  : 行终点;
              引文跨行状态 = {
                承接上行:
                  idx > 0 &&
                  引文起点 < 行起点 &&
                  引文范围含可见内容(
                    Math.max(引文起点, 上一行起点),
                    Math.min(引文终点, 上一行终点),
                  ),
                延续下行:
                  idx + 1 < 状态.行起点列表.length &&
                  引文终点 > 行终点 &&
                  引文范围含可见内容(
                    Math.max(引文起点, 下一行起点),
                    Math.min(引文终点, 下一行终点),
                  ),
                首个字元素: null,
                末个字元素: null,
              };
              本行引文跨行状态.set(引文idx, 引文跨行状态);
            }
            字元素.classList.add('引文内容');
            字元素.classList.add(
              (引文idx / 2) % 2 === 0 ? '引文底色一' : '引文底色二',
            );
            字元素.classList.toggle('引文承接上行', 引文跨行状态.承接上行);
            字元素.classList.toggle('引文延续下行', 引文跨行状态.延续下行);
            引文跨行状态.首个字元素 ??= 字元素;
            引文跨行状态.末个字元素 = 字元素;
          } else if (字终点 === 引文起点 || 字起点 === 引文终点) {
            字元素.classList.add('引文引号');
          }
        }

        for (const 关键词游标 of 关键词游标列表) {
          const { 关键词 } = 关键词游标;
          while (
            关键词游标.idx < 关键词.命中位置.length &&
            关键词.命中位置[关键词游标.idx] + 关键词.文本.length <= 字起点
          ) {
            关键词游标.idx += 1;
          }

          let 检查命中idx = 关键词游标.idx;
          while (
            检查命中idx < 关键词.命中位置.length &&
            关键词.命中位置[检查命中idx] < 字终点
          ) {
            const 命中起点 = 关键词.命中位置[检查命中idx];
            const 命中终点 = 命中起点 + 关键词.文本.length;
            if (命中终点 > 字起点) {
              字命中详情.push({
                关键词,
                命中idx: 检查命中idx,
                命中起点,
                命中终点,
              });
            }
            检查命中idx += 1;
          }
        }

        if (字命中详情.length) {
          const 当前关键词命中 = 字命中详情.find(
            function 找到当前关键词命中(命中详情) {
              return 命中详情.关键词.id === 状态.当前关键词id;
            },
          );
          const 当前项命中 = 字命中详情.find(function 找到当前项命中(命中详情) {
            return (
              命中详情.关键词.id === 状态.当前关键词id &&
              命中详情.命中idx === 命中详情.关键词.当前命中idx
            );
          });
          const 点击命中 = 当前项命中 || 当前关键词命中 || 字命中详情[0];

          const 主配色 = 获取关键词配色(点击命中.关键词);
          字元素.classList.add('命中');
          字元素.classList.toggle(
            '命中起点',
            字命中详情.some((命中详情) => 命中详情.命中起点 === 字起点),
          );
          字元素.classList.toggle(
            '命中终点',
            字命中详情.some((命中详情) => 命中详情.命中终点 === 字终点),
          );
          字元素.classList.toggle('当前关键词组', Boolean(当前关键词命中));
          字元素.classList.toggle('当前命中', Boolean(当前项命中));
          if (当前项命中) {
            行元素.classList.add('含当前命中');
            字元素.classList.toggle(
              '当前命中起点',
              当前项命中.命中起点 === 字起点,
            );
            字元素.classList.toggle(
              '当前命中终点',
              当前项命中.命中终点 === 字终点,
            );
            字元素.classList.toggle(
              '逐字环',
              是混合盒命中(当前项命中.命中起点, 当前项命中.命中终点),
            );
          }
          const 是悬停关键词 = 点击命中.关键词.id === 状态.悬停关键词id;
          const 是悬停命中 =
            是悬停关键词 && 点击命中.命中idx === 状态.悬停命中idx;
          字元素.classList.toggle('同组悬停', 是悬停关键词);
          字元素.classList.toggle('悬停命中', 是悬停命中);
          字元素.classList.toggle(
            '悬停让位',
            状态.悬停关键词id !== null && 当前关键词命中 && !是悬停关键词,
          );
          字元素.classList.toggle(
            '悬停隐藏当前框',
            状态.悬停关键词id !== null && 当前项命中,
          );
          if (是悬停命中) {
            行元素.classList.add('含悬停命中');
          }
          字元素.classList.toggle(
            '全文唯一',
            字命中详情.some(function 是全文唯一命中(命中详情) {
              return 命中详情.关键词.命中位置.length === 1;
            }),
          );
          if (当前关键词命中) {
            const 当前命中idx = 当前关键词命中.命中idx;
            const 最后命中idx = 当前关键词命中.关键词.命中位置.length - 1;
            if (当前命中idx === 0 && 当前关键词命中.命中起点 === 字起点) {
              字元素.dataset.groupStart = '';
            }
            if (
              当前命中idx === 最后命中idx &&
              当前关键词命中.命中终点 === 字终点
            ) {
              字元素.dataset.groupEnd = '';
            }
          }
          if (
            点击命中.关键词.命中位置.length > 1 &&
            点击命中.命中终点 === 字终点
          ) {
            字元素.dataset.hitPosition = `${点击命中.命中idx + 1}/${点击命中.关键词.命中位置.length}`;
            字元素.classList.toggle(
              '显示命中位置',
              Boolean(当前项命中 && 状态.当前命中位置计时器),
            );
          }
          字元素.dataset.keywordId = String(点击命中.关键词.id);
          字元素.dataset.hitIndex = String(点击命中.命中idx);
          if (
            点击命中.关键词.命中位置.length > 1 &&
            点击命中.命中起点 === 字起点 &&
            点击命中.命中idx === 0
          ) {
            const 首处标记 = document.createElement('span');
            首处标记.className = '首处标记';
            首处标记.textContent = '◀';
            首处标记.setAttribute('aria-hidden', 'true');
            字元素.append(首处标记);
          }
          if (
            点击命中.关键词.命中位置.length > 1 &&
            点击命中.命中终点 === 字终点 &&
            点击命中.命中idx === 点击命中.关键词.命中位置.length - 1
          ) {
            const 末处标记 = document.createElement('span');
            末处标记.className = '末处标记';
            末处标记.textContent = '▶';
            末处标记.setAttribute('aria-hidden', 'true');
            字元素.append(末处标记);
          }
          字元素.style.setProperty('--命中背景', 主配色.浅色);
          字元素.style.setProperty('--命中当前色', 主配色.深色);
        }

        行元素.append(字元素);
      }

      for (const 引文跨行状态 of 本行引文跨行状态.values()) {
        if (!引文跨行状态.承接上行) {
          引文跨行状态.首个字元素.classList.add('引文起点');
        }
        if (!引文跨行状态.延续下行) {
          引文跨行状态.末个字元素.classList.add('引文终点');
        }
      }

      片段.append(行元素);
    }

    return 片段;

    function 引文范围含可见内容(范围起点, 范围终点) {
      for (let idx = 范围起点; idx < 范围终点; idx += 1) {
        const 字 = 状态.文本[idx];
        if (字 !== '\n' && 字 !== '\r' && !不渲染引号集合.has(字)) {
          return true;
        }
      }
      return false;
    }
  }

  function 收集片段边界(行起点, 行终点, 行文本, 关键词游标列表) {
    const 边界列表 = [行起点];
    const 行长度 = 行文本.length;
    let 字素起点 = 0;
    let 聚合片段起点 = -1;
    let 聚合片段是西文 = false;
    while (字素起点 < 行长度) {
      const 码 = 行文本.charCodeAt(字素起点);
      let 字素终点;
      if (
        是安全字素码(码) &&
        (字素起点 + 1 >= 行长度 ||
          是安全字素码(行文本.charCodeAt(字素起点 + 1)))
      ) {
        字素终点 = 字素起点 + 1;
      } else {
        字素终点 = 查找字素终点(行文本, 字素起点);
      }
      const 当前是西文 = 是西文范围(行文本, 字素起点, 字素终点);
      if (!当前是西文 && 是方块字素码(码)) {
        提交聚合片段(字素起点);
        边界列表.push(行起点 + 字素终点);
      } else if (聚合片段起点 === -1) {
        聚合片段起点 = 字素起点;
        聚合片段是西文 = 当前是西文;
      } else if (聚合片段是西文 !== 当前是西文) {
        提交聚合片段(字素起点);
        聚合片段起点 = 字素起点;
        聚合片段是西文 = 当前是西文;
      }
      字素起点 = 字素终点;
    }
    提交聚合片段(行长度);
    return 边界列表;

    function 提交聚合片段(片段终点) {
      if (聚合片段起点 === -1) {
        return;
      }
      const 片段绝对起点 = 行起点 + 聚合片段起点;
      const 片段绝对终点 = 行起点 + 片段终点;
      聚合片段起点 = -1;

      let 命中切分列表 = null;
      for (const 关键词游标 of 关键词游标列表) {
        const { 关键词 } = 关键词游标;
        for (
          let 检查命中idx = 关键词游标.idx;
          检查命中idx < 关键词.命中位置.length &&
          关键词.命中位置[检查命中idx] < 片段绝对终点;
          检查命中idx += 1
        ) {
          const 命中起点 = 关键词.命中位置[检查命中idx];
          const 命中终点 = 命中起点 + 关键词.文本.length;
          if (命中起点 > 片段绝对起点) {
            (命中切分列表 ??= []).push(命中起点);
          }
          if (命中终点 > 片段绝对起点 && 命中终点 < 片段绝对终点) {
            (命中切分列表 ??= []).push(命中终点);
          }
        }
      }

      if (命中切分列表) {
        命中切分列表.sort((左切分, 右切分) => 左切分 - 右切分);
        for (const 切分 of 命中切分列表) {
          if (切分 !== 边界列表[边界列表.length - 1]) {
            边界列表.push(切分);
          }
        }
      }
      边界列表.push(片段绝对终点);
    }
  }

  function 查找首个未结束引文(文本偏移) {
    let 左边界 = 0;
    let 右边界 = 状态.引文边界列表.length / 2;
    while (左边界 < 右边界) {
      const idx = (左边界 + 右边界) >>> 1;
      if (状态.引文边界列表[idx * 2 + 1] < 文本偏移) {
        左边界 = idx + 1;
      } else {
        右边界 = idx;
      }
    }
    return 左边界 * 2;
  }
}

// 当前命中项的「当前序号/总数」徽标：短暂显示后自动隐藏。
export function 显示当前命中位置提示() {
  for (const 字元素 of 元素.可见内容.querySelectorAll('.字.显示命中位置')) {
    字元素.classList.remove('显示命中位置');
  }
  window.clearTimeout(状态.当前命中位置计时器);
  状态.当前命中位置计时器 = window.setTimeout(function 隐藏当前命中位置提示() {
    状态.当前命中位置计时器 = 0;
    for (const 字元素 of 元素.可见内容.querySelectorAll('.字.显示命中位置')) {
      字元素.classList.remove('显示命中位置');
    }
  }, 当前命中位置提示时长);
  for (const 字元素 of 元素.可见内容.querySelectorAll(
    '.字.命中.当前命中[data-hit-position]',
  )) {
    字元素.classList.add('显示命中位置');
  }
}

export function 设置文本(元素, 文本) {
  if (元素.textContent !== 文本) {
    元素.textContent = 文本;
  }
}

export function 设置属性(元素, 名称, 值) {
  if (元素.getAttribute(名称) !== 值) {
    元素.setAttribute(名称, 值);
  }
}
