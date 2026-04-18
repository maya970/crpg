/// On-chain RPG: numbers aligned with js/dungeon-game.js and php/bootstrap.php (d20 hit, weapon dice+STR, floor pool, kill/chest rewards, weighted drops).
/// No wipe: heroes persist; dead heroes pay gold to rest; no reset.
module adventurer::dungeon {
    use std::signer;
    use std::vector;
    use adventurer::catalog;

    const E_NO_HERO: u64 = 1;
    const E_ALREADY_REG: u64 = 2;
    const E_PLAYER_DEAD: u64 = 3;
    const E_MONSTER_ACTIVE: u64 = 4;
    const E_NO_ENCOUNTER: u64 = 5;
    const E_BAG_FULL: u64 = 6;
    const E_BAD_SLOT: u64 = 7;
    const E_CANT_EQUIP: u64 = 8;
    const E_NOT_DEAD: u64 = 9;
    const E_GOLD: u64 = 10;
    const E_CHEST_CAP: u64 = 11;
    const E_NO_DESCEND_TOKEN: u64 = 12;
    const E_NO_GAME_STORE: u64 = 13;
    const E_NOT_ADMIN: u64 = 14;
    const E_NFT_NOT_FOUND: u64 = 15;
    const E_MINT_DISABLED: u64 = 16;
    const E_NOT_OWNER: u64 = 17;
    const E_GAME_STORE_EXISTS: u64 = 18;
    const E_NO_AUCTION_HOUSE: u64 = 19;
    const E_AUCTION_HOUSE_EXISTS: u64 = 20;
    const E_AUC_LOT: u64 = 21;
    const E_AUC_PRICE: u64 = 22;
    const E_AUC_SELF: u64 = 23;
    const E_AUC_LOTS_CAP: u64 = 24;
    const E_PLUS_MAX: u64 = 25;
    const E_WORLD_DUNGEON_EXISTS: u64 = 26;
    const E_NO_WORLD_DUNGEON: u64 = 27;
    const E_BOSS_PARAM: u64 = 28;
    const E_JUMP_PORTAL: u64 = 29;
    const E_CHIP_DAMAGE: u64 = 30;
    const E_DUNGEON_SPAWN_EXISTS: u64 = 31;
    const E_FLOOR_MAX: u64 = 32;
    const MON_NONE: u8 = 255;
    const BAG_CAP: u64 = 16;
    const ITEM_SLOTS: u64 = 27;
    /// Cap floor so u64 scaling math cannot overflow (descend is unbounded on-chain).
    const MAX_FLOOR: u64 = 1_000_000;

    struct Hero has key {
        xp: u64,
        gold: u64,
        str: u64,
        dex: u64,
        con: u64,
        hp: u64,
        floor: u64,
        seed: u64,
        mon_id: u8,
        mon_hp: u64,
        mon_max_hp: u64,
        mon_ac: u64,
        mon_to_hit: u64,
        mon_dn: u8,
        mon_dd: u8,
        mon_dm: u64,
        eq_w_main: u16,
        eq_w_off: u16,
        eq_armor: u16,
        eq_ring: u16,
        eq_boots: u16,
        bag: vector<u16>,
        chest_taken: u8,
        chest_floor: u64,
        /// May descend only after killing this floor's monster and resolving (no skip after register).
        ready_descend: bool,
    }

    /// Tracks bag items minted as registered on-chain NFTs; same id if bridged to standard NFTs.
    struct NftRecord has store, copy, drop {
        id: u64,
        owner: address,
        packed: u16,
    }

    /// Global game store: item mint toggle + NFT registry (burn returns item to bag).
    struct GameStore has key {
        admin: address,
        mint_items_enabled: bool,
        next_nft_id: u64,
        nfts: vector<NftRecord>,
    }

    struct AuctionLot has store, copy, drop {
        id: u64,
        seller: address,
        packed: u16,
        price_gold: u64,
    }

    /// Global auction house (separate from GameStore to avoid breaking deployed layout).
    struct AuctionHouse has key {
        lots: vector<AuctionLot>,
        next_id: u64,
    }

    /// Shared world boss: all players contribute capped damage until work_accumulated >= work_target (PoW-style pool).
    struct WorldDungeonState has key {
        max_unlocked_floor: u64,
        milestone: u64,
        work_accumulated: u64,
        work_target: u64,
    }

    /// 3D client entry floor (jump portal). Combat progression stays in Hero.floor.
    struct DungeonSpawn has key {
        floor: u64,
    }

    const AUCTION_LOTS_CAP: u64 = 256;

    fun find_nft_idx_rec(v: &vector<NftRecord>, nft_id: u64, i: u64): (bool, u64) {
        let len = vector::length(v);
        if (i >= len) {
            (false, 0)
        } else {
            let e = vector::borrow(v, i);
            if (e.id == nft_id) {
                (true, i)
            } else {
                find_nft_idx_rec(v, nft_id, i + 1)
            }
        }
    }

    /// LCG step matching JS uint64 wrap; raw u64*u64 aborts on overflow - keep low 64 bits.
    fun next_seed(s: u64): u64 {
        let t = (s as u128) * 1103515245u128 + 12345u128;
        let mask: u128 = 0xffffffffffffffffu128;
        ((t & mask) as u64)
    }

    fun min_u64(a: u64, b: u64): u64 {
        if (a < b) { a } else { b }
    }

    fun max_u64(a: u64, b: u64): u64 {
        if (a > b) { a } else { b }
    }

    fun world_dungeon_tier(f: u64): u64 {
        let ff = if (f < 1) {
            1
        } else {
            f
        };
        (ff - 1) / 10 + 1
    }

    /// Same scaling as PHP world boss hp_max (ginger_grunt template).
    fun world_boss_work_target(milestone: u64): u64 {
        let f = min_u64(milestone, MAX_FLOOR);
        let base = 18u128;
        let ff = (f as u128);
        let mul_num = 100u128 + (ff - 1u128) * 11u128;
        let hp0 = (base * mul_num) / 100u128 + (ff - 1u128) * 2u128;
        let tm = (world_dungeon_tier(f) as u128);
        let hp1 = hp0 * tm;
        let out = hp1 * 1000u128;
        let cap: u128 = 0xffffffffffffffffu128;
        if (out > cap) {
            cap as u64
        } else {
            (out as u64)
        }
    }

