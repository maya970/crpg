# Initia Adventurer

This document is maintained **in English and Chinese for every section** (paired headings). **Initia Adventurer is not a gambling product**; market observations below reference adjacent entertainment categories for consumer-psychology context only.

---

## 1. Project overview / 项目概述

### English

| Item | Description |
|------|-------------|
| **Positioning** | On-chain dungeon RPG: core state and rules enforced in Move; the web client handles playable presentation and chain interaction. |
| **Track** | Initiate / Initia ecosystem — **Gaming & Consumer** (real users, real interfaces). |
| **Stage** | Playable on Initia testnet (`initiation-2`); active iteration on content and UX. |

### 中文

| 项 | 内容 |
|----|------|
| **定位** | 链上地牢 RPG：核心状态与规则由 Move 执行，前端负责可玩呈现与链交互。 |
| **赛道** | Initiate / Initia 生态 — **Gaming & Consumer**（真实用户、真实界面）。 |
| **当前阶段** | 测试网可玩（`initiation-2`），持续迭代内容与体验。 |

---

## 2. Value proposition and market context / 价值主张与市场背景

### English

- **Consumer psychology (Japan-adjacent casino entertainment as reference):** Many products in this category invest heavily in **complex IP** and **high-intensity audiovisual production**. Demand is often **not reducible to “simple gambling.”** A meaningful portion of engagement is **psychological comfort**: predictable rhythm, temporary relief, and a sense of being “held” by a structured experience.  
- **Homogeneity and limits of spectacle:** When the market converges on similar loops, **stacking IP and sensory stimulation alone** frequently fails to sustain retention—players recognize the underlying pattern. **Meaningful novelty** typically requires a **new play structure** and a **credible long-term monetization model**, not only upgraded presentation.  
- **What we build (non-gambling):** **Initia Adventurer** is a **dungeon RPG**. We borrow the lesson above at the level of **motivation**, not mechanics: durable engagement pairs **emotional payoff** with **rules that can be explained and verified**. We therefore place core gameplay constraints **on-chain in Move** rather than treating the chain as a cosmetic asset layer.  
- **Technology:** Initia + Move provide a **single source of truth**, reducing “off-chain black box rules” and operational trust disputes for core mechanics.  
- **Go-to-market reality:** We already have a player community. Migrating users onto Initia introduces real friction (wallet onboarding, gas, retries, RPC stability, shipping cadence) and requires **ongoing engineering plus marketing spend** for smooth migration and acquisition.

### 中文

- **消费心理（以日本博彩类娱乐产业为参照）：** 该品类中大量产品依托**复杂 IP** 与**强刺激声画**建立体验。用户需求往往**不能简化为“单纯赌博”**；其中相当一部分来自**心理慰藉**——可预期的节奏、短暂的情绪纾解，以及在结构化体验中获得“被承接感”。  
- **同质化与堆料边界：** 当市场收敛到相似反馈曲线时，仅靠**叠加 IP 与感官刺激**常常难以留住用户，玩家仍能识别底层套路。**真正的新颖**通常需要**新的玩法结构**与**可长期成立的盈利模式**，而非只在视听层加码。  
- **本产品边界（非博彩）：** **Initia Adventurer** 是**地牢 RPG**。我们在**动机层面**借鉴上述观察，而非复制博彩机制：可持续的参与来自**情绪回报**与**可解释、可验证的规则**并存；因此我们将核心玩法约束放在 **Initia Move** 上，而不是把链仅当作资产发行层。  
- **技术层：** 以 Initia + Move 作为**单一可信源**，降低核心玩法上“链下黑箱规则”与运营争议成本。  
- **增长层：** 团队已有玩家社群；向链上迁移涉及钱包、Gas、重试、网络稳定性与版本交付等摩擦，需要**持续的研发与市场营销投入**以完成平滑迁移与拉新。

---

## 3. Core capabilities / 核心能力

### English

- **On-chain core loop:** Hero registration, combat/exploration, floor progression, inventory and equipment constraints enforced by `adventurer::dungeon` (and related modules).  
- **Playable client:** Three.js scenes + React application layer; InterwovenKit for connection and transactions.  
- **Optional auto-sign:** Session-style signing for high-frequency `MsgExecute` flows (see `web/.env.example`).  
- **Economy and extensions (depends on on-chain bootstrap state):** Catalog, NFT-related flows, auction house, world-scale mechanics enabled by modules plus initialization transactions.  
- **Open source:** Move and web sources are public for audit and reproduction.

