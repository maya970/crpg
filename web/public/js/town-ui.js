/* global gameApi */

function qs(id) {
  return document.getElementById(id);
}

const SLOT_LABELS = {
  weapon: 'Weapon',
  armor: 'Armor',
  ring: 'Ring',
  boots: 'Boots',
  misc: 'Trinket',
};

const RARITY_LABELS = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

function slotZh(s) {
  return SLOT_LABELS[s] || s;
}

function rarityZh(r) {
  return RARITY_LABELS[r] || r;
}

/** Dice power tier for CSS coloring */
function dicePowerTier(dice) {
  const m = String(dice || '').match(/^(\d+)d(\d+)/i);
  const p = m ? Math.max(1, parseInt(m[1], 10) * parseInt(m[2], 10)) : 1;
  if (p <= 4) return 1;
  if (p <= 12) return 2;
  if (p <= 30) return 3;
  return 4;
}

function rarityTagHtml(r) {
  const k = String(r || 'common')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  const key = k || 'common';
  return `<span class="rarity-tag rarity-${key}">${escapeHtml(rarityZh(r))}</span>`;
}

function diceTagHtml(dice) {
  const t = dicePowerTier(dice);
  return `<span class="dice-tag dice-tier-${t}">${escapeHtml(String(dice || '1d4'))}</span>`;
}

/** Min/max face total for a damage die string */
function damageDiceMinMaxPair(dice) {
  const m = String(dice || '')
    .toLowerCase()
    .trim()
    .match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!m) return [1, 1];
  const n = Math.min(20, Math.max(1, parseInt(m[1], 10)));
  const d = Math.min(100, Math.max(2, parseInt(m[2], 10)));
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  return [Math.max(1, n + mod), Math.max(1, n * d + mod)];
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t == null ? '' : String(t);
  return d.innerHTML;
}

function weaponAllowLabel(it) {
  const a = it.weapon_allow || 'both';
  if (a === 'main') return 'Main hand only';
  if (a === 'off') return 'Off hand only';
  return 'Main or off hand';
}

function weaponAllowMainOk(it) {
  const a = it.weapon_allow || 'both';
  return a === 'main' || a === 'both';
}

function weaponAllowOffOk(it) {
  const a = it.weapon_allow || 'both';
  return a === 'off' || a === 'both';
}

function equippedForSlotKey(inv, key) {
  const list = inv || [];
  if (key === 'weapon_main') {
    return list.find(
      (x) =>
        Number(x.equipped) === 1 &&
        x.slot === 'weapon' &&
        (x.weapon_hand == null || x.weapon_hand === '' || x.weapon_hand === 'main')
    );
  }
  if (key === 'weapon_off') {
    return list.find((x) => Number(x.equipped) === 1 && x.slot === 'weapon' && x.weapon_hand === 'off');
  }
  return list.find((x) => Number(x.equipped) === 1 && x.slot === key);
}

/** Pad monster sprite index to 4 digits */
function pad4MonsterSprite(n) {
  const k = Math.max(1, Math.min(9999, Math.floor(Number(n) || 1)));
  return String(k).padStart(4, '0');
}

function buildMonsterSpriteIndexByKey(catalog) {
  const map = {};
  const keys = Object.keys(catalog || {}).sort();
  const used = Object.create(null);
  keys.forEach((k) => {
    const def = catalog[k];
    const explicit =
      def && def.sprite_index != null
        ? Number(def.sprite_index)
        : def && def.sprite_num != null
          ? Number(def.sprite_num)
          : 0;
    if (explicit > 0 && explicit <= 9999) {
      map[k] = Math.floor(explicit);
      used[map[k]] = true;
    }
  });
  let next = 1;
  keys.forEach((k) => {
    if (map[k] != null) return;
    while (used[next]) next++;
    map[k] = next;
    used[next] = true;
    next++;
  });
  return map;
}

/** Difficulty multiplier from NdM */
function diceDifficultyMult(dice) {
  const m = String(dice || '1d4').match(/^(\d+)d(\d+)/i);
  if (!m) return 1;
  const n = Math.max(1, parseInt(m[1], 10));
  const d = Math.max(1, parseInt(m[2], 10));
  return Math.max(1, Math.ceil(Math.sqrt(n * d)));
}

