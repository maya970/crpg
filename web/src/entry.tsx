/** App bootstrap: Buffer polyfill, then load main. */
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
      '<strong>Could not load the app</strong><br/>' +
      msg.replace(/</g, '&lt;') +
      '</p>';
  }
});
