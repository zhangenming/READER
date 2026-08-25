import { 汉字模式 } from './常量.js';
import { 创建Uint32Array, 创建Uint8Array, 按需让出主线程 } from './调度.js';
import { 是句内停顿码, 是汉字, 是阅读字符码 } from './文本工具.js';
import { 计算句段负担 } from './排版引擎.js';

// 纯文本预处理管线：从 app.js 应用文本()/载入文本() 拆出。
// 不触碰 DOM 与状态单例，可独立测试；
// 任务有效性由调用方经末位参数 `任务仍然有效` 回调注入（返回 false 即中止）。

export async function 规范化文本(全文, 任务仍然有效) {
  const 输出片段列表 = [];
  const 文本长度 = 全文.length;
  const 文本起点 = 全文.charCodeAt(0) === 0xfeff ? 1 : 0;
  let 上次截取位置 = 文本起点;
  let 时间片开始 = performance.now();

  for (let idx = 文本起点; idx < 文本长度; idx += 1) {
    const 码 = 全文.charCodeAt(idx);
    let 替换终点 = idx + 1;
    let 替换文本 = null;
    if (码 === 0x0d) {
      if (全文.charCodeAt(idx + 1) === 0x0a) {
        替换终点 += 1;
      }
      替换文本 = '\n';
    } else if (码 === 0x3f && idx > 文本起点) {
      let 前字符起点 = idx - 1;
      if (
        前字符起点 > 文本起点 &&
        全文.charCodeAt(前字符起点) >= 0xdc00 &&
        全文.charCodeAt(前字符起点) <= 0xdfff &&
        全文.charCodeAt(前字符起点 - 1) >= 0xd800 &&
        全文.charCodeAt(前字符起点 - 1) <= 0xdbff
      ) {
        前字符起点 -= 1;
      }
      if (汉字模式.test(全文.slice(前字符起点, idx))) {
        替换文本 = '？';
      }
    }

    if (替换文本 !== null) {
      输出片段列表.push(全文.slice(上次截取位置, idx), 替换文本);
      上次截取位置 = 替换终点;
      idx = 替换终点 - 1;
    }

    if ((idx & 4095) === 4095) {
      时间片开始 = await 按需让出主线程(时间片开始);
      if (!任务仍然有效()) {
        return null;
      }
    }
  }

  if (!任务仍然有效()) {
    return null;
  }
  if (输出片段列表.length === 0) {
    return 文本起点 === 0 ? 全文 : 全文.slice(文本起点);
  }
  输出片段列表.push(全文.slice(上次截取位置));
  return 输出片段列表.join('');
}

export async function 创建引文索引(全文, 任务仍然有效) {
  const 引号配对 = new Map([
    ['“', '”'],
    ['‘', '’'],
    ['「', '」'],
    ['『', '』'],
    ['《', '》'],
  ]);
  const 闭引号集合 = new Set(引号配对.values());
  const 待闭合引号栈 = [];
  const 边界列表 = [];
  let 未配对数量 = 0;
  let 时间片开始 = performance.now();

  for (let idx = 0; idx < 全文.length; idx += 1) {
    const 字 = 全文[idx];
    const 目标闭引号 = 引号配对.get(字);
    if (目标闭引号) {
      待闭合引号栈.push({
        内容起点: idx + 字.length,
        目标闭引号,
        原边界数量: 边界列表.length,
      });
    } else if (闭引号集合.has(字)) {
      const 待闭合引号 = 待闭合引号栈[待闭合引号栈.length - 1];
      if (!待闭合引号 || 待闭合引号.目标闭引号 !== 字) {
        未配对数量 += 1;
      } else {
        待闭合引号栈.pop();
        边界列表.length = 待闭合引号.原边界数量;
        if (待闭合引号.内容起点 < idx) {
          边界列表.push(待闭合引号.内容起点, idx);
        }
      }
    }

    if ((idx & 4095) === 4095) {
      时间片开始 = await 按需让出主线程(时间片开始);
      if (!任务仍然有效()) {
        return null;
      }
    }
  }

  未配对数量 += 待闭合引号栈.length;
  const 类型化边界列表 = await 创建Uint32Array(边界列表, 任务仍然有效);
  if (!类型化边界列表) {
    return null;
  }

  return {
    边界列表: 类型化边界列表,
    未配对数量,
  };
}

