import fs from 'node:fs';
import path from 'node:path';
globalThis.document = { baseURI: 'file:///tmp/' };
const { 创建章节索引 } = await import('../../js/章节索引.js');
for (const f of process.argv.slice(2)) {
  const 文本 = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const 列表 = await 创建章节索引(文本, () => true);
  console.log(`\n### ${path.basename(f)}  共 ${列表.length} 章`);
  for (const 章 of 列表) {
    const 行号 = 文本.slice(0, 章.偏移).split('\n').length;
    console.log(`  [${行号}] ${章.类型}  ${章.标题}`);
  }
}
