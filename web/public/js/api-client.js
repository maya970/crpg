/* global crypto */
var RPG_API_TIMEOUT_MS = 45000;

async function gameApi(action, body) {
  if (window.parent === window) {
    throw new Error('Open this game from the home page so it can talk to your wallet.');
  }
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('The game is taking too long to respond. Check your connection and refresh the page.'));
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
