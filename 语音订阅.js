// 语音转录订阅 + 阅读指令识别（无界面后台版）
// ------------------------------------------------------------
// 连接：wss://localhost:15941（声音远程服务器，自签名证书，需已在浏览器信任 https://localhost:15941）
// 地址可被 URL 参数 ?ws= 覆盖（如 ?ws=wss://localhost:3000），改端口时无需改本文件
// 房间：默认 main，可用 URL 参数 ?room=xxx 覆盖
// 独立性：不依赖 app.js，本脚本只负责“识别语音指令”并派发 window
//   识别到「上 / more」后派发事件「语音翻页」；识别到「快 / 慢」后派发
//   事件「语音自动滚动」；具体动作均由 app.js 监听后执行。
//   识别到指令后立即派发，阅读器同步翻页，无需任何手动确认。
// 不创建任何 DOM 与样式，识别在后台静默进行；所有日志仅输出到控制台。
'use strict';

(function () {
  const 参数 = new URLSearchParams(location.search);
  const 房间 = 参数.get('room') || 'main';
  const 地址 = 参数.get('ws') || 'wss://localhost:15941';

  // 触发冷却：避免流式转写把同一句话反复推送导致连续狂翻页
  const 冷却毫秒 = 900;
  let 上次触发时间 = 0;
  let 上次触发指令 = null;
  let 最近文本 = '';

  let 重试次数 = 0;
  let 连接 = null;

  function 时间戳() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }

  function 打印收到的信息(消息) {
    console.log(`[语音转录 ${时间戳()}] ${消息.type}`, 消息);
  }

  // ===== 转写文本提取（兼容多种服务器报文结构）=====
  function 提取文本(消息) {
    if (!消息 || typeof 消息 !== 'object') {
      return '';
    }
    const 候选 = [
      'text',
      'transcript',
      'result',
      'final',
      'data',
      'content',
      'message',
      'recognized',
      'recognizedText',
      'bestAlternative',
      'alternatives',
    ];
    for (const 键 of 候选) {
      const 值 = 消息[键];
      if (typeof 值 === 'string' && 值.trim()) {
        return 值;
      }
      if (值 && typeof 值 === 'object') {
        if (typeof 值.text === 'string' && 值.text.trim()) {
          return 值.text;
        }
        const 候选数组 = Array.isArray(值) ? 值 : 值.alternatives;
        if (Array.isArray(候选数组) && 候选数组[0] && 候选数组[0].text) {
          return 候选数组[0].text;
        }
      }
    }
    return '';
  }

  // 判定报文是否代表“最终/稳定”结果：true=最终，false=中间结果，null=未知（按默认策略处理）
  function 判定最终性(消息) {
    if (!消息 || typeof 消息 !== 'object') {
      return null;
    }
    const 类型 = String(消息.type || '').toLowerCase();
    if (/(final|result|complete|sentence|utterance|speech\.?end|done|stop|recognition)/.test(类型)) {
      return true;
    }
    if (/(partial|interim|hypothesis|temp|speaking|alt)/.test(类型)) {
      return false;
    }
    if (消息.isFinal === true || 消息.final === true) {
      return true;
    }
    if (消息.isPartial === true || 消息.partial === true) {
      return false;
    }
    return null;
  }

  function 识别指令(文本) {
    if (!文本) {
      return null;
    }
    const 规范文本 = 文本
      .trim()
      .toLowerCase()
      .replace(/[，。、,.!?！？；;：:"'（）()\[\]【】「」『』""''~～—]/g, '');
    if (规范文本 === '上') {
      return '上一页';
    }
    if (规范文本 === 'more') {
      return '下一页';
    }
    if (规范文本 === '快' || 规范文本 === '慢') {
      return 规范文本;
    }
    return null;
  }

  function 触发指令(指令) {
    const 事件名称 =
      指令 === '快' || 指令 === '慢' ? '语音自动滚动' : '语音翻页';
    window.dispatchEvent(
      new CustomEvent(事件名称, { detail: { 指令, 原文: 最近文本 } }),
    );
  }

  function 处理转录消息(消息) {
    打印收到的信息(消息);
    最近文本 = 提取文本(消息);
    if (!最近文本) {
      return;
    }
    const 指令 = 识别指令(最近文本);
    if (!指令) {
      return;
    }
    const 最终性 = 判定最终性(消息);
    if (最终性 === false) {
      // 明确的中间结果：不触发翻页（避免半句误触）
      return;
    }
    // 冷却：同一指令在冷却期内不重复触发（流式转写可能多次推送同一句）
    const 现在 = performance.now();
    if (现在 - 上次触发时间 < 冷却毫秒 && 指令 === 上次触发指令) {
      return;
    }
    上次触发时间 = 现在;
    上次触发指令 = 指令;
    触发指令(指令);
  }

  function 连接服务器() {
    if (
      连接 &&
      (连接.readyState === WebSocket.OPEN ||
        连接.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    try {
      连接 = new WebSocket(地址);
    } catch (错误) {
      console.warn(`[语音转录 ${时间戳()}] 连接失败：${错误.message}，稍后重试`);
      setTimeout(连接服务器, Math.min(1000 * Math.pow(2, 重试次数++), 10000));
      return;
    }
    连接.onopen = () => {
      重试次数 = 0;
      console.log(`[语音转录 ${时间戳()}] 已连接 ${地址}，加入房间「${房间}」`);
      连接.send(JSON.stringify({ type: 'join', role: 'display', room: 房间 }));
    };
    连接.onmessage = (事件) => {
      let 消息;
      try {
        消息 = JSON.parse(事件.data);
      } catch {
        return;
      }
      处理转录消息(消息);
    };
    连接.onclose = () => {
      const 间隔 = Math.min(1000 * Math.pow(2, 重试次数), 10000);
      console.warn(`[语音转录 ${时间戳()}] 连接断开（服务器未启动？），${间隔 / 1000}s 后重连`);
      setTimeout(连接服务器, 间隔);
    };
    连接.onerror = () => 连接.close();
  }

  连接服务器();
})();