### 中文

- **链上核心循环：** 注册英雄、战斗/探索、楼层推进、背包与装备约束等由 `adventurer::dungeon` 等模块约束。  
- **可玩客户端：** Three.js 场景 + React 业务层，InterwovenKit 完成连接与交易。  
- **可选自动签名：** 高频 `MsgExecute` 场景可配置会话式签名（详见 `web/.env.example`）。  
- **经济与扩展能力（视链上初始化状态）：** 物品目录、NFT 相关流程、拍卖行、世界向机制等由合约与初始化交易共同启用。  
- **开源可审计：** Move 与 Web 源码公开，便于评委与社区复现。

---

## 4. Technology stack and Initia integration / 技术栈与 Initia 集成

### English

| Layer | Technology |
|-------|------------|
| Chain | Initia; Move modules `adventurer::dungeon`, `adventurer::catalog` |
| Web | Node.js ≥ 20; React 19; Vite 6; TypeScript |
| Rendering | Three.js |
| Wallet / Tx | `@initia/interwovenkit-react`; CosmJS helpers (fees / encoding) |
| Queries | LCD (REST) via `VITE_LCD_URL` |

### 中文

| 层级 | 技术 |
|------|------|
| 链 | Initia；Move 模块 `adventurer::dungeon`、`adventurer::catalog` |
| 前端 | Node.js ≥ 20；React 19；Vite 6；TypeScript |
| 渲染 | Three.js |
| 钱包 / Tx | `@initia/interwovenkit-react`；CosmJS（Gas / 编码辅助） |
| 查询 | LCD（REST），由 `VITE_LCD_URL` 配置 |

---

## 5. Live demo and judge verification / 线上演示与评委快速验证

### English

