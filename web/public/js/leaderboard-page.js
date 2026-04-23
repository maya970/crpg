/* global gameApi, TownUI */

(function () {
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const g = { toast };
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
    try {
      await TownUI.refreshLeaderboard();
    } catch (e) {
      toast(String(e.message || e));
    }
  });
})();
