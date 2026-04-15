/* global gameApi, TownUI */

(function () {
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  const AuctionGame = {
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
    const g = AuctionGame;
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
    try {
      const d = await gameApi('player', {});
      g.applyPlayerPayload(d);
    } catch (e) {
      g.toast(String(e.message || e));
      return;
    }
    TownUI.initTownUI(g);
    TownUI.showPlaceholderDetail();
    TownUI.renderAttrPanel(g.state.player);
    TownUI.refreshAllInventoryUI(g, g.state.inventory || []);
    await TownUI.refreshAuction(g);
    TownUI.populateAuctionSelect(g);
  });
})();
