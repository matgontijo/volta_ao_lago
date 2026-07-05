import { useEffect, useRef, useState } from 'react';
import { fetchReplay } from '../lib/api';
import type { ReplayFrame, VehiclePosition } from '../lib/types';

/**
 * Replay pós-prova: anima o rastro persistido acumulando a última posição de
 * cada veículo ao longo dos frames.
 */
export function useReplay() {
  const [replayMode, setReplayMode] = useState(false);
  const [frames, setFrames] = useState<ReplayFrame[]>([]);
  const [playing, setPlaying] = useState(false);
  const [replayPositions, setReplayPositions] = useState<VehiclePosition[]>([]);
  const idxRef = useRef(0);
  const accRef = useRef<Record<number, VehiclePosition>>({});

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const f = frames;
      if (idxRef.current >= f.length) {
        setPlaying(false);
        return;
      }
      const batch = Math.max(1, Math.ceil(f.length / 300));
      for (let k = 0; k < batch && idxRef.current < f.length; k++) {
        const fr = f[idxRef.current++];
        accRef.current[fr.vehicleId] = {
          vehicleId: fr.vehicleId,
          teamId: fr.teamId,
          teamName: fr.teamName,
          colorHex: fr.colorHex,
          role: fr.role,
          driverName: null, // rastro persistido não guarda o operador

          lat: fr.lat,
          lng: fr.lng,
          speedMps: null,
          headingDeg: null,
          batteryPct: null,
          ts: fr.ts,
        };
      }
      setReplayPositions(Object.values(accRef.current));
    }, 120);
    return () => clearInterval(t);
  }, [playing, frames]);

  async function loadReplay() {
    try {
      const f = await fetchReplay();
      if (f.length === 0) {
        alert('Sem rastro registrado ainda. Rode a prova (ou o simulador) primeiro.');
        return;
      }
      idxRef.current = 0;
      accRef.current = {};
      setReplayPositions([]);
      setFrames(f);
      setReplayMode(true);
      setPlaying(true);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function exitReplay() {
    setReplayMode(false);
    setPlaying(false);
  }

  return { replayMode, frames, playing, setPlaying, replayPositions, idxRef, loadReplay, exitReplay };
}