function nextEnhanceChancePercent(currentPlus, dice) {
  const pl = Math.max(0, Number(currentPlus) || 0);
  const denom = (pl + 1) * diceDifficultyMult(dice);
  return Math.floor(100 / Math.max(1, denom));
}

function nextEnhanceGoldCost(currentPlus) {
  return 50 * Math.pow(2, Math.max(0, Number(currentPlus) || 0));
}

function buildItemStatLines(it) {
  const blocks = [];
  blocks.push(`<div class="detail-line">${escapeHtml(`Slot: ${it.slot === 'misc' ? 'Trinket (cannot equip)' : slotZh(it.slot)}`)}</div>`);
  if (it.slot === 'weapon' && Number(it.equipped) === 1) {
    const h = it.weapon_hand;
    blocks.push(
      `<div class="detail-line">${escapeHtml(h === 'off' ? 'Worn in off hand (left)' : 'Worn in main hand (right)')}</div>`
    );
  }
  if (it.slot === 'weapon') {
    blocks.push(`<div class="detail-line">${escapeHtml(`Hand rule: ${weaponAllowLabel(it)}`)}</div>`);
  }
  blocks.push(`<div class="detail-line">Rarity: ${rarityTagHtml(it.rarity)}</div>`);
  const pl = Number(it.plus_level) || 0;
  const diceStr = it.damage_dice || '1d4';
  if (['weapon', 'armor', 'ring', 'boots'].includes(it.slot)) {
    const ch = nextEnhanceChancePercent(pl, diceStr);
    const gc = nextEnhanceGoldCost(pl);
    if (pl > 0) {
      blocks.push(
        `<div class="detail-line">${escapeHtml(
          `Enhance: +${pl} (stats grow with each tier; damage dice unchanged). Next try ~${ch}% for ${gc} gold`
        )}</div>`
      );
    } else {
      blocks.push(`<div class="detail-line">${escapeHtml(`Enhance: +0. Next try ~${ch}% for ${gc} gold`)}</div>`);
    }
    blocks.push(
      `<div class="detail-line">Enhance at the <a href="enhance.html" class="detail-inline-link">Enhance hall</a></div>`
    );
  }
  if (it.slot === 'weapon' || it.slot === 'boots' || it.slot === 'armor' || (it.damage_dice && it.damage_dice !== '1d4')) {
    blocks.push(`<div class="detail-line">Damage dice: ${diceTagHtml(it.damage_dice || '1d4')}</div>`);
  }
  if (it.slot === 'weapon' || it.slot === 'armor' || it.slot === 'boots') {
    const [dmn, dmx] = damageDiceMinMaxPair(it.damage_dice || '1d4');
    blocks.push(
      `<div class="detail-line">${escapeHtml(`Roll range on this die: ${dmn}–${dmx} (enhancement adds flat damage; STR affects hits)`)}</div>`
    );
  }
  if (it.slot === 'boots') {
    blocks.push(
      `<div class="detail-line">${escapeHtml(
        'Boots soften trap damage. Your current trap range is shown in the stats panel.'
      )}</div>`
    );
  }
  if (Number(it.bonus_str)) blocks.push(`<div class="detail-line">${escapeHtml(`STR +${it.bonus_str}`)}</div>`);
  if (Number(it.bonus_dex)) blocks.push(`<div class="detail-line">${escapeHtml(`DEX +${it.bonus_dex}`)}</div>`);
  if (Number(it.bonus_con)) blocks.push(`<div class="detail-line">${escapeHtml(`CON +${it.bonus_con}`)}</div>`);
  if (Number(it.bonus_ac)) blocks.push(`<div class="detail-line">${escapeHtml(`Armor bonus +${it.bonus_ac}`)}</div>`);
  if (Number(it.bonus_trap))
    blocks.push(`<div class="detail-line">${escapeHtml(`Trap cushion +${it.bonus_trap} (scales with enhance)`)}</div>`);
  const sell = it.shop_sell_gold;
  if (sell != null && sell !== '') {
    blocks.push(`<div class="detail-line">${escapeHtml(`Shop buyback: ${sell} gold`)}</div>`);
  } else {
    blocks.push(`<div class="detail-line">${escapeHtml('Shop buyback: —')}</div>`);
  }
  return blocks.join('');
}

