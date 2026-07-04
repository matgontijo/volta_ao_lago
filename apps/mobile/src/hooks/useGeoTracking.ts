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
 *    persistido em localStorage — sobrevive a reload da página — e são
 *    reenviadas EM LOTES no evento `connect` do socket (auto-reconnect).
 *
 * Observação honesta sobre background: navegadores estrangulam timers de abas
 * em segundo plano. Mitigação: Wake Lock (tela acesa, celular fixado na van) —
 * ver useWakeLock. Tracking 100% com app fechado exige app nativo.
 */
export type GeoPermission = 'unknown' | 'prompt' | 'granted' | 'denied';

const BUFFER_KEY = 'volta.posBuffer';
const BUFFER_MAX = 1000; // teto de memória/armazenamento
const FLUSH_CHUNK = 25; // posições por lote no reenvio
const FLUSH_CHUNK_MS = 250; // intervalo entre lotes (não afoga a conexão recém-criada)

function loadBuffer(): PositionUpdate[] {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    const arr = raw ? (JSON.parse(raw) as PositionUpdate[]) : [];
    return Array.isArray(arr) ? arr.slice(-BUFFER_MAX) : [];
  } catch {
    return [];
  }
}

function saveBuffer(buf: PositionUpdate[]): void {
  try {
    if (buf.length === 0) localStorage.removeItem(BUFFER_KEY);
    else localStorage.setItem(BUFFER_KEY, JSON.stringify(buf));
  } catch {
    /* storage cheio/indisponível: o buffer em memória continua valendo */
  }
}

export function useGeoTracking(socket: Socket | null, opts: Options = {}) {
  const intervalMs = opts.intervalMs ?? 5000;

  const [tracking, setTracking] = useState(false);
  const [lastFix, setLastFix] = useState<GeoFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<GeoPermission>('unknown');
  const [bufferedCount, setBufferedCount] = useState(0);
  const [batteryPct, setBatteryPct] = useState<number | null>(null);

  const watchId = useRef<number | null>(null);
  const timerId = useRef<number | null>(null);
  const flushTimerId = useRef<number | null>(null);
  const latest = useRef<GeolocationPosition | null>(null);
  // Lazy: restaura o buffer persistido UMA vez (não a cada render).
  const [initialBuffer] = useState<PositionUpdate[]>(() => loadBuffer());
  const buffer = useRef<PositionUpdate[]>(initialBuffer);
  const battery = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(socket);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  // Observa o estado da permissão de localização (quando o navegador expõe).
  // Essencial p/ UX: se o motorista negar, mostramos como reativar.
  useEffect(() => {
    const nav = navigator as Navigator & { permissions?: any };
    let status: any;
    nav.permissions
      ?.query?.({ name: 'geolocation' })
      .then((st: any) => {
        status = st;
        setPermission(st.state as GeoPermission);
        st.onchange = () => setPermission(st.state as GeoPermission);
      })
      .catch(() => {
        /* Safari antigo não expõe — seguimos com 'unknown' */
      });
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

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

  // Reenvia o buffer assim que a conexão volta — em lotes, para não despejar
  // até 1000 posições de uma vez numa conexão que acabou de se restabelecer.
  const flushBuffer = useCallback(() => {
    if (flushTimerId.current != null) return; // flush já em andamento
    const pump = () => {
      const currentSocket = socketRef.current;
      if (!currentSocket?.connected || buffer.current.length === 0) {
        if (flushTimerId.current != null) {
          clearInterval(flushTimerId.current);
          flushTimerId.current = null;
        }
        saveBuffer(buffer.current);
        setBufferedCount(buffer.current.length);
        return;
      }
      for (let i = 0; i < FLUSH_CHUNK && buffer.current.length > 0; i++) {
        currentSocket.emit('position:update', buffer.current.shift());
      }
      saveBuffer(buffer.current);
      setBufferedCount(buffer.current.length);
    };
    pump();
    if (buffer.current.length > 0) {
      flushTimerId.current = window.setInterval(pump, FLUSH_CHUNK_MS);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('connect', flushBuffer);
    // Buffer restaurado do localStorage (reload na zona morta): reflete o
    // contador e, se a conexão já estiver de pé, despacha imediatamente.
    setBufferedCount(buffer.current.length);
    if (socket.connected && buffer.current.length > 0) flushBuffer();
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
        setPermission('granted');
        setError(null);
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
      (err) => {
        if (err.code === 1) {
          // PERMISSION_DENIED: parar limpo — o overlay de recuperação assume.
          setPermission('denied');
          setError('Permissão de localização negada neste navegador.');
          if (watchId.current != null) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
          }
          if (timerId.current != null) {
            clearInterval(timerId.current);
            timerId.current = null;
          }
          setTracking(false);
        } else if (err.code === 2) {
          setError('Sem sinal de GPS no momento — procurando satélites…');
        } else {
          setError('GPS demorou a responder — tentando de novo…');
        }
      },
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
        if (buffer.current.length > BUFFER_MAX) buffer.current.shift(); // teto
        saveBuffer(buffer.current); // sobrevive a reload na zona morta
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
    if (flushTimerId.current != null) {
      clearInterval(flushTimerId.current);
      flushTimerId.current = null;
    }
    setTracking(false);
  }, []);

  useEffect(() => {
    if (opts.autoStart) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { tracking, lastFix, error, permission, bufferedCount, batteryPct, start, stop };
}
