import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { calculateFee, GasPrice } from '@cosmjs/stargate';
import { useInitiaAddress, useInterwovenKit } from '@initia/interwovenkit-react';
import {
  fetchAuctionHouse,
  fetchDungeonSpawn,
  fetchGameStore,
  fetchHero,
  fetchWorldDungeon,
  parseU64,
  type GameStoreRaw,
  type HeroRaw,
  type WorldDungeonRaw,
} from './dungeonApi';
import {
  dungeonExecuteMsg,
  msgsEncounterThenAutoBattle,
  msgAdminSetMint,
  msgAutoBattle,
  msgBootstrapAuctionHouse,
  msgBootstrapWorldDungeon,
  msgBurnNftToBag,
  msgEquipFromBag,
  msgMintItemNft,
  msgSellBag,
  msgTransferItemNft,
  msgUnequipToBag,
} from './dungeonTx';
import type { EncodeObject } from '@cosmjs/proto-signing';
import { handleGameApi } from './gameApiBridge';
import type { ItemDef } from './heroAdapter';
import { KitErrorBoundary } from './KitErrorBoundary';
import { autosignBuildSummary } from './autosignConfig';

const lcdUrl = import.meta.env.VITE_LCD_URL ?? '';
const moduleAddr = import.meta.env.VITE_MOVE_MODULE_ADDR ?? '';
const gasPriceStr = import.meta.env.VITE_GAS_PRICE ?? '0.025uinit';

const INITIA_TESTNET_FAUCET = 'https://app.testnet.initia.xyz/faucet';

const AUTOSIGN_DOCS = 'https://docs.initia.xyz/interwovenkit/features/autosign/configuration';

function isLikelyUnfundedAccountMessage(msg: string): boolean {
  return /does not exist on chain|Send some tokens before trying to query sequence/i.test(msg);
}

const MON_NONE = 255n;

function parseBag(h: HeroRaw | null): string[] {
  if (!h || !Array.isArray(h.bag)) return [];
  return h.bag.map((x) => String(x));
}

function parseNftList(gs: GameStoreRaw | null): Array<{ id: string; owner: string; packed: string }> {
  if (!gs || !Array.isArray(gs.nfts)) return [];
  return gs.nfts
    .map((x: unknown) => {
      if (!x || typeof x !== 'object') return null;
      const o = x as Record<string, unknown>;
      return {
        id: String(o.id ?? ''),
        owner: String(o.owner ?? ''),
        packed: String(o.packed ?? ''),
      };
    })
    .filter((n): n is { id: string; owner: string; packed: string } => Boolean(n && n.id));
}

