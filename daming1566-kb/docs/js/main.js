/* 大明王朝1566 · 阅读器交互：高亮开关 + 段落锚点复制 */
(function () {
  var body = document.body;

  // 高亮开关（持久化）
  try {
    if (localStorage.getItem('dm1566-hl') === 'off') body.classList.add('syntax-highlight-off');
  } catch (e) {}

  var btn = document.getElementById('settings-toggle');
  var panel = document.getElementById('settings-panel');
  if (btn && panel) {
    panel.innerHTML = '<label><input type="checkbox" id="hl-switch"> 实体高亮</label>';
    var sw = document.getElementById('hl-switch');
    sw.checked = !body.classList.contains('syntax-highlight-off');
    btn.addEventListener('click', function () { panel.hidden = !panel.hidden; });
    sw.addEventListener('change', function () {
      body.classList.toggle('syntax-highlight-off', !sw.checked);
      try { localStorage.setItem('dm1566-hl', sw.checked ? 'on' : 'off'); } catch (e) {}
    });
  }

  // 段落编号：点击复制锚点链接
  document.querySelectorAll('.para-num').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      var url = location.origin + location.pathname + '#' + a.id;
      var done = function () {
        var t = a.title; a.title = '已复制链接';
        setTimeout(function () { a.title = t; }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done);
      } else { location.hash = a.id; }
    });
  });

  // 打开页面时定位到锚点段落
  if (location.hash) {
    var el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ block: 'center' });
  }
})();
