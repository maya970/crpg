# 哪些上链 · 哪些放 GitHub + Vercel

## 一、要上链的（Move 合约包）

**整个目录**：`initia-adventurer/move/`

| 文件 | 作用 |
|------|------|
| `Move.toml` | 包名、命名地址 `adventurer`（发布时换成你的模块地址） |
| `sources/catalog.move` | 怪物/物品数值表（与 `data/*.json` 对齐） |
| `sources/dungeon.move` | 角色 `Hero`、`GameStore`（NFT 登记）、战斗与经济逻辑 |

发布产物是 **链上字节码**，不在 Git 里单独存一份；Git 里保留的是 **源代码**。

**不上链**：`data/monsters.json`、`data/items.json` 仅作前端展示/对照；**权威数值以 Move `catalog` 为准**。

---

## 二、放 GitHub、用 Vercel 免费静态托管的

**前端工程**：`initia-adventurer/web/`（源码）

Vercel 上通常：

1. **Root Directory** 设为：`initia-adventurer/web`
2. **Build Command**：`npm run build`
3. **Output Directory**：`dist`
4. **Environment Variables**（在 Vercel 项目设置里填，不要写进仓库）：

| 变量 | 说明 |
|------|------|
| `VITE_NETWORK` | `testnet` 或 `mainnet` |
| `VITE_LCD_URL` | 你的 rollup / Initia LCD REST 根地址 |
| `VITE_MOVE_MODULE_ADDR` | 发布 Move 后的 **模块账户地址**（bech32） |
| `VITE_GAS_PRICE` | 与链一致的 gas price，如 `0.025uinit` |

管理员身份由链上 `GameStore.admin` 与当前连接钱包比对，**无需**额外环境变量。

**不要提交**：`web/.env`、`web/.env.local`、`web/node_modules/`、`web/dist/`（`dist` 由 Vercel 构建）。

**可选同仓静态资源**（仅展示用，非合约）：仓库根的 `data/`、`img/`、`js/dungeon-game.js` 等；若只做 Initia 面板，可以只部署 `web/`。

---

## 三、装备 mint / 销毁回游戏（本仓库实现方式）

- **全局开关**：链上 `GameStore.mint_items_enabled`，仅 **`bootstrap_game_store` 使用的 admin 地址** 可调 `admin_set_item_mint_enabled`。
- **Mint**：`mint_item_nft_from_bag` 从 **背包槽位** 取出 `packed`，写入 `GameStore.nfts`（分配全局 `nft_id`），物品不再占用背包格。
- **销毁回包**：`burn_nft_to_bag(nft_id)` 从登记册删除该记录，同一物品 `packed` **推回背包**（背包未满时）。
- **转让**：`transfer_item_nft(nft_id, to)` 只改登记册中的 `owner`，便于后续接市场或标准 NFT 浏览器（本实现为 **链上登记册**，非独立 CW721 合约；若要 OpenSea/钱包标准 NFT，需再对接 Initia 上 EVM/CW721 层）。

发布合约后 **必须先** 用 **与 `adventurer` 发布地址相同的账户** 调一次 `bootstrap_game_store`，否则 mint 会报无 `GameStore`。

---

## 四、从零部署（推荐按顺序做）

### 0. 准备环境

- 安装 Initia 官方文档中的 **CLI / 钱包**（如 `minitiad` 或与 rollup 配套工具），能向你的链发交易。
- 安装 **Node.js**（本仓库 `package.json` 要求 **≥20**，低于此版本可能无法通过构建）。

### 1. 发布 Move 包

```bash
cd initia-adventurer/move
# 按你当前链的文档设置 Move.toml 里 [addresses] adventurer = "0x你的发布地址"
# 编译、发布（命令以官方为准，示例）：
# minitiad move publish . --from <发布账户>
```

记下发布后的 **模块账户地址**（bech32，如 `init1…`），即前端的 `VITE_MOVE_MODULE_ADDR`。

