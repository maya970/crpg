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
        toast('Connect your wallet from the top bar first.');
        return;
      }
      if (!s.has_hero) {
        toast('Create your character from the top bar, then refresh this page.');
        return;
      }
    } catch (e) {
      toast(String((e && e.message) || e || 'Could not reach the game'));
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
        if (window.top) window.top.location.href = '/';
      };
    }
  });
})();
