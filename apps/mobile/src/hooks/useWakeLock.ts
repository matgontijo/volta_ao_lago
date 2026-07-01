import { useEffect, useRef } from 'react';
import NoSleep from 'nosleep.js';

/**
 * Mantém a tela acesa enquanto o tracking está ativo (celular fixado na van).
 * Utiliza o NoSleep.js (que roda um micro-vídeo invisível) para garantir que
 * o iOS Safari/Chrome não suspenda o processo e corte a conexão do WebSocket.
 */
export function useWakeLock(active: boolean): void {
  const noSleepRef = useRef<NoSleep | null>(null);

  useEffect(() => {
    if (!active) return;

    if (!noSleepRef.current) {
      noSleepRef.current = new NoSleep();
    }

    const ns = noSleepRef.current;
    
    // Tenta ativar o lock (requer que seja engatilhado por interação do usuário,
    // o que já acontece pois o "active" vira true no onClick do ATIVAR GPS)
    ns.enable().catch(() => {
      console.warn('Falha ao ativar o NoSleep');
    });

    return () => {
      ns.disable();
    };
  }, [active]);
}