function showItemDetail(game, it, tag) {
  const pane = qs('item-detail-pane');
  if (!pane || !it) return;
  const prefix = tag ? escapeHtml(tag) : '';
  const pl = Number(it.plus_level) || 0;
  const plusTitle = pl > 0 ? ` +${pl}` : '';
  const title = prefix + escapeHtml(it.label) + escapeHtml(plusTitle);
  const rawDesc = String(it.item_desc || it.desc || '').trim();
  const descHtml = rawDesc
    ? escapeHtml(rawDesc).replace(/\n/g, '<br>')
    : 'No flavor text yet.';
  const canUnequip =
    game &&
    it &&
    Number(it.equipped) === 1 &&
    ['weapon', 'armor', 'ring', 'boots'].includes(it.slot) &&
    Number(it.id) > 0;
  const actionsHtml = canUnequip
    ? '<div class="item-detail-actions"><button type="button" class="detail-action-btn detail-unequip-btn">Unequip</button></div>'
    : '';
  pane.innerHTML = `
    <h3 class="detail-title">${title}</h3>
    <p class="detail-desc">${descHtml}</p>
    <div class="detail-box"><strong>Stats</strong>${buildItemStatLines(it)}</div>
    ${actionsHtml}
  `;
  const uBtn = pane.querySelector('.detail-unequip-btn');
  if (uBtn && game) {
    uBtn.onclick = async () => {
      try {
        const data = await gameApi('unequip', { item_id: it.id });
        if (typeof game.applyPlayerPayload === 'function') {
          game.applyPlayerPayload(data);
        }
        refreshAllInventoryUI(game, data.inventory || []);
        if (typeof game.toast === 'function') game.toast('Unequipped');
        showPlaceholderDetail();
      } catch (err) {
        if (typeof game.toast === 'function') game.toast(String(err.message || err));
      }
    };
  }
}

function showMonsterDetail(m, spriteIndexLabel) {
  const pane = qs('item-detail-pane');
  if (!pane || !m) return;
  const descHtml = escapeHtml(m.desc || '').replace(/\n/g, '<br>');
  const picHint =
    spriteIndexLabel != null
      ? `<div class="detail-line">Art index: ${escapeHtml(spriteIndexLabel)}</div>`
      : '';
  pane.innerHTML = `
    <h3 class="detail-title">Bestiary · ${escapeHtml(m.label)}</h3>
    ${picHint}
    <p class="detail-desc">${descHtml}</p>
    <div class="detail-box">
      <strong>Combat snapshot</strong>
      <div class="detail-line">HP: ${m.hp}</div>
      <div class="detail-line">AC: ${m.ac}</div>
      <div class="detail-line">To hit: +${m.to_hit}</div>
      <div class="detail-line">Damage: ${diceTagHtml(m.damage)}</div>
    </div>
  `;
}

function showPlaceholderDetail() {
  const pane = qs('item-detail-pane');
  if (!pane) return;
  pane.innerHTML =
    '<p class="detail-placeholder">Select a slot, a bag row, or a market listing to see details. Open the <strong>Codex</strong> and tap a name to read about a monster.</p>';
}

function fmtMod(n) {
  return (n >= 0 ? '+' : '') + n;
}

