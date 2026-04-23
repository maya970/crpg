import type { HeroRaw } from './dungeonApi';
import { parseU64 } from './dungeonApi';

export type ItemDef = {
  id: string;
  label: string;
  desc?: string;
  slot: string;
  rarity: string;
  damage_dice: string;
  equip_hand?: string;
  bonus_str?: number;
  bonus_dex?: number;
  bonus_con?: number;
  bonus_ac?: number;
  bonus_trap?: number;
  image_num?: number;
};

/** Synthetic item ids: bag 101+slot, equip 201..205 */
export const EQ_MAIN = 201;
export const EQ_OFF = 202;
export const EQ_ARMOR = 203;
export const EQ_RING = 204;
export const EQ_BOOTS = 205;

export function bagItemId(slot: number): number {
  return 101 + slot;
}

export function parseSyntheticItemId(id: number): { kind: 'bag'; slot: number } | { kind: 'equip'; slotKind: number } | null {
  if (id >= 101 && id <= 116) return { kind: 'bag', slot: id - 101 };
  if (id >= EQ_MAIN && id <= EQ_BOOTS) return { kind: 'equip', slotKind: id - EQ_MAIN };
  return null;
}

export function addrFingerprint(addr: string): number {
  let h = 2166136261;
  for (let i = 0; i < addr.length; i++) {
    h ^= addr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 2147483647;
}

export function shortAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

export function unpackPacked(packed: bigint): { idx: number; plus: number } {
  const p = Number(packed);
  const plus = p & 0xff;
  const hi = (p >> 8) & 0xff;
  const idx = hi === 0 ? -1 : hi - 1;
  return { idx, plus };
}

function statAdd(s: bigint): bigint {
  return s >= 10n ? (s - 10n) / 2n : 0n;
}

function statSub(s: bigint): bigint {
  return s < 10n ? (11n - s) / 2n : 0n;
}

function xpToLevel(xp: bigint): bigint {
  let lvl = 1n;
  let acc = 0n;
  while (lvl < 99n) {
    const step = 100n + (lvl - 1n) * 50n;
    if (xp < acc + step) break;
    acc += step;
    lvl += 1n;
  }
  return lvl;
}

function maxU64(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/** Matches catalog rarity tier by item index */
function itemRarityTier(idx: number): number {
  const t: Record<number, number> = {
    0: 0, 5: 0, 12: 0, 14: 0, 19: 0, 20: 0,
    1: 1, 6: 1, 11: 1, 15: 1, 21: 1, 22: 1, 25: 1,
    2: 2, 7: 2, 10: 2, 16: 2, 23: 2,
    3: 3, 8: 3, 13: 3, 17: 3, 24: 3,
  };
  return t[idx] ?? 4;
}

export function itemSellGoldIdx(idx: number): number {
  const t = itemRarityTier(idx);
  const mult = [1, 2, 4, 8, 14][t] ?? 1;
  return 15 * mult + 4;
}

function sumStrFromPacked(hero: HeroRaw, items: ItemDef[]): number {
  let s = 0;
  for (const k of ['eq_w_main', 'eq_w_off', 'eq_armor', 'eq_ring', 'eq_boots'] as const) {
    const { idx } = unpackPacked(parseU64(hero[k]));
    if (idx >= 0 && idx < items.length) s += Number(items[idx].bonus_str || 0);
  }
  return s;
}

function sumDexFromPacked(hero: HeroRaw, items: ItemDef[]): number {
  let s = 0;
  for (const k of ['eq_w_main', 'eq_w_off', 'eq_armor', 'eq_ring', 'eq_boots'] as const) {
    const { idx } = unpackPacked(parseU64(hero[k]));
    if (idx >= 0 && idx < items.length) s += Number(items[idx].bonus_dex || 0);
  }
  return s;
}

function sumConFromPacked(hero: HeroRaw, items: ItemDef[]): number {
  let s = 0;
  for (const k of ['eq_w_main', 'eq_w_off', 'eq_armor', 'eq_ring', 'eq_boots'] as const) {
    const { idx } = unpackPacked(parseU64(hero[k]));
    if (idx >= 0 && idx < items.length) s += Number(items[idx].bonus_con || 0);
  }
  return s;
}

function sumAcFromPacked(hero: HeroRaw, items: ItemDef[]): number {
  let s = 0;
  for (const k of ['eq_w_main', 'eq_w_off', 'eq_armor', 'eq_ring', 'eq_boots'] as const) {
    const { idx } = unpackPacked(parseU64(hero[k]));
    if (idx >= 0 && idx < items.length) s += Number(items[idx].bonus_ac || 0);
  }
  return s;
}

function hpMaxFor(hero: HeroRaw, items: ItemDef[]): bigint {
  const xp = parseU64(hero.xp);
  const lvl = xpToLevel(xp);
  const str = parseU64(hero.str);
  const ec = str + BigInt(sumConFromPacked(hero, items));
  const cm = ec >= 10n ? (ec - 10n) / 2n : 0n;
  const bracket = 4n + cm;
  return maxU64(1n, 8n + lvl * bracket);
}

function acFor(hero: HeroRaw, items: ItemDef[]): bigint {
  const dex = parseU64(hero.dex);
  const ed = dex + BigInt(sumDexFromPacked(hero, items));
  const raw = 10n + statAdd(ed);
  const sub = statSub(ed);
  const base = raw <= sub ? 1n : raw - sub;
  return base + BigInt(sumAcFromPacked(hero, items));
}

function applyDicePlus(dice: string, plusBonus: number): string {
  const m = String(dice)
    .toLowerCase()
    .trim()
    .match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!m) return dice;
  const n = parseInt(m[1], 10);
  const d = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  const nm = mod + plusBonus;
  return `${n}d${d}${nm >= 0 ? '+' : ''}${nm}`;
}

function damageDiceMinMax(dice: string): [number, number] {
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

export function itemRowFromPacked(
  packedStr: string,
  items: ItemDef[],
  opts: {
    id: number;
    equipped: 0 | 1;
    weapon_hand?: 'main' | 'off';
    inWarehouse?: 0 | 1;
  }
): Record<string, unknown> | null {
  const packed = parseU64(packedStr);
  if (packed === 0n) return null;
  const { idx, plus } = unpackPacked(packed);
  if (idx < 0 || idx >= items.length) return null;
  const tpl = items[idx];
  const diceBase = tpl.damage_dice || '1d4';
  const dice = applyDicePlus(diceBase, plus * 2);
  const slot = tpl.slot;
  let weapon_allow = 'both';
  if (tpl.equip_hand === 'main') weapon_allow = 'main';
  else if (tpl.equip_hand === 'off') weapon_allow = 'off';
  const [wmin, wmax] = damageDiceMinMax(dice);
  const strB = Number(tpl.bonus_str || 0);
  const dexB = Number(tpl.bonus_dex || 0);
  const conB = Number(tpl.bonus_con || 0);
  const acB = Number(tpl.bonus_ac || 0);
  const trapB = Number(tpl.bonus_trap || 0);
  const base: Record<string, unknown> = {
    id: opts.id,
    item_key: tpl.id,
    label: tpl.label,
    desc: tpl.desc || '',
    item_desc: tpl.desc || '',
    slot,
    rarity: tpl.rarity,
    damage_dice: dice,
    plus_level: plus,
    equipped: opts.equipped,
    weapon_hand: opts.weapon_hand ?? '',
    weapon_allow,
    image_num: tpl.image_num ?? idx + 1,
    bonus_str: strB,
    bonus_dex: dexB,
    bonus_con: conB,
    bonus_ac: acB,
    bonus_trap: trapB,
    shop_sell_gold: itemSellGoldIdx(idx),
    rank_checksum: Math.max(1, wmin * wmax * Math.max(1, plus + 1)),
    weapon_roll_min: wmin,
    weapon_roll_max: wmax,
  };
  if (opts.inWarehouse !== undefined) {
    base.in_warehouse = opts.inWarehouse;
  }
  return base;
}

export type PlayerPayloadExtras = {
  dungeonSpawnFloor?: number;
  /** Bag slot indices (0..15) marked as in warehouse for 3D/town UI */
  warehouseBagSlots?: Set<number>;
};

export function buildPlayerPayload(
  hero: HeroRaw,
  items: ItemDef[],
  walletAddress: string,
  extras?: PlayerPayloadExtras
): { player: Record<string, unknown>; inventory: Record<string, unknown>[]; username: string } {
  const str = parseU64(hero.str);
  const dex = parseU64(hero.dex);
  const con = parseU64(hero.con);
  const xp = parseU64(hero.xp);
  const lvl = xpToLevel(xp);
  const hpMax = hpMaxFor(hero, items);
  const ac = acFor(hero, items);
  const se = str + BigInt(sumStrFromPacked(hero, items));
  const de = dex + BigInt(sumDexFromPacked(hero, items));
  const ce = con + BigInt(sumConFromPacked(hero, items));
  const smb = statAdd(str);
  const dmb = statAdd(dex);
  const strMod = statAdd(se) - statSub(se);
  const dexMod = statAdd(de) - statSub(de);

  const mainP = parseU64(hero.eq_w_main);
  const { idx: wi, plus: wPlus } = unpackPacked(mainP);
  const mainTpl = wi >= 0 && wi < items.length ? items[wi] : null;
  const weaponDice = mainTpl ? applyDicePlus(mainTpl.damage_dice || '1d4', wPlus * 2) : '1d4';
  const [whMin, whMax] = damageDiceMinMax(weaponDice);
  const smNum = Number(strMod);
  const weaponHitMin = Math.max(1, whMin + smNum);
  const weaponHitMax = Math.max(1, whMax + smNum);

  const armorP = parseU64(hero.eq_armor);
  const { idx: ai, plus: aPlus } = unpackPacked(armorP);
  const armorTpl = ai >= 0 && ai < items.length ? items[ai] : null;
  const armorDice = armorTpl ? applyDicePlus(armorTpl.damage_dice || '1d4', aPlus * 2) : '1d4';
  const [amin, amax] = damageDiceMinMax(armorDice);
  const armorAcBonus = armorTpl ? Number(armorTpl.bonus_ac || 0) : 0;

  const bootP = parseU64(hero.eq_boots);
  const { idx: bi, plus: bPlus } = unpackPacked(bootP);
  const bootTpl = bi >= 0 && bi < items.length ? items[bi] : null;
  const trapBase = bootTpl ? Number(bootTpl.bonus_trap || 0) + bPlus : 0;
  const trapMitigMin = trapBase;
  const trapMitigMax = trapBase + 2;
  const rawMin = 4;
  const rawMax = 11;
  const trapFinalMin = Math.max(1, rawMin - trapMitigMax);
  const trapFinalMax = Math.max(1, rawMax - trapMitigMin);

  const pid = addrFingerprint(walletAddress);

  const player: Record<string, unknown> = {
    id: pid,
    display_name: shortAddr(walletAddress),
    username: shortAddr(walletAddress),
    level: String(lvl),
    xp: String(xp),
    gold: String(parseU64(hero.gold)),
    hp: String(parseU64(hero.hp)),
    hp_max: String(hpMax),
    floor: String(parseU64(hero.floor)),
    str: String(str),
    dex: String(dex),
    con: String(con),
    str_effective: String(se),
    dex_effective: String(de),
    con_effective: String(ce),
    str_mod: String(strMod),
    dex_mod: String(dexMod),
    str_mod_base: String(smb),
    dex_mod_base: String(dmb),
    ac: String(ac),
    int_stat: '8',
    wis: '8',
    cha: '8',
    weapon_dice: weaponDice,
    weapon_roll_min: String(whMin),
    weapon_roll_max: String(whMax),
    weapon_hit_dmg_min: String(weaponHitMin),
    weapon_hit_dmg_max: String(weaponHitMax),
    armor_dice: armorDice,
    armor_roll_min: String(amin),
    armor_roll_max: String(amax),
    armor_ac_bonus: String(armorAcBonus),
    trap_raw_min: String(rawMin),
    trap_raw_max: String(rawMax),
    trap_mitig_min: String(trapMitigMin),
    trap_mitig_max: String(trapMitigMax),
    trap_final_dmg_min: String(trapFinalMin),
    trap_final_dmg_max: String(trapFinalMax),
    dungeon_spawn_floor: String(Math.max(1, Math.min(100000, extras?.dungeonSpawnFloor ?? 1))),
  };

  const whSlots = extras?.warehouseBagSlots;
  const inventory: Record<string, unknown>[] = [];
  const bag = Array.isArray(hero.bag) ? hero.bag : [];
  bag.forEach((cell, i) => {
    const row = itemRowFromPacked(String(cell), items, {
      id: bagItemId(i),
      equipped: 0,
      inWarehouse: whSlots?.has(i) ? 1 : 0,
    });
    if (row) inventory.push(row);
  });

  const addEq = (packedStr: string, id: number, hand?: 'main' | 'off') => {
    const row = itemRowFromPacked(packedStr, items, { id, equipped: 1, weapon_hand: hand, inWarehouse: 0 });
    if (row) inventory.push(row);
  };
  addEq(hero.eq_w_main, EQ_MAIN, 'main');
  addEq(hero.eq_w_off, EQ_OFF, 'off');
  addEq(hero.eq_armor, EQ_ARMOR);
  addEq(hero.eq_ring, EQ_RING);
  addEq(hero.eq_boots, EQ_BOOTS);

  return { player, inventory, username: shortAddr(walletAddress) };
}

export function diceDifficultyMult(dice: string): number {
  const m = String(dice || '1d4').match(/^(\d+)d(\d+)/i);
  if (!m) return 1;
  const n = Math.max(1, parseInt(m[1], 10));
  const d = Math.max(1, parseInt(m[2], 10));
  return Math.max(1, Math.ceil(Math.sqrt(n * d)));
}

export function enhanceGoldCost(plus: number): number {
  return 50 * 2 ** Math.max(0, plus);
}

export function enhanceChancePercent(plus: number, dice: string): number {
  const denom = (plus + 1) * diceDifficultyMult(dice);
  return Math.floor(100 / Math.max(1, denom));
}