**Demo (Chrome recommended):** [https://mxzgh.com](https://mxzgh.com)

| Setting | Value |
|---------|-------|
| Chain ID | `initiation-2` |
| LCD (REST) | `https://rest.testnet.initia.xyz` |
| RPC | `https://rpc.testnet.initia.xyz` |
| Move module address | `0x249A0913DB1FA0D5D8B425745B3277F61988A09F` |
| Faucet | [Initia Testnet Faucet](https://app.testnet.initia.xyz/faucet) |

**Suggested path:** Install InterwovenKit → switch to testnet → faucet → open demo → connect wallet → register and play → cross-check LCD queries against UI state.

### 中文

**演示入口（推荐 Chrome）：** [https://mxzgh.com](https://mxzgh.com)

| 配置项 | 值 |
|--------|-----|
| Chain ID | `initiation-2` |
| LCD（REST） | `https://rest.testnet.initia.xyz` |
| RPC（交易/节点） | `https://rpc.testnet.initia.xyz` |
| Move 模块地址 | `0x249A0913DB1FA0D5D8B425745B3277F61988A09F` |
| 测试币水龙头 | [Initia Testnet Faucet](https://app.testnet.initia.xyz/faucet) |

**建议验证路径：** 安装 InterwovenKit → 切换测试网 → 水龙头领币 → 打开演示站 → 连接钱包 → 完成注册/战斗或探索 → 对照链上查询确认状态与 UI 一致。

---

## 6. Local development (web) / 本地运行（前端）

### English

```bash
cd web
cp .env.example .env
# Set VITE_LCD_URL, VITE_MOVE_MODULE_ADDR, VITE_GAS_PRICE, VITE_NETWORK, etc.
npm install
npm run dev
```

Build / preview: `npm run build`, `npm run preview`.

### 中文

```bash
cd web
cp .env.example .env
# 按实际部署填写 VITE_LCD_URL、VITE_MOVE_MODULE_ADDR、VITE_GAS_PRICE、VITE_NETWORK 等
npm install
npm run dev
```

构建与预览：`npm run build` / `npm run preview`。

---

## 7. Move deployment and on-chain bootstrap / Move 部署与链上引导

### English

Requires `initiad` and a configured signing key. `scripts/deploy-move.sh` temporarily adjusts the named address in `move/Move.toml` to match the publisher address, then restores it after build.

```bash
export KEY_NAME=<name from `initiad keys list`>
export ADVENTURER_HEX=0x<hex matching the signing account>
./scripts/deploy-move.sh
```

First-time or global-resource bootstrap (e.g., store/auction—depends on chain state):

```bash
RUN_BOOTSTRAP=1 ./scripts/deploy-move.sh
```

One-off bootstrap against an already deployed module (owner key):

```bash
export KEY_NAME=...
export MODULE_ADDR=0x...
export NODE_URL=https://rpc.testnet.initia.xyz
./scripts/bootstrap-chain.sh
```

See header comments in each script for parameters.

### 中文

需本机安装 `initiad` 并配置签名账户。部署脚本会临时调整 `move/Move.toml` 中的命名地址以匹配发布者地址，构建完成后还原。

```bash
export KEY_NAME=<initiad keys list 中的账户名>
export ADVENTURER_HEX=0x<与签名账户一致的 hex>
./scripts/deploy-move.sh
```

首次或需初始化全局资源（如商店/拍卖等，视报错与链上状态）：

```bash
RUN_BOOTSTRAP=1 ./scripts/deploy-move.sh
```

仅对已部署模块执行一次性引导（需模块所有者密钥）：

```bash
export KEY_NAME=...
export MODULE_ADDR=0x...
export NODE_URL=https://rpc.testnet.initia.xyz
./scripts/bootstrap-chain.sh
```

详细参数说明见各脚本文件头部注释。

---

## 8. Repository layout / 仓库结构

### English

```
├── move/                 # Move package (dungeon, catalog)
├── web/                  # Vite + React frontend
├── scripts/              # deploy-move.sh, bootstrap-chain.sh
├── vercel.json           # Static hosting config (if using Vercel)
└── README.md
```

### 中文

```
├── move/                 # Move 包（dungeon、catalog）
├── web/                  # Vite + React 前端
├── scripts/              # deploy-move.sh、bootstrap-chain.sh
├── vercel.json           # 静态站点部署配置（若使用 Vercel）
└── README.md
```

---

## 9. Roadmap and resourcing / 路线图与资源需求

### English

- **Product:** Content seasons, deeper mechanics, onboarding, and resilient error recovery.  
- **Ecosystem:** Interoperation and co-marketing with Initia wallets and ecosystem projects.  
- **Execution:** Community migration and scaled acquisition depend on **continuous engineering delivery + marketing budget**; disclosed explicitly for planning and external communication.

### 中文

- **产品：** 内容赛季、玩法深度、新手引导与错误恢复体验优化。  
- **生态：** 与 Initia 钱包/生态项目的互操作与联合活动。  
- **执行：** 社群链上迁移与规模化获客依赖**研发交付 + 市场投放**的持续预算，已在规划与对外沟通中明确披露。

---

## 10. Contributing / 参与贡献

### English

Issues and pull requests are welcome. Please include reproduction steps, chain ID, module address, and browser environment.

### 中文

Issue / Pull Request 欢迎；请优先附复现步骤、链 ID、合约地址与浏览器环境说明。

---

## Appendix A — Roadshow script / 附录 A：路演口播稿

**Note / 说明:** Full **English** and **中文** scripts below; both include the Japan-adjacent casino-industry reference, **psychological comfort（心理慰藉）**, homogeneity, and non-gambling product boundary.

### English (≈3–3.5 minutes)

Hello judges—this is **Initia Adventurer**.

**Opening:** We are a **Gaming & Consumer** submission: a **dungeon RPG** on **Initia** where **real users** meet a **real, playable interface**, and where **core rules are enforced in Move**—not hidden on a private game server.

**Market context (reference category):** In Japan-adjacent casino-style entertainment products, teams often invest in **complex IP** and **intense audiovisual production**. A lot of engagement is **not reducible to simple gambling**; it includes **psychological comfort**—rhythm, relief, and the feeling of being held by a structured experience. At the same time, the market is **homogeneous**: stacking IP and sensory stimulation alone often fails to retain users once the underlying loop is recognized.

**Our product boundary:** We are **not** building gambling. We take the consumer insight seriously: durable engagement pairs **emotional payoff** with **rules that can be explained and verified**. That is why we put the **core gameplay loop on-chain in Move**.

**Initia integration:** The web stack is **React + Vite + Three.js**; wallets and transactions use **InterwovenKit**, with optional **auto-sign** to reduce friction for repeated on-chain actions. We ship an **end-to-end testnet demo** on **`initiation-2`**. The README lists the module address, LCD endpoints, faucet, and scripts so verification is reproducible.

**Demo path:** Please open the demo link, use **Chrome** and **InterwovenKit**, fund via the faucet if needed, connect, register, and play—then cross-check state against LCD queries.

**Execution:** We already have a community. Migrating users onto chain introduces real friction—wallets, gas, retries, RPC stability, releases—and requires **ongoing engineering and marketing investment**.

**Close:** Initia Adventurer demonstrates **Move-enforced mechanics** with **Initia-native wallet flows** and a **working testnet demo**. Thank you—we welcome questions.

### 中文（约 3～3.5 分钟）

各位评委好，我们是 **Initia Adventurer**。

**开场：** 这是 **Gaming & Consumer** 赛道项目：跑在 **Initia** 上的**地牢 RPG**，让**真实用户**进入**真实可玩的界面**；核心规则在 **Move** 中执行，而不是藏在私有化服务器里。

**市场参照（日本博彩类娱乐产业）：** 该领域常见做法是叠加**复杂 IP** 与**炫彩声画**；但用户需求往往**不是“单纯赌博”**，其中很重要的一部分是**心理慰藉**——节奏、纾解，以及在结构化体验里获得“被承接感”。与此同时，市场**高度同质化**：只靠堆 IP 与感官刺激，玩家一旦识别底层套路，留存仍然困难；真正的新颖通常需要**新玩法结构**与**可持续的盈利模式**。

**产品边界：** 我们**不是**博彩产品；我们认同的是动机层面的规律：**情绪回报**需要与**可解释、可验证的规则**并存，因此把**核心玩法循环**放在 **Initia Move**。

**技术集成：** 前端 **React + Vite + Three.js**；钱包与交易使用 **InterwovenKit**，并可配置**自动签名**降低高频链上操作摩擦。我们在 **`initiation-2` 测试网**提供端到端演示；README 公开模块地址、LCD、水龙头与脚本，便于复核与复现。

**演示路径：** 打开演示链接，建议 **Chrome + InterwovenKit**，必要时水龙头领币，连接后注册并游玩，再对照 LCD 查询与 UI 状态。

**执行：** 我们已有社群；迁移上链存在钱包、Gas、重试、RPC 与版本节奏等真实摩擦，需要**持续的研发与市场投入**。

**收尾：** Initia Adventurer 用 **Move 强制执行机制**、**Initia 原生钱包流程**与**可运行的测试网演示**交付可验证的消费级体验。感谢各位，欢迎提问。

### English — 90-second version

**Initia Adventurer** is **Gaming & Consumer**: a **dungeon RPG** on **Initia** with core mechanics in **Move**, UI in **React + Three.js**, wallet via **InterwovenKit**, testnet **`initiation-2`**. Market reference: Japan-adjacent casino-style products combine **complex IP** and intense AV; demand includes **psychological comfort**, not only wagering—yet homogeneity means spectacle alone rarely retains. We are **not** gambling; we pair emotional payoff with **verifiable rules** on-chain. README: demo, faucet, module address, scripts. Community migration needs **engineering + marketing**. Thank you.

### 中文 — 90 秒压缩版

**Initia Adventurer**，**Gaming & Consumer** 赛道：**Initia** 上 **Move** 强制执行核心的**地牢 RPG**，前端 **React + Three.js**，钱包 **InterwovenKit**，**`initiation-2`** 可验证。市场参照：日本博彩类娱乐常叠**复杂 IP** 与炫彩声画；需求含**心理慰藉**，并非只剩“赌”；同质化下仅靠堆料难留存。我们**非博彩**，把**可验证规则**写进链上。README 含演示、水龙头、合约与脚本。社群迁移需要**研发+市场**持续投入。谢谢。

---

**Version / 版本:** Testnet v0.1  
**Last updated / 文档更新:** April 2026 / 2026 年 4 月
