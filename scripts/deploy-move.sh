#!/usr/bin/env bash
# Initia Move 部署脚本（需本机已安装 initiad，并配置好 key）
#
# 使用前：
# 1) export ADVENTURER_HEX=0x你的发布者地址（须与 initiad keys parse 得到的、且与 KEY_NAME 钱包一致）
# 2) export KEY_NAME=keys list 里的名字。勿在 shell 里粘贴带尖括号的示例，会报 syntax error。
#
# 示例：
#   initiad keys parse init1你的地址   # 得到 hex，与 ADVENTURER_HEX 一致
#   export KEY_NAME=mykey
#   export ADVENTURER_HEX=0x你的发布者hex
#   ./scripts/deploy-move.sh
#
# 可选：钥匙环不是默认 os 时
#   export KEYRING_BACKEND=file
#
# 发交易请用 RPC（不是 LCD）；默认已指向 testnet RPC，可按链修改：
#   export NODE_URL=https://rpc.testnet.initia.xyz
#
# 首次 / 旧链补初始化：
#   RUN_BOOTSTRAP=1 ./scripts/deploy-move.sh
#
# ADVENTURER_HEX 只写真实 hex；不要复制带尖括号或中文说明的一整段 export。
#
# OS keyring 下「keys show」会要密码；脚本用 keys list 检查名字。仍失败可跳过检查：
#   SKIP_KEY_CHECK=1 ./scripts/deploy-move.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOVE_DIR="$ROOT/move"

: "${INITIAD:=initiad}"
: "${ADVENTURER_HEX:=}"
: "${KEY_NAME:=}"
: "${CHAIN_ID:=initiation-2}"
# 发交易用 CometBFT RPC；LCD（rest）不能替代
: "${NODE_URL:=https://rpc.testnet.initia.xyz}"
: "${GAS_PRICES:=0.015uinit}"
: "${RUN_BOOTSTRAP:=0}"
: "${KEYRING_BACKEND:=}"
: "${SKIP_KEY_CHECK:=0}"
# initiad 要求全大写：COMPATIBLE | IMMUTABLE
: "${UPGRADE_POLICY:=COMPATIBLE}"

usage() {
  sed -n '1,35p' "$0" >&2
  exit 1
}

KEYRING_ARGS=()
if [[ -n "${KEYRING_BACKEND}" ]]; then
  KEYRING_ARGS=(--keyring-backend "${KEYRING_BACKEND}")
fi

if [[ -z "${KEY_NAME}" ]]; then
  echo "error: 请 export KEY_NAME=你在 initiad keys list 里看到的名称" >&2
  usage
fi

if [[ -z "${ADVENTURER_HEX}" ]]; then
  echo "error: 必须 export ADVENTURER_HEX=0x...（与签名账户一致），否则编译进包的 adventurer 仍是 Move.toml 里的 0x1，会报 MODULE_ADDRESS_DOES_NOT_MATCH_SENDER。" >&2
  echo "从 bech32 换 hex: initiad keys parse init1xxxx..." >&2
  exit 1
fi

# 去掉可能的前后空白；保留 0x 前缀
ADVENTURER_HEX="$(echo -n "$ADVENTURER_HEX" | tr -d '[:space:]')"
if ! [[ "$ADVENTURER_HEX" =~ ^0x[0-9a-fA-F]+$ ]]; then
  echo "error: ADVENTURER_HEX 须为 0x 开头的十六进制地址" >&2
  exit 1
fi

# 不用 keys show：OS keyring 在无 TTY / 重定向 stderr 时会失败，被误判成「没有 key」。
if [[ "$SKIP_KEY_CHECK" != "1" ]]; then
  list_out=$("$INITIAD" keys list "${KEYRING_ARGS[@]}" 2>/dev/null || true)
  if ! printf '%s\n' "$list_out" | grep -Eq "^- name:[[:space:]]+${KEY_NAME}[[:space:]]*$|^[[:space:]]+name:[[:space:]]+${KEY_NAME}[[:space:]]*$"; then
    echo "error: initiad keys list 里看不到名为「${KEY_NAME}」的 key。" >&2
    echo "请在本机执行: $INITIAD keys list" >&2
    echo "若在 file/test 环: export KEYRING_BACKEND=file 后重跑。" >&2
    echo "若确定名字无误: SKIP_KEY_CHECK=1 $0" >&2
    exit 1
  fi
