/* global crypto */
var RPG_API_TIMEOUT_MS = 45000;

async function gameApi(action, body) {
  if (window.parent === window) {
    throw new Error(
      '请从站点首页进入：先打开根路径 /，用顶栏连接钱包后再点「地城」。不要在新标签直接打开 dungeon.html（无游戏壳时无法链上通信）。'
    );
  }
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(
        new Error(
          '游戏壳长时间无响应（可能链上查询卡住）。请检查：① Vercel 是否已配置 VITE_LCD_URL、VITE_MOVE_MODULE_ADDR；② 网络能否访问 Initia REST；③ 刷新页面并重新连接钱包。'
        )
      );
    }, RPG_API_TIMEOUT_MS);
    function onMessage(ev) {
      if (ev.source !== window.parent) return;
      const msg = ev.data;
      if (!msg || msg.type !== 'rpg:api:res' || msg.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (msg.error) {
        reject(new Error(String(msg.error)));
        return;
      }
      resolve(msg.data);
    }
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'rpg:api:req', id, action, body: body || {} }, '*');
  });
}
