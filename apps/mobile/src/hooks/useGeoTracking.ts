import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { PositionUpdate } from '../lib/types';

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
  speedMps: number | null;
  ts: number;
}

interface Options {
  /** Intervalo de envio. Requisito: 5s. */
  intervalMs?: number;
  autoStart?: boolean;
}

/**
 * Captura GPS contínua via Geolocation API e envia ao backend a cada `intervalMs`.
 *
 * Estratégia (foreground/background):
 *  - `watchPosition` mantém o fix mais recente atualizado em alta precisão.
 *  - Um timer separado amostra esse fix a cada 5s e emite via WebSocket.
 *  - Sem conexão (van em zona morta da estrada), as amostras vão para um BUFFER
 *    em memória e são reenviadas no evento `connect` do socket (auto-reconnect).
 *
 * Observação honesta sobre background: navegadores estrangulam timers de abas
 * em segundo plano. Mitigação: Wake Lock (tela acesa, celular fixado na van) —
 * ver useWakeLock. Tracking 100% com app fechado exige app nativo.
 */
export function useGeoTracking(socket: Socket | null, opts: Options = {}) {
  const intervalMs = opts.intervalMs ?? 5000;

  const [tracking, setTracking] = useState(false);
  const [lastFix, setLastFix] = useState<GeoFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bufferedCount, setBufferedCount] = useState(0);
  const [batteryPct, setBatteryPct] = useState<number | null>(null);

  const watchId = useRef<number | null>(null);
  const timerId = useRef<number | null>(null);
  const latest = useRef<GeolocationPosition | null>(null);
  const buffer = useRef<PositionUpdate[]>([]);
  const battery = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(socket);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  // Nível de bateria (telemetria) quando a API estiver disponível.
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<any> };
    nav.getBattery?.().then((b) => {
      const update = () => {
        const pct = Math.round(b.level * 100);
        battery.current = pct;
        setBatteryPct(pct);
      };
      update();
      b.addEventListener('levelchange', update);
    });
  }, []);

  // Reenvia o buffer assim que a conexão volta.
  const flushBuffer = useCallback(() => {
    const currentSocket = socketRef.current;
    if (!currentSocket?.connected) return;
    while (buffer.current.length > 0) {
      currentSocket.emit('position:update', buffer.current.shift());
    }
    setBufferedCount(0);
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('connect', flushBuffer);
    return () => {
      socket.off('connect', flushBuffer);
    };
  }, [socket, flushBuffer]);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocalização não suportada neste dispositivo.');
      return;
    }
    if (watchId.current != null) return;
    setError(null);
    setTracking(true);

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const isFirst = latest.current === null;
        latest.current = pos;
        setLastFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speedMps: pos.coords.speed,
          ts: pos.timestamp,
        });
        
        if (isFirst) {
          // Dispara imediatamente no primeiro fix de GPS!
          const payload: PositionUpdate = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            speedMps: pos.coords.speed ?? undefined,
            headingDeg: pos.coords.heading ?? undefined,
            accuracyM: pos.coords.accuracy,
            batteryPct: battery.current ?? undefined,
            ts: Date.now(),
          };
          const currentSocket = socketRef.current;
          if (currentSocket?.connected) {
            currentSocket.emit('position:update', payload);
          }
        }
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
    );

    timerId.current = window.setInterval(() => {
      const pos = latest.current;
      if (!pos) return;
      const payload: PositionUpdate = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speedMps: pos.coords.speed ?? undefined,
        headingDeg: pos.coords.heading ?? undefined,
        accuracyM: pos.coords.accuracy,
        batteryPct: battery.current ?? undefined,
        ts: Date.now(),
      };
      
      const currentSocket = socketRef.current;
      if (currentSocket?.connected) {
        currentSocket.emit('position:update', payload);
      } else {
        buffer.current.push(payload);
        if (buffer.current.length > 1000) buffer.current.shift(); // teto de memória
        setBufferedCount(buffer.current.length);
      }
    }, intervalMs);
  }, [intervalMs]);

  const stop = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (timerId.current != null) {
      clearInterval(timerId.current);
      timerId.current = null;
    }
    setTracking(false);
  }, []);

  useEffect(() => {
    if (opts.autoStart) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { tracking, lastFix, error, bufferedCount, batteryPct, start, stop };
}
