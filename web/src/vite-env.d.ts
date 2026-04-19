/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: string;
  readonly VITE_LCD_URL: string;
  readonly VITE_MOVE_MODULE_ADDR: string;
  readonly VITE_GAS_PRICE: string;
  /**
   * Auto-Sign：`true` / `1` 为简单模式；`explicit` 为按链仅允许 MsgExecute（配合 VITE_CHAIN_ID，默认 initiation-2）
   * @see https://docs.initia.xyz/interwovenkit/features/autosign/configuration
   */
  readonly VITE_ENABLE_AUTOSIGN?: string;
  /** 与 `VITE_ENABLE_AUTOSIGN=explicit` 联用，指定链 id（主网务必显式填写） */
  readonly VITE_CHAIN_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
