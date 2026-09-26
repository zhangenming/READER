// 一次性排查脚本：用当前代码的文本管线重算每本书的 状态.文本.length，
// 与 localStorage 里持久化的 文本长度 对比。判据只看长度：app.js 的
// 恢复文本内容状态 用 `持久化状态.文本长度 !== 状态.文本.length` 决定是否恢复关键词，
// 一旦不等，关键词不再恢复，且下一次保存会用内存里的（空）列表覆盖磁盘记录。
import fs from 'node:fs';

globalThis.document = { baseURI: 'http://localhost:15921/' };

const { 规范化文本, 创建引文索引, 整理句子换行 } = await import('../js/文本管线.js');
const { 创建章节索引 } = await import('../js/章节索引.js');

const 快照路径 = process.argv[2] ?? '/tmp/ls-out/snap1.json';
const 快照 = JSON.parse(fs.readFileSync(快照路径, 'utf8'));

let 危险 = 0;
for (const [文件名, 态] of Object.entries(快照.文本状态)) {
  const 词数 = 态.关键词列表?.length ?? 0;
  if (!词数) continue;
  const 路径 = `txt/${文件名}`;
  if (!fs.existsSync(路径)) {
    console.log(`缺文件 ${文件名}`);
    continue;
  }
  const 原文 = fs.readFileSync(路径, 'utf8');
  const 规范 = await 规范化文本(原文, () => true);
  const 章节 = await 创建章节索引(规范, () => true);
  const 引文 = await 创建引文索引(规范, () => true);
  const 结果 = await 整理句子换行(规范, 引文.边界列表, () => true, 章节);
  const 现在 = 结果.文本.length;
  const 一致 = 现在 === 态.文本长度;
  if (!一致) 危险 += 词数;
  console.log(
    `${一致 ? 'OK  ' : '漂移'} ${String(词数).padStart(3)}词  磁盘=${String(态.文本长度).padStart(8)}  现在=${String(现在).padStart(8)}  差=${String(现在 - 态.文本长度).padStart(7)}  ${文件名}`
  );
}
console.log(`\n因长度漂移会被丢弃的关键词总数: ${危险}`);
