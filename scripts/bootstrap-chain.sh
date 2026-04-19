#!/usr/bin/env bash
# 仅执行链上一次性初始化（需 adventurer 对应 key；模块已部署）
#
#   initiad keys list
#   export KEY_NAME=mykey
#   export MODULE_ADDR=0x249A0913DB1FA0D5D8B425745B3277F61988A09F
#   export NODE_URL=https://rpc.testnet.initia.xyz
#   ./scripts/bootstrap-chain.sh
#
set -euo pipefail

: "${INITIAD:=initiad}"
: "${KEY_NAME:=}"
: "${MODULE_ADDR:=}"
: "${CHAIN_ID:=initiation-2}"
: "${NODE_URL:=https://rpc.testnet.initia.xyz}"
: "${GAS_PRICES:=0.015uinit}"
: "${KEYRING_BACKEND:=}"
: "${SKIP_KEY_CHECK:=0}"

KEYRING_ARGS=()
if [[ -n "${KEYRING_BACKEND}" ]]; then
  KEYRING_ARGS=(--keyring-backend "${KEYRING_BACKEND}")
fi

if [[ -z "$KEY_NAME" || -z "$MODULE_ADDR" ]]; then
  echo "用法: KEY_NAME=<initiad keys list 中的名字> MODULE_ADDR=<0x...> $0" >&2
  exit 1
fi

if [[ "$SKIP_KEY_CHECK" != "1" ]]; then
  list_out=$("$INITIAD" keys list "${KEYRING_ARGS[@]}" 2>/dev/null || true)
  if ! printf '%s\n' "$list_out" | grep -Eq "^- name:[[:space:]]+${KEY_NAME}[[:space:]]*$|^[[:space:]]+name:[[:space:]]+${KEY_NAME}[[:space:]]*$"; then
    echo "error: initiad keys list 里看不到「$KEY_NAME」。执行 initiad keys list 或设 SKIP_KEY_CHECK=1" >&2
    exit 1
  fi
fi

echo ""
echo ">>> 若光标闪、无提示：可能在等 keyring 密码，直接输入后回车（不回显）。"
echo "==> bootstrap_game_store"
# initiad: [模块地址] [模块名] [函数名] —— Move 里为 module adventurer::dungeon，模块名是 dungeon
"$INITIAD" tx move execute "$MODULE_ADDR" dungeon bootstrap_game_store \
  --from "$KEY_NAME" \
  "${KEYRING_ARGS[@]}" \
  --gas auto \
  --gas-adjustment 1.5 \
  --gas-prices "$GAS_PRICES" \
  --node "$NODE_URL" \
  --chain-id "$CHAIN_ID" \
  -y

echo ""
echo "==> bootstrap_auction_house（若已存在可忽略报错；若卡住请先输入 keyring 密码）"
set +e
"$INITIAD" tx move execute "$MODULE_ADDR" dungeon bootstrap_auction_house \
  --from "$KEY_NAME" \
  "${KEYRING_ARGS[@]}" \
  --gas auto \
  --gas-adjustment 1.5 \
  --gas-prices "$GAS_PRICES" \
  --node "$NODE_URL" \
  --chain-id "$CHAIN_ID" \
  -y
set -e
