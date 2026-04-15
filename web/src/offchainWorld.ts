/**
 * Session: warehouse flags for 3D/town UI (not on-chain).
 * World boss + jump floors come from chain (WorldDungeonState, DungeonSpawn).
 */

import type { WorldDungeonRaw } from './dungeonApi';

export type BossRow = {
  milestone: number;
  hp: number;
  max_hp: number;
  ac: number;
  to_hit: number;
  damage: string;
  label: string;
  monster_key: string;
  defeated: 0 | 1;
  first_killer_username: string;
  first_killed_at: string;
};

export type OffchainWarehouseState = {
  warehouseSlots: Record<string, 0 | 1>;
};

const whDefault = (): OffchainWarehouseState => ({ warehouseSlots: {} });

function storageKey(addr: string): string {
  return `rpg:initia:offchain:${addr}`;
}

export function loadWarehouseState(addr: string): OffchainWarehouseState {
  if (typeof sessionStorage === 'undefined') return whDefault();
  try {
    const raw = sessionStorage.getItem(storageKey(addr));
    if (!raw) return whDefault();
    const j = JSON.parse(raw) as Partial<{ warehouseSlots: Record<string, 0 | 1> }>;
    return {
      warehouseSlots: typeof j.warehouseSlots === 'object' && j.warehouseSlots !== null ? j.warehouseSlots : {},
    };
  } catch {
    return whDefault();
  }
}

export function saveWarehouseState(addr: string, s: OffchainWarehouseState): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(addr), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function dungeonFloorTierMult(floor: number): number {
  const f = Math.max(1, Math.min(100000, floor));
  return Math.floor((f - 1) / 10) + 1;
}

function scaleMonsterBaseStatsForFloor(
  def: { hp: number; ac: number; to_hit: number; damage: string },
  floor: number
): { hp: number; ac: number; toHit: number; damage: string } {
  const f = Math.max(1, Math.min(100000, floor));
  const mul = 1 + (f - 1) * 0.11;
  let hp = Math.max(1, Math.round(def.hp * mul + (f - 1) * 2));
  hp = Math.max(1, Math.round(hp * dungeonFloorTierMult(f)));
  const ac = Math.min(30, Math.round(def.ac + Math.floor((f - 1) / 2)));
  const toHit = Math.min(20, Math.round(def.to_hit + Math.floor((f - 1) / 3)));
  return { hp, ac, toHit, damage: def.damage };
}

function bossUiStats(milestone: number): { max_hp: number; ac: number; to_hit: number; damage: string } {
  const def = { hp: 18, ac: 12, to_hit: 4, damage: '1d6+1' };
  const scaled = scaleMonsterBaseStatsForFloor(def, milestone);
  const maxHp = Math.max(1, Math.round(scaled.hp * 1000));
  const ac = Math.min(40, Math.round(scaled.ac * 1.3));
  const toHit = Math.min(30, Math.round(scaled.toHit * 1.3));
  let damage = scaled.damage.replace(/[^0-9dD+\-]/g, '').slice(0, 24);
  if (!damage) damage = '1d6';
  return { max_hp: maxHp, ac, to_hit: toHit, damage };
}

/** Build PHP-shaped dungeon_world from on-chain WorldDungeonState (shared PoW pool). */
export function dungeonWorldFromChain(wd: WorldDungeonRaw | null): { max_unlocked_floor: number; bosses: BossRow[] } {
  if (!wd) {
    return { max_unlocked_floor: 10, bosses: [] };
  }
  const maxF = Math.max(10, Math.min(100000, parseInt(wd.max_unlocked_floor, 10) || 10));
  const currentMs = Math.max(10, Math.min(100000, parseInt(wd.milestone, 10) || 10));
  const tgt = BigInt(wd.work_target || '0');
  const acc = BigInt(wd.work_accumulated || '0');
  const bosses: BossRow[] = [];
  for (let m = 10; m < currentMs; m += 10) {
    const st = bossUiStats(m);
    bosses.push({
      milestone: m,
      hp: 0,
      max_hp: st.max_hp,
      ac: st.ac,
      to_hit: st.to_hit,
      damage: st.damage,
      label: `世界首领 · 第${m}层`,
      monster_key: 'world_boss',
      defeated: 1,
      first_killer_username: '',
      first_killed_at: '',
    });
  }
  const st = bossUiStats(currentMs);
  const maxHp = Number(tgt > 0n ? tgt : BigInt(st.max_hp));
  const remaining = tgt > 0n ? Number(tgt - acc > 0n ? tgt - acc : 0n) : 0;
  const defeated: 0 | 1 = tgt > 0n && acc >= tgt ? 1 : 0;
  bosses.push({
    milestone: currentMs,
    hp: remaining,
    max_hp: maxHp,
    ac: st.ac,
    to_hit: st.to_hit,
    damage: st.damage,
    label: `世界首领 · 第${currentMs}层`,
    monster_key: 'world_boss',
    defeated,
    first_killer_username: '',
    first_killed_at: '',
  });
  return { max_unlocked_floor: maxF, bosses };
}

/** Aligns with Move catalog::jump_equiv_units (misc idx 19-24). */
export const JUMP_EQUIV_CATALOG: { item_key: string; equiv_units: number; label: string }[] = [
  { item_key: 'holly_ink_vial', equiv_units: 1, label: '冬青墨水瓶' },
  { item_key: 'flower_tea_flask', equiv_units: 1, label: '花露茶壶（纪念）' },
  { item_key: 'flutter_egg_souvenir', equiv_units: 1, label: '振翅彩蛋' },
  { item_key: 'robin_badge', equiv_units: 1, label: '知更鸟徽章' },
  { item_key: 'windchime_whistle', equiv_units: 1, label: '风铃哨' },
  { item_key: 'cherry_blossom_ink', equiv_units: 1, label: '樱墨水瓶' },
  { item_key: 'sunbeam_crystal', equiv_units: 1, label: '曦光晶屑' },
];

export function jumpEquivMap(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of JUMP_EQUIV_CATALOG) {
    m[r.item_key] = Math.max(0, r.equiv_units);
  }
  return m;
}