export async function 整理句子换行(全文, 原引文边界列表, 任务仍然有效) {
  const 句末标点集合 = new Set(['。', '！', '？', '!', '?', '…']);
  const 输出片段列表 = [];
  const 引文边界列表 = [];
  const 缩进起点集合 = new Set();
  let 上次截取位置 = 0;
  let 新增换行数 = 0;
  let 引文idx = 0;
  let 引文起点 = 原引文边界列表[引文idx];
  let 引文终点 = 原引文边界列表[引文idx + 1];
  let 引文包含句末标点 = false;
  let 下次检查位置 = 4096;
  let 时间片开始 = performance.now();

  for (let idx = 0; idx < 全文.length;) {
    if (idx >= 下次检查位置) {
      时间片开始 = await 按需让出主线程(时间片开始);
      if (!任务仍然有效()) {
        return null;
      }
      下次检查位置 = idx + 4096;
    }

    if (
      全文[idx] === '\n' &&
      idx + 1 < 全文.length &&
      全文[idx + 1] !== '\n'
    ) {
      缩进起点集合.add(idx + 1 + 新增换行数);
    }

    if (idx === 引文起点) {
      引文边界列表.push(idx + 新增换行数);
      引文包含句末标点 = false;
    }

    if (idx === 引文终点) {
      引文边界列表.push(idx + 新增换行数);
      idx += 1;
      if (引文包含句末标点) {
        插入换行(idx);
      }
      引文idx += 2;
      引文起点 = 原引文边界列表[引文idx];
      引文终点 = 原引文边界列表[引文idx + 1];
      continue;
    }

    const 码 = 全文.charCodeAt(idx);
    if (
      码 !== 0x3002 &&
      码 !== 0xff01 &&
      码 !== 0xff1f &&
      码 !== 0x21 &&
      码 !== 0x3f &&
      码 !== 0x2026 &&
      !(码 === 0x2e && 全文.startsWith('...', idx))
    ) {
      idx += 1;
      continue;
    }

    let 标点终点 = idx;
    let 找到句末标点 = false;
    while (标点终点 < 全文.length) {
      if (句末标点集合.has(全文[标点终点])) {
        找到句末标点 = true;
        标点终点 += 1;
      } else if (全文.startsWith('...', 标点终点)) {
        找到句末标点 = true;
        do {
          标点终点 += 1;
          if (标点终点 >= 下次检查位置) {
            时间片开始 = await 按需让出主线程(时间片开始);
            if (!任务仍然有效()) {
              return null;
            }
            下次检查位置 = 标点终点 + 4096;
          }
        } while (全文[标点终点] === '.');
      } else {
        break;
      }

      if (标点终点 >= 下次检查位置) {
        时间片开始 = await 按需让出主线程(时间片开始);
        if (!任务仍然有效()) {
          return null;
        }
        下次检查位置 = 标点终点 + 4096;
      }
    }
    if (!找到句末标点) {
      idx += 1;
      continue;
    }

    if (引文终点 !== undefined && idx >= 引文起点 && idx < 引文终点) {
      引文包含句末标点 = true;
    } else {
      插入换行(标点终点);
    }
    idx = 标点终点;
  }

  输出片段列表.push(全文.slice(上次截取位置));
  const 类型化引文边界列表 = await 创建Uint32Array(
    引文边界列表,
    任务仍然有效,
  );
  if (!类型化引文边界列表) {
    return null;
  }
  return {
    文本: 输出片段列表.join(''),
    引文边界列表: 类型化引文边界列表,
    缩进起点集合,
    新增换行数,
  };

  function 插入换行(位置) {
    if (位置 >= 全文.length || 全文[位置] === '\n') {
      return;
    }
    输出片段列表.push(全文.slice(上次截取位置, 位置), '\n');
    上次截取位置 = 位置;
    新增换行数 += 1;
  }
}

