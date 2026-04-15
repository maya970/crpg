/* global gameApi, ChristmasRPG */

document.addEventListener('DOMContentLoaded', async () => {
  const g = window.ChristmasRPG;
  if (!g) return;
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
    await g.bootstrapDungeonScene();
  } catch (e) {
    g.toast(String(e.message || e));
    return;
  }
  g.openDungeonEntry();
});
