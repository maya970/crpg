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
        g.toast('未连接钱包：请在顶栏连接 Initia 钱包。');
        return;
      }
      if (!s.has_hero) {
        g.toast('请先在顶栏点击「注册链上角色」，再刷新本页。');
        return;
      }
    } catch (e) {
      g.toast(String((e && e.message) || e || '无法连接游戏壳'));
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
