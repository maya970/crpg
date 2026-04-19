/**
 * InterwovenKit + 可选 Auto-Sign
 * Privy / 域名等见：https://docs.initia.xyz/interwovenkit/features/autosign/configuration
 */
import { PropsWithChildren, Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import {
  InterwovenKitProvider,
  MAINNET,
  TESTNET,
  initiaPrivyWalletConnector,
  injectStyles,
} from '@initia/interwovenkit-react';
import interwovenKitStyles from '@initia/interwovenkit-react/styles.js';
import { resolveInterwovenKitEnableAutoSign } from './autosignConfig';

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  connectors: [initiaPrivyWalletConnector],
  chains: [mainnet],
  transports: { [mainnet.id]: http() },
});

const kitEnv =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_NETWORK === 'mainnet'
    ? MAINNET
    : TESTNET;

/** 部分域名在未配置 Privy 时 enableAutoSign 会卡住首屏，默认关闭；见 `autosignConfig` 与 `.env.example` */
const enableAutoSign = resolveInterwovenKitEnableAutoSign();

function KitSuspenseFallback() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#070b10',
        color: '#e8eef5',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, fontSize: 16 }}>正在加载 Initia 钱包组件…</p>
      <p style={{ margin: '1rem 0 0', fontSize: 13, color: '#94a3b8', maxWidth: 360, lineHeight: 1.5 }}>
        若长时间停在此页，请检查网络，或将部署域名加入 InterwovenKit / Privy 允许列表。
      </p>
    </div>
  );
}

export function Providers({ children }: PropsWithChildren) {
  useEffect(() => {
    injectStyles(interwovenKitStyles);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <Suspense fallback={<KitSuspenseFallback />}>
          <InterwovenKitProvider {...kitEnv} enableAutoSign={enableAutoSign}>
            {children}
          </InterwovenKitProvider>
        </Suspense>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