function renderAttrPanel(p) {
  const el = qs('town-stats');
  if (!el || !p) return;
  const N = (x, d) => (x != null && x !== '' && !Number.isNaN(Number(x)) ? Number(x) : d);
  const se = p.str_effective != null ? p.str_effective : p.str;
  const de = p.dex_effective != null ? p.dex_effective : p.dex;
  const ce = p.con_effective != null ? p.con_effective : p.con;
  const smb = p.str_mod_base != null ? p.str_mod_base : null;
  const dmb = p.dex_mod_base != null ? p.dex_mod_base : null;
  const strLine =
    smb != null
      ? `STR base ${p.str} → effective ${se}, mod ${fmtMod(p.str_mod)} (unarmored ${fmtMod(smb)}) — melee hit & damage`
      : `STR ${p.str}, mod ${fmtMod(p.str_mod)} — melee hit & damage`;
  const dexLine =
    dmb != null
      ? `DEX base ${p.dex} → effective ${de}, mod ${fmtMod(p.dex_mod)} (unarmored ${fmtMod(dmb)}) — affects AC`
      : `DEX ${p.dex}, mod ${fmtMod(p.dex_mod)} — affects AC`;
  const conLine =
    p.con_effective != null
      ? `CON base ${p.con} → effective ${ce} (HP uses effective CON)`
      : `CON ${p.con} — HP growth`;
  el.innerHTML = `
    <div class="attr-block">
      <h3 class="attr-sub">Overview</h3>
      <div class="stat-line">Level: ${p.level}</div>
      <div class="stat-line">XP: ${p.xp}</div>
      <div class="stat-line">Gold: ${p.gold}</div>
      <div class="stat-line">Max HP: ${p.hp_max}</div>
      <div class="stat-line">AC: ${p.ac}</div>
      <div class="stat-line">Weapon dice: ${diceTagHtml(p.weapon_dice)} (faces ${N(p.weapon_roll_min, 1)}–${N(p.weapon_roll_max, 1)})</div>
      <div class="stat-line">Weapon hit damage: ${N(p.weapon_hit_dmg_min, 1)}–${N(p.weapon_hit_dmg_max, 1)} (includes STR ${fmtMod(Number(p.str_mod) || 0)})</div>
      <div class="stat-line">Armor dice ${diceTagHtml(p.armor_dice || '1d4')}: ${N(p.armor_roll_min, 1)}–${N(p.armor_roll_max, 1)} · armor AC +${N(p.armor_ac_bonus, 0)}</div>
      <div class="stat-line">Traps: raw ${N(p.trap_raw_min, 4)}–${N(p.trap_raw_max, 11)} HP · boots soften ${N(p.trap_mitig_min, 0)}–${N(p.trap_mitig_max, 0)} · about ${N(p.trap_final_dmg_min, 1)}–${N(p.trap_final_dmg_max, 11)} HP</div>
    </div>
    <div class="attr-block">
      <h3 class="attr-sub">Attributes (with gear)</h3>
      <div class="stat-line">${strLine}</div>
      <div class="stat-line">${dexLine}</div>
      <div class="stat-line">${conLine}</div>
      <div class="stat-line">INT: ${p.int_stat}</div>
      <div class="stat-line">WIS: ${p.wis}</div>
      <div class="stat-line">CHA: ${p.cha}</div>
    </div>
    <p class="attr-footnote">Dungeon combat uses your current gear when you enter; it updates after kills sync.</p>
  `;
}

function renderEquipSlots(game, inv) {
  const host = qs('equip-slots');
  if (!host) return;
  host.innerHTML = '';
  const slots = [
    { key: 'weapon_main', label: 'Main hand (R)' },
    { key: 'weapon_off', label: 'Off hand (L)' },
    { key: 'armor', label: 'Armor' },
    { key: 'ring', label: 'Ring' },
    { key: 'boots', label: 'Boots' },
  ];
  slots.forEach(({ key, label }) => {
    const equipped = equippedForSlotKey(inv, key);
    const box = document.createElement('div');
    box.className = 'equip-slot' + (equipped ? ' filled' : ' empty');
    if (equipped) {
      const epl = Number(equipped.plus_level) || 0;
      const plusBit = epl > 0 ? ` +${epl}` : '';
      box.innerHTML = `<div class="equip-slot-label">${escapeHtml(label)}</div><div class="equip-slot-name">${escapeHtml(equipped.label)}${escapeHtml(plusBit)}</div><div class="equip-slot-meta">${rarityTagHtml(equipped.rarity)} · ${diceTagHtml(
        equipped.damage_dice || '1d4'
      )}</div>`;
    } else {
      box.innerHTML = `<div class="equip-slot-label">${escapeHtml(label)}</div><div class="equip-slot-empty">Empty</div>`;
    }
    box.onclick = () => {
      if (equipped) showItemDetail(game, equipped, '[Equipped]');
      else {
        showPlaceholderDetail();
        game.toast('Empty slot — pick an item from your bag');
      }
    };
    host.appendChild(box);
  });
}