function AppMain() {
  const initiaAddress = useInitiaAddress();
  const { openConnect, isConnected, submitTxBlock, estimateGas, disconnect } = useInterwovenKit();

  const [hero, setHero] = useState<HeroRaw | null>(null);
  const [gameStore, setGameStore] = useState<GameStoreRaw | null>(null);
  const [auctionHouse, setAuctionHouse] = useState<Awaited<ReturnType<typeof fetchAuctionHouse>>>(null);
  const [worldDungeon, setWorldDungeon] = useState<WorldDungeonRaw | null>(null);
  const [itemsJson, setItemsJson] = useState<ItemDef[]>([]);
  const [loadingState, setLoadingState] = useState(false);
  const [queryErr, setQueryErr] = useState<string | null>(null);
  const [txBusy, setTxBusy] = useState(false);
  const [txNote, setTxNote] = useState<string | null>(null);
  const [sellSlot, setSellSlot] = useState('0');
  const [equipSlot, setEquipSlot] = useState('0');
  const [uneqSlot, setUneqSlot] = useState('0');
  const [uneqKind, setUneqKind] = useState('0');
  const [nftMintSlot, setNftMintSlot] = useState('0');
  const [nftBurnId, setNftBurnId] = useState('1');
  const [nftTransferId, setNftTransferId] = useState('1');
  const [nftTransferTo, setNftTransferTo] = useState('');
  const [iframeSrc, setIframeSrc] = useState('/town.html');

  const isMainnet = import.meta.env.VITE_NETWORK === 'mainnet';
  const showTestnetFaucet = !isMainnet;
  const autosign = autosignBuildSummary();

  useEffect(() => {
    void fetch('/data/items.json')
      .then((r) => r.json())
      .then((j) => setItemsJson(Array.isArray(j) ? j : []))
      .catch(() => setItemsJson([]));
  }, []);

  const refresh = useCallback(async () => {
    if (!lcdUrl || !moduleAddr) {
      setHero(null);
      setGameStore(null);
      setAuctionHouse(null);
      setWorldDungeon(null);
      setQueryErr(null);
      return;
    }
    setLoadingState(true);
    setQueryErr(null);
    try {
      const gs = await fetchGameStore(lcdUrl, moduleAddr);
      setGameStore(gs);
      const ah = await fetchAuctionHouse(lcdUrl, moduleAddr);
      setAuctionHouse(ah);
      const wd = await fetchWorldDungeon(lcdUrl, moduleAddr);
      setWorldDungeon(wd);
      if (initiaAddress) {
        const data = await fetchHero(lcdUrl, initiaAddress, moduleAddr);
        setHero(data);
      } else {
        setHero(null);
      }
    } catch (e) {
      setQueryErr(e instanceof Error ? e.message : String(e));
      setHero(null);
      setGameStore(null);
      setAuctionHouse(null);
      setWorldDungeon(null);
    } finally {
      setLoadingState(false);
    }
  }, [initiaAddress, lcdUrl, moduleAddr]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = useCallback(
    async (messages: EncodeObject[]) => {
      if (!initiaAddress || !moduleAddr) return { ok: false as const, error: '未连接' };
      setTxBusy(true);
      setTxNote(null);
      try {
        const gas = await estimateGas({ messages });
        const fee = calculateFee(Math.ceil(gas * 1.35), GasPrice.fromString(gasPriceStr));
        const res = await submitTxBlock({ messages, fee });
        if (res.code !== 0) {
          const err = res.rawLog ?? `交易失败 code=${res.code}`;
          setTxNote(err);
          return { ok: false as const, error: err };
        }
        setTxNote(`成功 · ${res.transactionHash}`);
        await refresh();
        return { ok: true as const };
      } catch (e) {
        let err = e instanceof Error ? e.message : String(e);
        if (!isMainnet && isLikelyUnfundedAccountMessage(err)) {
          err = `新钱包需先领测试 INIT 才能发交易（${INITIA_TESTNET_FAUCET}）。原始错误：${err}`;
        }
        setTxNote(err);
        return { ok: false as const, error: err };
      } finally {
        setTxBusy(false);
      }
    },
    [initiaAddress, estimateGas, submitTxBlock, refresh, isMainnet]
  );

  const bridgeCtx = useMemo(
    () => ({
      lcdUrl,
      moduleAddr,
      address: initiaAddress ?? null,
      items: itemsJson,
      submitTx: submit,
      fetchHero: async () => {
        if (!lcdUrl || !moduleAddr || !initiaAddress) return null;
        return fetchHero(lcdUrl, initiaAddress, moduleAddr);
      },
      fetchAuctionHouse: async () => {
        if (!lcdUrl || !moduleAddr) return null;
        return fetchAuctionHouse(lcdUrl, moduleAddr);
      },
      fetchWorldDungeon: async () => {
        if (!lcdUrl || !moduleAddr) return null;
        return fetchWorldDungeon(lcdUrl, moduleAddr);
      },
      fetchDungeonSpawn: async () => {
        if (!lcdUrl || !moduleAddr || !initiaAddress) return null;
        return fetchDungeonSpawn(lcdUrl, initiaAddress, moduleAddr);
      },
    }),
    [lcdUrl, moduleAddr, initiaAddress, itemsJson, submit]
  );

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.type !== 'rpg:api:req') return;
      const { id, action, body } = d as { id: string; action: string; body?: Record<string, unknown> };
      if (action === 'logout') {
        void disconnect?.();
        ev.source?.postMessage({ type: 'rpg:api:res', id, data: { ok: true } }, '*');
        return;
      }
      void (async () => {
        try {
          if ((action === 'login' || action === 'register') && !initiaAddress) {
            openConnect();
            ev.source?.postMessage(
              {
                type: 'rpg:api:res',
                id,
                error: '请先在顶栏连接 Initia 钱包，然后重试',
              },
              '*'
            );
            return;
          }
          const data = await handleGameApi(action, body, bridgeCtx);
          ev.source?.postMessage({ type: 'rpg:api:res', id, data }, '*');
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          ev.source?.postMessage({ type: 'rpg:api:res', id, error: err }, '*');
        }
      })();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [bridgeCtx, disconnect, openConnect, initiaAddress]);

  const hp = hero ? parseU64(hero.hp) : 0n;
  const monHp = hero ? parseU64(hero.mon_hp) : 0n;
  const monId = hero ? parseU64(hero.mon_id) : MON_NONE;
  const dead = !!hero && hp === 0n;
  const noEncounter = monId === MON_NONE;
  const inFight = !noEncounter && monHp > 0n;
  const canEncounter = !!hero && !dead && noEncounter;
  const canBattle = !!hero && !dead && inFight;
  const hasDescendToken = hero ? hero.ready_descend === 'true' || hero.ready_descend === true : false;
  const canDescend = !!hero && !dead && noEncounter && monHp === 0n && hasDescendToken;
  const chestTaken = hero ? parseU64(hero.chest_taken) : 0n;
  const canChest = !!hero && !dead && chestTaken < 3n;
  const bag = parseBag(hero);
  const nftList = parseNftList(gameStore);
  const configOk = Boolean(lcdUrl && moduleAddr);
  const canAdmin = Boolean(
    initiaAddress && gameStore && String(gameStore.admin) === String(initiaAddress)
  );
  const mintEnabled =
    gameStore?.mint_items_enabled === true || gameStore?.mint_items_enabled === 'true';

  const restCost = hero ? 10n + parseU64(hero.floor) * 2n : 0n;

  const navBtn = (path: string, label: string) => (
    <button
      type="button"
      onClick={() => setIframeSrc(path)}
      style={{
        ...btnStyle('transparent', 'var(--muted)', true),
        padding: '0.35rem 0.65rem',
        fontSize: '0.8rem',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        color: 'var(--text, #e8eef5)',
      }}
    >
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid var(--border, #1e2a3a)',
          background: 'var(--panel, #0f1620)',
        }}
      >
        <strong style={{ fontSize: '0.9rem', color: 'var(--text, #e8eef5)' }}>冒险者 · Initia</strong>
        {navBtn('/town.html', '主城')}
        {navBtn('/dungeon.html', '地城')}
        {navBtn('/enhance.html', '强化')}
        {navBtn('/auction.html', '拍卖')}
        {navBtn('/leaderboard.html', '排行')}
        {navBtn('/codex.html', '图鉴')}
        {autosign.on ? (
          <span
            title={
              autosign.mode === 'explicit'
                ? `显式模式：仅链 ${autosign.chainId} 的 MsgExecute`
                : '简单模式：常规 Move 执行可走 Auto-Sign（首次仍要在钱包里选授权时长）'
            }
            style={{ fontSize: '0.72rem', color: 'var(--accent, #5eead4)', whiteSpace: 'nowrap' }}
          >
            无感签名
            {autosign.mode === 'explicit' ? ` · ${autosign.chainId}` : ''}
          </span>
        ) : (
          <a
            href={AUTOSIGN_DOCS}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.72rem', color: 'var(--muted, #7a8fa3)', whiteSpace: 'nowrap' }}
          >
            Auto-Sign 说明
          </a>
        )}
        <span style={{ flex: 1 }} />
        {!configOk && (
          <span style={{ color: 'var(--danger, #f87171)', fontSize: '0.75rem' }}>
            未配置链上环境变量（VITE_LCD_URL / VITE_MOVE_MODULE_ADDR）
          </span>
        )}
        {isConnected ? (
          <span
            className="mono"
            style={{
              fontSize: '0.72rem',
              color: 'var(--muted, #7a8fa3)',
              maxWidth: 180,
              overflow: 'hidden',
            }}
          >
            {initiaAddress || '…'}
          </span>
        ) : null}
        {!isConnected ? (
          <button
            type="button"
            onClick={() => openConnect()}
            style={btnStyle('var(--accent, #5eead4)', '#042f2e')}
          >
            连接钱包
          </button>
        ) : (
          <button type="button" onClick={() => disconnect?.()} style={btnStyle('#64748b', '#0f172a')}>
            断开
          </button>
        )}
        {isConnected && configOk && !hero && (
          <>
            <button
              type="button"
              disabled={txBusy}
              onClick={() => void submit([dungeonExecuteMsg(initiaAddress!, moduleAddr, 'register')])}
              style={btnStyle('#a78bfa', '#1e1b4b')}
            >
              注册链上角色
            </button>
            {showTestnetFaucet && (
              <a
                href={INITIA_TESTNET_FAUCET}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.72rem', color: 'var(--accent, #5eead4)', whiteSpace: 'nowrap' }}
              >
                新钱包先领测试 INIT
              </a>
            )}
          </>
        )}
      </header>

      {(queryErr || txNote) && (
        <div
          role="status"
          style={{
            flexShrink: 0,
            padding: '0.5rem 0.75rem',
            borderBottom: '1px solid var(--border, #1e2a3a)',
            background: '#140f1a',
            fontSize: '0.78rem',
            lineHeight: 1.45,
          }}
        >
          {queryErr ? (
            <p style={{ margin: 0, color: 'var(--danger, #f87171)', wordBreak: 'break-word' }}>
              <strong>链上查询</strong>：{queryErr}
              {showTestnetFaucet && isLikelyUnfundedAccountMessage(queryErr) ? (
                <>
                  {' '}
                  <a href={INITIA_TESTNET_FAUCET} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #5eead4)' }}>
                    打开测试网水龙头
                  </a>
                  （账户上链并有余额后，再点「注册链上角色」）
                </>
              ) : null}
            </p>
          ) : null}
          {txNote ? (
            <p
              className="mono"
              style={{
                margin: queryErr ? '0.4rem 0 0' : 0,
                color: txNote.startsWith('成功') ? 'var(--accent, #5eead4)' : 'var(--danger, #f87171)',
                wordBreak: 'break-word',
              }}
            >
              <strong>交易</strong>：{txNote}
              {showTestnetFaucet && !txNote.startsWith('成功') && isLikelyUnfundedAccountMessage(txNote) ? (
                <>
                  {' '}
                  <a href={INITIA_TESTNET_FAUCET} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #5eead4)' }}>
                    打开测试网水龙头
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      )}

      <iframe
        title="rpg"
        src={iframeSrc}
        style={{ flex: 1, width: '100%', border: 0, background: '#070b10' }}
      />

      <details
        style={{
          flexShrink: 0,
          maxHeight: '40vh',
          overflow: 'auto',
          borderTop: '1px solid var(--border, #1e2a3a)',
          background: 'var(--bg, #070b10)',
          fontSize: '0.85rem',
        }}
      >
        <summary
          style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', color: 'var(--muted, #7a8fa3)' }}
        >
          链上调试台（遇敌 / 战斗 / NFT / bootstrap）
        </summary>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 1rem 1rem' }}>
          {loadingState && <p style={{ margin: 0, color: 'var(--muted)' }}>读取链上…</p>}
          {queryErr && <p style={{ margin: 0, color: 'var(--danger)' }}>{queryErr}</p>}

          {isConnected && configOk && hero && (
            <section style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem', marginTop: '0.5rem' }}>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem', fontSize: '0.82rem' }}>
                <dt style={{ color: 'var(--muted)' }}>层数</dt>
                <dd style={{ margin: 0 }}>{hero.floor}</dd>
                <dt style={{ color: 'var(--muted)' }}>生命</dt>
                <dd style={{ margin: 0 }}>{hero.hp}</dd>
                <dt style={{ color: 'var(--muted)' }}>经验 / 金币</dt>
                <dd style={{ margin: 0 }}>
                  {hero.xp} · <span style={{ color: 'var(--gold)' }}>{hero.gold}</span>
                </dd>
                <dt style={{ color: 'var(--muted)' }}>战斗</dt>
                <dd style={{ margin: 0 }}>
                  {noEncounter
                    ? '无遭遇'
                    : `怪 #${hero.mon_id} · HP ${hero.mon_hp}/${hero.mon_max_hp}`}
                </dd>
                <dt style={{ color: 'var(--muted)' }}>拍卖行</dt>
                <dd style={{ margin: 0 }}>{auctionHouse ? `lots ${Array.isArray(auctionHouse.lots) ? auctionHouse.lots.length : 0}` : '未部署'}</dd>
              </dl>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
                <button
                  type="button"
                  disabled={txBusy || parseU64(hero.gold) < restCost}
                  onClick={() => void submit([dungeonExecuteMsg(initiaAddress!, moduleAddr, 'rest_at_inn')])}
                  style={btnStyle('#94a3b8', '#1e293b')}
                >
                  旅店 {String(restCost)} 金
                </button>
                <button
                  type="button"
                  disabled={txBusy || !canEncounter}
                  onClick={() => void submit([dungeonExecuteMsg(initiaAddress!, moduleAddr, 'encounter_start')])}
                  style={btnStyle('#38bdf8', '#0c4a6e')}
                >
                  遇敌
                </button>
                <button
                  type="button"
                  disabled={txBusy || !canEncounter}
                  title="同一笔交易：遇敌后立即自动战斗，只签一次名"
                  onClick={() =>
                    void submit(msgsEncounterThenAutoBattle(initiaAddress!, moduleAddr, 24))
                  }
                  style={btnStyle('#0ea5e9', '#0c4a6e')}
                >
                  遇敌+开打
                </button>
                <button
                  type="button"
                  disabled={txBusy || !canBattle}
                  onClick={() => void submit([msgAutoBattle(initiaAddress!, moduleAddr, 24)])}
                  style={btnStyle('#fb923c', '#431407')}
                >
                  自动战斗
                </button>
                <button
                  type="button"
                  disabled={txBusy || !canDescend}
                  onClick={() => void submit([dungeonExecuteMsg(initiaAddress!, moduleAddr, 'descend_floor')])}
                  style={btnStyle('var(--accent)', '#042f2e')}
                >
                  下楼
                </button>
                <button
                  type="button"
                  disabled={txBusy || !canChest}
                  onClick={() => void submit([dungeonExecuteMsg(initiaAddress!, moduleAddr, 'claim_chest')])}
                  style={btnStyle('#c084fc', '#3b0764')}
                >
                  宝箱
                </button>
              </div>
            </section>
          )}

          {hero && bag.length > 0 && (
            <section style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: '0.75rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                <input value={sellSlot} onChange={(e) => setSellSlot(e.target.value)} className="mono" style={{ width: 48, padding: '0.25rem' }} />
                <button type="button" disabled={txBusy} onClick={() => void submit([msgSellBag(initiaAddress!, moduleAddr, Number(sellSlot) || 0)])} style={btnStyle('transparent', 'var(--muted)', true)}>
                  卖背包槽
                </button>
                <input value={equipSlot} onChange={(e) => setEquipSlot(e.target.value)} className="mono" style={{ width: 48, padding: '0.25rem' }} />
                <button type="button" disabled={txBusy} onClick={() => void submit([msgEquipFromBag(initiaAddress!, moduleAddr, Number(equipSlot) || 0, true)])} style={btnStyle('transparent', 'var(--muted)', true)}>
                  装主手
                </button>
                <button type="button" disabled={txBusy} onClick={() => void submit([msgEquipFromBag(initiaAddress!, moduleAddr, Number(equipSlot) || 0, false)])} style={btnStyle('transparent', 'var(--muted)', true)}>
                  装副手
                </button>
                <input value={uneqSlot} onChange={(e) => setUneqSlot(e.target.value)} className="mono" style={{ width: 48, padding: '0.25rem' }} />
                <select value={uneqKind} onChange={(e) => setUneqKind(e.target.value)} style={{ padding: '0.25rem', background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  <option value="0">主手</option>
                  <option value="1">副手</option>
                  <option value="2">护甲</option>
                  <option value="3">戒指</option>
                  <option value="4">鞋</option>
                </select>
                <button
                  type="button"
                  disabled={txBusy}
                  onClick={() =>
                    void submit([msgUnequipToBag(initiaAddress!, moduleAddr, Number(uneqSlot) || 0, Number(uneqKind) || 0)])
                  }
                  style={btnStyle('transparent', 'var(--muted)', true)}
                >
                  卸下交换
                </button>
              </div>
            </section>
          )}

          {isConnected && configOk && !gameStore && !loadingState && (
            <section style={{ border: '1px solid var(--danger)', borderRadius: 8, padding: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" disabled={txBusy} onClick={() => void submit([dungeonExecuteMsg(initiaAddress!, moduleAddr, 'bootstrap_game_store')])} style={btnStyle('#f87171', '#450a0a')}>
                bootstrap_game_store
              </button>
            </section>
          )}

          {isConnected && configOk && gameStore && !auctionHouse && !loadingState && (
            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" disabled={txBusy} onClick={() => void submit([msgBootstrapAuctionHouse(initiaAddress!, moduleAddr)])} style={btnStyle('#38bdf8', '#0c4a6e')}>
                bootstrap_auction_house
              </button>
            </section>
          )}

          {canAdmin && configOk && gameStore && !worldDungeon && !loadingState && (
            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" disabled={txBusy} onClick={() => void submit([msgBootstrapWorldDungeon(initiaAddress!, moduleAddr)])} style={btnStyle('#a78bfa', '#2e1065')}>
                bootstrap_world_dungeon（全服首领 + 跳跃解锁层）
              </button>
            </section>
          )}

          {gameStore && (
            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem', marginTop: '0.5rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>装备 NFT</div>
              {canAdmin && (
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <button type="button" disabled={txBusy || mintEnabled} onClick={() => void submit([msgAdminSetMint(initiaAddress!, moduleAddr, true)])} style={btnStyle('#22c55e', '#14532d')}>
                    允许 mint
                  </button>
                  <button type="button" disabled={txBusy || !mintEnabled} onClick={() => void submit([msgAdminSetMint(initiaAddress!, moduleAddr, false)])} style={btnStyle('#eab308', '#422006')}>
                    关 mint
                  </button>
                </div>
              )}
              {hero && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                  <input value={nftMintSlot} onChange={(e) => setNftMintSlot(e.target.value)} className="mono" style={{ width: 44, padding: '0.25rem' }} />
                  <button type="button" disabled={txBusy || !mintEnabled || dead} onClick={() => void submit([msgMintItemNft(initiaAddress!, moduleAddr, Number(nftMintSlot) || 0)])} style={btnStyle('#6366f1', '#1e1b4b')}>
                    mint
                  </button>
                  <input value={nftBurnId} onChange={(e) => setNftBurnId(e.target.value)} className="mono" style={{ width: 64, padding: '0.25rem' }} />
                  <button type="button" disabled={txBusy || dead} onClick={() => void submit([msgBurnNftToBag(initiaAddress!, moduleAddr, nftBurnId.trim())])} style={btnStyle('#64748b', '#0f172a')}>
                    burn
                  </button>
                  <input value={nftTransferId} onChange={(e) => setNftTransferId(e.target.value)} className="mono" style={{ width: 56, padding: '0.25rem' }} />
                  <input value={nftTransferTo} onChange={(e) => setNftTransferTo(e.target.value)} className="mono" placeholder="init1…" style={{ flex: 1, minWidth: 100, padding: '0.25rem' }} />
                  <button
                    type="button"
                    disabled={txBusy || dead || !nftTransferTo.trim()}
                    onClick={() =>
                      void submit([msgTransferItemNft(initiaAddress!, moduleAddr, nftTransferId.trim(), nftTransferTo.trim())])
                    }
                    style={btnStyle('transparent', 'var(--muted)', true)}
                  >
                    转让
                  </button>
                </div>
              )}
              {nftList.length > 0 && (
                <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1rem', fontSize: '0.72rem' }} className="mono">
                  {nftList.map((n) => (
                    <li key={n.id}>
                      id={n.id} owner={n.owner} packed={n.packed}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <button type="button" disabled={loadingState} onClick={() => void refresh()} style={{ ...btnStyle('transparent', 'var(--muted)', true), marginTop: '0.5rem' }}>
            刷新链上状态
          </button>
          {txNote && <p className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)', wordBreak: 'break-all' }}>{txNote}</p>}
        </div>
      </details>
    </div>
  );
}

function AppSafeBanner() {
  return (
    <div
      style={{
        flexShrink: 0,
        padding: '8px 12px',
        background: '#1e293b',
        color: '#f1f5f9',
        fontSize: 13,
        lineHeight: 1.45,
        borderBottom: '1px solid #334155',
      }}
    >
      <p style={{ margin: '0 0 6px' }}>
        <strong style={{ color: '#5eead4' }}>提示</strong>：下方顶栏应有「<strong>连接钱包</strong>」按钮。若整页无字、纯黑，请按{' '}
        <kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: 4 }}>F12</kbd> 打开「控制台」查看红色报错；并在
        Vercel 中配置 <code style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 4 }}>VITE_LCD_URL</code>、
        <code style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 4 }}>VITE_MOVE_MODULE_ADDR</code>。
      </p>
      <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1' }}>
        <strong style={{ color: '#a5f3fc' }}>减少重复签名（Auto-Sign）</strong>：本页使用 Initia{' '}
        <strong>InterwovenKit</strong>（内置 <strong>Privy</strong> 登录/嵌入式钱包）。按{' '}
        <a href={AUTOSIGN_DOCS} target="_blank" rel="noopener noreferrer" style={{ color: '#5eead4' }}>
          官方 Auto-Sign 配置
        </a>{' '}
        把<strong>你的站点域名</strong>加入 Privy 允许列表并启用 Auto-Sign 后，再在环境变量里设{' '}
        <code style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 4 }}>VITE_ENABLE_AUTOSIGN=true</code>
        （简单模式）或{' '}
        <code style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 4 }}>VITE_ENABLE_AUTOSIGN=explicit</code>
        并可选 <code style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 4 }}>VITE_CHAIN_ID</code>（默认 initiation-2，仅放行 MsgExecute），然后重新部署。
        <strong>未配好前不要打开</strong>，否则可能卡在首屏。钱包请用顶栏同一套 Initia 连接（非浏览器插件钱包路径）。
      </p>
    </div>
  );
}

export function App() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg, #070b10)',
        color: 'var(--text, #e8eef5)',
      }}
    >
      <AppSafeBanner />
      <KitErrorBoundary>
        <AppMain />
      </KitErrorBoundary>
    </div>
  );
}

function btnStyle(bg: string, fg: string, outline?: boolean): CSSProperties {
  return {
    fontFamily: 'inherit',
    fontWeight: 600,
    fontSize: '0.85rem',
    padding: '0.45rem 0.85rem',
    borderRadius: 8,
    border: outline ? `1px solid ${fg}` : 'none',
    background: outline ? 'transparent' : bg,
    color: outline ? fg : fg,
    cursor: 'pointer',
    opacity: 1,
  };
}
