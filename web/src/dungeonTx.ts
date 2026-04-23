import type { EncodeObject } from '@cosmjs/proto-signing';
import { Buffer } from 'buffer';
import { MsgExecute, bcs } from '@initia/initia.js';

const MSG_EXECUTE = '/initia.move.v1.MsgExecute' as const;

/** Initia Move `MsgExecute` args: each value is BCS bytes as base64 (see initia-js docs). */
function moveArgBcs(bytes: Uint8Array): string {
  const withB64 = bytes as Uint8Array & { toBase64?: () => string };
  if (typeof withB64.toBase64 === 'function') return withB64.toBase64();
  return Buffer.from(bytes).toString('base64');
}

function b64U64(v: string | number | bigint): string {
  const x = typeof v === 'bigint' ? v : String(v);
  return moveArgBcs(bcs.u64().serialize(x));
}

function b64U8(v: number): string {
  const n = Math.min(255, Math.max(0, Math.floor(Number(v))));
  return moveArgBcs(bcs.u8().serialize(n));
}

function b64Bool(v: boolean): string {
  return moveArgBcs(bcs.bool().serialize(v));
}

function b64Address(addr: string): string {
  return moveArgBcs(bcs.address().serialize(addr));
}

export type DungeonFn =
  | 'register'
  | 'rest_at_inn'
  | 'encounter_start'
  | 'auto_battle'
  | 'descend_floor'
  | 'claim_chest'
  | 'sell_bag_slot'
  | 'equip_from_bag'
  | 'unequip_to_bag'
  | 'bootstrap_game_store'
  | 'bootstrap_auction_house'
  | 'admin_set_item_mint_enabled'
  | 'mint_item_nft_from_bag'
  | 'burn_nft_to_bag'
  | 'transfer_item_nft'
  | 'death_reset_run'
  | 'unequip_append'
  | 'sell_all_bag'
  | 'enhance_bag_slot'
  | 'enhance_equip_slot'
  | 'auction_post'
  | 'auction_cancel'
  | 'auction_buy'
  | 'bootstrap_world_dungeon'
  | 'boss_hit_world'
  | 'jump_portal_discard'
  | 'jump_reset_spawn'
  | 'init_dungeon_spawn';

export function dungeonExecuteMsg(
  sender: string,
  moduleAddress: string,
  functionName: DungeonFn,
  typeArgs: string[] = [],
  args: string[] = []
): EncodeObject {
  const msg = new MsgExecute(sender, moduleAddress, 'dungeon', functionName, typeArgs, args);
  return { typeUrl: MSG_EXECUTE, value: msg.toProto() };
}

/** auto_battle(max_rounds: u8) */
export function msgAutoBattle(sender: string, mod: string, maxRounds: number): EncodeObject {
  const r = Math.min(255, Math.max(1, Math.floor(maxRounds)));
  return dungeonExecuteMsg(sender, mod, 'auto_battle', [], [b64U8(r)]);
}

/** One signature: encounter_start then auto_battle (msgs run in order in a single tx). */
export function msgsEncounterThenAutoBattle(
  sender: string,
  mod: string,
  maxRounds: number
): EncodeObject[] {
  return [dungeonExecuteMsg(sender, mod, 'encounter_start'), msgAutoBattle(sender, mod, maxRounds)];
}

/** sell_bag_slot(slot: u64) */
export function msgSellBag(sender: string, mod: string, slot: number): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'sell_bag_slot', [], [b64U64(slot)]);
}

/** equip_from_bag(bag_slot: u64, main_hand: bool) */
export function msgEquipFromBag(sender: string, mod: string, bagSlot: number, mainHand: boolean): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'equip_from_bag', [], [b64U64(bagSlot), b64Bool(mainHand)]);
}

/** unequip_to_bag: slot_kind 0 main 1 off 2 armor 3 ring 4 boots */
export function msgUnequipToBag(sender: string, mod: string, bagSlot: number, slotKind: number): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'unequip_to_bag', [], [b64U64(bagSlot), b64U8(slotKind)]);
}

export function msgAdminSetMint(sender: string, mod: string, enabled: boolean): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'admin_set_item_mint_enabled', [], [b64Bool(enabled)]);
}

export function msgMintItemNft(sender: string, mod: string, bagSlot: number): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'mint_item_nft_from_bag', [], [b64U64(bagSlot)]);
}

export function msgBurnNftToBag(sender: string, mod: string, nftId: string): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'burn_nft_to_bag', [], [b64U64(nftId)]);
}

export function msgTransferItemNft(sender: string, mod: string, nftId: string, toAddress: string): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'transfer_item_nft', [], [b64U64(nftId), b64Address(toAddress)]);
}

export function msgDeathResetRun(sender: string, mod: string): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'death_reset_run');
}

export function msgUnequipAppend(sender: string, mod: string, slotKind: number): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'unequip_append', [], [b64U8(slotKind)]);
}

export function msgSellAllBag(sender: string, mod: string): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'sell_all_bag');
}

export function msgEnhanceBagSlot(sender: string, mod: string, bagSlot: number): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'enhance_bag_slot', [], [b64U64(bagSlot)]);
}

export function msgEnhanceEquipSlot(sender: string, mod: string, slotKind: number): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'enhance_equip_slot', [], [b64U8(slotKind)]);
}

export function msgAuctionPost(sender: string, mod: string, bagSlot: number, priceGold: string): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'auction_post', [], [b64U64(bagSlot), b64U64(priceGold)]);
}

export function msgAuctionCancel(sender: string, mod: string, lotId: string): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'auction_cancel', [], [b64U64(lotId)]);
}

export function msgAuctionBuy(sender: string, mod: string, lotId: string): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'auction_buy', [], [b64U64(lotId)]);
}

export function msgBootstrapAuctionHouse(sender: string, mod: string): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'bootstrap_auction_house');
}

export function msgBootstrapWorldDungeon(sender: string, mod: string): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'bootstrap_world_dungeon');
}

/** boss_hit_world(milestone, damage, chip) */
export function msgBossHitWorld(
  sender: string,
  mod: string,
  milestone: number,
  damage: number,
  chip: boolean
): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'boss_hit_world', [], [
    b64U64(milestone),
    b64U64(damage),
    b64Bool(chip),
  ]);
}

/** jump_portal_discard(target_floor, n, s0..s7) — pass slots sorted descending, pad with 0 */
export function msgJumpPortalDiscard(
  sender: string,
  mod: string,
  targetFloor: number,
  slotsDesc: number[]
): EncodeObject {
  const n = Math.min(8, Math.max(1, slotsDesc.length));
  const s = slotsDesc.slice(0, 8);
  while (s.length < 8) s.push(0);
  return dungeonExecuteMsg(sender, mod, 'jump_portal_discard', [], [
    b64U64(targetFloor),
    b64U64(n),
    ...s.map((x) => b64U64(x)),
  ]);
}

export function msgJumpResetSpawn(sender: string, mod: string): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'jump_reset_spawn');
}

export function msgInitDungeonSpawn(sender: string, mod: string): EncodeObject {
  return dungeonExecuteMsg(sender, mod, 'init_dungeon_spawn');
}
