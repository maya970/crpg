import type { EncodeObject } from '@cosmjs/proto-signing';
import type { HeroRaw } from './dungeonApi';
import { parseU64 } from './dungeonApi';
import {
  dungeonExecuteMsg,
  msgsEncounterThenAutoBattle,
  msgAuctionBuy,
  msgAuctionCancel,
  msgAuctionPost,
  msgAutoBattle,
  msgBossHitWorld,
  msgDeathResetRun,
  msgEnhanceBagSlot,
  msgEnhanceEquipSlot,
  msgEquipFromBag,
  msgJumpPortalDiscard,
  msgJumpResetSpawn,
  msgSellBag,
  msgSellAllBag,
  msgUnequipAppend,
} from './dungeonTx';
import {
  addrFingerprint,
  buildPlayerPayload,
  diceDifficultyMult,
  enhanceChancePercent,
  enhanceGoldCost,
  itemRowFromPacked,
  itemSellGoldIdx,
  parseSyntheticItemId,
  type ItemDef,
  unpackPacked,
} from './heroAdapter';
import {
  dungeonWorldFromChain,
  JUMP_EQUIV_CATALOG,
  loadWarehouseState,
  saveWarehouseState,
} from './offchainWorld';

const MON_NONE = 255n;

const AUCTION_NOT_BOOTSTRAPPED = 'The market is not available yet. Try again later.';

export type BridgeSubmitResult = { ok: boolean; error?: string };

export type GameApiBridgeContext = {
  lcdUrl: string;
  moduleAddr: string;
  address: string | null;
  items: ItemDef[];
  submitTx: (messages: EncodeObject[]) => Promise<BridgeSubmitResult>;
  fetchHero: () => Promise<HeroRaw | null>;
  fetchAuctionHouse: () => Promise<import('./dungeonApi').AuctionHouseRaw | null>;
  fetchWorldDungeon: () => Promise<import('./dungeonApi').WorldDungeonRaw | null>;
  fetchDungeonSpawn: () => Promise<import('./dungeonApi').DungeonSpawnRaw | null>;
};

function newItemsAdded(before: string[], after: string[]): string[] {
  const count = (arr: string[]) => {
    const m = new Map<string, number>();
    for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
    return m;
  };
  const mb = count(before);
  const ma = count(after);
  const added: string[] = [];
  for (const [k, v] of ma) {
    const b = mb.get(k) || 0;
    for (let i = 0; i < v - b; i++) added.push(k);
  }
  return added;
}

function mintDelta(before: HeroRaw | null, after: HeroRaw | null, items: ItemDef[]): Record<string, unknown> {
  if (!before || !after) return {};
  const xpg = Number(parseU64(after.xp) - parseU64(before.xp));
  const gdg = Number(parseU64(after.gold) - parseU64(before.gold));
  const b0 = (Array.isArray(before.bag) ? before.bag : []).map(String);
  const b1 = (Array.isArray(after.bag) ? after.bag : []).map(String);
  const added = newItemsAdded(b0, b1);
  let item: unknown;
  if (added.length > 0) {
    const row = itemRowFromPacked(added[0], items, { id: 0, equipped: 0 });
    if (row) item = row;
  }
  return { xp_gained: xpg, gold_gained: gdg, ...(item ? { item } : {}) };
}

function readPackedForSynthetic(hero: HeroRaw, itemId: number): bigint {
  const r = parseSyntheticItemId(itemId);
  if (!r) return 0n;
  if (r.kind === 'bag') {
    const bag = Array.isArray(hero.bag) ? hero.bag : [];
    return parseU64(String(bag[r.slot] ?? '0'));
  }
  const keys = ['eq_w_main', 'eq_w_off', 'eq_armor', 'eq_ring', 'eq_boots'] as const;
  return parseU64(String(hero[keys[r.slotKind]] ?? '0'));
}