    fun weapon_dice_max_main_hand(h: &Hero): u64 {
        let wi = unpack_idx(h.eq_w_main);
        if (wi == MON_NONE) {
            4
        } else {
            let pw = (packed_plus_u8(h.eq_w_main) as u128) * 2u128;
            let (n, d, m) = catalog::item_damage_ndm(wi);
            let t = (n as u128) * (d as u128) + (m as u128) + pw;
            let cap: u128 = 0xffffffffffffffffu128;
            if (t > cap) {
                cap as u64
            } else {
                (t as u64)
            }
        }
    }

    /// Capped work contribution per hit (matches PHP boss_hit_apply damage cap).
    fun boss_work_from_reported(h: &Hero, damage: u64, chip: bool): u64 {
        if (chip) {
            assert!(damage == 1, E_CHIP_DAMAGE);
            1
        } else {
            let dice_max = weapon_dice_max_main_hand(h);
            let se = h.str + sum_str_eq(h);
            let sa = stat_add(se);
            let ss = stat_sub(se);
            let hit_max = apply_net(dice_max, sa, ss);
            let cap = max_u64(8, hit_max + 10);
            min_u64(damage, cap)
        }
    }

    fun sqrt_floor(y: u64): u64 {
        if (y < 2) {
            y
        } else {
            let i = 1u64;
            let best = 0u64;
            let yy = (y as u128);
            while ((i as u128) * (i as u128) <= yy && i < 100000) {
                best = i;
                i = i + 1;
            };
            best
        }
    }

    fun sqrt_ceil(y: u64): u64 {
        let s = sqrt_floor(y);
        let ss = (s as u128) * (s as u128);
        if (ss >= (y as u128)) {
            s
        } else {
            s + 1
        }
    }

    fun packed_plus_u8(p: u16): u8 {
        let lo = (p as u64) & 255u64;
        lo as u8
    }

    fun enhance_cost_gold(plus: u8): u64 {
        let c = 50u64;
        let i = 0u8;
        while (i < plus) {
            c = c * 2;
            i = i + 1;
        };
        c
    }

    fun dice_difficulty_from_idx(idx: u8): u64 {
        let (n, d, _) = catalog::item_damage_ndm(idx);
        let p = ((n as u128) * (d as u128)) as u64;
        sqrt_ceil(p)
    }

    fun find_auction_lot_idx(v: &vector<AuctionLot>, lot_id: u64, i: u64): (bool, u64) {
        let len = vector::length(v);
        if (i >= len) {
            (false, 0)
        } else {
            let e = vector::borrow(v, i);
            if (e.id == lot_id) {
                (true, i)
            } else {
                find_auction_lot_idx(v, lot_id, i + 1)
            }
        }
    }

    fun stat_add(s: u64): u64 {
        if (s >= 10) {
            (s - 10) / 2
        } else {
            0
        }
    }

    fun stat_sub(s: u64): u64 {
        if (s < 10) {
            (11 - s) / 2
        } else {
            0
        }
    }

    fun apply_net(roll: u64, add: u64, sub: u64): u64 {
        let t = roll + add;
        if (t <= sub) {
            1
        } else {
            t - sub
        }
    }

    fun xp_to_level(xp: u64): u64 {
        let lvl = 1u64;
        let acc = 0u64;
        while (lvl < 99) {
            let step = 100 + (lvl - 1) * 50;
            if (xp < acc + step) {
                break
            };
            acc = acc + step;
            lvl = lvl + 1;
        };
        lvl
    }

    fun unpack_idx(p: u16): u8 {
        if (p == 0) {
            MON_NONE
        } else {
            let hi = (p >> 8) as u8;
            hi - 1
        }
    }

    fun pack_item(idx: u8, plus: u8): u16 {
        let hi = ((idx as u16) + 1) << 8;
        hi | (plus as u16)
    }

    fun sum_str_eq(h: &Hero): u64 {
        let i0 = unpack_idx(h.eq_w_main);
        let v0 = if (i0 == MON_NONE) { 0u64 } else { catalog::item_bonus_str(i0) };
        let i1 = unpack_idx(h.eq_w_off);
        let v1 = if (i1 == MON_NONE) { 0u64 } else { catalog::item_bonus_str(i1) };
        let i2 = unpack_idx(h.eq_armor);
        let v2 = if (i2 == MON_NONE) { 0u64 } else { catalog::item_bonus_str(i2) };
        let i3 = unpack_idx(h.eq_ring);
        let v3 = if (i3 == MON_NONE) { 0u64 } else { catalog::item_bonus_str(i3) };
        let i4 = unpack_idx(h.eq_boots);
        let v4 = if (i4 == MON_NONE) { 0u64 } else { catalog::item_bonus_str(i4) };
        v0 + v1 + v2 + v3 + v4
    }

    fun sum_dex_eq(h: &Hero): u64 {
        let i0 = unpack_idx(h.eq_w_main);
        let v0 = if (i0 == MON_NONE) { 0u64 } else { catalog::item_bonus_dex(i0) };
        let i1 = unpack_idx(h.eq_w_off);
        let v1 = if (i1 == MON_NONE) { 0u64 } else { catalog::item_bonus_dex(i1) };
        let i2 = unpack_idx(h.eq_armor);
        let v2 = if (i2 == MON_NONE) { 0u64 } else { catalog::item_bonus_dex(i2) };
        let i3 = unpack_idx(h.eq_ring);
        let v3 = if (i3 == MON_NONE) { 0u64 } else { catalog::item_bonus_dex(i3) };
        let i4 = unpack_idx(h.eq_boots);
        let v4 = if (i4 == MON_NONE) { 0u64 } else { catalog::item_bonus_dex(i4) };
        v0 + v1 + v2 + v3 + v4
    }

    fun sum_con_eq(h: &Hero): u64 {
        let i0 = unpack_idx(h.eq_w_main);
        let v0 = if (i0 == MON_NONE) { 0u64 } else { catalog::item_bonus_con(i0) };
        let i1 = unpack_idx(h.eq_w_off);
        let v1 = if (i1 == MON_NONE) { 0u64 } else { catalog::item_bonus_con(i1) };
        let i2 = unpack_idx(h.eq_armor);
        let v2 = if (i2 == MON_NONE) { 0u64 } else { catalog::item_bonus_con(i2) };
        let i3 = unpack_idx(h.eq_ring);
        let v3 = if (i3 == MON_NONE) { 0u64 } else { catalog::item_bonus_con(i3) };
        let i4 = unpack_idx(h.eq_boots);
        let v4 = if (i4 == MON_NONE) { 0u64 } else { catalog::item_bonus_con(i4) };
        v0 + v1 + v2 + v3 + v4
    }

