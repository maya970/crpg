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
    dungeonShowError('3D engine failed to load. Try a hard refresh (Ctrl+Shift+R).');
    return;
  }
  const g = window.ChristmasRPG;
  if (!g) {
    dungeonShowError('Dungeon could not start. Try a hard refresh (Ctrl+Shift+R).');
    return;
  }
  try {
    const s = await gameApi('session', {});
    if (!s.logged_in) {
      dungeonShowError('Open the game from the home page and connect your wallet from the top bar first.');
      return;
    }
    if (!s.has_hero) {
      dungeonShowError('Create your character from the top bar, then open the dungeon again.');
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
