/** Wallet shell (InterwovenKit). */
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

/** Auto-sign when enabled at build time; see autosignConfig. */
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
      <p style={{ margin: 0, fontSize: 16 }}>Loading wallet…</p>
      <p style={{ margin: '1rem 0 0', fontSize: 13, color: '#94a3b8', maxWidth: 360, lineHeight: 1.5 }}>
        If this screen stays for a long time, check your network and try again later.
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
