// 验证「提取后续词组 / 提取前置词组」的边界与分段行为(从 app.js 抽取的函数体)
const 词组分段器 = new Intl.Segmenter('zh-CN', { granularity: 'word' });

const 提取后续词组源 = String.raw`
    function 提取后续词组(文本偏移) {
      const 上下文 = 状态.文本.slice(文本偏移, 文本偏移 + 前缀.length + 64);
      const 前缀终点 = 前缀.length;
      let 词组终点 = 前缀终点;
      for (const 片段 of 词组分段器.segment(上下文)) {
        const 片段终点 = 片段.index + 片段.segment.length;
        if (片段终点 <= 前缀终点) {
          continue;
        }
        if (
          片段.index < 前缀终点 ||
          (片段.index === 前缀终点 && 片段.isWordLike)
        ) {
          词组终点 = 片段终点;
        }
        break;
      }
      return 上下文.slice(0, 词组终点);
    }`;

const 提取前置词组源 = String.raw`
    function 提取前置词组(文本偏移) {
      const 起点 = Math.max(0, 文本偏移 - 64);
      const 上下文 = 状态.文本.slice(起点, 文本偏移);
      const 片段列表 = [...词组分段器.segment(上下文)];
      let 词组起点 = 上下文.length;
      for (let idx = 片段列表.length - 1; idx >= 0; idx -= 1) {
        const 片段 = 片段列表[idx];
        const 片段终点 = 片段.index + 片段.segment.length;
        if (片段.index >= 上下文.length) {
          continue;
        }
        if (
          片段终点 > 上下文.length ||
          (片段终点 === 上下文.length && 片段.isWordLike)
        ) {
          词组起点 = 片段.index;
        }
        break;
      }
      return 上下文.slice(词组起点);
    }`;

const 状态 = { 文本: '' };
const 制造函数 = new Function(
  '状态',
  '词组分段器',
  '前缀',
  `${提取后续词组源}\n${提取前置词组源}
   return { 提取后续词组, 提取前置词组 };`,
);

const 场景 = [];
function 检查(name, 文本, 偏移, 前缀, 期望前, 期望后) {
  状态.文本 = 文本;
  const { 提取后续词组, 提取前置词组 } = 制造函数(状态, 词组分段器, 前缀);
  const 后 = 提取后续词组(偏移);
  const 前 = 提取前置词组(偏移);
  const ok后 = 后 === 期望后;
  const ok前 = 前 === 期望前;
  场景.push({
    name,
    pass: ok前 && ok后,
    detail: `前=[${期望前}] 得[${前}]${ok前 ? '' : ' ✗'} | 后=[${期望后}] 得[${后}]${ok后 ? '' : ' ✗'}`,
  });
}

// 1. 常规:前面接词 + 关键词 + 后面接词
检查('常规两侧', '他向阁老请安去了', 2, '阁老', '向', '阁老请');
// 2. 文首命中(无前置上下文)
检查('文首', '阁老已经到了', 0, '阁老', '', '阁老已经');
// 3. 文末命中(无后续内容;分段器把前面的词整词返回)
检查('文末', '他去拜见阁老', 4, '阁老', '拜见', '阁老');
// 4. 标点紧邻(标点不是词,后面接不出词组 → 只返回关键词本身,由调用方过滤)
检查('标点分隔', '大人,阁老,请留步', 3, '阁老', '', '阁老');
// 5. 关键词开头即整句结尾且前面是冒号
检查('冒号前', '众人齐呼:"阁老"', 6, '阁老', '', '阁老');
// 6. 长前置截断(前置窗口恰好切在 64 字边界,顿号保证分段确定)
const 长前文 = '甲,'.repeat(40) + '见阁老,去了';
const 长前偏移 = '甲,'.repeat(40).length + 1;
检查('长前置截断', 长前文, 长前偏移, '阁老', '见', '阁老');
// 7. 长后文截断
检查('长后文截断', '阁老去' + '乙'.repeat(80), 0, '阁老', '', '阁老去');

let 失败数 = 0;
for (const s of 场景) {
  if (!s.pass) 失败数 += 1;
  console.log(`${s.pass ? 'PASS' : 'FAIL'} ${s.name}: ${s.detail}`);
}
console.log(失败数 ? `\n${失败数} 个场景失败` : '\n全部通过');
process.exit(失败数 ? 1 : 0);