### 2. 链上初始化（细化，各只需成功一次）

合约里两个入口都有 **`assert!(signer::address_of(account) == @adventurer, E_NOT_ADMIN)`**。含义是：

- **`adventurer` 不是随便填的名字**：它是 **`Move.toml` 里 `[addresses] adventurer = "0x……"` 在编译进字节码时解析成的那个链上地址**。
- 你必须用 **控制该地址私钥的钱包** 去签名这两笔交易；通常就是 **发布本 Move 包时用的同一个账户**（发布前把 `adventurer` 设成这个账户地址，再 `publish`）。

链上会把资源建在 **`adventurer` 这个账户地址** 下：

| 入口函数 | 创建的资源 | 缺了会怎样 |
|----------|------------|------------|
| `bootstrap_game_store` | `GameStore`（NFT 登记、`mint` 开关、`admin`） | `mint_item_nft` / `burn` 等报无 `GameStore` |
| `bootstrap_auction_house` | `AuctionHouse`（拍卖列表） | 上架 / 下架 / 购买 报无拍卖行 |

**顺序**：两者互不依赖，**先 `bootstrap_game_store` 再 `bootstrap_auction_house`** 即可（便于排查：先保证 NFT 再开拍卖）。

**成功标志**：各函数 **全链只需成功执行一次**；第二次再调会失败（例如资源已存在）。属正常。

#### 2.1 用网页「链上调试台」（推荐）

1. 完成下面 **§3** 的 `.env`（至少 `VITE_LCD_URL`、`VITE_MOVE_MODULE_ADDR` 正确）。
2. `npm run dev`，浏览器打开 **`/` 根路径**。
3. 用 **adventurer 对应钱包** 在顶栏 **连接钱包**（地址必须与发布包时 `Move.toml` 里的 `adventurer` 一致；bech32 与 `0x` 是同一账户的不同显示方式，以浏览器/钱包为准）。
4. 页面底部展开 **「链上调试台」**：
   - 若链上还没有 `GameStore`，会出现 **`bootstrap_game_store`** 按钮 → 点一次，等交易确认。
   - 若已有 `GameStore` 但还没有 `AuctionHouse`，会出现 **`bootstrap_auction_house`** 按钮 → 点一次。
5. 若按钮不出现：可能已初始化完成，或当前连接地址 **不是** `adventurer`（没有管理员权限时不会给你误点的机会；调试台里 NFT 区的「允许 mint」也要求 `GameStore.admin` 等于当前地址）。

#### 2.2 用 CLI（模板，命令以 Initia / 你的 rollup 文档为准）

思路：**`--from` 的账户地址 = `Move.toml` 里的 `adventurer`**；**模块包名与函数名**与源码一致：`adventurer::dungeon::bootstrap_game_store` / `bootstrap_auction_house`。

下面仅为 **占位示例**，请把链名、参数格式换成你环境里的官方命令（如 `minitiad`、`initiad` 等）：

```bash
# 示例 A：发布包（发布前 adventurer 已写在 Move.toml）
cd initia-adventurer/move
# minitiad keys show my-publisher   # 确认地址与 Move.toml 中 adventurer 一致
# minitiad move publish . --from my-publisher

# 示例 B：执行 bootstrap（模块已部署到 adventurer 地址后）
# minitiad tx move execute <模块部署账户init1或0x> adventurer dungeon bootstrap_game_store \
#   --from my-publisher
# minitiad tx move execute <同上> adventurer dungeon bootstrap_auction_house \
#   --from my-publisher
```

若 CLI 参数与上述不同：**以官方「执行 Move 合约 entry」文档为准**；也可在链上区块浏览器的 **Contract → Write** 里连接 `adventurer` 钱包调用同名函数。

#### 2.3 常见错误