    fun sum_ac_eq(h: &Hero): u64 {
        let i0 = unpack_idx(h.eq_w_main);
        let v0 = if (i0 == MON_NONE) { 0u64 } else { catalog::item_bonus_ac(i0) };
        let i1 = unpack_idx(h.eq_w_off);
        let v1 = if (i1 == MON_NONE) { 0u64 } else { catalog::item_bonus_ac(i1) };
        let i2 = unpack_idx(h.eq_armor);
        let v2 = if (i2 == MON_NONE) { 0u64 } else { catalog::item_bonus_ac(i2) };
        let i3 = unpack_idx(h.eq_ring);
        let v3 = if (i3 == MON_NONE) { 0u64 } else { catalog::item_bonus_ac(i3) };
        let i4 = unpack_idx(h.eq_boots);
        let v4 = if (i4 == MON_NONE) { 0u64 } else { catalog::item_bonus_ac(i4) };
        v0 + v1 + v2 + v3 + v4
    }

    fun hp_max_for(h: &Hero): u64 {
        let lvl = xp_to_level(h.xp);
        let ec = h.con + sum_con_eq(h);
        let cm = if (ec >= 10) {
            (ec - 10) / 2
        } else {
            0
        };
        let bracket = 4 + cm;
        let t = 8u128 + (lvl as u128) * (bracket as u128);
        let cap: u128 = 0xffffffffffffffffu128;
        let v = if (t > cap) {
            cap as u64
        } else {
            (t as u64)
        };
        max_u64(1, v)
    }

    fun ac_for(h: &Hero): u64 {
        let ed = h.dex + sum_dex_eq(h);
        let raw = 10 + stat_add(ed);
        let sub = stat_sub(ed);
        let base = if (raw <= sub) {
            1
        } else {
            raw - sub
        };
        base + sum_ac_eq(h)
    }

    fun roll_die(s: u64, faces: u64): (u64, u64) {
        let s2 = next_seed(s);
        let v = (s2 % faces) + 1;
        (v, s2)
    }

    fun roll_ndm_inner(s: u64, left: u64, d: u64, acc: u64): (u64, u64) {
        if (left == 0) {
            (acc, s)
        } else {
            let (v, s1) = roll_die(s, d);
            roll_ndm_inner(s1, left - 1, d, acc + v)
        }
    }

    fun roll_ndm(s: u64, n: u64, d: u64, modv: u64): (u64, u64) {
        let (sum, s2) = roll_ndm_inner(s, n, d, 0);
        let t = sum + modv;
        let out = if (t < 1) {
            1
        } else {
            t
        };
        (out, s2)
    }

    fun pick_monster_id(floor: u64, s: u64): (u8, u64) {
        let f = if (floor < 1) {
            1
        } else {
            floor
        };
        let s2 = next_seed(s);
        let r = s2 % 1000;
        let id = if (f <= 4) {
            let i = r % 4;
            if (i == 0) {
                0u8
            } else if (i == 1) {
                1u8
            } else if (i == 2) {
                3u8
            } else {
                6u8
            }
        } else if (f <= 11) {
            let i = r % 8;
            if (i == 0) {
                0u8
            } else if (i == 1) {
                1u8
            } else if (i == 2) {
                3u8
            } else if (i == 3) {
                6u8
            } else if (i == 4) {
                4u8
            } else if (i == 5) {
                5u8
            } else if (i == 6) {
                7u8
            } else {
                8u8
            }
        } else if (f <= 24) {
            let i = r % 8;
            if (i == 0) {
                2u8
            } else if (i == 1) {
                4u8
            } else if (i == 2) {
                5u8
            } else if (i == 3) {
                7u8
            } else if (i == 4) {
                8u8
            } else if (i == 5) {
                9u8
            } else if (i == 6) {
                10u8
            } else {
                3u8
            }
        } else {
            (r % 12) as u8
        };
        (id, next_seed(s2))
    }

    fun scale_monster(floor: u64, id: u8): (u64, u64, u64, u8, u8, u64) {
        let f = min_u64(
            if (floor < 1) {
                1
            } else {
                floor
            },
            MAX_FLOOR
        );
        let bhp = catalog::mon_base_hp(id);
        let ff = (f as u128);
        let mul = 100u128 + (ff - 1u128) * 11u128;
        let hp128 = ((bhp as u128) * mul) / 100u128 + (ff - 1u128) * 2u128;
        let cap: u128 = 0xffffffffffffffffu128;
        let hp = max_u64(
            1,
            if (hp128 > cap) {
                cap as u64
            } else {
                (hp128 as u64)
            }
        );
        let bac = catalog::mon_base_ac(id);
        let ac = min_u64(30, bac + (f - 1) / 2);
        let bth = catalog::mon_base_to_hit(id);
        let th = min_u64(20, bth + (f - 1) / 3);
        let (n, d, m) = catalog::mon_damage_ndm(id);
        (hp, ac, th, n as u8, d as u8, m)
    }

    fun sum_loot_w(floor: u64, i: u64): u64 {
        if (i >= ITEM_SLOTS) {
            0
        } else {
            catalog::loot_weight_adjusted(i as u8, floor) + sum_loot_w(floor, i + 1)
        }
    }

    fun pick_loot_walk(floor: u64, i: u64, target: u64, acc: u64): u8 {
        if (i >= ITEM_SLOTS) {
            0
        } else {
            let w = catalog::loot_weight_adjusted(i as u8, floor);
            let next = acc + w;
            if (target < next) {
                i as u8
            } else {
                pick_loot_walk(floor, i + 1, target, next)
            }
        }
    }

    fun try_loot_drop(h: &mut Hero, floor: u64, chance: u64, s: u64): u64 {
        let s1 = next_seed(s);
        let roll = (s1 % 100) + 1;
        let s2 = next_seed(s1);
        if (roll <= chance) {
            let total = sum_loot_w(floor, 0);
            if (total == 0) {
                s2
            } else {
                let pick = (s2 % total);
                let s3 = next_seed(s2);
                let idx = pick_loot_walk(floor, 0, pick, 0);
                if (vector::length(&h.bag) < BAG_CAP) {
                    vector::push_back(&mut h.bag, pack_item(idx, 0));
                };
                s3
            }
        } else {
            s2
        }
    }

    fun kill_loot_chance(f: u64): u64 {
        let ff = if (f < 1) {
            1
        } else {
            f
        };
        let sx = sqrt_floor(ff) * 7 / 2;
        let inner = 12 + min_u64(68, sx + (ff - 1) / 45);
        min_u64(82, inner)
    }

