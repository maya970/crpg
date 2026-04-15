/**
 * InterwovenKit + Auto-Sign（enableAutoSign）
 * Privy / 域名等见：https://docs.initia.xyz/interwovenkit/features/autosign/configuration
 */
import { PropsWithChildren, useEffect } from 'react';
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

export function Providers({ children }: PropsWithChildren) {
  useEffect(() => {
    injectStyles(interwovenKitStyles);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <InterwovenKitProvider {...kitEnv} enableAutoSign>
          {children}
        </InterwovenKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
