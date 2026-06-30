import type { VehiclePosition } from '../lib/types';

export function FleetPanel({
  positions,
  now,
  staleSeconds = 30,
}: {
  positions: VehiclePosition[];
  now: number;
  staleSeconds?: number;
}) {
  const sorted = [...positions].sort(
    (a, b) => a.teamId - b.teamId || (a.role === 'van_pickup' ? -1 : 1),
  );
  return (
    <div className="panel">
      <h2><span className="h2-ico" aria-hidden>🚐</span> Frota — rastreio</h2>
      <ul className="fleet">
        {sorted.map((p) => {
          const ageS = Math.max(0, Math.floor((now - p.ts) / 1000));
          const stale = ageS > staleSeconds;
          return (
            <li key={p.vehicleId} className={stale ? 'stale' : ''}>
              <i className="swatch" style={{ background: p.colorHex }} />
              <span className="fleet-name">
                {p.teamName.replace('Canelas do Planalto — ', '')}
                <small>{p.role === 'van_pickup' ? 'Van (pick-up)' : 'Carro (drop-off)'}</small>
              </span>
              <span className="fleet-meta">
                <span className={stale ? 'bad' : 'ok'}>
                  {stale ? `⚠ ${ageS}s` : `há ${ageS}s`}
                </span>
                {p.batteryPct != null && <span className="batt">🔋 {p.batteryPct}%</span>}
              </span>
            </li>
          );
        })}
        {sorted.length === 0 && <div className="empty">Nenhum veículo transmitindo.</div>}
      </ul>
    </div>
  );
}
