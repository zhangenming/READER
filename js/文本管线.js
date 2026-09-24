import { 汉字模式, 自适应句长惩罚上限, 自适应句长惩罚系数, 自适应句长起点 } from './常量.js';
import { 创建Uint32Array, 创建Uint8Array, 按需让出主线程 } from './调度.js';
import { 是句内停顿码, 是汉字, 是阅读字符码 } from './文本工具.js';

// 纯文本预处理管线：从 app.js 应用文本()/载入文本() 拆出。
// 不触碰 DOM 与状态单例，可独立测试；
// 任务有效性由调用方经末位参数 `任务仍然有效` 回调注入（返回 false 即中止）。

// 段负担 = 段长 × 句长惩罚：超过 自适应句长起点 的连续无标点段，每多一个「起点」区间
// 加成 自适应句长惩罚系数（封顶 自适应句长惩罚上限）。短段（对话、短语）无惩罚。
// （原在 排版引擎.js，因唯一消费者是本模块且排版引擎依赖闭包含 DOM/状态，
//   下沉到此处让管线保持可脱离浏览器独立加载。）
export function 计算句段负担(段长度) {
  if (段长度 <= 自适应句长起点) {
    return 段长度;
  }
  const 惩罚 =
    1 + 自适应句长惩罚系数 * ((段长度 - 自适应句长起点) / 自适应句长起点);
  return 段长度 * Math.min(自适应句长惩罚上限, 惩罚);
}

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

// 被「我说，」这类插入语切开的连续对话，前后两段引文视同一段，底色不切换。
// 判定：前段以句内停顿收尾，且两段之间没有句末标点、也没有换行。
// 奇偶按片段序号索引而非偏移，故整理句子换行必须逐对原样搬运边界列表，两者才不会错位。
const 引文延续停顿集合 = new Set(['，', '、', '；', ',', ';']);
const 引文断开正则 = /[\n。！？!?…]/;

function 计算引文底色奇偶(全文, 边界列表) {
  const 片段数 = 边界列表.length / 2;
  const 奇偶列表 = new Uint8Array(片段数);
  let 奇偶 = 0;
  for (let 片段idx = 0; 片段idx < 片段数; 片段idx += 1) {
    if (片段idx > 0) {
      const 前段终点 = 边界列表[片段idx * 2 - 1];
      const 本段起点 = 边界列表[片段idx * 2];
      const 间隔 = 全文.slice(前段终点, 本段起点);
      const 是同一段话 =
        引文延续停顿集合.has(全文[前段终点 - 1]) && !引文断开正则.test(间隔);
      if (!是同一段话) 奇偶 ^= 1;
    }
    奇偶列表[片段idx] = 奇偶;
  }
  return 奇偶列表;
}

