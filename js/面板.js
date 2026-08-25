import { 关键词排序方式列表, 拼音排序器 } from './常量.js';
import { 元素, 状态 } from './状态.js';
import { 获取关键词配色 } from './搜索.js';
import { 安排保存持久化状态 } from './持久化.js';

// 关键词面板（右下角「关键词 N」胶囊 + 排序栏 + 列表）的渲染与排序。
// 从 关键词.js 拆出，使 指示器 与 app.js 只依赖面板的展示能力，
// 避免「指示器 ↔ 关键词」双向依赖。

export function 有弹窗打开() {
  return (
    元素.查找弹窗.open ||
    元素.上下文弹窗.open ||
    元素.词频弹窗.open ||
    元素.内容选择弹窗.open ||
    !元素.字体弹窗.hidden
  );
}

export function 切换关键词排序(排序方式) {
  if (!关键词排序方式列表.includes(排序方式) || 状态.关键词排序 === 排序方式) {
    return;
  }
  状态.关键词排序 = 排序方式;
  渲染关键词面板();
  安排保存持久化状态();

  console.info('[阅读器] 已切换关键词排序', { 排序方式 });
}

/* 排序只影响面板展示顺序，不改动关键词的原始添加顺序。 */

export function 排序后的关键词列表() {
  const 列表 = 状态.关键词列表.filter(function 排除临时关键词(关键词) {
    return !关键词.临时;
  });
  switch (状态.关键词排序) {
    case '数量':
      列表.sort(function 按数量排序(左, 右) {
        return (
          右.命中位置.length - 左.命中位置.length ||
          (左.命中位置[0] ?? 0) - (右.命中位置[0] ?? 0)
        );
      });
      break;
    case '位置':
      列表.sort(function 按位置排序(左, 右) {
        return (左.命中位置[0] ?? 0) - (右.命中位置[0] ?? 0);
      });
      break;
    case '拼音':
      列表.sort(function 按拼音排序(左, 右) {
        return 拼音排序器.compare(左.文本, 右.文本);
      });
      break;
  }
  return 列表;
}

/* 面板只在关键词状态真正变化时重建 DOM，悬停、滚动引发的调用都会被签名拦下。 */

export function 渲染关键词面板() {
  const 持久关键词列表 = 状态.关键词列表.filter(
    function 排除临时关键词(关键词) {
      return !关键词.临时;
    },
  );
  const 面板可见 = Boolean(状态.文件名) && 持久关键词列表.length > 0;
  // 面板展开时，关键词面板开关需保持可见（即使鼠标不在热区），便于收起面板
  document.body.classList.toggle(
    '右下面板展开',
    面板可见 && 状态.关键词面板展开,
  );
  if (!面板可见) {
    元素.关键词面板.hidden = true;
    状态.关键词面板签名 = '';
    return;
  }

  const 签名 = [
    状态.当前关键词id,
    状态.关键词面板展开 ? 1 : 0,
    状态.关键词排序,
    ...持久关键词列表.map(function 读取关键词签名(关键词) {
      return `${关键词.id}:${关键词.命中位置.length}:${关键词.当前命中idx}`;
    }),
  ].join('|');
  if (!元素.关键词面板.hidden && 签名 === 状态.关键词面板签名) {
    return;
  }
  状态.关键词面板签名 = 签名;

  元素.关键词面板.hidden = false;
  元素.关键词面板开关.textContent = `关键词 ${持久关键词列表.length}`;
  元素.关键词面板开关.setAttribute(
    'aria-expanded',
    String(状态.关键词面板展开),
  );
  元素.关键词列表容器.hidden = !状态.关键词面板展开;
  if (!状态.关键词面板展开) {
    元素.关键词列表容器.replaceChildren();
    return;
  }

  const 片段 = document.createDocumentFragment();
  片段.append(创建排序栏());
  for (const 关键词 of 排序后的关键词列表()) {
    const 配色 = 获取关键词配色(关键词);
    const 是当前 = 关键词.id === 状态.当前关键词id;
    const 项 = document.createElement('div');
    项.className = '关键词项';
    项.classList.toggle('当前', 是当前);
    项.dataset.keywordId = String(关键词.id);
    项.style.setProperty('--关键词浅色', 配色.浅色);
    项.style.setProperty('--关键词深色', 配色.深色);

    const 主钮 = document.createElement('button');
    主钮.type = 'button';
    主钮.className = '关键词主钮';
    主钮.dataset.action = '选中';
    主钮.title = '设为当前关键词';
    const 色点 = document.createElement('i');
    色点.className = '关键词色点';
    const 文字 = document.createElement('span');
    文字.className = '关键词文字';
    文字.textContent = 关键词.文本;
    const 计数 = document.createElement('span');
    计数.className = '关键词计数';
    计数.textContent =
      是当前 && 关键词.当前命中idx >= 0
        ? `${(关键词.当前命中idx + 1).toLocaleString('zh-CN')}/${关键词.命中位置.length.toLocaleString('zh-CN')}`
        : 关键词.命中位置.length.toLocaleString('zh-CN');
    主钮.append(色点, 文字, 计数);

    项.append(
      主钮,
      创建面板操作钮('上下文', '≡', '上下文列表'),
      创建面板操作钮('删除', '×', '删除标记'),
    );
    片段.append(项);
  }
  元素.关键词列表容器.replaceChildren(片段);

  function 创建排序栏() {
    const 排序栏 = document.createElement('div');
    排序栏.className = '关键词排序栏';
    const 标签 = document.createElement('span');
    标签.className = '关键词排序标签';
    标签.textContent = '排序';
    排序栏.append(标签);
    const 提示表 = {
      数量: '按命中数量排序',
      位置: '按首次出现位置排序',
      拼音: '按首字母拼音排序',
    };
    for (const 排序方式 of 关键词排序方式列表) {
      const 按钮 = document.createElement('button');
      按钮.type = 'button';
      按钮.className = '关键词排序钮';
      按钮.dataset.sort = 排序方式;
      按钮.textContent = 排序方式;
      按钮.title = 提示表[排序方式];
      按钮.setAttribute('aria-pressed', String(状态.关键词排序 === 排序方式));
      排序栏.append(按钮);
    }
    return 排序栏;
  }

  function 创建面板操作钮(操作, 文字, 提示) {
    const 按钮 = document.createElement('button');
    按钮.type = 'button';
    按钮.className = '关键词操作钮';
    按钮.dataset.action = 操作;
    按钮.textContent = 文字;
    按钮.title = 提示;
    按钮.setAttribute('aria-label', 提示);
    return 按钮;
  }
}
