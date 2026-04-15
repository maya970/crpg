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
        toast('未连接钱包：请在顶栏连接 Initia 钱包。');
        return;
      }
      if (!s.has_hero) {
        toast('请先在顶栏点击「注册链上角色」，再刷新本页。');
        return;
      }
    } catch (e) {
      toast(String((e && e.message) || e || '无法连接游戏壳'));
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
