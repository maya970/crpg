/* global gameApi, TownUI */

function qs(id) {
  return document.getElementById(id);
}

function toast(msg) {
  const t = qs('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t == null ? '' : String(t);
  return d.innerHTML;
}

async function renderEnhanceList(game) {
  const host = qs('enhance-list');
  if (!host) return;
  host.innerHTML = '';
  const inv = game.state.inventory || [];
  const items = inv.filter(
    (it) => ['weapon', 'armor', 'ring', 'boots'].includes(it.slot) && (Number(it.plus_level) || 0) < 20
  );
  if (!items.length) {
    host.innerHTML = '<p class="empty-hint">没有可强化的装备（或已全部 +20）。</p>';
    return;
  }
  for (const it of items) {
    let prev = {};
    try {
      prev = await gameApi('enhance_preview', { item_id: it.id });
    } catch (e) {
      prev = { ok: false, _err: e.message || String(e) };
    }
    const row = document.createElement('div');
    row.className = 'enhance-row';
    if (!prev.ok) {
      row.innerHTML = `<div class="enhance-row-main">${escapeHtml(it.label)} — ${escapeHtml(prev._err || '无法预览')}</div>`;
      host.appendChild(row);
      continue;
    }
    const pl = Number(it.plus_level) || 0;
    const main = document.createElement('div');
    main.className = 'enhance-row-main';
    const rTag = typeof TownUI !== 'undefined' && TownUI.rarityTagHtml ? TownUI.rarityTagHtml(it.rarity) : '';
    const dTag = typeof TownUI !== 'undefined' && TownUI.diceTagHtml ? TownUI.diceTagHtml(it.damage_dice || '1d4') : escapeHtml(String(it.damage_dice || '1d4'));
    main.innerHTML = `
      <strong>${escapeHtml(it.label)}</strong> ${rTag} +${pl} → +${prev.next_plus}<br>
      消耗 <strong>${prev.gold_cost}</strong> 金币 · 成功率约 <strong>${prev.chance_percent}%</strong>
      · 骰子难度系数 <strong>${prev.dice_difficulty}</strong>（伤害骰 ${dTag} 不变）
    `;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'auth-btn primary enhance-action-btn';
    btn.textContent = '尝试强化';
    btn.onclick = async () => {
      try {
        const data = await gameApi('enhance', { item_id: it.id });
        if (data.enhance_failed) {
          game.applyPlayerPayload({ player: data.player, inventory: data.inventory });
          if (qs('enh-gold') && game.state.player) qs('enh-gold').textContent = String(game.state.player.gold);
          TownUI.renderAttrPanel(game.state.player);
          TownUI.refreshAllInventoryUI(game, game.state.inventory || []);
          toast(data.message || '强化失败');
          return;
        }
        game.applyPlayerPayload(data);
        if (qs('enh-gold') && game.state.player) qs('enh-gold').textContent = String(game.state.player.gold);
        TownUI.renderAttrPanel(game.state.player);
        TownUI.refreshAllInventoryUI(game, data.inventory || game.state.inventory || [], {
          skipInventoryHook: true,
        });
        const np = data.enhance && data.enhance.plus_level != null ? data.enhance.plus_level : pl + 1;
        toast('强化成功 +' + np);
        await renderEnhanceList(game);
      } catch (e) {
        toast(String(e.message || e));
      }
    };
    row.appendChild(main);
    row.appendChild(btn);
    host.appendChild(row);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const g = {
    state: { player: null, inventory: [], username: '' },
    toast,
    applyPlayerPayload(data) {
      if (!data || !data.player) return;
      if (data.username) this.state.username = data.username;
      this.state.player = data.player;
      this.state.inventory = data.inventory || [];
    },
    onInventoryChanged() {
      renderEnhanceList(g).catch((e) => toast(String(e.message || e)));
      if (qs('enh-gold') && g.state.player) qs('enh-gold').textContent = String(g.state.player.gold);
    },
  };

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
  TownUI.showPlaceholderDetail();

  try {
    const d = await gameApi('player', {});
    g.applyPlayerPayload(d);
    if (qs('enh-gold') && g.state.player) qs('enh-gold').textContent = String(g.state.player.gold);
    TownUI.renderAttrPanel(d.player);
    TownUI.refreshAllInventoryUI(g, d.inventory || [], { skipInventoryHook: true });
  } catch (e) {
    toast(String(e.message || e));
    return;
  }

  await renderEnhanceList(g);

  const ref = qs('btn-enh-refresh');
  if (ref) {
    ref.onclick = async () => {
      try {
        const d = await gameApi('player', {});
        g.applyPlayerPayload(d);
        if (qs('enh-gold') && g.state.player) qs('enh-gold').textContent = String(g.state.player.gold);
        TownUI.renderAttrPanel(d.player);
        TownUI.refreshAllInventoryUI(g, d.inventory || [], { skipInventoryHook: true });
        await renderEnhanceList(g);
        toast('已刷新');
      } catch (e) {
        toast(String(e.message || e));
      }
    };
  }
});