// 阶梯段落断点扫描：找出每个「短话段起点」及其阶梯层级。
// 只记录数据（起点偏移升序 + 层级），不改写文本；是否生效由创建行索引决定。
// 规则：句内停顿（，、；：及半角 , ; :）另起一段并 +1 级；
// 句末标点（。！？…）阶梯复原——引文之外归 0，引文之内归引文首段层级
// （与 spk 第一句对齐）；标点簇越过闭引号即引文结束，随引文末段继续爬升；
// 原文段落起点（缩进起点集合）归 0。整理句子换行插入的换行不是段落边界，
// 由换行分支按簇的句末/停顿属性统一记账，避免重复 +1。
export async function 创建阶梯断点索引(
  全文,
  原引文边界列表,
  缩进起点集合,
  任务仍然有效,
) {
  // 顿号（、）仅列举停顿，不参与阶梯断行
  const 停顿标点集合 = new Set(['，', '；', '：', ',', ';', ':']);
  const 句末标点集合 = new Set(['。', '！', '？', '!', '?', '…']);
  const 闭引号集合 = new Set(['”', '’', '」', '』', '》']);
  const 断点标点集合 = new Set([...停顿标点集合, ...句末标点集合]);
  const 起点数组 = [];
  const 层级数组 = [];
  let 当前层级 = 0;
  let 区基层级 = 0; // 当前引文首段所在层级（引文内句末复原的目标）
  let 引文idx = 0;
  let 引文起点 = 原引文边界列表[引文idx];
  let 引文终点 = 原引文边界列表[引文idx + 1];
  let 句末待重置层级 = null; // 簇后紧跟换行时延后到换行分支记账；null = 爬升
  let 下次检查位置 = 4096;
  let 时间片开始 = performance.now();

  for (let idx = 0; idx < 全文.length;) {
    if (idx >= 下次检查位置) {
      时间片开始 = await 按需让出主线程(时间片开始);
      if (!任务仍然有效()) {
        return null;
      }
      下次检查位置 = idx + 4096;
    }

    越过已结束引文(idx);
    if (引文起点 !== undefined && idx === 引文起点) {
      区基层级 = 当前层级;
    }

    const 字 = 全文[idx];
    if (字 === '\n') {
      const 下一个idx = idx + 1;
      if (下一个idx >= 全文.length || 缩进起点集合.has(下一个idx)) {
        当前层级 = 0;
        区基层级 = 0;
      } else if (
        全文[下一个idx] !== '\n' &&
        !断点标点集合.has(全文[下一个idx])
      ) {
        当前层级 = 句末待重置层级 ?? 当前层级 + 1;
        记录断点(下一个idx);
      }
      句末待重置层级 = null;
      idx += 1;
      continue;
    }

    if (断点标点集合.has(字)) {
      const 簇在行首 = idx > 0 && 全文[idx - 1] === '\n';
      const 簇在引文内 =
        引文起点 !== undefined &&
        引文终点 !== undefined &&
        idx >= 引文起点 &&
        idx < 引文终点;
      let 标点终点 = idx;
      let 簇含句末 = false;
      while (标点终点 < 全文.length) {
        const 簇字 = 全文[标点终点];
        if (断点标点集合.has(簇字)) {
          if (句末标点集合.has(簇字)) {
            簇含句末 = true;
          }
          标点终点 += 1;
        } else if (闭引号集合.has(簇字)) {
          标点终点 += 1;
        } else {
          break;
        }
        if (标点终点 >= 下次检查位置) {
          时间片开始 = await 按需让出主线程(时间片开始);
          if (!任务仍然有效()) {
            return null;
          }
          下次检查位置 = 标点终点 + 4096;
        }
      }
      const 簇越出引文 = 引文终点 !== undefined && 标点终点 > 引文终点;
      if (簇在行首) {
        // 行首标点（如 ”，她说 被句子整理断在 ，前）：整行并作新的一段，
        // 层级记在本行起点，避免簇后再断行拆出只有一个标点的行。
        当前层级 = 簇含句末
          ? 句末复原目标(簇在引文内, 簇越出引文)
          : 当前层级 + 1;
        记录断点(idx);
        句末待重置层级 = null;
      } else if (标点终点 < 全文.length && 全文[标点终点] !== '\n') {
        当前层级 = 簇含句末
          ? 句末复原目标(簇在引文内, 簇越出引文)
          : 当前层级 + 1;
        记录断点(标点终点);
        句末待重置层级 = null;
      } else {
        // 簇后紧跟换行或正文结束：换行分支统一爬升或复原，避免重复记账
        句末待重置层级 = 簇含句末
          ? 句末复原目标(簇在引文内, 簇越出引文)
          : null;
      }
      idx = 标点终点;
      continue;
    }

    idx += 1;
  }

  const 类型化起点列表 = await 创建Uint32Array(起点数组, 任务仍然有效);
  if (!类型化起点列表) {
    return null;
  }
  const 类型化层级列表 = await 创建Uint8Array(层级数组, 任务仍然有效);
  if (!类型化层级列表) {
    return null;
  }
  return { 起点列表: 类型化起点列表, 层级列表: 类型化层级列表 };

  function 越过已结束引文(位置) {
    while (引文终点 !== undefined && 引文终点 < 位置) {
      引文idx += 2;
      引文起点 = 原引文边界列表[引文idx];
      引文终点 = 原引文边界列表[引文idx + 1];
    }
  }

  function 句末复原目标(簇在引文内, 簇越出引文) {
    if (!簇在引文内) {
      return 0;
    }
    if (簇越出引文) {
      return 当前层级 + 1;
    }
    return 区基层级;
  }

  function 记录断点(偏移) {
    起点数组.push(偏移);
    层级数组.push(Math.min(当前层级, 255));
  }
}

