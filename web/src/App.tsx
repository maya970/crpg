import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { calculateFee, GasPrice } from '@cosmjs/stargate';
import { useInitiaAddress, useInterwovenKit } from '@initia/interwovenkit-react';
import { fetchAuctionHouse, fetchDungeonSpawn, fetchHero, fetchWorldDungeon, type HeroRaw } from './dungeonApi';
import { dungeonExecuteMsg } from './dungeonTx';
import type { EncodeObject } from '@cosmjs/proto-signing';
import { handleGameApi } from './gameApiBridge';
import type { ItemDef } from './heroAdapter';
import { KitErrorBoundary } from './KitErrorBoundary';
import { autosignBuildSummary } from './autosignConfig';

const lcdUrl = import.meta.env.VITE_LCD_URL ?? '';
const moduleAddr = import.meta.env.VITE_MOVE_MODULE_ADDR ?? '';
const gasPriceStr = import.meta.env.VITE_GAS_PRICE ?? '0.025uinit';

const INITIA_TESTNET_FAUCET = 'https://app.testnet.initia.xyz/faucet';

function isLikelyUnfundedAccountMessage(msg: string): boolean {
  return /does not exist on chain|Send some tokens before trying to query sequence/i.test(msg);
}

function AppMain() {
  const initiaAddress = useInitiaAddress();
  const kit = useInterwovenKit();
  const { openConnect, isConnected, submitTxBlock, estimateGas, disconnect } = kit;

  const [hero, setHero] = useState<HeroRaw | null>(null);
  const [itemsJson, setItemsJson] = useState<ItemDef[]>([]);
  const [queryErr, setQueryErr] = useState<string | null>(null);
  const [txBusy, setTxBusy] = useState(false);
  const [txNote, setTxNote] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [iframeSrc, setIframeSrc] = useState('/town.html');

  const isMainnet = import.meta.env.VITE_NETWORK === 'mainnet';
  const showTestnetFaucet = !isMainnet;
  const autosignBuild = autosignBuildSummary();
  const autosignOnBuild = autosignBuild.on;
  const autosignBuildHint =
    !autosignBuild.on
      ? 'Auto-sign (build): off'
      : autosignBuild.mode === 'explicit'
        ? `Auto-sign (build): on · ${autosignBuild.chainId}`
        : 'Auto-sign (build): on · simple';

  const enableDungeonSession = useCallback(async () => {
    type KitAuto = { autoSign?: { enable: () => Promise<void> } };
    const k = kit as KitAuto;
    if (typeof k.autoSign?.enable !== 'function') {
      setTxNote(
        'This wallet build does not expose auto-sign. Upgrade @initia/interwovenkit-react and enable VITE_ENABLE_AUTOSIGN in .env.'
      );
      return;
    }
    if (!autosignOnBuild) {
      setTxNote(
        'Turn on auto-sign in the frontend .env (e.g. VITE_ENABLE_AUTOSIGN=explicit), rebuild, then tap this again to grant a session.'
      );
      return;
    }
    setSessionBusy(true);
    setTxNote(null);
    try {
      await k.autoSign.enable();
      setTxNote(
        'Adventure session active: Move txs can run without a popup until the session expires. You still pay gas (or use feegrant if configured).'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTxNote(`Could not start auto-sign session: ${msg}`);
    } finally {
      setSessionBusy(false);
    }
  }, [kit, autosignOnBuild]);

  useEffect(() => {
    void fetch('/data/items.json')
      .then((r) => r.json())
      .then((j) => setItemsJson(Array.isArray(j) ? j : []))
      .catch(() => setItemsJson([]));
  }, []);

  const refresh = useCallback(async () => {
    if (!lcdUrl || !moduleAddr) {
      setHero(null);
      setQueryErr(null);
      return;
    }
    setQueryErr(null);
    try {
      if (initiaAddress) {
        const data = await fetchHero(lcdUrl, initiaAddress, moduleAddr);
        setHero(data);
      } else {
        setHero(null);
      }
    } catch (e) {
      setQueryErr(e instanceof Error ? e.message : String(e));
      setHero(null);
    }
  }, [initiaAddress, lcdUrl, moduleAddr]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = useCallback(
    async (messages: EncodeObject[]) => {
      if (!initiaAddress || !moduleAddr) return { ok: false as const, error: 'Not connected' };
      setTxBusy(true);
      setTxNote(null);
      try {
        const gas = await estimateGas({ messages });
        const fee = calculateFee(Math.ceil(gas * 1.35), GasPrice.fromString(gasPriceStr));
        const res = await submitTxBlock({ messages, fee });
        if (res.code !== 0) {
          const err = res.rawLog ?? `Transaction failed (code ${res.code})`;
          setTxNote(err);
          return { ok: false as const, error: err };
        }
        setTxNote(`Success · ${res.transactionHash}`);
        await refresh();
        return { ok: true as const };
      } catch (e) {
        let err = e instanceof Error ? e.message : String(e);
        if (!isMainnet && isLikelyUnfundedAccountMessage(err)) {
          err = `Fund this wallet with test INIT before sending transactions. Open the faucet, then try again. Details: ${err}`;
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
                error: 'Connect your wallet from the bar above, then try again.',
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

  const configOk = Boolean(lcdUrl && moduleAddr);

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
        <strong style={{ fontSize: '0.9rem', color: 'var(--text, #e8eef5)' }}>Adventurer</strong>
        {navBtn('/town.html', 'Town')}
        {navBtn('/dungeon.html', 'Dungeon')}
        {navBtn('/enhance.html', 'Enhance')}
        {navBtn('/auction.html', 'Market')}
        {navBtn('/leaderboard.html', 'Rankings')}
        {navBtn('/codex.html', 'Codex')}
        {configOk ? (
          <span
            title="Reads VITE_ENABLE_AUTOSIGN at dev/build time. You still need wallet + “Silent dungeon” once for an on-chain session grant."
            style={{
              fontSize: '0.68rem',
              color: autosignOnBuild ? 'var(--accent, #5eead4)' : 'var(--muted, #64748b)',
              whiteSpace: 'nowrap',
            }}
          >
            {autosignBuildHint}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        {!configOk && (
          <span style={{ color: 'var(--danger, #f87171)', fontSize: '0.75rem' }}>
            This build is missing server configuration. Please contact the site owner.
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
        {isConnected && configOk ? (
          <button
            type="button"
            disabled={sessionBusy}
            onClick={() => void enableDungeonSession()}
            title={
              autosignOnBuild
                ? 'One wallet approval to allow MsgExecute without repeated prompts during a dungeon run.'
                : 'Set VITE_ENABLE_AUTOSIGN in .env and rebuild first.'
            }
            style={btnStyle('#0d9488', '#ecfdf5')}
          >
            {sessionBusy ? 'Opening session…' : 'Silent dungeon (auto-sign)'}
          </button>
        ) : null}
        {!isConnected ? (
          <button
            type="button"
            onClick={() => openConnect()}
            style={btnStyle('var(--accent, #5eead4)', '#042f2e')}
          >
            Connect wallet
          </button>
        ) : (
          <button type="button" onClick={() => disconnect?.()} style={btnStyle('#64748b', '#0f172a')}>
            Disconnect
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
              Create character
            </button>
            {showTestnetFaucet && (
              <a
                href={INITIA_TESTNET_FAUCET}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.72rem', color: 'var(--accent, #5eead4)', whiteSpace: 'nowrap' }}
              >
                Testnet faucet
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
              <strong>Status</strong>: {queryErr}
              {showTestnetFaucet && isLikelyUnfundedAccountMessage(queryErr) ? (
                <>
                  {' '}
                  <a href={INITIA_TESTNET_FAUCET} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #5eead4)' }}>
                    Open faucet
                  </a>
                  {' '}
                  (fund the account, then tap Create character)
                </>
              ) : null}
            </p>
          ) : null}
          {txNote ? (
            <p
              className="mono"
              style={{
                margin: queryErr ? '0.4rem 0 0' : 0,
                color: txNote.startsWith('Success') ? 'var(--accent, #5eead4)' : 'var(--danger, #f87171)',
                wordBreak: 'break-word',
              }}
            >
              <strong>Transaction</strong>: {txNote}
              {showTestnetFaucet && !txNote.startsWith('Success') && isLikelyUnfundedAccountMessage(txNote) ? (
                <>
                  {' '}
                  <a href={INITIA_TESTNET_FAUCET} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #5eead4)' }}>
                    Open faucet
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      )}

      <iframe title="game" src={iframeSrc} style={{ flex: 1, width: '100%', border: 0, background: '#070b10' }} />
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
