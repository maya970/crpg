/**
 * 必须在其它应用代码之前 import（见 main.tsx 首行）。
 * @cosmjs / 钱包依赖会在模块顶层使用 Buffer。
 */
import { Buffer } from 'buffer';

const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
if (typeof g.Buffer === 'undefined') {
  g.Buffer = Buffer;
}