function renderBag(game, inv) {
  const el = qs('bag-list');
  if (!el) return;
  el.innerHTML = '';
  const bag = inv.filter((x) => Number(x.equipped) !== 1);
  if (!bag.length) {
    el.innerHTML = '<div class="empty-hint">Your bag is empty. Equipped items appear in the slots on the left.</div>';
    return;
  }
  bag.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'bag-row';
    const info = document.createElement('div');
    info.className = 'bag-info';
    const bpl = Number(it.plus_level) || 0;
    const bagPlus = bpl > 0 ? ` +${bpl}` : '';
    info.innerHTML = `<span class="bag-name">${escapeHtml(it.label)}${escapeHtml(bagPlus)}</span><span class="bag-meta">${escapeHtml(slotZh(it.slot))} · ${rarityTagHtml(it.rarity)} · ${diceTagHtml(
      it.damage_dice || '1d4'
    )} · tap for details</span>`;
    info.onclick = () => showItemDetail(game, it, '[Bag]');
    const actions = document.createElement('div');
    actions.className = 'bag-actions';
    if (it.slot === 'weapon') {
      if (weaponAllowMainOk(it)) {
        const bm = document.createElement('button');
        bm.type = 'button';
        bm.textContent = 'Main (R)';
        bm.onclick = async (e) => {
          e.stopPropagation();
          try {
            const data = await gameApi('equip', { item_id: it.id, hand: 'main' });
            game.applyPlayerPayload(data);
            refreshAllInventoryUI(game, data.inventory || []);
            game.toast('Equipped to main hand');
          } catch (err) {
            game.toast(String(err.message || err));
          }
        };
        actions.appendChild(bm);
      }
      if (weaponAllowOffOk(it)) {
        const bo = document.createElement('button');
        bo.type = 'button';
        bo.textContent = 'Off (L)';
        bo.onclick = async (e) => {
          e.stopPropagation();
          try {
            const data = await gameApi('equip', { item_id: it.id, hand: 'off' });
            game.applyPlayerPayload(data);
            refreshAllInventoryUI(game, data.inventory || []);
            game.toast('Equipped to off hand');
          } catch (err) {
            game.toast(String(err.message || err));
          }
        };
        actions.appendChild(bo);
      }
    } else if (['armor', 'ring', 'boots'].includes(it.slot)) {
      const b1 = document.createElement('button');
      b1.type = 'button';
      b1.textContent = 'Equip';
      b1.onclick = async (e) => {
        e.stopPropagation();
        try {
          const data = await gameApi('equip', { item_id: it.id });
          game.applyPlayerPayload(data);
          refreshAllInventoryUI(game, data.inventory || []);
          game.toast('Gear updated');
        } catch (err) {
          game.toast(String(err.message || err));
        }
      };
      actions.appendChild(b1);
    }
    const b2 = document.createElement('button');
    b2.type = 'button';
    b2.textContent = 'Sell';
    b2.onclick = (e) => {
      e.stopPropagation();
      const m = qs('sell-one-modal');
      const sum = qs('sell-one-summary');
      const price = it.shop_sell_gold != null ? it.shop_sell_gold : '—';
      if (m && sum) {
        m.dataset.itemId = String(it.id);
        sum.textContent = `Sell "${it.label}" for ${price} gold? This cannot be undone.`;
        m.hidden = false;
        return;
      }
      if (!window.confirm(`Sell "${it.label}" for ${price} gold?`)) return;
      gameApi('sell', { item_id: it.id })
        .then((data) => {
          game.applyPlayerPayload(data);
          refreshAllInventoryUI(game, data.inventory || []);
          if (qs('town-stats') && data.player) renderAttrPanel(data.player);
          game.toast('Sold for ' + (data.sold_for || 0) + ' gold');
        })
        .catch((err) => game.toast(String(err.message || err)));
    };
    actions.appendChild(b2);
    row.appendChild(info);
    row.appendChild(actions);
    el.appendChild(row);
  });
}

function refreshAllInventoryUI(game, inv, opts) {
  if (game && game.state && Array.isArray(inv)) game.state.inventory = inv;
  renderEquipSlots(game, inv);
  renderBag(game, inv);
  if (qs('town-stats') && game.state && game.state.player) renderAttrPanel(game.state.player);
  if (qs('auc-post-item')) populateAuctionSelect(game);
  if (!opts || !opts.skipInventoryHook) {
    if (typeof game.onInventoryChanged === 'function') {
      try {
        game.onInventoryChanged();
      } catch (_) {
        /* ignore */
      }
    }
  }
}

