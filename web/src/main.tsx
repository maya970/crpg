import './polyfill';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Providers } from './providers';
import { App } from './App';
import { RootErrorBoundary } from './RootErrorBoundary';

declare global {
  interface Window {
    __RPG_APP_READY?: boolean;
  }
}

const el = document.getElementById('root');
if (el) {
  try {
    createRoot(el).render(
      <StrictMode>
        <RootErrorBoundary>
          <Providers>
            <App />
          </Providers>
        </RootErrorBoundary>
      </StrictMode>
    );
    window.__RPG_APP_READY = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    el.innerHTML =
      '<p style="padding:2rem;color:#fca5a5;font-family:system-ui,sans-serif;max-width:28rem;margin:0 auto">' +
      '<strong>首屏渲染崩溃</strong><br/>' +
      String(msg).replace(/</g, '&lt;') +
      '</p>';
  }
}