async function resolveCombat(ctx: GameApiBridgeContext): Promise<void> {
  const addr = ctx.address;
  if (!addr) throw new Error('Wallet not connected');
  let h = await ctx.fetchHero();
  if (!h) throw new Error('Create a character first');
  let monId = parseU64(h.mon_id);
  if (monId === MON_NONE) {
    const r = await ctx.submitTx(msgsEncounterThenAutoBattle(addr, ctx.moduleAddr, 32));
    if (!r.ok) throw new Error(r.error || 'Combat failed to start');
    h = await ctx.fetchHero();
    if (!h) throw new Error('Could not load your character');
  }
  for (let i = 0; i < 28; i++) {
    monId = parseU64(h.mon_id);
    const monHp = parseU64(h.mon_hp);
    if (monId === MON_NONE || monHp === 0n) return;
    if (parseU64(h.hp) === 0n) throw new Error('Your hero has fallen');
    const r = await ctx.submitTx([msgAutoBattle(addr, ctx.moduleAddr, 32)]);
    if (!r.ok) throw new Error(r.error || 'Auto-battle failed');
    h = await ctx.fetchHero();
    if (!h) throw new Error('Could not load your character');
  }
  monId = parseU64(h.mon_id);
  const monHp = parseU64(h.mon_hp);
  if (monId !== MON_NONE && monHp > 0n) throw new Error('Combat is still in progress. Try again in a moment.');
}

function warehouseSetFromSession(addr: string): Set<number> {
  const st = loadWarehouseState(addr);
  const wh = new Set<number>();
  for (const [k, v] of Object.entries(st.warehouseSlots)) {
    if (v === 1) wh.add(Number(k));
  }
  return wh;
}

async function fullPlayer(ctx: GameApiBridgeContext) {
  const addr = ctx.address;
  if (!addr) throw new Error('Wallet not connected');
  const hero = await ctx.fetchHero();
  if (!hero) throw new Error('Create a character first');
  const sp = await ctx.fetchDungeonSpawn();
  const spawnFloor = Math.max(1, Math.min(100000, parseInt(String(sp?.floor ?? '1'), 10) || 1));
  const payload = buildPlayerPayload(hero, ctx.items, addr, {
    dungeonSpawnFloor: spawnFloor,
    warehouseBagSlots: warehouseSetFromSession(addr),
  });
  return { ...payload, ok: true };
}

