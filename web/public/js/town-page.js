/* global gameApi, TownUI */

(function () {
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  const TownGame = {
    state: { player: null, inventory: [], username: '' },
    toast,
    applyPlayerPayload(data) {
      if (!data || !data.player) return;
      if (data.username) this.state.username = data.username;
      this.state.player = data.player;
      this.state.inventory = data.inventory || [];
    },
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const g = TownGame;
    if (window.RpgBuildCheck && typeof window.RpgBuildCheck.run === 'function') {
      await window.RpgBuildCheck.run();
    }
    try {
      const s = await gameApi('session', {});
      if (!s.logged_in) {
        const q = s.restricted && s.error ? '?msg=' + encodeURIComponent(s.error) : '';
        location.href = 'login.html' + q;
        return;
      }
      if (!s.has_hero) {
        alert('请先在顶栏游戏壳中点击「注册链上角色」，然后刷新本页。');
        return;
      }
    } catch (_) {
      location.href = 'login.html';
      return;
    }
    TownUI.initTownUI(g);
    await TownUI.openTown(g);
    const lo = document.getElementById('btn-logout');
    if (lo) {
      lo.onclick = async () => {
        try {
          await gameApi('logout', {});
        } catch (_) {
          /* ignore */
        }
        location.href = 'login.html';
      };
    }
  });
})();
