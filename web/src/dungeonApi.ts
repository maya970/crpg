import { RESTClient } from '@initia/initia.js';

/** 避免 REST 长期无响应导致 iframe 一直停在「加载中」 */
const LCD_FETCH_MS = 28000;

export class LcdTimeoutError extends Error {
  constructor() {
    super('链上 REST 查询超时，请检查 VITE_LCD_URL 与网络');
    this.name = 'LcdTimeoutError';
  }
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
  const structTag = `${moduleAddress}::dungeon::GameStore`;
  try {
    const res = await withLcdTimeout(client.move.resource<GameStoreRaw>(moduleAddress, structTag));
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
  const structTag = `${moduleAddress}::dungeon::Hero`;
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
  const structTag = `${moduleAddress}::dungeon::AuctionHouse`;
  try {
    const res = await withLcdTimeout(client.move.resource<AuctionHouseRaw>(moduleAddress, structTag));
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
  const structTag = `${moduleAddress}::dungeon::WorldDungeonState`;
  try {
    const res = await withLcdTimeout(client.move.resource<WorldDungeonRaw>(moduleAddress, structTag));
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
  const structTag = `${moduleAddress}::dungeon::DungeonSpawn`;
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
