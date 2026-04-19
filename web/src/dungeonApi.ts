import { RESTClient } from '@initia/initia.js';

/** 避免 REST 长期无响应导致 iframe 一直停在「加载中」 */
const LCD_FETCH_MS = 28000;

export class LcdTimeoutError extends Error {
  constructor() {
    super('链上 REST 查询超时，请检查 VITE_LCD_URL 与网络');
    this.name = 'LcdTimeoutError';
  }
}

/**
 * Initia REST 查询 Move 资源时，地址与 struct tag 内模块地址常需 **32 字节 hex**（0x + 64 字符），
 * 短写 `0x249a…` 会导致 404，前端误判「无拍卖行」。
 * bech32（init1…）原样返回，由 SDK/节点解析。
 */
export function canonMoveModuleAddress(addr: string): string {
  const t = String(addr).trim();
  if (!t) return t;
  if (t.toLowerCase().startsWith('init')) return t;
  if (!/^0x[0-9a-fA-F]+$/i.test(t)) return t;
  const hex = t.slice(2).toLowerCase();
  if (hex.length > 64) return '0x' + hex.slice(-64);
  return '0x' + hex.padStart(64, '0');
}

function withLcdTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new LcdTimeoutError()), LCD_FETCH_MS);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/** LCD 返回的 Move 资源字段多为字符串 */
export interface HeroRaw {
  xp: string;
  gold: string;
  str: string;
  dex: string;
  con: string;
  hp: string;
  floor: string;
  seed: string;
  mon_id: string;
  mon_hp: string;
  mon_max_hp: string;
  mon_ac: string;
  mon_to_hit: string;
  mon_dn: string;
  mon_dd: string;
  mon_dm: string;
  eq_w_main: string;
  eq_w_off: string;
  eq_armor: string;
  eq_ring: string;
  eq_boots: string;
  bag?: unknown;
  chest_taken: string;
  chest_floor: string;
  ready_descend?: string | boolean;
}

export interface GameStoreRaw {
  admin: string;
  mint_items_enabled: string | boolean;
  next_nft_id: string;
  nfts?: unknown;
}

export interface AuctionLotRaw {
  id: string;
  seller: string;
  packed: string;
  price_gold: string;
}

export interface AuctionHouseRaw {
  lots?: unknown;
  next_id?: string;
}

/** @adventurer WorldDungeonState — shared boss PoW pool */
export interface WorldDungeonRaw {
  max_unlocked_floor: string;
  milestone: string;
  work_accumulated: string;
  work_target: string;
}

export interface DungeonSpawnRaw {
  floor: string;
}

export async function fetchGameStore(
  lcdUrl: string,
  moduleAddress: string
): Promise<GameStoreRaw | null> {
  const client = new RESTClient(lcdUrl);
  const mod = canonMoveModuleAddress(moduleAddress);
  const structTag = `${mod}::dungeon::GameStore`;
  try {
    const res = await withLcdTimeout(client.move.resource<GameStoreRaw>(mod, structTag));
    return res.data;
  } catch {
    return null;
  }
}

export async function fetchHero(
  lcdUrl: string,
  playerAddress: string,
  moduleAddress: string
): Promise<HeroRaw | null> {
  const client = new RESTClient(lcdUrl);
  const mod = canonMoveModuleAddress(moduleAddress);
  const structTag = `${mod}::dungeon::Hero`;
  try {
    const res = await withLcdTimeout(client.move.resource<HeroRaw>(playerAddress, structTag));
    return res.data;
  } catch (e) {
    if (e instanceof LcdTimeoutError) throw e;
    return null;
  }
}

export async function fetchAuctionHouse(
  lcdUrl: string,
  moduleAddress: string
): Promise<AuctionHouseRaw | null> {
  const client = new RESTClient(lcdUrl);
  const mod = canonMoveModuleAddress(moduleAddress);
  const structTag = `${mod}::dungeon::AuctionHouse`;
  try {
    const res = await withLcdTimeout(client.move.resource<AuctionHouseRaw>(mod, structTag));
    return res.data;
  } catch {
    return null;
  }
}

export async function fetchWorldDungeon(
  lcdUrl: string,
  moduleAddress: string
): Promise<WorldDungeonRaw | null> {
  const client = new RESTClient(lcdUrl);
  const mod = canonMoveModuleAddress(moduleAddress);
  const structTag = `${mod}::dungeon::WorldDungeonState`;
  try {
    const res = await withLcdTimeout(client.move.resource<WorldDungeonRaw>(mod, structTag));
    return res.data;
  } catch {
    return null;
  }
}

export async function fetchDungeonSpawn(
  lcdUrl: string,
  playerAddress: string,
  moduleAddress: string
): Promise<DungeonSpawnRaw | null> {
  const client = new RESTClient(lcdUrl);
  const mod = canonMoveModuleAddress(moduleAddress);
  const structTag = `${mod}::dungeon::DungeonSpawn`;
  try {
    const res = await withLcdTimeout(client.move.resource<DungeonSpawnRaw>(playerAddress, structTag));
    return res.data;
  } catch (e) {
    if (e instanceof LcdTimeoutError) throw e;
    return null;
  }
}

export function parseU64(s: string): bigint {
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}
