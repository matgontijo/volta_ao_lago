import { useEffect, useRef } from 'react';

/**
 * Mantém a tela acesa enquanto o tracking está ativo (celular fixado na van).
 * Reativa o lock ao voltar do segundo plano. No-op em browsers sem Wake Lock.
 */
export function useWakeLock(active: boolean): void {
  const sentinel = useRef<any>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: any };
    if (!active || !nav.wakeLock) return;

    let cancelled = false;
    const request = async () => {
      try {
        sentinel.current = await nav.wakeLock.request('screen');
      } catch {
        /* negado / sem suporte */
      }
    };
    request();

    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      sentinel.current?.release?.().catch(() => {});
      sentinel.current = null;
    };
  }, [active]);
}
