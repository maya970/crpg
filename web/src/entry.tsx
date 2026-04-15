/**
 * 必须作为唯一入口：ESM 会提升静态 import，导致在 main 里先 import polyfill 仍会晚于依赖子图。
 * 用 top-level await：先挂好 Buffer，再动态加载应用。
 */
import { Buffer } from 'buffer';

const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
g.Buffer = Buffer;

await import('./main');
