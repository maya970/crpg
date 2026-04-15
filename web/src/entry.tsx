/**
 * 唯一入口：先同步挂 Buffer，再动态 import main（避免 ESM 静态提升导致 polyfill 太晚）。
 * 不使用 top-level await：Vite 生产构建的 esbuild-transpile 默认目标不支持 TLA，会报错。
 */
import { Buffer } from 'buffer';

const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
g.Buffer = Buffer;

void import('./main').catch((err) => {
  console.error(err);
  const root = document.getElementById('root');
  if (root) {
    const msg = err instanceof Error ? err.message : String(err);
    root.innerHTML =
      '<p style="padding:2rem;color:#fca5a5;font-family:system-ui,sans-serif;max-width:28rem;margin:0 auto">' +
      '<strong>应用加载失败</strong><br/>' +
      msg.replace(/</g, '&lt;') +
      '</p>';
  }
});