export async function 构建句段负担索引(全文, 任务仍然有效) {
  const 起点数组 = [];
  const 负担数组 = [];
  let 段起点 = -1;
  let 段长度 = 0;
  let 总负担 = 0;
  let 时间片开始 = performance.now();
  for (let idx = 0; idx < 全文.length; idx += 1) {
    const 码 = 全文.charCodeAt(idx);
    if (是阅读字符码(码)) {
      if (段起点 === -1) {
        段起点 = idx;
      }
      段长度 += 1;
    } else if (是句内停顿码(码) && 段起点 !== -1) {
      const 负担值 = 计算句段负担(段长度);
      起点数组.push(段起点);
      负担数组.push(负担值);
      总负担 += 负担值;
      段起点 = -1;
      段长度 = 0;
    }

    if ((idx & 4095) === 4095) {
      时间片开始 = await 按需让出主线程(时间片开始);
      if (!任务仍然有效()) {
        return null;
      }
    }
  }
  if (段起点 !== -1) {
    const 负担值 = 计算句段负担(段长度);
    起点数组.push(段起点);
    负担数组.push(负担值);
    总负担 += 负担值;
  }

  const 句段起点列表 = await 创建Uint32Array(起点数组, 任务仍然有效);
  if (!句段起点列表) {
    return null;
  }
  const 句段负担前缀和 = new Float64Array(负担数组.length + 1);
  时间片开始 = performance.now();
  for (let idx = 0; idx < 负担数组.length; idx += 1) {
    句段负担前缀和[idx + 1] = 句段负担前缀和[idx] + 负担数组[idx];
    if ((idx & 4095) === 4095) {
      时间片开始 = await 按需让出主线程(时间片开始);
      if (!任务仍然有效()) {
        return null;
      }
    }
  }
  return 任务仍然有效()
    ? { 句段起点列表, 句段负担前缀和, 句段负担总合: 总负担 }
    : null;
}

export async function 统计全文单字(全文, 任务仍然有效) {
  const 汉字频次 = new Map();
  let 已扫描字符数 = 0;
  let 时间片开始 = performance.now();
  for (const 字 of 全文) {
    if (是汉字(字)) {
      汉字频次.set(字, (汉字频次.get(字) ?? 0) + 1);
    }
    已扫描字符数 += 1;
    if ((已扫描字符数 & 4095) === 0) {
      时间片开始 = await 按需让出主线程(时间片开始);
      if (!任务仍然有效()) {
        return null;
      }
    }
  }
  if (!任务仍然有效()) {
    return null;
  }
  return new Set(
    [...汉字频次]
      .filter(function 筛选全文单字([, 频次]) {
        return 频次 === 1;
      })
      .map(function 读取全文单字([字]) {
        return 字;
      }),
  );
}
