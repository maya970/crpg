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
        toast('未连接钱包：请在顶栏连接 Initia 钱包（本站点不使用 PHP 版账号密码登录）。');
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