    fun chest_loot_chance(f: u64): u64 {
        let ff = if (f < 1) {
            1
        } else {
            f
        };
        let sx = sqrt_floor(ff) * 7 / 2;
        let inner = 28 + min_u64(58, sx + (ff - 1) / 50);
        min_u64(88, inner)
    }

    fun grant_kill_rewards(h: &mut Hero) {
        let f = h.floor;
        let ff0 = if (f < 1) {
            1
        } else {
            f
        };
        let ff = min_u64(ff0, MAX_FLOOR);
        let s0 = h.seed;
        let base_xp = 3 + (s0 % 14);
        let xp = base_xp + (ff - 1) * 26 / 10;
        let s1 = next_seed(s0);
        let base_g = 1 + (s1 % 11);
        let g = base_g + (ff - 1) * 15 / 10;
        let s2 = next_seed(s1);
        h.xp = h.xp + xp;
        h.gold = h.gold + g;
        let ch = kill_loot_chance(ff);
        let s3 = try_loot_drop(h, ff, ch, s2);
        h.seed = s3;
    }

    fun grant_chest_rewards(h: &mut Hero) {
        let f = h.floor;
        let ff0 = if (f < 1) {
            1
        } else {
            f
        };
        let ff = min_u64(ff0, MAX_FLOOR);
        let s0 = h.seed;
        let base_xp = 5 + (s0 % 18);
        let xp = base_xp + (ff - 1) * 32 / 10;
        let s1 = next_seed(s0);
        let base_g = 2 + (s1 % 13);
        let g = base_g + (ff - 1) * 20 / 10;
        let s2 = next_seed(s1);
        h.xp = h.xp + xp;
        h.gold = h.gold + g;
        let ch = chest_loot_chance(ff);
        let s3 = try_loot_drop(h, ff, ch, s2);
        h.seed = s3;
    }

    /// Call once after deploy from the account that matches named address `adventurer` to init GameStore.
    public entry fun bootstrap_game_store(account: &signer) {
        let a = signer::address_of(account);
        assert!(a == @adventurer, E_NOT_ADMIN);
        assert!(!exists<GameStore>(@adventurer), E_GAME_STORE_EXISTS);
        move_to(
            account,
            GameStore {
                admin: a,
                mint_items_enabled: true,
                next_nft_id: 1,
                nfts: vector::empty(),
            }
        );
    }

    /// Runs when this package is **first** published: creates `AuctionHouse` at `@adventurer` (publisher).
    /// After that, **any player** can use the auction; no publish-wallet step is required on new deploys.
    /// (Move cannot `move_to` another account's global storage, so the resource must be created at publish or by `@adventurer`.)
    fun init_module(deployer: &signer) {
        if (!exists<AuctionHouse>(@adventurer)) {
            move_to(
                deployer,
                AuctionHouse {
                    lots: vector::empty(),
                    next_id: 1,
                }
            );
        };
    }

    /// Idempotent: if `AuctionHouse` already exists (e.g. after `init_module` or a prior bootstrap), **any** caller is a no-op.
    /// If still missing (old deployments without `init_module`), only `@adventurer` can create it so it lands at the global address.
    public entry fun bootstrap_auction_house(account: &signer) {
        if (!exists<AuctionHouse>(@adventurer)) {
            let a = signer::address_of(account);
            assert!(a == @adventurer, E_NOT_ADMIN);
            move_to(
                account,
                AuctionHouse {
                    lots: vector::empty(),
                    next_id: 1,
                }
            );
        };
    }

    /// One-time init shared world boss / jump max floor (same admin as other bootstraps).
    public entry fun bootstrap_world_dungeon(account: &signer) {
        let a = signer::address_of(account);
        assert!(a == @adventurer, E_NOT_ADMIN);
        assert!(!exists<WorldDungeonState>(@adventurer), E_WORLD_DUNGEON_EXISTS);
        let ms = 10u64;
        move_to(
            account,
            WorldDungeonState {
                max_unlocked_floor: 10,
                milestone: ms,
                work_accumulated: 0,
                work_target: world_boss_work_target(ms),
            }
        );
    }

    /// For heroes registered before DungeonSpawn existed.
    public entry fun init_dungeon_spawn(account: &signer) {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        assert!(!exists<DungeonSpawn>(a), E_DUNGEON_SPAWN_EXISTS);
        move_to(account, DungeonSpawn { floor: 1 });
    }

    /// Reset 3D spawn floor to 1 (jump portal ack). Creates DungeonSpawn if missing.
    public entry fun jump_reset_spawn(account: &signer) acquires DungeonSpawn {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        if (!exists<DungeonSpawn>(a)) {
            move_to(account, DungeonSpawn { floor: 1 });
        } else {
            let sp = borrow_global_mut<DungeonSpawn>(a);
            sp.floor = 1;
        };
    }

    /// Destroy misc bag slots (no gold); set 3D spawn_floor to target. Slot indices strict-descending (remove high index first). n in 1..8.
    public entry fun jump_portal_discard(
        account: &signer,
        target_floor: u64,
        n: u64,
        s0: u64,
        s1: u64,
        s2: u64,
        s3: u64,
        s4: u64,
        s5: u64,
        s6: u64,
        s7: u64,
    ) acquires Hero, WorldDungeonState {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        assert!(exists<WorldDungeonState>(@adventurer), E_NO_WORLD_DUNGEON);
        assert!(n >= 1 && n <= 8, E_JUMP_PORTAL);
        let max_f = {
            let wd0 = borrow_global<WorldDungeonState>(@adventurer);
            wd0.max_unlocked_floor
        };
        assert!(max_f >= 10 && target_floor >= 10 && target_floor % 10 == 0 && target_floor <= max_f, E_JUMP_PORTAL);
        let need = target_floor / 10;
        if (!exists<DungeonSpawn>(a)) {
            move_to(account, DungeonSpawn { floor: 1 });
        };
        {
            let h = borrow_global_mut<Hero>(a);
            let total = 0u64;
            let prev = BAG_CAP;
            let i = 0u64;
            while (i < n) {
                let slot = if (i == 0) {
                    s0
                } else if (i == 1) {
                    s1
                } else if (i == 2) {
                    s2
                } else if (i == 3) {
                    s3
                } else if (i == 4) {
                    s4
                } else if (i == 5) {
                    s5
                } else if (i == 6) {
                    s6
                } else {
                    s7
                };
                assert!(slot < prev, E_JUMP_PORTAL);
                prev = slot;
                let len = vector::length(&h.bag);
                assert!(slot < len, E_BAD_SLOT);
                let p = *vector::borrow(&h.bag, slot);
                let idx = unpack_idx(p);
                assert!(idx != MON_NONE, E_BAD_SLOT);
                assert!(catalog::item_slot_kind(idx) == 4, E_JUMP_PORTAL);
                let eu = catalog::jump_equiv_units(idx);
                assert!(eu > 0, E_JUMP_PORTAL);
                total = total + eu;
                i = i + 1;
            };
            assert!(total >= need, E_JUMP_PORTAL);
            i = 0;
            while (i < n) {
                let slot = if (i == 0) {
                    s0
                } else if (i == 1) {
                    s1
                } else if (i == 2) {
                    s2
                } else if (i == 3) {
                    s3
                } else if (i == 4) {
                    s4
                } else if (i == 5) {
                    s5
                } else if (i == 6) {
                    s6
                } else {
                    s7
                };
                let _ = vector::swap_remove(&mut h.bag, slot);
                h.seed = next_seed(h.seed);
                i = i + 1;
            };
        };
        let sp = borrow_global_mut<DungeonSpawn>(a);
        sp.floor = target_floor;
    }