// 引号未闭合不得越段生效：原文漏了下引号时，栈要一直等到全书下一个同型闭引号才闭合，
// 中间所有段落都被误判为引文（实测最长一条跨 22 万字）。段落结束仍有待闭合引号即就地闭合，
// 把误判限制在一个自然段内。下一段以同型开引号续起者除外——中文多段引文（一段一开引号、
// 只在末段收尾）是常规写法，照常连成一条，不做拆分；末段的闭引号一到即整条收尾。
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
  let 段号 = 0;
  let 时间片开始 = performance.now();

  // 整栈就地闭合：只留最外层一条边界，其内嵌套引号本就被外层底色覆盖，一并丢弃。
  function 就地闭合(闭合位置) {
    if (待闭合引号栈.length === 0) {
      return;
    }
    未配对数量 += 待闭合引号栈.length;
    const 最外层 = 待闭合引号栈[0];
    边界列表.length = 最外层.原边界数量;
    if (最外层.内容起点 < 闭合位置) {
      边界列表.push(最外层.内容起点, 闭合位置);
    }
    待闭合引号栈.length = 0;
  }

  for (let idx = 0; idx < 全文.length; idx += 1) {
    const 字 = 全文[idx];
    const 目标闭引号 = 引号配对.get(字);
    if (目标闭引号) {
      待闭合引号栈.push({
        内容起点: idx + 字.length,
        目标闭引号,
        原边界数量: 边界列表.length,
        段号,
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
        // 末段收尾：闭引号与栈底同型、且栈底是更早段落开的，说明这条多段引文刚收尾。
        // 不同型（如引文内的‘青城四秀’）只是段中嵌套，不算结束。
        if (
          待闭合引号栈.length > 0 &&
          待闭合引号.目标闭引号 === 待闭合引号栈[0].目标闭引号 &&
          待闭合引号栈[0].段号 < 段号
        ) {
          就地闭合(idx);
        }
      }
    } else if (字 === '\n') {
      段号 += 1;
      if (待闭合引号栈.length > 0) {
        let 下段首字idx = idx + 1;
        while (下段首字idx < 全文.length && /\s/.test(全文[下段首字idx])) {
          下段首字idx += 1;
        }
        const 续起目标 = 引号配对.get(全文[下段首字idx]);
        const 是续段 =
          续起目标 !== undefined &&
          待闭合引号栈.some((项) => 项.目标闭引号 === 续起目标);
        if (!是续段) {
          就地闭合(idx);
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

  就地闭合(全文.length);
  const 类型化边界列表 = await 创建Uint32Array(边界列表, 任务仍然有效);
  if (!类型化边界列表) {
    return null;
  }

  return {
    边界列表: 类型化边界列表,
    底色奇偶列表: 计算引文底色奇偶(全文, 边界列表),
    未配对数量,
  };
}

export async function 整理句子换行(
  全文,
  原引文边界列表,
  任务仍然有效,
  原章节列表 = [],
) {
  const 章节列表 = [];
  let 章节idx = 0;
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
  映射章节起点(Infinity);
  return {
    文本: 输出片段列表.join(''),
    章节列表,
    引文边界列表: 类型化引文边界列表,
    缩进起点集合,
    新增换行数,
  };

  function 插入换行(位置) {
    // 引文兜底就地闭合会把终点落在换行符上，此时引文后一位已是行首，再插即多空行。
    if (
      位置 >= 全文.length ||
      全文[位置] === '\n' ||
      (位置 > 0 && 全文[位置 - 1] === '\n')
    ) {
      return;
    }
    映射章节起点(位置);
    输出片段列表.push(全文.slice(上次截取位置, 位置), '\n');
    上次截取位置 = 位置;
    新增换行数 += 1;
  }

  function 映射章节起点(边界) {
    // 插入点与标题起点相同，新增换行也位于标题之前，必须在下一次映射时计入。
    while (章节idx < 原章节列表.length && 原章节列表[章节idx].偏移 < 边界) {
      const 章节 = 原章节列表[章节idx++];
      章节列表.push({ ...章节, 偏移: 章节.偏移 + 新增换行数 });
    }
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
  // BMP 汉字用 64K 频次数组直查，避免 for...of 迭代器的每字符字符串分配与 Map 哈希；
  // 扩展平面（代理对）与三区间外的罕用 Han 字（〇 々 〡 等）回退 Map，语义与 是汉字 一致。
  // 实测百万字文本 62ms → 6ms（tmp/bench-hotpaths.mjs）。
  const BMP频次 = new Uint32Array(0x10000);
  const 扩展频次 = new Map();
  const 文本长度 = 全文.length;
  let 时间片开始 = performance.now();
  for (let idx = 0; idx < 文本长度; idx += 1) {
    const 码 = 全文.charCodeAt(idx);
    if (
      (码 >= 0x3400 && 码 <= 0x4dbf) ||
      (码 >= 0x4e00 && 码 <= 0x9fff) ||
      (码 >= 0xf900 && 码 <= 0xfaff)
    ) {
      BMP频次[码] += 1;
    } else if (码 >= 0xd800 && 码 <= 0xdbff && idx + 1 < 文本长度) {
      const 低位 = 全文.charCodeAt(idx + 1);
      if (低位 >= 0xdc00 && 低位 <= 0xdfff) {
        const 码点 = 0x10000 + ((码 - 0xd800) << 10) + (低位 - 0xdc00);
        if (汉字模式.test(String.fromCodePoint(码点))) {
          扩展频次.set(码点, (扩展频次.get(码点) ?? 0) + 1);
        }
        idx += 1;
      }
      // 孤立高代理：\p{Script=Han} 不匹配，原实现同样不计入
    } else if (码 > 0x7f && 汉字模式.test(String.fromCharCode(码))) {
      BMP频次[码] += 1;
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
  const 单字 = new Set();
  for (let 码 = 0x80; 码 < 0x10000; 码 += 1) {
    if (BMP频次[码] === 1) {
      单字.add(String.fromCharCode(码));
    }
  }
  for (const [码点, 频次] of 扩展频次) {
    if (频次 === 1) {
      单字.add(String.fromCodePoint(码点));
    }
  }
  return 单字;
}
