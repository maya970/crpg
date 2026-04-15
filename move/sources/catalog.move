/// Static stats aligned with data/monsters.json and data/items.json (auditable on-chain).
module adventurer::catalog {
    /// Monster count (JSON key order).
    public fun monster_count(): u8 { 12 }

    /// Item template count (items.json array order).
    public fun item_count(): u8 { 27 }

    public fun mon_base_hp(id: u8): u64 {
        if (id == 0) { 18 } else if (id == 1) { 14 } else if (id == 2) { 28 } else if (id == 3) { 22 }
        else if (id == 4) { 32 } else if (id == 5) { 20 } else if (id == 6) { 16 } else if (id == 7) { 24 }
        else if (id == 8) { 26 } else if (id == 9) { 40 } else if (id == 10) { 34 } else if (id == 11) { 48 }
        else { 18 }
    }

    public fun mon_base_ac(id: u8): u64 {
        if (id == 0) { 12 } else if (id == 1) { 13 } else if (id == 2) { 15 } else if (id == 3) { 11 }
        else if (id == 4) { 14 } else if (id == 5) { 14 } else if (id == 6) { 15 } else if (id == 7) { 13 }
        else if (id == 8) { 12 } else if (id == 9) { 16 } else if (id == 10) { 14 } else if (id == 11) { 17 }
        else { 12 }
    }

    public fun mon_base_to_hit(id: u8): u64 {
        if (id == 0) { 4 } else if (id == 1) { 5 } else if (id == 2) { 6 } else if (id == 3) { 3 }
        else if (id == 4) { 5 } else if (id == 5) { 7 } else if (id == 6) { 6 } else if (id == 7) { 8 }
        else if (id == 8) { 5 } else if (id == 9) { 7 } else if (id == 10) { 8 } else if (id == 11) { 10 }
        else { 4 }
    }

    /// Damage dice n, d, flat bonus (matches rollDice).
    public fun mon_damage_ndm(id: u8): (u64, u64, u64) {
        if (id == 0) { (1, 6, 1) } else if (id == 1) { (1, 4, 2) } else if (id == 2) { (1, 8, 2) } else if (id == 3) { (1, 6, 2) }
        else if (id == 4) { (1, 8, 1) } else if (id == 5) { (1, 6, 3) } else if (id == 6) { (1, 4, 3) } else if (id == 7) { (1, 8, 2) }
        else if (id == 8) { (1, 10, 1) } else if (id == 9) { (2, 6, 2) } else if (id == 10) { (1, 10, 3) } else if (id == 11) { (2, 8, 3) }
        else { (1, 6, 1) }
    }

    /// 0=weapon 1=armor 2=ring 3=boots 4=misc
    public fun item_slot_kind(idx: u8): u8 {
        if (idx <= 4) { 0 } else if (idx <= 9) { 1 } else if (idx <= 13) { 2 } else if (idx <= 18) { 3 }
        else if (idx <= 24) { 4 } else { 0 }
    }

    /// Weapons: 0=main only, 1=off only, 2=either; ignored for non-weapons.
    public fun item_weapon_hand(idx: u8): u8 {
        if (idx == 0) { 0 } else if (idx == 1) { 1 } else if (idx == 2) { 0 } else if (idx == 3) { 0 }
        else if (idx == 4) { 0 } else if (idx == 25) { 1 } else if (idx == 26) { 1 } else { 2 }
    }

    public fun item_bonus_str(idx: u8): u64 {
        if (idx == 2) { 2 } else if (idx == 3) { 3 } else if (idx == 4) { 4 } else if (idx == 7) { 1 }
        else if (idx == 9) { 1 } else if (idx == 12) { 1 } else if (idx == 25) { 0 } else if (idx == 26) { 0 } else { 0 }
    }

    public fun item_bonus_dex(idx: u8): u64 {
        if (idx == 1) { 1 } else if (idx == 6) { 1 } else if (idx == 8) { 2 } else if (idx == 9) { 1 }
        else if (idx == 15) { 1 } else if (idx == 16) { 1 } else if (idx == 17) { 2 } else if (idx == 18) { 2 }
        else if (idx == 25) { 2 } else if (idx == 26) { 3 } else { 0 }
    }

    public fun item_bonus_con(idx: u8): u64 {
        if (idx == 7) { 1 } else if (idx == 8) { 1 } else if (idx == 9) { 2 } else if (idx == 10) { 1 }
        else if (idx == 13) { 2 } else if (idx == 16) { 1 } else if (idx == 18) { 1 } else { 0 }
    }

    public fun item_bonus_ac(idx: u8): u64 {
        if (idx == 5) { 2 } else if (idx == 6) { 3 } else if (idx == 7) { 5 } else if (idx == 8) { 6 }
        else if (idx == 9) { 8 } else if (idx == 10) { 1 } else if (idx == 11) { 1 } else if (idx == 12) { 0 }
        else if (idx == 13) { 2 } else if (idx == 17) { 1 } else if (idx == 18) { 1 } else { 0 }
    }

