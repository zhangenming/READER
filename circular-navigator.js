'use strict';

/**
 * 环形导航（循环列表）
 * ------------------------------------------------------------
 * 给定一组「有序」的关键词，提供首尾相连的循环访问：
 *   - 位于最后一个时，下一个 → 第一个；
 *   - 位于第一个时，上一个 → 最后一个；
 *   - 任意索引越界时自动环绕到另一端（取模归一化）。
 *
 * 适用场景：关键词在正文中的循环跳转、轮播、环形菜单、标签页循环切换等。
 *
 * 设计要点：
 *   1. 索引统一用「非负取模」归一化：((i % n) + n) % n，
 *      这样 -1 会落在 n-1（末位），n 会落在 0（首位），彻底消除越界。
 *   2. 所有导航方法既接受「索引」也接受「关键词本身」，方便在业务里混用。
 *   3. 空列表返回 undefined；单元素列表无论如何跳转都返回它自己。
 */

class 环形导航 {
  /**
   * @param {Array} 关键词列表 有序关键词（任意可比较的值，建议是字符串）
   * @param {object} [选项]
   * @param {(a:any,b:any)=>boolean} [选项.相等] 自定义相等判定，默认用 Object.is
   */
  constructor(关键词列表 = [], 选项 = {}) {
    if (!Array.isArray(关键词列表)) {
      throw new TypeError('环形导航：关键词列表必须是数组');
    }
    this.关键词列表 = [...关键词列表];
    this.相等 = 选项.相等 ?? Object.is;
  }

  /** 关键词数量 */
  get 长度() {
    return this.关键词列表.length;
  }

  /** 是否为空 */
  get 为空() {
    return this.关键词列表.length === 0;
  }

