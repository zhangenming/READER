import assert from 'node:assert/strict';

const 滚动容器 = { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
const 空元素 = new Proxy(
  {},
  {
    get(目标, 键) {
      if (键 === 'getContext') {
        return function 获取画布上下文() {
          return {};
        };
      }
      if (键 === 'append') {
        return function 追加元素() {};
      }
      return 空元素;
    },
  },
);
const 存储 = new Map();
const 写入记录 = [];
const 错误日志 = [];
const 警告日志 = [];
let 读取错误 = null;
let 写入失败键 = null;

globalThis.document = {
  baseURI: 'http://127.0.0.1/',
  documentElement: 空元素,
  body: 空元素,
  querySelector(选择器) {
    return 选择器 === '#滚动容器' ? 滚动容器 : 空元素;
  },
  createElement() {
    return 空元素;
  },
};
globalThis.window = {
  innerWidth: 800,
  clearTimeout() {},
  setTimeout() {
    return 1;
  },
};
globalThis.getComputedStyle = function 获取计算样式() {
  return {
    getPropertyValue() {
      return '';
    },
  };
};
globalThis.localStorage = {
  getItem(键) {
    if (读取错误) {
      throw 读取错误;
    }
    return 存储.has(键) ? 存储.get(键) : null;
  },
  setItem(键, 值) {
    写入记录.push({ 键, 值 });
    if (键 === 写入失败键) {
      throw new Error(`模拟写入失败：${键}`);
    }
    存储.set(键, String(值));
  },
};

const 原错误输出 = console.error;
const 原警告输出 = console.warn;
console.error = function 记录错误(...参数) {
  错误日志.push(参数);
};
console.warn = function 记录警告(...参数) {
  警告日志.push(参数);
};

const [持久化模块, 状态模块, 常量模块, 自动滚动模块, 滚动时段模块, 可见时段模块] =
  await Promise.all([
    import('../js/持久化.js'),
    import('../js/状态.js'),
    import('../js/常量.js'),
    import('../js/自动滚动.js'),
    import('../js/滚动时段.js'),
    import('../js/可见时段.js'),
  ]);
const { 读取持久化数据, 读取持久化数据或新建, 保存持久化状态 } = 持久化模块;
const { 状态, 统计, 本地日期串 } = 状态模块;
const { 持久化键, 旧持久化键, 损坏持久化备份键 } = 常量模块;
const { 载入自动滚动统计 } = 自动滚动模块;
const { 记录滚动时段, 载入滚动时段统计 } = 滚动时段模块;
const { 记录可见时段, 载入可见时段统计 } = 可见时段模块;

验证读取('无持久化数据', {}, { 当前文件名: '', 文本状态: {} });
验证读取(
  '合法 v1 数据',
  {
    [旧持久化键]: JSON.stringify({
      文件名: '旧书.txt',
      阅读偏移: 12,
    }),
  },
  {
    当前文件名: '旧书.txt',
    文本状态: { '旧书.txt': { 文件名: '旧书.txt', 阅读偏移: 12 } },
  },
);
验证读取(
  '非法 v1 文件名',
  {
    [旧持久化键]: JSON.stringify({ 文件名: '../旧书.txt' }),
  },
  { 当前文件名: '', 文本状态: {} },
);
验证读取(
  'v2 数据优先',
  {
    [旧持久化键]: JSON.stringify({ 文件名: '旧书.txt' }),
    [持久化键]: 创建v2数据('新书.txt'),
  },
  {
    当前文件名: '新书.txt',
    文本状态: { '新书.txt': { 文件名: '新书.txt' } },
  },
);

设置存储({ [持久化键]: 创建v2数据('缓存甲.txt') });
const 缓存甲 = 读取持久化数据();
assert.strictEqual(读取持久化数据(), 缓存甲, '相同原始串应复用解析结果');
存储.set(持久化键, 创建v2数据('缓存乙.txt'));
const 缓存乙 = 读取持久化数据();
assert.notStrictEqual(缓存乙, 缓存甲, '原始串变化后缓存必须失效');
assert.equal(缓存乙.当前文件名, '缓存乙.txt');
console.log('✓ v2 解析缓存按原始串失效');

设置存储({ [持久化键]: '{损坏甲' });
错误日志.length = 0;
const 损坏甲回退 = 读取持久化数据或新建();
assert.strictEqual(读取持久化数据或新建(), 损坏甲回退);
assert.equal(错误日志.length, 1, '同一损坏串只应记录一次错误');
损坏甲回退.当前文件名 = '不应复用.txt';
存储.set(持久化键, '{损坏乙');
const 损坏乙回退 = 读取持久化数据或新建();
assert.notStrictEqual(损坏乙回退, 损坏甲回退);
assert.equal(错误日志.length, 2, '损坏串变化后应记录新错误');
存储.set(持久化键, 创建v2数据('恢复.txt'));
读取持久化数据();
存储.set(持久化键, '{损坏甲');
const 再次损坏甲回退 = 读取持久化数据或新建();
assert.notStrictEqual(再次损坏甲回退, 损坏甲回退);
assert.equal(再次损坏甲回退.当前文件名, '');
assert.equal(错误日志.length, 3, '成功读取后再次损坏应创建新回退');
console.log('✓ 损坏回退按快照复用并在成功读取后清除');

设置存储({
  [持久化键]: '',
  [旧持久化键]: JSON.stringify({ 文件名: '不应降级.txt' }),
});
assert.throws(读取持久化数据, SyntaxError);
设置存储({ [旧持久化键]: '' });
assert.throws(读取持久化数据, SyntaxError);
console.log('✓ 空字符串按损坏数据处理');

设置存储({ [持久化键]: 创建v2数据('权限恢复.txt') });
const 权限错误 = new DOMException('禁止访问存储', 'SecurityError');
读取错误 = 权限错误;
assert.throws(读取持久化数据, function 是原始权限错误(错误) {
  return 错误 === 权限错误;
});
错误日志.length = 0;
const 权限回退 = 读取持久化数据或新建();
assert.deepEqual(权限回退, { 当前文件名: '', 文本状态: {} });
assert.strictEqual(读取持久化数据或新建(), 权限回退);
assert.equal(错误日志.length, 1, '连续访问失败只应记录一次错误');

状态.文件名 = '测试.txt';
状态.文本 = '测试正文';
状态.行起点列表 = new Uint32Array([0]);
写入记录.length = 0;
警告日志.length = 0;
保存持久化状态();
assert.deepEqual(写入记录, [], '快照不可读时不得尝试覆盖存储');
assert.equal(警告日志.length, 1);
读取错误 = null;
assert.equal(读取持久化数据().当前文件名, '权限恢复.txt');
console.log('✓ SecurityError 不阻断业务入口且禁止覆盖未知原值');

// —— 旧毫秒账（时段记录出现之前的历史）——
// 时长账已并段时段账，运行期不再新增这笔数，但载入与保存都必须原样带着它，
// 否则老日子的阅读时长就凭空丢了（那些日子没有起止时刻可以回溯）。
错误日志.length = 0;
统计.书籍每日滚动毫秒.clear();
载入自动滚动统计({
  当前文件名: '',
  文本状态: { '残留.txt': { 文件名: '残留.txt', 总滚动毫秒: 456 } },
  自动滚动统计: { 每日书籍毫秒: '不是对象' },
});
assert.equal(错误日志.length, 1, '分日记录格式无效要报出来');
assert.deepEqual([...统计.书籍滚动毫秒], [['残留.txt', 456]], '历史累计不受分日记录影响');
assert.deepEqual([...统计.书籍每日滚动毫秒], [], '坏的分日记录整本忽略');
console.log('✓ 非法每日滚动统计只丢分日记录，不影响历史累计');

{
  错误日志.length = 0;
  载入自动滚动统计({
    当前文件名: '',
    文本状态: {
      '残留.txt': { 文件名: '残留.txt', 总滚动毫秒: 456 },
      '坏书.txt': { 文件名: '坏书.txt', 总滚动毫秒: '456' },
    },
    自动滚动统计: {
      每日书籍毫秒: {
        '残留.txt': { '2026-09-01': 333, 坏日期: 10, 零: 0, 负: -5, 非数: 'x' },
        '坏表.txt': [],
      },
    },
  });
  assert.deepEqual(
    [...统计.书籍每日滚动毫秒.get('残留.txt')],
    [['2026-09-01', 333]],
    '坏一天丢一天，不牵连有效记录',
  );
  assert.deepEqual([...统计.书籍滚动毫秒], [['残留.txt', 456]], '非数字的总滚动毫秒不进账');
  assert.equal(统计.书籍每日滚动毫秒.get('坏表.txt'), undefined);
  console.log('✓ 旧每日滚动记录逐条容错载入');
}

// —— 时段账按书落盘：新形状是 日期 -> 书名 -> 段 ——
{
  状态.文件名 = '时段书.txt';
  状态.行起点列表 = new Uint32Array([0, 10]);
  状态.行高 = 20;
  状态.文本 = '0123456789';
  const 起点 = Date.now() - 60_000;
  记录滚动时段(起点, 起点 + 30_000, '时段书.txt');
  记录可见时段(起点, 起点 + 30_000, '时段书.txt');
  写入记录.length = 0;
  保存持久化状态();
  const 最后写入 = 写入记录.filter((项) => 项.键 === 持久化键).pop();
  const 落盘 = JSON.parse(最后写入.值);
  const 今天 = 本地日期串(new Date());
  assert.deepEqual(
    落盘.自动滚动统计.每日时段[今天]['时段书.txt'].map((段) => 段.length),
    [2],
    '滚动段按书落盘，只剩起止两列',
  );
  assert.deepEqual(
    Object.keys(落盘.前台停留统计.每日可见时段[今天]),
    ['时段书.txt'],
    '可见段按书落盘，键名不再叫 每日激活时段',
  );
  assert.equal(落盘.自动滚动统计.每日书籍毫秒['残留.txt']['2026-09-01'], 333, '旧毫秒账原样写回');
  assert.equal(落盘.自动滚动统计.今日毫秒, undefined, '今日缓存字段已随旧时长账一起撤掉');
  assert.equal(落盘.前台停留统计.每日激活时段, undefined);
  console.log('✓ 时段账按书落盘、旧毫秒账原样带回');
  载入滚动时段统计({});
  载入可见时段统计({});
  // 后面几段（备份/重建）按 测试.txt 断言，把书名还回去
  状态.文件名 = '测试.txt';
}


设置存储({ [持久化键]: '{待备份v2' });
保存持久化状态();
assert.deepEqual(
  写入记录.map(function 读取写入键(记录) {
    return 记录.键;
  }),
  [损坏持久化备份键, 持久化键],
);
assert.deepEqual(读取备份快照(), {
  原始数据: '{待备份v2',
  旧原始数据: null,
});
assert.equal(读取持久化数据().当前文件名, '测试.txt');
console.log('✓ 损坏 v2 先备份再重建');

设置存储({ [旧持久化键]: '{待备份v1' });
保存持久化状态();
assert.deepEqual(读取备份快照(), {
  原始数据: null,
  旧原始数据: '{待备份v1',
});
assert.equal(存储.get(旧持久化键), '{待备份v1');
assert.equal(读取持久化数据().当前文件名, '测试.txt');
console.log('✓ 损坏 v1 先备份再创建 v2');

设置存储({ [持久化键]: '{备份失败' });
写入失败键 = 损坏持久化备份键;
保存持久化状态();
assert.deepEqual(
  写入记录.map(function 读取写入键(记录) {
    return 记录.键;
  }),
  [损坏持久化备份键],
);
assert.equal(存储.get(持久化键), '{备份失败');
写入失败键 = null;
写入记录.length = 0;
保存持久化状态();
assert.deepEqual(
  写入记录.map(function 读取写入键(记录) {
    return 记录.键;
  }),
  [损坏持久化备份键, 持久化键],
);
assert.equal(读取持久化数据().当前文件名, '测试.txt');
console.log('✓ 备份失败不覆盖原值并可重试');

设置存储({ [持久化键]: '{主写失败' });
写入失败键 = 持久化键;
保存持久化状态();
assert.deepEqual(读取备份快照(), {
  原始数据: '{主写失败',
  旧原始数据: null,
});
assert.equal(存储.get(持久化键), '{主写失败');
写入失败键 = null;
写入记录.length = 0;
保存持久化状态();
assert.equal(读取持久化数据().当前文件名, '测试.txt');
console.log('✓ 主写失败保留回退并可重试');

设置存储({ [持久化键]: 创建v2数据('落盘前.txt') });
写入失败键 = 持久化键;
保存持久化状态();
assert.equal(存储.get(持久化键), 创建v2数据('落盘前.txt'));
assert.equal(
  读取持久化数据().当前文件名,
  '测试.txt',
  '落盘失败后应保留本次会话的数据库工作副本',
);
写入失败键 = null;
保存持久化状态();
assert.equal(读取持久化数据().当前文件名, '测试.txt');
console.log('✓ 正常主写失败保留会话工作副本并可重试');

设置存储({ [持久化键]: 创建v2数据('序列化失败.txt') });
const 待序列化数据 = 读取持久化数据();
待序列化数据.循环引用 = 待序列化数据;
警告日志.length = 0;
assert.throws(保存持久化状态, TypeError);
assert.deepEqual(写入记录, []);
assert.deepEqual(警告日志, []);
delete 待序列化数据.循环引用;
console.log('✓ 序列化失败直接暴露且不触发存储写入');

设置存储({
  [持久化键]: '',
  [旧持久化键]: JSON.stringify({ 文件名: '不应读取.txt' }),
});
保存持久化状态();
assert.deepEqual(读取备份快照(), {
  原始数据: '',
  旧原始数据: null,
});
console.log('✓ 空字符串备份不与缺失值混淆');

console.error = 原错误输出;
console.warn = 原警告输出;

function 验证读取(名称, 数据, 预期) {
  设置存储(数据);
  assert.deepEqual(读取持久化数据(), 预期);
  console.log(`✓ ${名称}`);
}

function 设置存储(数据) {
  存储.clear();
  for (const [键, 值] of Object.entries(数据)) {
    存储.set(键, 值);
  }
  写入记录.length = 0;
  读取错误 = null;
  写入失败键 = null;
}

function 创建v2数据(文件名) {
  return JSON.stringify({
    当前文件名: 文件名,
    文本状态: { [文件名]: { 文件名 } },
  });
}

function 读取备份快照() {
  return JSON.parse(存储.get(损坏持久化备份键));
}
