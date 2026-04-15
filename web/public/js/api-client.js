/* global crypto */
async function gameApi(action, body) {
  if (window.parent === window) {
    throw new Error('请从游戏壳打开：运行 web 开发服后访问站点根路径 / ，不要单独打开 public 下的 html。');
  }
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    function onMessage(ev) {
      if (ev.source !== window.parent) return;
      const msg = ev.data;
      if (!msg || msg.type !== 'rpg:api:res' || msg.id !== id) return;
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