let monsterCodexCache = null;

async function loadMonsterCodex(hostId) {
  const el = qs(hostId || 'monster-codex');
  if (!el) return;
  try {
    if (!monsterCodexCache) {
      const r = await fetch('data/monsters.json');
      monsterCodexCache = await r.json();
    }
    el.innerHTML = '';
    const keys = Object.keys(monsterCodexCache).sort();
    const spriteByKey = buildMonsterSpriteIndexByKey(monsterCodexCache);
    keys.forEach((key) => {
      const m = monsterCodexCache[key];
      const div = document.createElement('div');
      div.className = 'codex-row';
      const num = pad4MonsterSprite(spriteByKey[key]);
      div.innerHTML = `<span class="codex-num">${escapeHtml(num)}</span><span class="codex-name">${escapeHtml(m.label)}</span><span class="codex-damage">${escapeHtml(m.damage)}</span>`;
      div.onclick = () => showMonsterDetail(m, num);
      el.appendChild(div);
    });
  } catch (_) {
    el.innerHTML = '<div class="empty-hint">Could not load the bestiary.</div>';
  }
}

async function refreshAuction(game, listId) {
  const data = await gameApi('auction_list', {});
  const el = qs(listId || 'auc-list');
  if (!el) return;
  el.innerHTML = '';
  const aucPostBtn = qs('auc-post-btn');
  const aucSel = qs('auc-post-item');
  if (data.auction_house_ready === false) {
    el.innerHTML =
      '<p class="empty-hint" style="margin-bottom:12px">The market is closed for now. Try refreshing the page later.</p>';
    if (aucPostBtn) aucPostBtn.disabled = true;
    if (aucSel) {
      aucSel.disabled = true;
      aucSel.innerHTML = '<option value="">Market unavailable</option>';
    }
    return;
  }
  if (aucSel) aucSel.disabled = false;
  const myPid = game.state && game.state.player ? Number(game.state.player.id) : 0;
  (data.listings || []).forEach((L) => {
    let snap = {};
    try {
      snap = JSON.parse(L.item_snapshot || '{}');
    } catch (_) {
      snap = {};
    }
    const row = document.createElement('div');
    row.className = 'row auc-row';
    const left = document.createElement('div');
    left.className = 'auc-item';
    const seller = L.seller_username || L.seller_name || '?';
    left.innerHTML = `<span class="auc-title">${escapeHtml(snap.label || '?')}</span><span class="auc-sub">${rarityTagHtml(
      snap.rarity || 'common'
    )} · ${L.price_gold} gold · seller ${escapeHtml(seller)} · tap for details</span>`;
    left.onclick = () => showItemDetail(game, snap, '[Market]');
    const actions = document.createElement('div');
    actions.className = 'auc-row-actions';
    if (myPid > 0 && Number(L.seller_id) === myPid) {
      const bc = document.createElement('button');
      bc.type = 'button';
      bc.className = 'auth-btn auc-delist-btn';
      bc.textContent = 'Cancel';
      bc.onclick = async (e) => {
        e.stopPropagation();
        try {
          const res = await gameApi('auction_cancel', { auction_id: L.id });
          game.applyPlayerPayload(res);
          game.toast('Listing removed; item returned to bag');
          refreshAuction(game, listId);
          refreshAllInventoryUI(game, res.inventory || []);
          populateAuctionSelect(game);
        } catch (err) {
          game.toast(String(err.message || err));
        }
      };
      actions.appendChild(bc);
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Buy';
      b.onclick = async (e) => {
        e.stopPropagation();
        try {
          const res = await gameApi('auction_buy', { auction_id: L.id });
          game.applyPlayerPayload(res);
          game.toast('Purchase complete');
          refreshAuction(game, listId);
          refreshAllInventoryUI(game, res.inventory || []);
        } catch (err) {
          game.toast(String(err.message || err));
        }
      };
      actions.appendChild(b);
    }
    row.appendChild(left);
    row.appendChild(actions);
    el.appendChild(row);
  });
  if (game && qs('auc-post-item')) populateAuctionSelect(game);
}