export async function handleGameApi(
  action: string,
  body: Record<string, unknown> | undefined,
  ctx: GameApiBridgeContext
): Promise<Record<string, unknown>> {
  const addr = ctx.address;
  const mod = ctx.moduleAddr;
  const b = body ?? {};

  switch (action) {
    case 'session': {
      const hero = addr ? await ctx.fetchHero() : null;
      return {
        ok: true,
        logged_in: Boolean(addr),
        has_hero: Boolean(hero),
        username: addr ? addr.slice(0, 12) + '…' : '',
        restricted: false,
      };
    }
    case 'build_info':
      return { ok: true, build: 'live-1', backend: 'online' };
    case 'logout':
      return { ok: true };
    case 'login': {
      if (!addr) return { ok: false, error: 'Connect your wallet first', logged_in: false };
      const hero = await ctx.fetchHero();
      if (!hero) return { ok: true, logged_in: true, has_hero: false, player: null, inventory: [] };
      return { ok: true, logged_in: true, has_hero: true, ...(await fullPlayer(ctx)) };
    }
    case 'register': {
      if (!addr) throw new Error('Wallet not connected');
      const ex = await ctx.fetchHero();
      if (ex) throw new Error('This wallet already has a character');
      const r = await ctx.submitTx([dungeonExecuteMsg(addr, mod, 'register')]);
      if (!r.ok) throw new Error(r.error || 'Registration failed');
      return await fullPlayer(ctx);
    }
    case 'player':
      return await fullPlayer(ctx);
    case 'death': {
      if (!addr) throw new Error('Wallet not connected');
      const r = await ctx.submitTx([msgDeathResetRun(addr, mod)]);
      if (!r.ok) throw new Error(r.error || 'Could not reset after defeat');
      return await fullPlayer(ctx);
    }
    case 'mint': {
      if (!addr) throw new Error('Wallet not connected');
      const type = String(b.type || '');
      const before = await ctx.fetchHero();
      if (!before) throw new Error('Create a character first');
      if (type === 'chest') {
        const r = await ctx.submitTx([dungeonExecuteMsg(addr, mod, 'claim_chest')]);
        if (!r.ok) throw new Error(r.error || 'Could not claim chest');
        const after = await ctx.fetchHero();
        const payload = await fullPlayer(ctx);
        return { ...payload, mint: mintDelta(before, after, ctx.items) };
      }
      if (type === 'kill') {
        await resolveCombat(ctx);
        const after = await ctx.fetchHero();
        const payload = await fullPlayer(ctx);
        return { ...payload, mint: mintDelta(before, after, ctx.items) };
      }
      throw new Error('Unknown reward type');
    }
    case 'sell': {
      if (!addr) throw new Error('Wallet not connected');
      const itemId = Number(b.item_id);
      const route = parseSyntheticItemId(itemId);
      if (!route || route.kind !== 'bag') throw new Error('You can only sell items from your bag');
      const hero = await ctx.fetchHero();
      if (!hero) throw new Error('No character found');
      const packedBefore = readPackedForSynthetic(hero, itemId);
      const { idx } = unpackPacked(packedBefore);
      if (idx < 0) throw new Error('That bag slot is empty');
      const price = itemSellGoldIdx(idx);
      const r = await ctx.submitTx([msgSellBag(addr, mod, route.slot)]);
      if (!r.ok) throw new Error(r.error || 'Could not sell item');
      const payload = await fullPlayer(ctx);
      return { ...payload, sold_for: price, ok: true };
    }
    case 'sell_all_preview': {
      if (!addr) throw new Error('Wallet not connected');
      const hero = await ctx.fetchHero();
      if (!hero) throw new Error('No character found');
      const bag = Array.isArray(hero.bag) ? hero.bag : [];
      let total = 0;
      let count = 0;
      for (const cell of bag) {
        const { idx } = unpackPacked(parseU64(String(cell)));
        if (idx >= 0) {
          count += 1;
          total += itemSellGoldIdx(idx);
        }
      }
      return { ok: true, count, total_gold: total };
    }
    case 'sell_all': {
      if (!addr) throw new Error('Wallet not connected');
      const hero0 = await ctx.fetchHero();
      if (!hero0) throw new Error('No character found');
      const bag0 = Array.isArray(hero0.bag) ? hero0.bag : [];
      let previewTotal = 0;
      let previewCount = 0;
      for (const cell of bag0) {
        const { idx } = unpackPacked(parseU64(String(cell)));
        if (idx >= 0) {
          previewCount += 1;
          previewTotal += itemSellGoldIdx(idx);
        }
      }
      const r = await ctx.submitTx([msgSellAllBag(addr, mod)]);
      if (!r.ok) throw new Error(r.error || 'Could not sell all');
      const payload = await fullPlayer(ctx);
      return {
        ...payload,
        sell_all_count: previewCount,
        sell_all_gold: previewTotal,
        ok: true,
      };
    }
    case 'equip': {
      if (!addr) throw new Error('Wallet not connected');
      const itemId = Number(b.item_id);
      const route = parseSyntheticItemId(itemId);
      if (!route || route.kind !== 'bag') throw new Error('Equip items from your bag');
      const hand = String(b.hand || '');
      const mainHand = hand === 'main' ? true : hand === 'off' ? false : true;
      const r = await ctx.submitTx([msgEquipFromBag(addr, mod, route.slot, mainHand)]);
      if (!r.ok) throw new Error(r.error || 'Could not equip');
      return await fullPlayer(ctx);
    }
    case 'unequip': {
      if (!addr) throw new Error('Wallet not connected');
      const itemId = Number(b.item_id);
      const route = parseSyntheticItemId(itemId);
      if (!route || route.kind !== 'equip') throw new Error('Invalid equipment slot');
      const r = await ctx.submitTx([msgUnequipAppend(addr, mod, route.slotKind)]);
      if (!r.ok) throw new Error(r.error || 'Could not unequip');
      return await fullPlayer(ctx);
    }
    case 'enhance_preview': {
      if (!addr) throw new Error('Wallet not connected');
      const itemId = Number(b.item_id);
      const hero = await ctx.fetchHero();
      if (!hero) throw new Error('No character found');
      const p = readPackedForSynthetic(hero, itemId);
      const { idx, plus } = unpackPacked(p);
      if (idx < 0) return { ok: false, error: 'No item there' };
      const tpl = ctx.items[idx];
      if (!tpl || !['weapon', 'armor', 'ring', 'boots'].includes(tpl.slot)) {
        return { ok: false, error: 'This item cannot be enhanced' };
      }
      if (plus >= 20) return { ok: false, error: 'Already at +20' };
      const dice = tpl.damage_dice || '1d4';
      return {
        ok: true,
        next_plus: plus + 1,
        gold_cost: enhanceGoldCost(plus),
        chance_percent: enhanceChancePercent(plus, dice),
        dice_difficulty: diceDifficultyMult(dice),
      };
    }
    case 'enhance': {
      if (!addr) throw new Error('Wallet not connected');
      const itemId = Number(b.item_id);
      const hero = await ctx.fetchHero();
      if (!hero) throw new Error('No character found');
      const plusBefore = unpackPacked(readPackedForSynthetic(hero, itemId)).plus;
      const route = parseSyntheticItemId(itemId);
      if (!route) throw new Error('Invalid item');
      const msg =
        route.kind === 'bag'
          ? msgEnhanceBagSlot(addr, mod, route.slot)
          : msgEnhanceEquipSlot(addr, mod, route.slotKind);
      const r = await ctx.submitTx([msg]);
      if (!r.ok) throw new Error(r.error || 'Enhancement failed');
      const h2 = await ctx.fetchHero();
      const plusAfter = unpackPacked(readPackedForSynthetic(h2!, itemId)).plus;
      const success = plusAfter > plusBefore;
      const payload = await fullPlayer(ctx);
      if (!success) {
        return {
          ...payload,
          enhance_failed: true,
          message: 'Enhancement failed; gold was still spent',
          ok: true,
        };
      }
      return {
        ...payload,
        enhance: { plus_level: plusAfter },
        ok: true,
      };
    }
    case 'auction_list': {
      const ah = await ctx.fetchAuctionHouse();
      const auction_house_ready = Boolean(ah);
      const lots = Array.isArray(ah?.lots) ? ah!.lots : [];
      const listings = (lots as Record<string, unknown>[]).map((L) => {
        const seller = String(L.seller ?? '');
        const packed = String(L.packed ?? '0');
        const id = String(L.id ?? '');
        const price = String(L.price_gold ?? '0');
        const snap = itemRowFromPacked(packed, ctx.items, { id: 0, equipped: 0 }) ?? {};
        const fp = seller ? addrFingerprint(seller) : 0;
        return {
          id,
          seller_id: fp,
          seller_username: seller ? seller.slice(0, 14) + '…' : '?',
          seller_name: seller ? seller.slice(0, 14) + '…' : '?',
          price_gold: price,
          item_snapshot: JSON.stringify(snap),
        };
      });
      return { ok: true, auction_house_ready, listings };
    }
    case 'auction_post': {
      if (!addr) throw new Error('Wallet not connected');
      if (!(await ctx.fetchAuctionHouse())) throw new Error(AUCTION_NOT_BOOTSTRAPPED);
      const itemId = Number(b.item_id);
      const route = parseSyntheticItemId(itemId);
      if (!route || route.kind !== 'bag') throw new Error('List items from your bag');
      const price = String(Math.max(1, Math.floor(Number(b.price_gold) || 0)));
      const r = await ctx.submitTx([msgAuctionPost(addr, mod, route.slot, price)]);
      if (!r.ok) throw new Error(r.error || 'Could not list item');
      return { ok: true };
    }
    case 'auction_cancel': {
      if (!addr) throw new Error('Wallet not connected');
      if (!(await ctx.fetchAuctionHouse())) throw new Error(AUCTION_NOT_BOOTSTRAPPED);
      const lotId = String(b.auction_id ?? '');
      const r = await ctx.submitTx([msgAuctionCancel(addr, mod, lotId)]);
      if (!r.ok) throw new Error(r.error || 'Could not cancel listing');
      return await fullPlayer(ctx);
    }
    case 'auction_buy': {
      if (!addr) throw new Error('Wallet not connected');
      if (!(await ctx.fetchAuctionHouse())) throw new Error(AUCTION_NOT_BOOTSTRAPPED);
      const lotId = String(b.auction_id ?? '');
      const r = await ctx.submitTx([msgAuctionBuy(addr, mod, lotId)]);
      if (!r.ok) throw new Error(r.error || 'Purchase failed');
      return await fullPlayer(ctx);
    }
    case 'leaderboard': {
      if (!addr) {
        return {
          ok: true,
          boards: { xp: [], gold: [], weapon: [], armor: [], ring: [] },
        };
      }
      const hero = await ctx.fetchHero();
      if (!hero) {
        return {
          ok: true,
          boards: { xp: [], gold: [], weapon: [], armor: [], ring: [] },
        };
      }
      const sp = await ctx.fetchDungeonSpawn();
      const spawnFloor = Math.max(1, Math.min(100000, parseInt(String(sp?.floor ?? '1'), 10) || 1));
      const { player: p0, inventory: inv0 } = buildPlayerPayload(hero, ctx.items, addr, {
        dungeonSpawnFloor: spawnFloor,
        warehouseBagSlots: warehouseSetFromSession(addr),
      });
      const p = p0 as Record<string, unknown>;
      const inv = inv0 as Record<string, unknown>[];
      const person = {
        username: String(p.username ?? ''),
        display_name: String(p.display_name ?? ''),
        level: Number(p.level) || 1,
        xp: Number(p.xp) || 0,
        gold: Number(p.gold) || 0,
        str_effective: Number(p.str_effective) || 0,
        str_mod: Number(p.str_mod) || 0,
        dex_effective: Number(p.dex_effective) || 0,
        dex_mod: Number(p.dex_mod) || 0,
        con_effective: Number(p.con_effective) || 0,
        ac: Number(p.ac) || 0,
        weapon_dice: String(p.weapon_dice || '1d4'),
      };
      const gearRows = (slot: string) =>
        inv
          .filter((it) => Number(it.equipped) === 1 && String(it.slot) === slot)
          .map((it) => ({
            username: person.username,
            display_name: person.display_name,
            item_label: String(it.label || '—'),
            plus_level: Number(it.plus_level) || 0,
            score: Number(it.rank_checksum) || 0,
            damage_dice: String(it.damage_dice || '1d4'),
          }))
          .sort((a, b) => b.score - a.score);
      return {
        ok: true,
        boards: {
          xp: [person],
          gold: [person],
          weapon: gearRows('weapon'),
          armor: gearRows('armor'),
          ring: gearRows('ring'),
        },
      };
    }

    case 'dungeon_world': {
      if (!addr) throw new Error('Wallet not connected');
      const wd = await ctx.fetchWorldDungeon();
      return { ok: true, dungeon_world: dungeonWorldFromChain(wd) };
    }

    case 'boss_hit': {
      if (!addr) throw new Error('Wallet not connected');
      const wd0 = await ctx.fetchWorldDungeon();
      if (!wd0) {
        throw new Error('World boss is not available yet');
      }
      const hero = await ctx.fetchHero();
      if (!hero) throw new Error('Create a character first');
      const milestone = Math.floor(Number(b.milestone ?? 0));
      const damage = Math.floor(Number(b.damage ?? 0));
      const chip = Number(b.chip ?? 0) === 1;
      const chainMs = parseInt(wd0.milestone, 10) || 10;
      if (milestone !== chainMs) {
        throw new Error('Boss progress changed. Return to town and try again.');
      }
      const r = await ctx.submitTx([msgBossHitWorld(addr, mod, milestone, damage, chip)]);
      if (!r.ok) throw new Error(r.error || 'Boss action failed');
      const wd1 = await ctx.fetchWorldDungeon();
      const dw = dungeonWorldFromChain(wd1);
      const active = dw.bosses[dw.bosses.length - 1];
      if (!active) {
        return { ok: true, hp: 0, max_hp: 0, defeated: 0, dungeon_world: dw };
      }
      return {
        ok: true,
        hp: active.hp,
        max_hp: active.max_hp,
        defeated: active.defeated,
        dungeon_world: dw,
      };
    }

    case 'jump_catalog': {
      if (!addr) throw new Error('Wallet not connected');
      const wd = await ctx.fetchWorldDungeon();
      const maxF = wd ? Math.max(10, parseInt(wd.max_unlocked_floor, 10) || 10) : 10;
      return { ok: true, catalog: JUMP_EQUIV_CATALOG, max_floor: maxF };
    }

    case 'jump_spawn_ack': {
      if (!addr) throw new Error('Wallet not connected');
      const r = await ctx.submitTx([msgJumpResetSpawn(addr, mod)]);
      if (!r.ok) throw new Error(r.error || 'Could not sync');
      return await fullPlayer(ctx);
    }

    case 'jump_submit': {
      if (!addr) throw new Error('Wallet not connected');
      const target = Math.floor(Number(b.target_floor ?? 0));
      const rawIds = Array.isArray(b.item_ids) ? b.item_ids : [];
      const idList: number[] = [];
      const seen = new Set<number>();
      for (const x of rawIds) {
        const n = Math.floor(Number(x));
        if (n > 0 && !seen.has(n)) {
          seen.add(n);
          idList.push(n);
        }
      }
      const wd = await ctx.fetchWorldDungeon();
      const maxF = wd ? Math.max(10, parseInt(wd.max_unlocked_floor, 10) || 10) : 0;
      if (!wd || maxF < 10) {
        throw new Error('Floor jump is not available yet');
      }
      if (target < 10 || target % 10 !== 0 || target > maxF) {
        throw new Error(`Target floor must be a multiple of 10 between 10 and ${maxF}`);
      }
      const needEquiv = target / 10;
      if (needEquiv < 1 || idList.length < 1) {
        throw new Error('Pick offerings and a valid target floor');
      }
      const hero = await ctx.fetchHero();
      if (!hero) throw new Error('Create a character first');
      const whSt = loadWarehouseState(addr);
      let totalEquiv = 0;
      const slots: number[] = [];
      for (const iid of idList) {
        const route = parseSyntheticItemId(iid);
        if (!route || route.kind !== 'bag') {
          throw new Error('Item not found or not yours');
        }
        if (whSt.warehouseSlots[String(route.slot)] === 1) {
          throw new Error('Take items out of storage before using them here');
        }
        const bag = Array.isArray(hero.bag) ? hero.bag : [];
        const cell = bag[route.slot];
        const packed = parseU64(String(cell ?? '0'));
        const { idx } = unpackPacked(packed);
        if (idx < 0) {
          throw new Error('Item not found or not yours');
        }
        const tpl = ctx.items[idx];
        if (!tpl || tpl.slot !== 'misc') {
          throw new Error('Only trinkets can be used as offerings');
        }
        if (idx < 19 || idx > 24) {
          throw new Error('That trinket cannot be used as a jump offering');
        }
        totalEquiv += 1;
        slots.push(route.slot);
      }
      if (totalEquiv < needEquiv) {
        throw new Error(`Not enough offerings: need ${needEquiv}, selected ${totalEquiv}`);
      }
      const uniqueSlots = [...new Set(slots)].sort((a, b) => b - a);
      const jr = await ctx.submitTx([msgJumpPortalDiscard(addr, mod, target, uniqueSlots)]);
      if (!jr.ok) throw new Error(jr.error || 'Jump failed');
      const payload = await fullPlayer(ctx);
      return {
        ...payload,
        jump: {
          target_floor: target,
          equiv_needed: needEquiv,
          equiv_consumed: totalEquiv,
        },
      };
    }

    case 'warehouse_set': {
      if (!addr) throw new Error('Wallet not connected');
      const wItemId = Math.floor(Number(b.item_id ?? 0));
      const wFlag = Math.floor(Number(b.warehouse ?? -1));
      if (wItemId < 1 || (wFlag !== 0 && wFlag !== 1)) {
        throw new Error('Invalid request');
      }
      const route = parseSyntheticItemId(wItemId);
      if (!route) {
        throw new Error('Nothing there');
      }
      if (route.kind === 'equip') {
        throw new Error('Unequip items before moving them to storage');
      }
      const hero = await ctx.fetchHero();
      if (!hero) throw new Error('Create a character first');
      const bag = Array.isArray(hero.bag) ? hero.bag : [];
      const cell = bag[route.slot];
      if (!cell || parseU64(String(cell)) === 0n) {
        throw new Error('Nothing there');
      }
      const st = loadWarehouseState(addr);
      if (wFlag === 1) {
        st.warehouseSlots[String(route.slot)] = 1;
      } else {
        delete st.warehouseSlots[String(route.slot)];
      }
      saveWarehouseState(addr, st);
      return await fullPlayer(ctx);
    }

    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}
