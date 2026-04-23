/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: string;
  readonly VITE_LCD_URL: string;
  readonly VITE_MOVE_MODULE_ADDR: string;
  readonly VITE_GAS_PRICE: string;
  /** Auto-sign: `true` simple; `explicit` with optional VITE_CHAIN_ID */
  readonly VITE_ENABLE_AUTOSIGN?: string;
  /** Chain id when using explicit auto-sign */
  readonly VITE_CHAIN_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
