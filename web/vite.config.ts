import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RollupLog } from 'rollup';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Copy three.min.js into public/vendor for dungeon.html (no postinstall script file needed on CI). */
function copyThreeVendor(): Plugin {
  return {
    name: 'copy-three-vendor',
    buildStart() {
      const src = path.join(__dirname, 'node_modules', 'three', 'build', 'three.min.js');
      const dstDir = path.join(__dirname, 'public', 'vendor');
      const dst = path.join(dstDir, 'three.min.js');
      if (!fs.existsSync(src)) {
        console.warn('[copy-three] skip: three not installed yet');
        return;
      }
      fs.mkdirSync(dstDir, { recursive: true });
      fs.copyFileSync(src, dst);
      console.log('[copy-three] copied to public/vendor/three.min.js');
    },
  };
}

export default defineConfig({
  plugins: [
    copyThreeVendor(),
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
    rollupOptions: {
      onwarn(warning: RollupLog, defaultHandler: (w: RollupLog) => void) {
        const msg = String(warning.message ?? '');
        const id = typeof warning.id === 'string' ? warning.id : '';
        // Harmless: nested `ox` in wallet SDKs; Rollup strips misplaced /*#__PURE__*/.
        if (msg.includes('__PURE__') && id.includes('node_modules')) return;
        // Known polyfill / protobuf patterns pulled in via node polyfills + cosmjs stack.
        if (
          warning.code === 'EVAL' &&
          typeof warning.id === 'string' &&
          (warning.id.includes('vm-browserify') || warning.id.includes('@protobufjs/inquire'))
        ) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
});
