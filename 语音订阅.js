// 语音转录订阅：把声音远程服务器广播的每条信息打印到浏览器控制台
// 连接：wss://localhost:3000（声音远程服务器，自签名证书，需已在浏览器信任 https://localhost:3000）
// 房间：默认 main，可用 URL 参数 ?room=xxx 覆盖
// 独立性：不依赖 app.js，页面其余功能不受影响；服务器未启动时仅控制台提示，不打扰阅读
'use strict';

(function () {
  const 房间 = new URLSearchParams(location.search).get('room') || 'main';
  const 地址 = 'wss://localhost:3000';
  let 重试次数 = 0;
  let 连接 = null;

  function 时间戳() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }

  function 打印收到的信息(消息) {
    console.log(`[语音转录 ${时间戳()}] ${消息.type}`, 消息);
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
      打印收到的信息(消息);
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