  /**
   * 把任意整数索引归一化到 [0, n) 区间（核心环绕逻辑）。
   * @param {number} 索引 可为负、可越界
   * @returns {number} 归一化后的合法索引
   */
  #归一化(索引) {
    const n = this.关键词列表.length;
    // 先 %n 去掉整圈，再 +n 防负，再 %n 收口到 [0, n)
    return ((索引 % n) + n) % n;
  }

  /**
   * 查找关键词对应的索引（找不到返回 -1）。
   * @param {any} 关键词
   * @returns {number}
   */
  索引(关键词) {
    return this.关键词列表.findIndex((项) => this.相等(项, 关键词));
  }

  /**
   * 把「索引或关键词」统一解析为合法索引。
   * 传入数字视为索引；非数字视为关键词，查不到时按 0 处理（便于链式调用不崩）。
   * @param {number|any} 当前
   * @returns {number}
   */
  #解析(当前) {
    if (typeof 当前 === 'number' && Number.isFinite(当前)) {
      return this.#归一化(当前);
    }
    const i = this.索引(当前);
    return i < 0 ? 0 : i;
  }

  /**
   * 取当前之后的第 1 个（下一个），越界环绕。
   * @param {number|any} 当前 索引或关键词
   * @returns {any} 关键词，空列表返回 undefined
   */
  下一个(当前) {
    if (this.为空) return undefined;
    return this.关键词列表[this.#归一化(this.#解析(当前) + 1)];
  }

  /**
   * 取当前之前的第 1 个（上一个），越界环绕。
   * @param {number|any} 当前 索引或关键词
   * @returns {any}
   */
  上一个(当前) {
    if (this.为空) return undefined;
    const n = this.关键词列表.length;
    return this.关键词列表[this.#归一化(this.#解析(当前) - 1)];
  }

  /**
   * 仅返回「下一个」的索引（不取值），方便维护导航状态。
   * @param {number|any} 当前
   * @returns {number}
   */
  下一个索引(当前) {
    if (this.为空) return -1;
    return this.#归一化(this.#解析(当前) + 1);
  }

  /**
   * 仅返回「上一个」的索引。
   * @param {number|any} 当前
   * @returns {number}
   */
  上一个索引(当前) {
    if (this.为空) return -1;
    return this.#归一化(this.#解析(当前) - 1);
  }

  /**
   * 通用步进：步数可正（向前）可负（向后），任意大小都自动环绕。
   * @param {number|any} 当前
   * @param {number} [步数=1]
   * @returns {any}
   */
  前进(当前, 步数 = 1) {
    if (this.为空) return undefined;
    return this.关键词列表[this.#归一化(this.#解析(当前) + 步数)];
  }

  /**
   * 按任意索引取值（含越界），自动环绕到合法范围。
   * @param {number} 索引
   * @returns {any}
   */
  取第(索引) {
    if (this.为空) return undefined;
    return this.关键词列表[this.#归一化(索引)];
  }

  /**
   * 生成从当前位置出发、按步长依次经过的若干关键词（用于预览即将访问的路径）。
   * @param {number|any} 当前
   * @param {number} [步数=长度] 共取多少个（默认绕一整圈）
   * @param {number} [步长=1]
   * @returns {any[]}
   */
  路径(当前, 步数 = this.长度, 步长 = 1) {
    if (this.为空) return [];
    const 起点 = this.#解析(当前);
    const 结果 = [];
    for (let k = 0; k < 步数; k++) {
      结果.push(this.关键词列表[this.#归一化(起点 + k * 步长)]);
    }
    return 结果;
  }
}

// 同时支持浏览器 <script> 全局与 Node/ESM 导入
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 环形导航 };
} else if (typeof window !== 'undefined') {
  window.环形导航 = 环形导航;
}

// ============================================================
// 自检测试：运行 node circular-navigator.js 即可看到验证结果
// ============================================================
if (typeof require !== 'undefined' && require.main === module) {
  const 关键词 = ['苹果', '香蕉', '橙子', '西瓜', '葡萄'];
  const 环 = new 环形导航(关键词);

  const 用例 = [
    ['长度', 环.长度, 5],
    ['下一个(末位=西瓜/索引3) → 葡萄(0)', 环.下一个(3), '葡萄'],
    ['下一个(索引4=葡萄) 环绕 → 苹果(0)', 环.下一个(4), '苹果'],
    ['上一个(首位=苹果/索引0) 环绕 → 葡萄(4)', 环.上一个(0), '葡萄'],
    ['上一个(索引1=香蕉) → 苹果(0)', 环.上一个(1), '苹果'],
    ['前进(索引0, +2) → 橙子(2)', 环.前进(0, 2), '橙子'],
    ['前进(索引4, -1) 环绕 → 西瓜(3)', 环.前进(4, -1), '西瓜'],
    ['取第(-1) 环绕 → 葡萄(4)', 环.取第(-1), '葡萄'],
    ['取第(7) 环绕 → 橙子(2)', 环.取第(7), '橙子'],
    ['下一个(关键词"葡萄") → 苹果', 环.下一个('葡萄'), '苹果'],
    ['上一个(关键词"苹果") → 葡萄', 环.上一个('苹果'), '葡萄'],
    ['下一个索引(4) → 0', 环.下一个索引(4), 0],
    ['上一个索引(0) → 4', 环.上一个索引(0), 4],
    ['路径(0, 5) 完整一圈', 环.路径(0, 5).join(','), 关键词.join(',')],
    ['路径(3, 3) 从西瓜出发三步(含起点)', 环.路径(3, 3).join(','), '西瓜,葡萄,苹果'],
  ];

  let 通过 = 0;
  for (const [描述, 实际, 期望] of 用例) {
    const 是否相等 = Object.is(实际, 期望);
    是否相等 && 通过++;
    console.log(`${是否相等 ? '✓' : '✗'} ${描述}  => ${JSON.stringify(实际)}${是否相等 ? '' : ` （期望 ${JSON.stringify(期望)}）`}`);
  }

  // 边界：空列表与单元素
  const 空环 = new 环形导航([]);
  const 单环 = new 环形导航(['唯一']);
  console.log(`\n边界：空列表 下一个 → ${空环.下一个(0)}（应为 undefined）`);
  console.log(`边界：单元素 下一个 → ${单环.下一个(0)}（应为 唯一）`);
  console.log(`边界：单元素 上一个 → ${单环.上一个(0)}（应为 唯一）`);

  console.log(`\n结果：${通过}/${用例.length} 通过`);
  if (通过 !== 用例.length) process.exitCode = 1;
}
