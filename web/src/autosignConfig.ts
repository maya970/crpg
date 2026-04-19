/**
 * InterwovenKit Auto-Sign（构建时配置）
 * @see https://docs.initia.xyz/interwovenkit/features/autosign/configuration
 */
const MSG_EXECUTE = '/initia.move.v1.MsgExecute';

export type InterwovenEnableAutoSign = boolean | Record<string, string[]>;

export function resolveInterwovenKitEnableAutoSign(): InterwovenEnableAutoSign {
  const raw = (import.meta.env.VITE_ENABLE_AUTOSIGN ?? '').trim().toLowerCase();
  if (!raw || raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
  if (raw === 'explicit') {
    const chainId = String(import.meta.env.VITE_CHAIN_ID ?? '').trim() || 'initiation-2';
    return { [chainId]: [MSG_EXECUTE] };
  }
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
  return false;
}

export type AutosignBuildSummary =
  | { on: false; mode: 'off' }
  | { on: true; mode: 'simple' }
  | { on: true; mode: 'explicit'; chainId: string };

export function autosignBuildSummary(): AutosignBuildSummary {
  const raw = (import.meta.env.VITE_ENABLE_AUTOSIGN ?? '').trim().toLowerCase();
  if (!raw || raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') {
    return { on: false, mode: 'off' };
  }
  if (raw === 'explicit') {
    const chainId = String(import.meta.env.VITE_CHAIN_ID ?? '').trim() || 'initiation-2';
    return { on: true, mode: 'explicit', chainId };
  }
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') {
    return { on: true, mode: 'simple' };
  }
  return { on: false, mode: 'off' };
}
