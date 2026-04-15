# Initia Adventurer（Move + Web）

链上地牢 RPG：`move/` 为 Move 合约（`adventurer::dungeon`），`web/` 为 React + Vite 前端（InterwovenKit 钱包、链上读写）。

## 你当前的测试网部署

- **链 ID**：`initiation-2`
- **RPC**：`https://rpc.testnet.initia.xyz`
- **REST（LCD）**：`https://rest.testnet.initia.xyz`
- **模块地址**（你提供的发布地址）：`0x249A0913DB1FA0D5D8B425745B3277F61988A09F`

前端通过环境变量 `VITE_MOVE_MODULE_ADDR` 指向该地址；若 REST 报错，可改用 `initiad` / 浏览器插件显示的 **bech32** 形式（与链上查询一致即可）。

## 本地开发（前端）

```bash
cd web
cp .env.example .env
# 编辑 .env，填好 VITE_MOVE_MODULE_ADDR 等
npm install
npm run dev
```

请从 **`/` 根路径** 打开站点（不要单独打开 `public/*.html`），否则 iframe 与 `postMessage` 桥接会失效。

### 与旧版 PHP（crpg）的差异

链上版**没有** PHP 的账号密码会话：`login.html` 仅作遗留页面。真实登录 = 顶栏 **Initia 钱包**；角色数据在链上，由 `gameApi` 经 iframe 与 React 壳通信。

### 地城页黑屏、无响应

常见原因：① 未从 **`/`** 进入或未连钱包；② Vercel 未配置 **`VITE_LCD_URL` / `VITE_MOVE_MODULE_ADDR`**，链上查询卡住；③ **Three.js** 未加载（`npm install` 会生成 `public/vendor/three.min.js`，并有 jsdelivr 兜底）。部署后若仍异常，打开浏览器 **开发者工具 → Console / Network** 查看报错。

## 推到 GitHub

在仓库根目录（包含 `move/` 与 `web/` 的这一层）执行：

```bash
git init
git add .
git commit -m "Initial commit: Initia Adventurer Move + web"
```

在 GitHub 新建空仓库后：

```bash
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

（若使用 SSH，把 `origin` URL 换成 `git@github.com:...`。）

### 前端改依赖后务必提交 lockfile

本地 `npm install` 会更新 **`web/package-lock.json`**。若只改 `web/package.json` 却**不提交、不推送** lockfile，GitHub / Vercel 上的 `npm install` 与你不一致，容易出现**缺包、`Buffer is not defined`** 等问题。

推送前在仓库根目录检查：

```bash
git status
# 应能看到 web/package-lock.json、web/package.json、web/vite.config.ts、web/src/entry.tsx 等
git add web/package.json web/package-lock.json web/vite.config.ts web/src/
git commit -m "web: deps + Buffer polyfill for production"
git push origin main
```

构建日志里 `/*#__PURE__*/`、`eval` 相关提示来自第三方库，**可忽略**；只要最后有 `✓ built` 即成功。

## 部署到 Vercel（静态站点）

1. 用 GitHub 账号登录 [Vercel](https://vercel.com)，**Import** 上述仓库（根目录已含 `vercel.json`，会进入 `web` 构建并把产物目录设为 `web/dist`）。
2. 若你删掉了根目录 `vercel.json`，则需在项目设置里把 **Root Directory** 设为 **`web`**，Build：`npm run build`，Output：`dist`。
3. 在 **Environment Variables** 里添加（Production / Preview 按需勾选）：

| Name | 示例值 |
|------|--------|
| `VITE_NETWORK` | `testnet` |
| `VITE_LCD_URL` | `https://rest.testnet.initia.xyz` |
| `VITE_MOVE_MODULE_ADDR` | `0x249A0913DB1FA0D5D8B425745B3277F61988A09F` |
| `VITE_GAS_PRICE` | `0.015uinit` |

4. 点击 **Deploy**。之后每次改环境变量都要重新构建一次。

### Vercel 显示 Failed to deploy（构建失败）

常见原因：① 安装阶段省略了 **devDependencies**，导致没有 `vite`；② 打包 **内存不足**（单包约 13MB+）。根目录 **`vercel.json`** 已配置：

- `installCommand`：`NPM_CONFIG_PRODUCTION=false npm install`（强制安装含开发依赖）
- `buildCommand`：`NODE_OPTIONS=--max-old-space-size=8192`（加大 Node 堆内存）

另外 **`web/package.json`** 已将 **vite、typescript、插件等全部放进 `dependencies`**，即使将来未带上述环境变量，也更容易装全依赖。

推送后请在 Vercel → **Deployments** → 失败那条 → **Building** 日志里看具体报错；本地可先 `cd web && npm install && npm run build` 复现。

### 钱包与域名（必看）

前端使用 **InterwovenKit**（文档见 [Initia InterwovenKit](https://docs.initia.xyz)）。在 **Privy / Auto-Sign** 等后台配置里，需要把你的 **Vercel 域名**（如 `https://xxx.vercel.app`）加入允许列表，否则生产环境连接钱包可能失败。

## 合约编译与部署（回顾）

在 `move/` 目录：

```bash
initiad move build --named-addresses adventurer=0x你的地址
initiad move deploy --path . --build ... # 参数见官方文档
```

`Move.toml` 请使用 **Unix 换行（LF）**，避免 Windows `CRLF` 导致 “Unable to parse Move package manifest”。