function renderLbPersonRow(r, i, extraLineHtml) {
  const who = r.username || r.display_name || '?';
  const ex = extraLineHtml || '';
  return `<div class="row lb-row"><div class="lb-rank">${i + 1}</div><div class="lb-main"><div class="lb-name">${escapeHtml(who)}</div><div class="lb-stats">Lv ${r.level} · XP ${r.xp} · Gold ${r.gold}</div><div class="lb-abilities">STR ${r.str_effective} (mod ${fmtMod(Number(r.str_mod) || 0)}) · DEX ${r.dex_effective} (mod ${fmtMod(Number(r.dex_mod) || 0)}) · CON ${r.con_effective} · AC ${r.ac}</div><div class="lb-abilities">Weapon ${diceTagHtml(r.weapon_dice || '1d4')}</div>${ex}</div></div>`;
}

function renderLbGearRow(r, i) {
  const who = r.username || r.display_name || '?';
  const dice = r.damage_dice || '1d4';
  return `<div class="row lb-row"><div class="lb-rank">${i + 1}</div><div class="lb-main"><div class="lb-name">${escapeHtml(who)}</div><div class="lb-stats">${escapeHtml(r.item_label || '—')} · +${Number(r.plus_level) || 0}</div><div class="lb-abilities">Score ${Number(r.score) || 0} · ${diceTagHtml(dice)}</div></div></div>`;
}

async function refreshLeaderboard() {
  const data = await gameApi('leaderboard', {});
  const host = qs('lb-boards');
  const legacy = qs('lb-list');
  const boards = data.boards || {};
  if (host) {
    const sections = [
      { key: 'xp', title: 'XP (top 10)', type: 'person' },
      { key: 'gold', title: 'Gold (top 10)', type: 'person' },
      { key: 'weapon', title: 'Weapons (equipped, by score)', type: 'gear' },
      { key: 'armor', title: 'Armor (equipped, by score)', type: 'gear' },
      { key: 'ring', title: 'Rings (equipped, by score)', type: 'gear' },
    ];
    host.innerHTML = sections
      .map((sec) => {
        const rows = boards[sec.key] || [];
        const inner =
          sec.type === 'person'
            ? rows.map((r, i) => renderLbPersonRow(r, i, '')).join('')
            : rows.map((r, i) => renderLbGearRow(r, i)).join('');
        const empty = rows.length ? '' : '<p class="empty-hint">No entries yet</p>';
        return `<section class="lb-section"><h2 class="lb-section-title">${escapeHtml(sec.title)}</h2><div class="lb-section-body">${inner}${empty}</div></section>`;
      })
      .join('');
    return;
  }
  if (legacy) {
    const rows = boards.xp || [];
    legacy.innerHTML = rows.map((r, i) => renderLbPersonRow(r, i, '')).join('');
  }
}

