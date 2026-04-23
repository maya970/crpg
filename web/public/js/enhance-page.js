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
    host.innerHTML = '<p class="empty-hint">Nothing here can be enhanced (or everything is already +20).</p>';
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
      row.innerHTML = `<div class="enhance-row-main">${escapeHtml(it.label)} — ${escapeHtml(prev._err || 'Preview unavailable')}</div>`;
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
      Costs <strong>${prev.gold_cost}</strong> gold · about <strong>${prev.chance_percent}%</strong> success
      · difficulty <strong>${prev.dice_difficulty}</strong> (damage dice ${dTag} unchanged)
    `;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'auth-btn primary enhance-action-btn';
    btn.textContent = 'Try enhance';
    btn.onclick = async () => {
      try {
        const data = await gameApi('enhance', { item_id: it.id });
        if (data.enhance_failed) {
          game.applyPlayerPayload({ player: data.player, inventory: data.inventory });
          if (qs('enh-gold') && game.state.player) qs('enh-gold').textContent = String(game.state.player.gold);
          TownUI.renderAttrPanel(game.state.player);
          TownUI.refreshAllInventoryUI(game, game.state.inventory || []);
          toast(data.message || 'Enhancement failed');
          return;
        }
        game.applyPlayerPayload(data);
        if (qs('enh-gold') && game.state.player) qs('enh-gold').textContent = String(game.state.player.gold);
        TownUI.renderAttrPanel(game.state.player);
        TownUI.refreshAllInventoryUI(game, data.inventory || game.state.inventory || [], {
          skipInventoryHook: true,
        });
        const np = data.enhance && data.enhance.plus_level != null ? data.enhance.plus_level : pl + 1;
        toast('Enhanced to +' + np);
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
        toast('Refreshed');
      } catch (e) {
        toast(String(e.message || e));
      }
    };
  }
});
