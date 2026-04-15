/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: string;
  readonly VITE_LCD_URL: string;
  readonly VITE_MOVE_MODULE_ADDR: string;
  readonly VITE_GAS_PRICE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