    /// Contribute capped work to the shared world boss pool; XP/gold per hit. When pool reaches work_target, unlock next milestone.
    public entry fun boss_hit_world(account: &signer, milestone: u64, damage: u64, chip: bool) acquires Hero, WorldDungeonState {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        assert!(exists<WorldDungeonState>(@adventurer), E_NO_WORLD_DUNGEON);
        assert!(milestone >= 10 && milestone % 10 == 0, E_BOSS_PARAM);
        let h = borrow_global_mut<Hero>(a);
        assert!(h.hp > 0, E_PLAYER_DEAD);
        let wd = borrow_global_mut<WorldDungeonState>(@adventurer);
        assert!(milestone == wd.milestone, E_BOSS_PARAM);
        let tgt = wd.work_target;
        let wcap = boss_work_from_reported(h, damage, chip);
        if (wd.work_accumulated < tgt) {
            let room = tgt - wd.work_accumulated;
            let inc = min_u64(wcap, room);
            wd.work_accumulated = wd.work_accumulated + inc;
            let ms = wd.milestone;
            h.xp = h.xp + 2 + ms / 30;
            h.gold = h.gold + 1 + ms / 40;
            h.seed = next_seed(h.seed);
            if (wd.work_accumulated >= wd.work_target) {
                let next_ms = wd.milestone + 10;
                wd.max_unlocked_floor = max_u64(wd.max_unlocked_floor, min_u64(100000, next_ms));
                wd.work_accumulated = 0;
                if (next_ms <= 100000) {
                    wd.milestone = next_ms;
                    wd.work_target = world_boss_work_target(next_ms);
                } else {
                    wd.milestone = 100000;
                    wd.work_target = world_boss_work_target(100000);
                };
            };
        };
    }

    /// Admin: allow or deny minting bag items into registered NFTs.
    public entry fun admin_set_item_mint_enabled(account: &signer, enabled: bool) acquires GameStore {
        assert!(exists<GameStore>(@adventurer), E_NO_GAME_STORE);
        let gs = borrow_global_mut<GameStore>(@adventurer);
        assert!(signer::address_of(account) == gs.admin, E_NOT_ADMIN);
        gs.mint_items_enabled = enabled;
    }

    /// Mint one bag slot into a registered NFT (consumes global id; removed from bag).
    public entry fun mint_item_nft_from_bag(account: &signer, bag_slot: u64) acquires Hero, GameStore {
        let a = signer::address_of(account);
        assert!(exists<GameStore>(@adventurer), E_NO_GAME_STORE);
        assert!(exists<Hero>(a), E_NO_HERO);
        let gs = borrow_global_mut<GameStore>(@adventurer);
        assert!(gs.mint_items_enabled, E_MINT_DISABLED);
        let h = borrow_global_mut<Hero>(a);
        assert!(h.hp > 0, E_PLAYER_DEAD);
        let len = vector::length(&h.bag);
        assert!(bag_slot < len, E_BAD_SLOT);
        let p = *vector::borrow(&h.bag, bag_slot);
        let idx = unpack_idx(p);
        assert!(idx != MON_NONE, E_BAD_SLOT);
        let _ = vector::swap_remove(&mut h.bag, bag_slot);
        let nid = gs.next_nft_id;
        gs.next_nft_id = gs.next_nft_id + 1;
        vector::push_back(
            &mut gs.nfts,
            NftRecord { id: nid, owner: a, packed: p }
        );
        h.seed = next_seed(h.seed);
    }

    /// Burn NFT: remove from registry and return item to bag (needs bag space).
    public entry fun burn_nft_to_bag(account: &signer, nft_id: u64) acquires Hero, GameStore {
        let a = signer::address_of(account);
        assert!(exists<GameStore>(@adventurer), E_NO_GAME_STORE);
        assert!(exists<Hero>(a), E_NO_HERO);
        let gs = borrow_global_mut<GameStore>(@adventurer);
        let (ok, i) = find_nft_idx_rec(&gs.nfts, nft_id, 0);
        assert!(ok, E_NFT_NOT_FOUND);
        let e = *vector::borrow(&gs.nfts, i);
        assert!(e.owner == a, E_NOT_OWNER);
        let packed = e.packed;
        let _x = vector::swap_remove(&mut gs.nfts, i);
        let h = borrow_global_mut<Hero>(a);
        assert!(vector::length(&h.bag) < BAG_CAP, E_BAG_FULL);
        vector::push_back(&mut h.bag, packed);
        h.seed = next_seed(h.seed);
    }

    /// Transfer registered NFT to another owner (same packed item in-game).
    public entry fun transfer_item_nft(account: &signer, nft_id: u64, to: address) acquires GameStore {
        let a = signer::address_of(account);
        assert!(exists<GameStore>(@adventurer), E_NO_GAME_STORE);
        let gs = borrow_global_mut<GameStore>(@adventurer);
        let (ok, i) = find_nft_idx_rec(&gs.nfts, nft_id, 0);
        assert!(ok, E_NFT_NOT_FOUND);
        let e = vector::borrow_mut(&mut gs.nfts, i);
        assert!(e.owner == a, E_NOT_OWNER);
        e.owner = to;
    }