    public fun item_damage_ndm(idx: u8): (u64, u64, u64) {
        if (idx == 0) { (1, 6, 0) } else if (idx == 1) { (1, 6, 2) } else if (idx == 2) { (1, 10, 1) } else if (idx == 3) { (2, 6, 2) }
        else if (idx == 4) { (2, 8, 3) } else if (idx == 5 || idx == 6 || idx == 7 || idx == 8 || idx == 9) { (1, 4, 0) }
        else if (idx == 10 || idx == 11 || idx == 12 || idx == 13) { (1, 4, 0) } else if (idx == 14) { (1, 4, 0) }
        else if (idx == 15) { (1, 6, 0) } else if (idx == 16) { (1, 8, 0) } else if (idx == 17) { (2, 4, 0) } else if (idx == 18) { (2, 6, 0) }
        else if (idx == 19 || idx == 20 || idx == 21 || idx == 22 || idx == 23 || idx == 24) { (1, 4, 0) }
        else if (idx == 25) { (1, 8, 1) } else if (idx == 26) { (1, 8, 3) } else { (1, 4, 0) }
    }

    /// Drop weights (same scale as items.json weight; rarity tweak in dungeon).
    public fun item_drop_weight(idx: u8): u64 {
        if (idx == 0) { 22 } else if (idx == 1) { 14 } else if (idx == 2) { 8 } else if (idx == 3) { 5 } else if (idx == 4) { 2 }
        else if (idx == 5) { 20 } else if (idx == 6) { 12 } else if (idx == 7) { 7 } else if (idx == 8) { 4 } else if (idx == 9) { 1 }
        else if (idx == 10) { 6 } else if (idx == 11) { 10 } else if (idx == 12) { 16 } else if (idx == 13) { 3 }
        else if (idx == 14) { 18 } else if (idx == 15) { 12 } else if (idx == 16) { 7 } else if (idx == 17) { 4 } else if (idx == 18) { 2 }
        else if (idx == 19) { 30 } else if (idx == 20) { 28 } else if (idx == 21) { 18 } else if (idx == 22) { 15 } else if (idx == 23) { 9 }
        else if (idx == 24) { 5 } else if (idx == 25) { 13 } else if (idx == 26) { 9 } else { 1 }
    }

    /// 0 common 1 uncommon 2 rare 3 epic 4 legendary
    public fun item_rarity_tier(idx: u8): u8 {
        if (idx == 0 || idx == 5 || idx == 12 || idx == 14 || idx == 19 || idx == 20) { 0 }
        else if (idx == 1 || idx == 6 || idx == 11 || idx == 15 || idx == 21 || idx == 22 || idx == 25) { 1 }
        else if (idx == 2 || idx == 7 || idx == 10 || idx == 16 || idx == 23) { 2 }
        else if (idx == 3 || idx == 8 || idx == 13 || idx == 17 || idx == 24) { 3 } else { 4 }
    }

    /// Shop buy price: 15*rarity_mult+4 (matches PHP shop_sell_price).
    public fun item_sell_gold(idx: u8): u64 {
        let t = item_rarity_tier(idx);
        let mult = if (t == 0) { 1 } else if (t == 1) { 2 } else if (t == 2) { 4 } else if (t == 3) { 8 } else { 14 };
        15 * mult + 4
    }

    public fun loot_weight_adjusted(idx: u8, floor: u64): u64 {
        let base = item_drop_weight(idx);
        let (n, d, _) = item_damage_ndm(idx);
        let dice_power = n * d;
        let rarity_penalty = (18 * log2_ceil(1 + dice_power)) / 10;
        let w0 = base * 120 / (10 + rarity_penalty);
        let w1 = if (w0 < 1) { 1u64 } else { w0 };
        let tier_raw = if (floor > 0) { (floor - 1) / 12 } else { 0u64 };
        let tier = if (tier_raw > 6) { 6u64 } else { tier_raw };
        let rt = item_rarity_tier(idx);
        if (rt == 4) { w1 + tier * 3 } else if (rt == 3) { w1 + tier * 2 } else if (rt == 2) { w1 + (tier * 3) / 2 } else if (rt == 1) { w1 + tier } else { w1 }
    }

    fun log2_ceil(x: u64): u64 {
        if (x <= 1) { 0 } else if (x <= 2) { 1 } else if (x <= 4) { 2 } else if (x <= 8) { 3 } else if (x <= 16) { 4 }
        else if (x <= 32) { 5 } else if (x <= 64) { 6 } else if (x <= 128) { 7 } else if (x <= 256) { 8 } else { 9 }
    }

    /// Jump portal: equiv units for misc item template idx (0 if not allowed). Matches web JUMP_EQUIV_CATALOG / items.json misc 19-24.
    public fun jump_equiv_units(idx: u8): u64 {
        if (idx >= 19 && idx <= 24) {
            1
        } else {
            0
        }
    }
}