| 现象 | 常见原因 |
|------|----------|
| `E_NOT_ADMIN` | 签名钱包地址 ≠ 编译进包的 `@adventurer` |
| `E_GAME_STORE_EXISTS` / 拍卖行已存在 | 已成功初始化过，无需再点 |
| 前端没有 bootstrap 按钮 | 已存在对应资源，或 `.env` 里模块地址错导致读不到状态 |
| mint 仍失败 | 未做 `bootstrap_game_store`，或管理员关了 `mint_items_enabled` |

### 3. 配置并启动前端

```bash
cd initia-adventurer/web
npm install
cp .env.example .env
# 编辑 .env：VITE_LCD_URL、VITE_MOVE_MODULE_ADDR、VITE_GAS_PRICE、VITE_NETWORK
npm run dev
```

在浏览器打开 **开发服务器根地址**（如 `http://localhost:5173/`），**不要**单独新开标签访问 `town.html`：游戏页在 **iframe** 里，靠父页 `postMessage` 调钱包与链。

流程简述：**顶栏连接钱包** → **注册链上角色**（一次性）→ 用导航进主城 / 地城 / 强化 / 拍卖等。

### 4. 生产构建（如 Vercel）

与上文「二」相同：`Root Directory = web`，`npm run build`，`Output Directory = dist`，环境变量与 `.env.example` 一致。

---

## 五、排行榜（链下索引）

当前前端 `leaderboard` 接口返回 **空榜占位**。要做真实排行：

1. 用服务定期拉 **LCD**（或跟块）扫描 `Hero` 资源（按模块地址 + 结构体类型过滤），或索引 `register` / 写状态的交易。
2. 按经验、金币、装备分排序后写入你自己的 **HTTP API**。
3. 把 iframe 页的 `gameApi('leaderboard')` 改为请求该 API（或让 React 壳代理），与现有 UI 字段对齐（`boards.xp` / `gold` / `weapon` 等）。

链上无需再为排行榜加合约，除非你希望「写榜也上链」。

---

## 六、`node_modules` 很大（例如数百 MB）怎么办？

### 6.1 为什么这么大？

本前端依赖 **InterwovenKit + wagmi + viem** 以及钱包连接相关传递依赖（WalletConnect、多链适配等），**树很深**，本地 `node_modules` 达到 **几百 MB～1GB 量级很常见**。这不是你拷贝错了文件，而是这类栈的常态。

**上线给用户的是 `npm run build` 后的 `dist/`**，体积远小于 `node_modules`（仍可能因钱包代码较大而达到数 MB 级 JS，属正常）。

### 6.2 「用 CDN 代替 npm」是否可行？

- **整站改成 `<script type="module" src="https://esm.sh/…">` 引用 InterwovenKit / CosmJS**：理论上可以拼一个无 bundler 的页面，但 **与本仓库的 Vite + React + InterwovenKit 结构不兼容**，等于重写集成方式；维护与类型支持都差，**不推荐**作为「省磁盘」的手段。
- **部分小库走 CDN**：对减少 `node_modules` 帮助有限，大头仍在钱包 SDK。

### 6.3 实用减耗做法

1. **不要提交、不要备份 `node_modules`**：只保留 `package-lock.json`（或 pnpm-lock），需要时再装。
2. **用 pnpm**：全局内容寻址存储，多项目共享同一份依赖，磁盘占用通常 **明显小于** 每个项目一份完整 `npm install`。
   ```bash
   npm i -g pnpm
   cd initia-adventurer/web && pnpm install
   ```
3. **CI / Vercel**：在云端每次干净安装并构建，本机可以不长期保留 `web/node_modules`。
4. **好奇打包体积**（可选）：为 Vite 配置 `rollup-plugin-visualizer` 等，分析 `dist` 里各 chunk 占比（与 `node_modules` 磁盘占用不是同一概念）。

结论：**没有「一键 CDN 替代」又能保留当前钱包体验的捷径**；优先 **pnpm + 不把 node_modules 当资产拷贝**。
