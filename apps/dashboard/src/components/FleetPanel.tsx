import type { VehiclePosition } from '../lib/types';

export interface ExpectedVehicle {
  vehicleId: number;
  teamId: number;
  teamName: string;
  colorHex: string;
  role: 'van_pickup' | 'carro_dropoff' | null;
}

export function FleetPanel({
  positions,
  now,
  staleSeconds = 30,
  expected = [],
}: {
  positions: VehiclePosition[];
  now: number;
  staleSeconds?: number;
  expected?: ExpectedVehicle[];
}) {
  const byId = new Map(positions.map((p) => [p.vehicleId, p]));

  // Lista completa: todos os veículos cadastrados; sem cadastro, cai no que transmite.
  const rows =
    expected.length > 0
      ? expected.map((e) => ({ meta: e, pos: byId.get(e.vehicleId) ?? null }))
      : positions.map((p) => ({
          meta: {
            vehicleId: p.vehicleId,
            teamId: p.teamId,
            teamName: p.teamName,
            colorHex: p.colorHex,
            role: p.role,
          },
          pos: p as VehiclePosition | null,
        }));

  rows.sort(
    (a, b) =>
      a.meta.teamId - b.meta.teamId || (a.meta.role === 'van_pickup' ? -1 : 1),
  );

  return (
    <div className="panel">
      <h2><span className="h2-ico" aria-hidden>🚐</span> Frota — rastreio</h2>
      <ul className="fleet">
        {rows.map(({ meta, pos }) => {
          const ageS = pos ? Math.max(0, Math.floor((now - pos.ts) / 1000)) : null;
          const stale = ageS == null || ageS > staleSeconds;
          return (
            <li key={meta.vehicleId} className={stale ? 'stale' : ''}>
              <i className="swatch" style={{ background: meta.colorHex }} />
              <span className="fleet-name">
                {meta.teamName.replace('Canelas do Planalto — ', '')}
                <small>{meta.role === 'van_pickup' ? 'Van (pick-up)' : 'Carro (drop-off)'}</small>
              </span>
              <span className="fleet-meta">
                {ageS == null ? (
                  <span className="bad">sem sinal</span>
                ) : (
                  <span className={stale ? 'bad' : 'ok'}>
                    {stale ? `⚠ ${ageS}s` : `há ${ageS}s`}
                  </span>
                )}
                {pos?.batteryPct != null && <span className="batt">🔋 {pos.batteryPct}%</span>}
              </span>
            </li>
          );
        })}
        {rows.length === 0 && <div className="empty">Nenhum veículo cadastrado.</div>}
      </ul>
    </div>
  );
}
