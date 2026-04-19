/* global gameApi */

function qs(id) {
  return document.getElementById(id);
}

const SLOT_ZH = {
  weapon: '武器',
  armor: '护甲',
  ring: '戒指',
  boots: '鞋',
  misc: '杂物',
};

const RARITY_ZH = {
  common: '普通',
  uncommon: '优秀',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
};

function slotZh(s) {
  return SLOT_ZH[s] || s;
}

function rarityZh(r) {
  return RARITY_ZH[r] || r;
}

/** 伤害骰 n×m 分档，与 CSS .dice-tier-* 对应 */
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

/** 与服务器 damage_dice_min_max 一致：单件物品当前字面骰的上下限（不含强化后缀） */
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
  if (a === 'main') return '仅主手（右）';
  if (a === 'off') return '仅副手（左）';
  return '主手或副手均可';
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

/** 与地城怪物贴图编号一致：按 key 字典序；可用 monsters.json 的 sprite_index / sprite_num 覆盖 */
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

/** 与服务器 damage_dice_difficulty_mult 一致：ceil(√(n·m)) */
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
  blocks.push(`<div class="detail-line">${escapeHtml(`装备部位：${it.slot === 'misc' ? '杂物（不可装备）' : slotZh(it.slot)}`)}</div>`);
  if (it.slot === 'weapon' && Number(it.equipped) === 1) {
    const h = it.weapon_hand;
    blocks.push(
      `<div class="detail-line">${escapeHtml(h === 'off' ? '佩戴位：副手（左），不参与主手伤害骰' : '佩戴位：主手（右），用于伤害骰与力量加成')}</div>`
    );
  }
  if (it.slot === 'weapon') {
    blocks.push(`<div class="detail-line">${escapeHtml(`佩戴限制：${weaponAllowLabel(it)}`)}</div>`);
  }
  blocks.push(`<div class="detail-line">稀有度：${rarityTagHtml(it.rarity)}</div>`);
  const pl = Number(it.plus_level) || 0;
  const diceStr = it.damage_dice || '1d4';
  if (['weapon', 'armor', 'ring', 'boots'].includes(it.slot)) {
    const ch = nextEnhanceChancePercent(pl, diceStr);
    const gc = nextEnhanceGoldCost(pl);
    if (pl > 0) {
      blocks.push(
        `<div class="detail-line">${escapeHtml(
          `强化：+${pl}（属性加成每层约 ×1.5，伤害骰不变；下一级约 ${ch}% 成功，需 ${gc} 金币）`
        )}</div>`
      );
    } else {
      blocks.push(`<div class="detail-line">${escapeHtml(`强化：+0（下一级约 ${ch}% 成功，需 ${gc} 金币）`)}</div>`);
    }
    blocks.push(
      `<div class="detail-line">强化操作：请前往 <a href="enhance.html" class="detail-inline-link">强化工坊</a></div>`
    );
  }
  if (it.slot === 'weapon' || it.slot === 'boots' || it.slot === 'armor' || (it.damage_dice && it.damage_dice !== '1d4')) {
    blocks.push(`<div class="detail-line">伤害骰：${diceTagHtml(it.damage_dice || '1d4')}</div>`);
  }
  if (it.slot === 'weapon' || it.slot === 'armor' || it.slot === 'boots') {
    const [dmn, dmx] = damageDiceMinMaxPair(it.damage_dice || '1d4');
    blocks.push(
      `<div class="detail-line">${escapeHtml(`该骰字面区间：${dmn}～${dmx}（强化会追加 +2/级；武器命中另加力量调整）`)}</div>`
    );
  }
  if (it.slot === 'boots') {
    blocks.push(
      `<div class="detail-line">${escapeHtml(
        '陷阱规避：排行分 = 伤害骰 n×m × max(1,强化等级)，与「陷阱减免基准」叠加后决定减震区间；穿装后的具体上下限见属性面板。'
      )}</div>`
    );
  }
  if (Number(it.bonus_str)) blocks.push(`<div class="detail-line">${escapeHtml(`力量：+${it.bonus_str}`)}</div>`);
  if (Number(it.bonus_dex)) blocks.push(`<div class="detail-line">${escapeHtml(`敏捷：+${it.bonus_dex}`)}</div>`);
  if (Number(it.bonus_con)) blocks.push(`<div class="detail-line">${escapeHtml(`体质：+${it.bonus_con}`)}</div>`);
  if (Number(it.bonus_ac)) blocks.push(`<div class="detail-line">${escapeHtml(`护甲加值：+${it.bonus_ac}`)}</div>`);
  if (Number(it.bonus_trap))
    blocks.push(`<div class="detail-line">${escapeHtml(`陷阱减免基准：+${it.bonus_trap}（随强化层数缩放）`)}</div>`);
  const sell = it.shop_sell_gold;
  if (sell != null && sell !== '') {
    blocks.push(`<div class="detail-line">${escapeHtml(`商店收购价：${sell} 金币`)}</div>`);
  } else {
    blocks.push(`<div class="detail-line">${escapeHtml('商店收购价：—（未定价）')}</div>`);
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
    : '暂无背景介绍。';
  const canUnequip =
    game &&
    it &&
    Number(it.equipped) === 1 &&
    ['weapon', 'armor', 'ring', 'boots'].includes(it.slot) &&
    Number(it.id) > 0;
  const actionsHtml = canUnequip
    ? '<div class="item-detail-actions"><button type="button" class="detail-action-btn detail-unequip-btn">卸下</button></div>'
    : '';
  pane.innerHTML = `
    <h3 class="detail-title">${title}</h3>
    <p class="detail-desc">${descHtml}</p>
    <div class="detail-box"><strong>数值与词条</strong>${buildItemStatLines(it)}</div>
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
        if (typeof game.toast === 'function') game.toast('已卸下');
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
      ? `<div class="detail-line">地城贴图编号：monsters/${escapeHtml(spriteIndexLabel)}（与 0001、0002…序列一致）</div>`
      : '';
  pane.innerHTML = `
    <h3 class="detail-title">【魔物图鉴】${escapeHtml(m.label)}</h3>
    ${picHint}
    <p class="detail-desc">${descHtml}</p>
    <div class="detail-box">
      <strong>战斗参考（未计层数加成）</strong>
      <div class="detail-line">生命：${m.hp}</div>
      <div class="detail-line">护甲 AC：${m.ac}</div>
      <div class="detail-line">命中加值：+${m.to_hit}</div>
      <div class="detail-line">伤害骰：${diceTagHtml(m.damage)}</div>
    </div>
  `;
}

function showPlaceholderDetail() {
  const pane = qs('item-detail-pane');
  if (!pane) return;
  pane.innerHTML =
    '<p class="detail-placeholder">点击左侧<strong>装备槽</strong>、下方<strong>背包</strong>中的物品，或<strong>拍卖行</strong>条目，可在此查看<strong>物品介绍</strong>与<strong>属性</strong>。点击<strong>地城图鉴</strong>中的名称可阅读<strong>怪物设定</strong>。</p>';
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
      ? `力量 STR：基础 ${p.str} → 装备后有效 ${se}，调整值 ${fmtMod(p.str_mod)}（裸装 ${fmtMod(smb)}）— 近战命中与伤害`
      : `力量 STR：${p.str}，调整值 ${fmtMod(p.str_mod)} — 近战命中与伤害`;
  const dexLine =
    dmb != null
      ? `敏捷 DEX：基础 ${p.dex} → 有效 ${de}，调整值 ${fmtMod(p.dex_mod)}（裸装 ${fmtMod(dmb)}）— 影响 AC 等`
      : `敏捷 DEX：${p.dex}，调整值 ${fmtMod(p.dex_mod)} — 影响 AC 等`;
  const conLine =
    p.con_effective != null
      ? `体质 CON：基础 ${p.con} → 有效 ${ce}（生命上限已按有效体质计算）`
      : `体质 CON：${p.con} — 影响生命成长`;
  el.innerHTML = `
    <div class="attr-block">
      <h3 class="attr-sub">冒险概要</h3>
      <div class="stat-line">等级：${p.level}</div>
      <div class="stat-line">经验值：${p.xp}</div>
      <div class="stat-line">金币：${p.gold}</div>
      <div class="stat-line">生命上限：${p.hp_max}</div>
      <div class="stat-line">护甲（AC）：${p.ac}</div>
      <div class="stat-line">武器伤害骰：${diceTagHtml(p.weapon_dice)}（骰面 ${N(p.weapon_roll_min, 1)}～${N(p.weapon_roll_max, 1)}）</div>
      <div class="stat-line">武器命中伤害：${N(p.weapon_hit_dmg_min, 1)}～${N(p.weapon_hit_dmg_max, 1)}（已含力量调整 ${fmtMod(Number(p.str_mod) || 0)}）</div>
      <div class="stat-line">护甲骰 ${diceTagHtml(p.armor_dice || '1d4')}：${N(p.armor_roll_min, 1)}～${N(p.armor_roll_max, 1)} · 护甲件 AC +${N(p.armor_ac_bonus, 0)}</div>
      <div class="stat-line">陷阱：基础 ${N(p.trap_raw_min, 4)}～${N(p.trap_raw_max, 11)} HP · 鞋减震 ${N(p.trap_mitig_min, 0)}～${N(p.trap_mitig_max, 0)} · 最终约 ${N(p.trap_final_dmg_min, 1)}～${N(p.trap_final_dmg_max, 11)} HP</div>
    </div>
    <div class="attr-block">
      <h3 class="attr-sub">属性面板（含装备加成）</h3>
      <div class="stat-line">${strLine}</div>
      <div class="stat-line">${dexLine}</div>
      <div class="stat-line">${conLine}</div>
      <div class="stat-line">智力 INT：${p.int_stat}</div>
      <div class="stat-line">感知 WIS：${p.wis}</div>
      <div class="stat-line">魅力 CHA：${p.cha}</div>
    </div>
    <p class="attr-footnote">地城内战斗数值在进入地下城时按当前装备载入；击杀同步后会刷新。</p>
  `;
}

function renderEquipSlots(game, inv) {
  const host = qs('equip-slots');
  if (!host) return;
  host.innerHTML = '';
  const slots = [
    { key: 'weapon_main', label: '主手（右）' },
    { key: 'weapon_off', label: '副手（左）' },
    { key: 'armor', label: '护甲' },
    { key: 'ring', label: '戒指' },
    { key: 'boots', label: '鞋' },
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
      box.innerHTML = `<div class="equip-slot-label">${escapeHtml(label)}</div><div class="equip-slot-empty">（空）</div>`;
    }
    box.onclick = () => {
      if (equipped) showItemDetail(game, equipped, '【已装备】');
      else {
        showPlaceholderDetail();
        game.toast('该槽位暂无装备，请从背包选择物品装备到对应位置');
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
    el.innerHTML = '<div class="empty-hint">背包为空。已穿戴的物品显示在左侧装备栏。</div>';
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
    )} · 点击查看介绍</span>`;
    info.onclick = () => showItemDetail(game, it, '【背包】');
    const actions = document.createElement('div');
    actions.className = 'bag-actions';
    if (it.slot === 'weapon') {
      if (weaponAllowMainOk(it)) {
        const bm = document.createElement('button');
        bm.type = 'button';
        bm.textContent = '主手(右)';
        bm.onclick = async (e) => {
          e.stopPropagation();
          try {
            const data = await gameApi('equip', { item_id: it.id, hand: 'main' });
            game.applyPlayerPayload(data);
            refreshAllInventoryUI(game, data.inventory || []);
            game.toast('已装备到主手（右）');
          } catch (err) {
            game.toast(String(err.message || err));
          }
        };
        actions.appendChild(bm);
      }
      if (weaponAllowOffOk(it)) {
        const bo = document.createElement('button');
        bo.type = 'button';
        bo.textContent = '副手(左)';
        bo.onclick = async (e) => {
          e.stopPropagation();
          try {
            const data = await gameApi('equip', { item_id: it.id, hand: 'off' });
            game.applyPlayerPayload(data);
            refreshAllInventoryUI(game, data.inventory || []);
            game.toast('已装备到副手（左）');
          } catch (err) {
            game.toast(String(err.message || err));
          }
        };
        actions.appendChild(bo);
      }
    } else if (['armor', 'ring', 'boots'].includes(it.slot)) {
      const b1 = document.createElement('button');
      b1.type = 'button';
      b1.textContent = '装备';
      b1.onclick = async (e) => {
        e.stopPropagation();
        try {
          const data = await gameApi('equip', { item_id: it.id });
          game.applyPlayerPayload(data);
          refreshAllInventoryUI(game, data.inventory || []);
          game.toast('装备已更换');
        } catch (err) {
          game.toast(String(err.message || err));
        }
      };
      actions.appendChild(b1);
    }
    const b2 = document.createElement('button');
    b2.type = 'button';
    b2.textContent = '出售';
    b2.onclick = (e) => {
      e.stopPropagation();
      const m = qs('sell-one-modal');
      const sum = qs('sell-one-summary');
      const price = it.shop_sell_gold != null ? it.shop_sell_gold : '—';
      if (m && sum) {
        m.dataset.itemId = String(it.id);
        sum.textContent = `确定出售「${it.label}」？将获得 ${price} 金币（不可撤销）。`;
        m.hidden = false;
        return;
      }
      if (!window.confirm(`确定出售「${it.label}」？将获得 ${price} 金币。`)) return;
      gameApi('sell', { item_id: it.id })
        .then((data) => {
          game.applyPlayerPayload(data);
          refreshAllInventoryUI(game, data.inventory || []);
          if (qs('town-stats') && data.player) renderAttrPanel(data.player);
          game.toast('卖出获得 ' + (data.sold_for || 0) + ' 金币');
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
      div.innerHTML = `<span class="codex-num">${escapeHtml(num)}</span><span class="codex-name">${escapeHtml(m.label)}</span><span class="codex-damage">伤害 ${escapeHtml(m.damage)}</span>`;
      div.onclick = () => showMonsterDetail(m, num);
      el.appendChild(div);
    });
  } catch (_) {
    el.innerHTML = '<div class="empty-hint">图鉴数据加载失败。</div>';
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
    el.innerHTML = `<p class="empty-hint" style="margin-bottom:12px">${escapeHtml(
      '未读到链上拍卖行资源。① 刷新页面（前端已用 32 字节模块地址查 LCD）。② 若确未初始化：用发布钱包执行 initiad tx move execute <模块0x> dungeon bootstrap_auction_house（见 scripts/bootstrap-chain.sh）。③ 新包含 init_module 时首次发版会自动创建。'
    )}</p>`;
    if (aucPostBtn) aucPostBtn.disabled = true;
    if (aucSel) {
      aucSel.disabled = true;
      aucSel.innerHTML = '<option value="">拍卖行未就绪</option>';
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
    )} · ${L.price_gold} 金币 · 卖家 ${escapeHtml(seller)} · 点击查看介绍</span>`;
    left.onclick = () => showItemDetail(game, snap, '【拍卖行】');
    const actions = document.createElement('div');
    actions.className = 'auc-row-actions';
    if (myPid > 0 && Number(L.seller_id) === myPid) {
      const bc = document.createElement('button');
      bc.type = 'button';
      bc.className = 'auth-btn auc-delist-btn';
      bc.textContent = '下架';
      bc.onclick = async (e) => {
        e.stopPropagation();
        try {
          const res = await gameApi('auction_cancel', { auction_id: L.id });
          game.applyPlayerPayload(res);
          game.toast('已下架，物品已回到背包');
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
      b.textContent = '购买';
      b.onclick = async (e) => {
        e.stopPropagation();
        try {
          const res = await gameApi('auction_buy', { auction_id: L.id });
          game.applyPlayerPayload(res);
          game.toast('购买成功');
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
  return `<div class="row lb-row"><div class="lb-rank">${i + 1}</div><div class="lb-main"><div class="lb-name">${escapeHtml(who)}</div><div class="lb-stats">等级 ${r.level} · 经验 ${r.xp} · 金币 ${r.gold}</div><div class="lb-abilities">STR 有效 ${r.str_effective}（调整 ${fmtMod(Number(r.str_mod) || 0)}） · DEX 有效 ${r.dex_effective}（调整 ${fmtMod(Number(r.dex_mod) || 0)}） · CON 有效 ${r.con_effective} · AC ${r.ac}</div><div class="lb-abilities">武器骰 ${diceTagHtml(r.weapon_dice || '1d4')}</div>${ex}</div></div>`;
}

function renderLbGearRow(r, i) {
  const who = r.username || r.display_name || '?';
  const dice = r.damage_dice || '1d4';
  return `<div class="row lb-row"><div class="lb-rank">${i + 1}</div><div class="lb-main"><div class="lb-name">${escapeHtml(who)}</div><div class="lb-stats">${escapeHtml(r.item_label || '—')} · +${Number(r.plus_level) || 0}</div><div class="lb-abilities">排行分 ${Number(r.score) || 0} · 伤害骰 ${diceTagHtml(dice)}</div></div></div>`;
}

async function refreshLeaderboard() {
  const data = await gameApi('leaderboard', {});
  const host = qs('lb-boards');
  const legacy = qs('lb-list');
  const boards = data.boards || {};
  if (host) {
    const sections = [
      { key: 'xp', title: '经验榜（前 10）', type: 'person' },
      { key: 'gold', title: '金币榜（前 10）', type: 'person' },
      { key: 'weapon', title: '武器榜（已装备，按排行分）', type: 'gear' },
      { key: 'armor', title: '护甲榜（已装备，按排行分）', type: 'gear' },
      { key: 'ring', title: '戒指榜（已装备，按排行分）', type: 'gear' },
    ];
    host.innerHTML = sections
      .map((sec) => {
        const rows = boards[sec.key] || [];
        const inner =
          sec.type === 'person'
            ? rows.map((r, i) => renderLbPersonRow(r, i, '')).join('')
            : rows.map((r, i) => renderLbGearRow(r, i)).join('');
        const empty = rows.length ? '' : '<p class="empty-hint">暂无数据</p>';
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
        game.toast('卖出获得 ' + (data.sold_for || 0) + ' 金币');
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
        sum.textContent = '正在计算…';
        try {
          const p = await gameApi('sell_all_preview', {});
          sum.textContent =
            (p.count || 0) > 0
              ? `将卖出 ${p.count} 件未装备物品，预计共获得 ${p.total_gold} 金币。确认后不可撤销。`
              : '当前没有可卖出的未装备物品（已装备需先卸下）。';
        } catch (e) {
          sum.textContent = '无法预览：' + (e.message || e);
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
        game.toast(`已卖出 ${data.sell_all_count || 0} 件，共 ${data.sell_all_gold || 0} 金币`);
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
        game.toast('已上架拍卖行');
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
  sel.innerHTML = '<option value="">选择要上架的背包物品</option>';
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
    game.toast('加载角色失败：' + (e.message || e));
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
