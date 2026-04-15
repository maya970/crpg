/* global gameApi, ChristmasRPG, THREE */

function dungeonShowError(msg) {
  var hud = document.getElementById('hud');
  if (hud) {
    hud.textContent = msg;
    hud.style.color = '#fca5a5';
    hud.style.whiteSpace = 'pre-wrap';
    hud.style.padding = '1rem';
    hud.style.fontSize = '0.9rem';
    hud.style.maxWidth = '36rem';
    hud.style.margin = '2rem auto';
  } else {
    alert(msg);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof THREE === 'undefined') {
    dungeonShowError(
      'Three.js 未加载（缺少 public/vendor/three.min.js）。请在 web 目录执行 npm install 后再构建部署；勿依赖外网 CDN。'
    );
    return;
  }
  const g = window.ChristmasRPG;
  if (!g) {
    dungeonShowError('地牢脚本未初始化。请硬刷新页面 (Ctrl+Shift+R)；若仍失败请打开浏览器控制台查看报错。');
    return;
  }
  try {
    const s = await gameApi('session', {});
    if (!s.logged_in) {
      dungeonShowError('未连接钱包：请回到站点根路径 /，在顶栏点击「连接钱包」后再从导航进入地城。');
      return;
    }
    if (!s.has_hero) {
      dungeonShowError('尚未注册链上角色：请在顶栏点击「注册链上角色」，成功后再点「地城」或刷新本页。');
      return;
    }
  } catch (e) {
    dungeonShowError(String((e && e.message) || e));
    return;
  }
  try {
    await g.bootstrapDungeonScene();
  } catch (e) {
    g.toast(String(e.message || e));
    return;
  }
  g.openDungeonEntry();
});
