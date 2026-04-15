/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: string;
  readonly VITE_LCD_URL: string;
  readonly VITE_MOVE_MODULE_ADDR: string;
  readonly VITE_GAS_PRICE: string;
  /** 设为 true 才开启 InterwovenKit Auto-Sign（默认关闭，避免未配置域名时首屏卡住） */
  readonly VITE_ENABLE_AUTOSIGN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
