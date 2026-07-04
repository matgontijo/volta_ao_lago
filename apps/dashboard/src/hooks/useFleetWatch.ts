import { useEffect, useRef } from 'react';
import type { AlertPrefs } from '../components/AlertSettings';
import { beep } from '../lib/sound';
import type { GeofenceAlert, VehiclePosition } from '../lib/types';

const BATTERY_LOW_PCT = 15;
const BATTERY_RECOVER_PCT = 25;

/**
 * Vigia da frota: alerta (feed + bipe) quando um veículo para de transmitir
 * além do limite configurado — e avisa quando volta. Também acusa bateria
 * fraca no celular do veículo (uma vez, até recuperar).
 */
export function useFleetWatch(
  positions: Record<number, VehiclePosition>,
  prefsRef: React.MutableRefObject<AlertPrefs>,
  pushAlert: (a: GeofenceAlert) => void,
) {
  const staleAlerted = useRef<Record<number, boolean>>({});
  const batteryAlerted = useRef<Record<number, boolean>>({});

  useEffect(() => {
    const t = setInterval(() => {
      const limitMs = prefsRef.current.staleSeconds * 1000;
      const nowMs = Date.now();
      for (const p of Object.values(positions)) {
        const label = `${p.teamName} — ${p.role === 'van_pickup' ? 'Van' : 'Carro'}`;

        const stale = nowMs - p.ts > limitMs;
        const was = staleAlerted.current[p.vehicleId] ?? false;
        if (stale !== was) {
          staleAlerted.current[p.vehicleId] = stale;
          if (stale && prefsRef.current.sound) beep(3);
          pushAlert({
            teamId: p.teamId,
            teamName: p.teamName,
            pcName: '',
            distanceM: 0,
            message: stale
              ? `⚠️ ${label} SEM SINAL há ${Math.round((nowMs - p.ts) / 1000)}s`
              : `✅ ${label} voltou a transmitir`,
            ts: nowMs,
          });
        }

        // Bateria fraca: histerese (15% liga o alerta, 25% rearma).
        const pct = p.batteryPct;
        if (pct != null) {
          const low = pct <= BATTERY_LOW_PCT;
          const wasLow = batteryAlerted.current[p.vehicleId] ?? false;
          if (low && !wasLow) {
            batteryAlerted.current[p.vehicleId] = true;
            if (prefsRef.current.sound) beep(2);
            pushAlert({
              teamId: p.teamId,
              teamName: p.teamName,
              pcName: '',
              distanceM: 0,
              message: `🔋 ${label} com bateria fraca (${pct}%)`,
              ts: nowMs,
            });
          } else if (wasLow && pct >= BATTERY_RECOVER_PCT) {
            batteryAlerted.current[p.vehicleId] = false;
          }
        }
      }
    }, 5000);
    return () => clearInterval(t);
  }, [positions, prefsRef, pushAlert]);
}