function initTownUI(game) {
  const sellOneModal = qs('sell-one-modal');
  const sellOneSummary = qs('sell-one-summary');
  const sellOneCancel = qs('sell-one-cancel');
  const sellOneConfirm = qs('sell-one-confirm');
  if (sellOneCancel && sellOneModal) {
    sellOneCancel.onclick = () => {
      sellOneModal.hidden = true;
      delete sellOneModal.dataset.itemId;
    };
  }
  if (sellOneConfirm && sellOneModal) {
    sellOneConfirm.onclick = async () => {
      const id = Number(sellOneModal.dataset.itemId || 0);
      sellOneModal.hidden = true;
      delete sellOneModal.dataset.itemId;
      if (id < 1) return;
      try {
        const data = await gameApi('sell', { item_id: id });
        game.applyPlayerPayload(data);
        refreshAllInventoryUI(game, data.inventory || []);
        if (qs('town-stats') && data.player) renderAttrPanel(data.player);
        game.toast('Sold for ' + (data.sold_for || 0) + ' gold');
      } catch (e) {
        game.toast(String(e.message || e));
      }
    };
  }

  const sellModal = qs('sell-all-modal');
  const btnSellAll = qs('btn-sell-all');
  const sellCancel = qs('sell-all-cancel');
  const sellConfirm = qs('sell-all-confirm');
  if (btnSellAll && sellModal) {
    btnSellAll.onclick = async () => {
      const sum = qs('sell-all-summary');
      if (sum) {
        sum.textContent = 'Calculating…';
        try {
          const p = await gameApi('sell_all_preview', {});
          sum.textContent =
            (p.count || 0) > 0
              ? `Sell ${p.count} unequipped items for about ${p.total_gold} gold? This cannot be undone.`
              : 'No unequipped items to sell. Unequip gear first if needed.';
        } catch (e) {
          sum.textContent = 'Preview failed: ' + (e.message || e);
        }
      }
      sellModal.hidden = false;
    };
  }
  if (sellCancel && sellModal) {
    sellCancel.onclick = () => {
      sellModal.hidden = true;
    };
  }
  if (sellConfirm && sellModal) {
    sellConfirm.onclick = async () => {
      sellModal.hidden = true;
      try {
        const data = await gameApi('sell_all', {});
        game.applyPlayerPayload(data);
        refreshAllInventoryUI(game, data.inventory || []);
        if (qs('town-stats') && data.player) renderAttrPanel(data.player);
        game.toast(`Sold ${data.sell_all_count || 0} items for ${data.sell_all_gold || 0} gold`);
      } catch (e) {
        game.toast(String(e.message || e));
      }
    };
  }

  const btnAuc = qs('btn-auction-refresh');
  if (btnAuc) {
    btnAuc.onclick = () => {
      refreshAuction(game).catch((e) => game.toast(String(e.message || e)));
    };
  }
  const btnLb = qs('btn-lb-refresh');
  if (btnLb) {
    btnLb.onclick = () => {
      refreshLeaderboard().catch((e) => game.toast(String(e.message || e)));
    };
  }

  const aucSel = qs('auc-post-item');
  const aucPostBtn = qs('auc-post-btn');
  if (aucSel && aucPostBtn) {
    aucSel.addEventListener('change', () => {
      aucPostBtn.disabled = !aucSel.value;
    });
    aucPostBtn.onclick = async () => {
      const id = Number(aucSel.value || 0);
      const price = Number((qs('auc-post-price') && qs('auc-post-price').value) || 0);
      if (!id || price < 1) return;
      try {
        await gameApi('auction_post', { item_id: id, price_gold: price });
        game.toast('Listed on the market');
        const data = await gameApi('player', {});
        game.applyPlayerPayload(data);
        refreshAllInventoryUI(game, data.inventory || []);
        populateAuctionSelect(game);
        refreshAuction(game);
      } catch (e) {
        game.toast(String(e.message || e));
      }
    };
  }
}

function populateAuctionSelect(game) {
  const sel = qs('auc-post-item');
  if (!sel) return;
  sel.innerHTML = '<option value="">Pick a bag item to list</option>';
  (game.state.inventory || []).forEach((it) => {
    if (Number(it.equipped) === 1) return;
    const o = document.createElement('option');
    o.value = String(it.id);
    o.textContent = `${it.label}（${rarityZh(it.rarity)}）`;
    sel.appendChild(o);
  });
  const postBtn = qs('auc-post-btn');
  if (postBtn) postBtn.disabled = true;
}

async function openTown(game) {
  qs('town-overlay').classList.add('open');
  if (typeof window.setRpgBodyView === 'function') window.setRpgBodyView('rpg-view-town');
  showPlaceholderDetail();
  try {
    const data = await gameApi('player', {});
    game.applyPlayerPayload(data);
    qs('town-name').textContent = (data.username ? data.username + ' · ' : '') + data.player.display_name;
    renderAttrPanel(data.player);
    refreshAllInventoryUI(game, data.inventory || []);
    if (qs('monster-codex')) await loadMonsterCodex();
    if (qs('auc-list')) await refreshAuction(game);
    if (qs('lb-list')) await refreshLeaderboard();
  } catch (e) {
    game.toast('Could not load hero: ' + (e.message || e));
  }
}

function closeTownEnterDungeon(game) {
  qs('town-overlay').classList.remove('open');
  game.openDungeonEntry();
}

window.TownUI = {
  initTownUI,
  openTown,
  closeTownEnterDungeon,
  renderInventory: refreshAllInventoryUI,
  populateAuctionSelect,
  refreshAllInventoryUI,
  refreshAuction,
  refreshLeaderboard,
  renderAttrPanel,
  loadMonsterCodex,
  showPlaceholderDetail,
  showItemDetail,
  rarityTagHtml,
  diceTagHtml,
  dicePowerTier,
  rarityZh,
};