    /// On death-style reset: floor 1, clear combat, full HP (legacy death API; gold kept).
    public entry fun death_reset_run(account: &signer) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let h = borrow_global_mut<Hero>(a);
        h.floor = 1;
        h.mon_id = MON_NONE;
        h.mon_hp = 0;
        h.mon_max_hp = 0;
        h.mon_ac = 0;
        h.mon_to_hit = 0;
        h.mon_dn = 1;
        h.mon_dd = 4;
        h.mon_dm = 0;
        h.ready_descend = false;
        h.chest_taken = 0;
        h.chest_floor = 1;
        let hm = hp_max_for(h);
        h.hp = hm;
        h.seed = next_seed(h.seed);
    }

    /// Unequip to end of bag (bag must not be full).
    public entry fun unequip_append(account: &signer, slot_kind: u8) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        assert!((slot_kind as u64) <= 4, E_BAD_SLOT);
        let h = borrow_global_mut<Hero>(a);
        assert!(vector::length(&h.bag) < BAG_CAP, E_BAG_FULL);
        let old: u16;
        if (slot_kind == 0) {
            old = h.eq_w_main;
            h.eq_w_main = 0;
        } else if (slot_kind == 1) {
            old = h.eq_w_off;
            h.eq_w_off = 0;
        } else if (slot_kind == 2) {
            old = h.eq_armor;
            h.eq_armor = 0;
        } else if (slot_kind == 3) {
            old = h.eq_ring;
            h.eq_ring = 0;
        } else {
            old = h.eq_boots;
            h.eq_boots = 0;
        };
        let idx = unpack_idx(old);
        assert!(idx != MON_NONE, E_BAD_SLOT);
        vector::push_back(&mut h.bag, old);
        h.seed = next_seed(h.seed);
        let hm = hp_max_for(h);
        if (h.hp > hm) {
            h.hp = hm;
        };
    }

    /// Sell all bag items only (not equipped gear).
    public entry fun sell_all_bag(account: &signer) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let h = borrow_global_mut<Hero>(a);
        let i = 0u64;
        while (i < vector::length(&h.bag)) {
            let p = *vector::borrow(&h.bag, i);
            let idx = unpack_idx(p);
            if (idx == MON_NONE) {
                i = i + 1;
            } else {
                let pay = catalog::item_sell_gold(idx);
                let _ = vector::swap_remove(&mut h.bag, i);
                h.gold = h.gold + pay;
            };
        };
        h.seed = next_seed(h.seed);
    }

    /// Enhance from bag slot (weapon/armor/ring/boots; misc cannot enhance).
    public entry fun enhance_bag_slot(account: &signer, bag_slot: u64) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let h = borrow_global_mut<Hero>(a);
        let len = vector::length(&h.bag);
        assert!(bag_slot < len, E_BAD_SLOT);
        let p_ref = vector::borrow_mut(&mut h.bag, bag_slot);
        let p = *p_ref;
        let idx = unpack_idx(p);
        assert!(idx != MON_NONE, E_BAD_SLOT);
        let sk = catalog::item_slot_kind(idx);
        assert!(sk != 4, E_CANT_EQUIP);
        let plus = packed_plus_u8(p);
        assert!((plus as u64) < 20, E_PLUS_MAX);
        let cost = enhance_cost_gold(plus);
        assert!(h.gold >= cost, E_GOLD);
        h.gold = h.gold - cost;
        let diff = dice_difficulty_from_idx(idx);
        let denom = ((plus as u64) + 1) * diff;
        let s1 = next_seed(h.seed);
        let roll = (s1 % denom) + 1;
        h.seed = next_seed(s1);
        if (roll == 1) {
            *p_ref = pack_item(idx, plus + 1);
        };
        let hm = hp_max_for(h);
        if (h.hp > hm) {
            h.hp = hm;
        };
    }

    /// Enhance equipped item: slot_kind 0 main 1 off 2 armor 3 ring 4 boots.
    public entry fun enhance_equip_slot(account: &signer, slot_kind: u8) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        assert!((slot_kind as u64) <= 4, E_BAD_SLOT);
        let h = borrow_global_mut<Hero>(a);
        let p = if (slot_kind == 0) {
            h.eq_w_main
        } else if (slot_kind == 1) {
            h.eq_w_off
        } else if (slot_kind == 2) {
            h.eq_armor
        } else if (slot_kind == 3) {
            h.eq_ring
        } else {
            h.eq_boots
        };
        let idx = unpack_idx(p);
        assert!(idx != MON_NONE, E_BAD_SLOT);
        let sk = catalog::item_slot_kind(idx);
        assert!(sk != 4, E_CANT_EQUIP);
        let plus = packed_plus_u8(p);
        assert!((plus as u64) < 20, E_PLUS_MAX);
        let cost = enhance_cost_gold(plus);
        assert!(h.gold >= cost, E_GOLD);
        h.gold = h.gold - cost;
        let diff = dice_difficulty_from_idx(idx);
        let denom = ((plus as u64) + 1) * diff;
        let s1 = next_seed(h.seed);
        let roll = (s1 % denom) + 1;
        h.seed = next_seed(s1);
        let newp = if (roll == 1) {
            pack_item(idx, plus + 1)
        } else {
            p
        };
        if (slot_kind == 0) {
            h.eq_w_main = newp;
        } else if (slot_kind == 1) {
            h.eq_w_off = newp;
        } else if (slot_kind == 2) {
            h.eq_armor = newp;
        } else if (slot_kind == 3) {
            h.eq_ring = newp;
        } else {
            h.eq_boots = newp;
        };
        let hm = hp_max_for(h);
        if (h.hp > hm) {
            h.hp = hm;
        };
    }

    /// List for sale: remove from bag into auction lots.
    public entry fun auction_post(account: &signer, bag_slot: u64, price_gold: u64) acquires Hero, AuctionHouse {
        assert!(exists<AuctionHouse>(@adventurer), E_NO_AUCTION_HOUSE);
        assert!(price_gold > 0, E_AUC_PRICE);
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let ah = borrow_global_mut<AuctionHouse>(@adventurer);
        assert!(vector::length(&ah.lots) < AUCTION_LOTS_CAP, E_AUC_LOTS_CAP);
        let h = borrow_global_mut<Hero>(a);
        let len = vector::length(&h.bag);
        assert!(bag_slot < len, E_BAD_SLOT);
        let p = *vector::borrow(&h.bag, bag_slot);
        let idx = unpack_idx(p);
        assert!(idx != MON_NONE, E_BAD_SLOT);
        let _ = vector::swap_remove(&mut h.bag, bag_slot);
        let lid = ah.next_id;
        ah.next_id = ah.next_id + 1;
        vector::push_back(
            &mut ah.lots,
            AuctionLot { id: lid, seller: a, packed: p, price_gold }
        );
        h.seed = next_seed(h.seed);
    }

    /// Seller cancels listing; item returns to bag.
    public entry fun auction_cancel(account: &signer, lot_id: u64) acquires Hero, AuctionHouse {
        assert!(exists<AuctionHouse>(@adventurer), E_NO_AUCTION_HOUSE);
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let ah = borrow_global_mut<AuctionHouse>(@adventurer);
        let (ok, i) = find_auction_lot_idx(&ah.lots, lot_id, 0);
        assert!(ok, E_AUC_LOT);
        let lot = *vector::borrow(&ah.lots, i);
        assert!(lot.seller == a, E_NOT_OWNER);
        let h = borrow_global_mut<Hero>(a);
        assert!(vector::length(&h.bag) < BAG_CAP, E_BAG_FULL);
        let _ = vector::swap_remove(&mut ah.lots, i);
        vector::push_back(&mut h.bag, lot.packed);
        h.seed = next_seed(h.seed);
    }

    /// Buy: pay gold, credit seller, item to buyer bag.
    public entry fun auction_buy(account: &signer, lot_id: u64) acquires Hero, AuctionHouse {
        assert!(exists<AuctionHouse>(@adventurer), E_NO_AUCTION_HOUSE);
        let buyer = signer::address_of(account);
        assert!(exists<Hero>(buyer), E_NO_HERO);
        let ah = borrow_global_mut<AuctionHouse>(@adventurer);
        let (ok, i) = find_auction_lot_idx(&ah.lots, lot_id, 0);
        assert!(ok, E_AUC_LOT);
        let lot = *vector::borrow(&ah.lots, i);
        assert!(lot.seller != buyer, E_AUC_SELF);
        let price = lot.price_gold;
        let packed = lot.packed;
        let seller_addr = lot.seller;
        let hb = borrow_global_mut<Hero>(buyer);
        assert!(hb.gold >= price, E_GOLD);
        assert!(vector::length(&hb.bag) < BAG_CAP, E_BAG_FULL);
        hb.gold = hb.gold - price;
        let _ = vector::swap_remove(&mut ah.lots, i);
        vector::push_back(&mut hb.bag, packed);
        hb.seed = next_seed(hb.seed);
        assert!(exists<Hero>(seller_addr), E_NO_HERO);
        let hs = borrow_global_mut<Hero>(seller_addr);
        hs.gold = hs.gold + price;
        hs.seed = next_seed(hs.seed);
    }

    /// Create hero once. Starts like PHP register: 100 gold, stats 8, floor 1, no combat.
    public entry fun register(account: &signer) {
        let a = signer::address_of(account);
        assert!(!exists<Hero>(a), E_ALREADY_REG);
        let bag = vector::empty<u16>();
        let hp_start = 8 + 1 * 4;
        move_to(
            account,
            Hero {
                xp: 0,
                gold: 100,
                str: 8,
                dex: 8,
                con: 8,
                hp: hp_start,
                floor: 1,
                seed: 1,
                mon_id: MON_NONE,
                mon_hp: 0,
                mon_max_hp: 0,
                mon_ac: 0,
                mon_to_hit: 0,
                mon_dn: 1,
                mon_dd: 4,
                mon_dm: 0,
                eq_w_main: 0,
                eq_w_off: 0,
                eq_armor: 0,
                eq_ring: 0,
                eq_boots: 0,
                bag,
                chest_taken: 0,
                chest_floor: 1,
                ready_descend: false,
            }
        );
        move_to(account, DungeonSpawn { floor: 1 });
    }

    /// Pay gold for full heal (no wipe, no floor drop, items kept). Required when dead; optional heal when alive.
    public entry fun rest_at_inn(account: &signer) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let h = borrow_global_mut<Hero>(a);
        let fcap = min_u64(h.floor, MAX_FLOOR);
        let cost = 10 + fcap * 2;
        assert!(h.gold >= cost, E_GOLD);
        h.gold = h.gold - cost;
        let hm = hp_max_for(h);
        h.hp = hm;
        h.seed = next_seed(h.seed);
    }

    /// When no active monster, roll one from floor pool using on-chain seed.
    public entry fun encounter_start(account: &signer) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let h = borrow_global_mut<Hero>(a);
        assert!(h.hp > 0, E_PLAYER_DEAD);
        assert!(h.mon_id == MON_NONE, E_MONSTER_ACTIVE);
        let (mid, s2) = pick_monster_id(h.floor, h.seed);
        let (mhp, mac, mth, dn, dd, dm) = scale_monster(h.floor, mid);
        h.mon_id = mid;
        h.mon_hp = mhp;
        h.mon_max_hp = mhp;
        h.mon_ac = mac;
        h.mon_to_hit = mth;
        h.mon_dn = dn;
        h.mon_dd = dd;
        h.mon_dm = dm;
        h.seed = s2;
        if (h.chest_floor != h.floor) {
            h.chest_taken = 0;
            h.chest_floor = h.floor;
        };
        h.ready_descend = false;
    }

    /// Auto battle: player then monster each round, up to max_rounds (cap 32). Kill grants XP/gold/loot roll.
    public entry fun auto_battle(account: &signer, max_rounds: u8) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let h = borrow_global_mut<Hero>(a);
        assert!(h.hp > 0, E_PLAYER_DEAD);
        assert!(h.mon_id != MON_NONE, E_NO_ENCOUNTER);
        assert!(h.mon_hp > 0, E_NO_ENCOUNTER);
        let cap = max_rounds as u64;
        let limit = if (cap > 32) {
            32
        } else {
            cap
        };
        let k = 0u64;
        while (k < limit && h.mon_hp > 0 && h.hp > 0) {
            let es = h.str + sum_str_eq(h);
            let sa = stat_add(es);
            let ss = stat_sub(es);
            let (d20a, s1) = roll_die(h.seed, 20);
            h.seed = s1;
            let atk_p = apply_net(d20a, sa, ss);
            if (atk_p >= h.mon_ac) {
                let wi = unpack_idx(h.eq_w_main);
                let pw = if (wi == MON_NONE) {
                    0u8
                } else {
                    packed_plus_u8(h.eq_w_main)
                };
                let (n, d, m) = if (wi == MON_NONE) {
                    (1u64, 4u64, 0u64)
                } else {
                    catalog::item_damage_ndm(wi)
                };
                let m2 = m + (pw as u64) * 2;
                let (dmg, s2) = roll_ndm(h.seed, n, d, m2);
                h.seed = s2;
                let dmg2 = apply_net(dmg, sa, ss);
                if (dmg2 >= h.mon_hp) {
                    h.mon_hp = 0;
                } else {
                    h.mon_hp = h.mon_hp - dmg2;
                };
            };
            if (h.mon_hp > 0 && h.hp > 0) {
                let ac = ac_for(h);
                let (d20m, s3) = roll_die(h.seed, 20);
                h.seed = s3;
                let atk_m = d20m + h.mon_to_hit;
                if (atk_m >= ac) {
                    let (md, s4) = roll_ndm(
                        h.seed,
                        h.mon_dn as u64,
                        h.mon_dd as u64,
                        h.mon_dm
                    );
                    h.seed = s4;
                    if (md >= h.hp) {
                        h.hp = 0;
                    } else {
                        h.hp = h.hp - md;
                    };
                };
            };
            k = k + 1;
        };
        if (h.mon_hp == 0 && h.mon_id != MON_NONE) {
            grant_kill_rewards(h);
            h.mon_id = MON_NONE;
            h.ready_descend = true;
        };
    }

    /// After clear, descend: floor+1, no auto encounter.
    public entry fun descend_floor(account: &signer) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let h = borrow_global_mut<Hero>(a);
        assert!(h.hp > 0, E_PLAYER_DEAD);
        assert!(h.mon_id == MON_NONE && h.mon_hp == 0, E_MONSTER_ACTIVE);
        assert!(h.ready_descend, E_NO_DESCEND_TOKEN);
        assert!(h.floor < MAX_FLOOR, E_FLOOR_MAX);
        h.ready_descend = false;
        h.floor = h.floor + 1;
        h.chest_taken = 0;
        h.chest_floor = h.floor;
        h.seed = next_seed(h.seed);
    }

    /// Up to 3 chest claims per floor; rewards slightly better than a kill.
    public entry fun claim_chest(account: &signer) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let h = borrow_global_mut<Hero>(a);
        assert!(h.hp > 0, E_PLAYER_DEAD);
        assert!(h.chest_taken < 3, E_CHEST_CAP);
        h.chest_taken = h.chest_taken + 1;
        grant_chest_rewards(h);
    }

    public entry fun sell_bag_slot(account: &signer, slot: u64) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let h = borrow_global_mut<Hero>(a);
        let len = vector::length(&h.bag);
        assert!(slot < len, E_BAD_SLOT);
        let p = *vector::borrow(&h.bag, slot);
        let idx = unpack_idx(p);
        assert!(idx != MON_NONE, E_BAD_SLOT);
        let pay = catalog::item_sell_gold(idx);
        let _ = vector::swap_remove(&mut h.bag, slot);
        h.gold = h.gold + pay;
        h.seed = next_seed(h.seed);
    }

    /// main_hand true equips main weapon, false off-hand; other slots inferred from item kind.
    public entry fun equip_from_bag(account: &signer, bag_slot: u64, main_hand: bool) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let h = borrow_global_mut<Hero>(a);
        let len = vector::length(&h.bag);
        assert!(bag_slot < len, E_BAD_SLOT);
        let newp = *vector::borrow(&h.bag, bag_slot);
        let idx = unpack_idx(newp);
        assert!(idx != MON_NONE, E_BAD_SLOT);
        let sk = catalog::item_slot_kind(idx);
        assert!(sk != 4, E_CANT_EQUIP);
        if (sk == 0) {
            let wh = catalog::item_weapon_hand(idx);
            if (main_hand) {
                assert!(wh == 0 || wh == 2, E_CANT_EQUIP);
                let old = h.eq_w_main;
                h.eq_w_main = newp;
                *vector::borrow_mut(&mut h.bag, bag_slot) = old;
            } else {
                assert!(wh == 1 || wh == 2, E_CANT_EQUIP);
                let old = h.eq_w_off;
                h.eq_w_off = newp;
                *vector::borrow_mut(&mut h.bag, bag_slot) = old;
            };
        } else if (sk == 1) {
            let old = h.eq_armor;
            h.eq_armor = newp;
            *vector::borrow_mut(&mut h.bag, bag_slot) = old;
        } else if (sk == 2) {
            let old = h.eq_ring;
            h.eq_ring = newp;
            *vector::borrow_mut(&mut h.bag, bag_slot) = old;
        } else {
            let old = h.eq_boots;
            h.eq_boots = newp;
            *vector::borrow_mut(&mut h.bag, bag_slot) = old;
        };
        h.seed = next_seed(h.seed);
        let hm = hp_max_for(h);
        if (h.hp > hm) {
            h.hp = hm;
        };
    }

    /// Swap equipped item with bag slot (exchanges with current bag contents at that index).
    public entry fun unequip_to_bag(account: &signer, bag_slot: u64, slot_kind: u8) acquires Hero {
        let a = signer::address_of(account);
        assert!(exists<Hero>(a), E_NO_HERO);
        let h = borrow_global_mut<Hero>(a);
        let len = vector::length(&h.bag);
        assert!(bag_slot < len, E_BAD_SLOT);
        let cur_b = *vector::borrow(&h.bag, bag_slot);
        if (slot_kind == 0) {
            let old = h.eq_w_main;
            h.eq_w_main = cur_b;
            *vector::borrow_mut(&mut h.bag, bag_slot) = old;
        } else if (slot_kind == 1) {
            let old = h.eq_w_off;
            h.eq_w_off = cur_b;
            *vector::borrow_mut(&mut h.bag, bag_slot) = old;
        } else if (slot_kind == 2) {
            let old = h.eq_armor;
            h.eq_armor = cur_b;
            *vector::borrow_mut(&mut h.bag, bag_slot) = old;
        } else if (slot_kind == 3) {
            let old = h.eq_ring;
            h.eq_ring = cur_b;
            *vector::borrow_mut(&mut h.bag, bag_slot) = old;
        } else {
            let old = h.eq_boots;
            h.eq_boots = cur_b;
            *vector::borrow_mut(&mut h.bag, bag_slot) = old;
        };
        h.seed = next_seed(h.seed);
        let hm = hp_max_for(h);
        if (h.hp > hm) {
            h.hp = hm;
        };
    }
}