fi

if [[ ! -d "$MOVE_DIR" ]]; then
  echo "error: 未找到 move 目录: $MOVE_DIR" >&2
  exit 1
fi

cd "$MOVE_DIR"

MT="$MOVE_DIR/Move.toml"
MT_BAK="$MOVE_DIR/Move.toml.bak.deploy-$$"
restore_move_toml() {
  if [[ -f "$MT_BAK" ]]; then
    cp -f "$MT_BAK" "$MT"
    rm -f "$MT_BAK"
  fi
}
# 构建失败退出时还原 Move.toml
trap restore_move_toml EXIT

cp "$MT" "$MT_BAK"
# 部分 initiad 的 --named-addresses 会报 Unable to resolve packages；改为临时改 adventurer。
sed -i "s|^adventurer = \".*\"|adventurer = \"${ADVENTURER_HEX}\"|" "$MT"

echo "==> initiad move build (Move.toml 内 adventurer 已临时改为部署地址)"
"$INITIAD" move build --path .

# 构建已成功：立即还原 Move.toml，避免长时间停留在被改动的文件上
restore_move_toml
trap - EXIT

echo ""
echo ">>> 若 deploy 时屏幕几乎空白、只有光标或「点点」在动：多半是在等 OS keyring 密码。"
echo ">>> 请直接输入 keyring 口令后按回车（输入过程不会显示字符，属正常）。"
echo ""

echo "==> initiad move deploy (--from $KEY_NAME)"
"$INITIAD" move deploy \
  --path . \
  --upgrade-policy "$UPGRADE_POLICY" \
  --from "$KEY_NAME" \
  "${KEYRING_ARGS[@]}" \
  --gas auto \
  --gas-adjustment 1.5 \
  --gas-prices "$GAS_PRICES" \
  --node "$NODE_URL" \
  --chain-id "$CHAIN_ID" \
  -y

MOD="${ADVENTURER_HEX}"
echo ""
echo "部署交易已提交。请将前端 web/.env 中 VITE_MOVE_MODULE_ADDR 设为本次 ADVENTURER_HEX（或与链上一致的 bech32）。"
if [[ -n "$MOD" ]]; then
  echo "当前 ADVENTURER_HEX=$MOD"
fi

if [[ "$RUN_BOOTSTRAP" == "1" ]]; then
  :
else
  echo "可选: 旧链补跑 GameStore/拍卖行初始化: RUN_BOOTSTRAP=1 ADVENTURER_HEX=0x... $0"
  exit 0
fi

echo ""
echo ">>> 若下面命令卡住：同样可能是 keyring 密码（输入不回显）。"
echo "==> bootstrap_game_store（仅 adventurer 地址可成功；已存在会报错）"
"$INITIAD" tx move execute "$MOD" dungeon bootstrap_game_store \
  --from "$KEY_NAME" \
  "${KEYRING_ARGS[@]}" \
  --gas auto \
  --gas-adjustment 1.5 \
  --gas-prices "$GAS_PRICES" \
  --node "$NODE_URL" \
  --chain-id "$CHAIN_ID" \
  -y

echo "==> bootstrap_auction_house（若 init_module 已创建拍卖行，本步会失败，可忽略）"
set +e
"$INITIAD" tx move execute "$MOD" dungeon bootstrap_auction_house \
  --from "$KEY_NAME" \
  "${KEYRING_ARGS[@]}" \
  --gas auto \
  --gas-adjustment 1.5 \
  --gas-prices "$GAS_PRICES" \
  --node "$NODE_URL" \
  --chain-id "$CHAIN_ID" \
  -y
ec=$?
set -e
if [[ $ec -ne 0 ]]; then
  echo "（若提示拍卖行已存在，说明 init_module 或此前 bootstrap 已成功，可忽略。）" >&2
fi

echo ""
echo "完成。前端 web/.env 中 VITE_MOVE_MODULE_ADDR=$MOD（或与链 REST 一致的 bech32）"
