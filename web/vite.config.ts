import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      protocolImports: true,
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    react(),
  ],
  server: { port: 5173 },
  optimizeDeps: {
    include: ['buffer'],
  },
  build: {
    chunkSizeWarningLimit: 16000,
    target: 'es2022',
  },
});
