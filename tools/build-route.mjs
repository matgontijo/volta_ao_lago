// ============================================================================
// build-route — busca a rota REAL seguindo as ruas (OSRM) que liga os PCs na
// ordem do percurso e grava no banco:
//   * route_path.points  -> geometria road-snapped (para desenhar o traçado)
//   * legs.distance_m     -> distância REAL de cada trecho (pace/ETA fiéis)
//   * exchange_points.km_marker -> recalculado (acumulado)
//
// Rode uma vez após o seed:  npm run build:route
// ============================================================================
import pg from 'pg';

const DB =
  process.env.DATABASE_URL ?? 'postgres://volta:volta@localhost:5544/volta_ao_lago';
const OSRM = process.env.OSRM_URL ?? 'https://router.project-osrm.org';

async function main() {
  const client = new pg.Client({
    connectionString: DB,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  const pcs = (
    await client.query(
      `SELECT sequence,
              ST_X(location::geometry) AS lng,
              ST_Y(location::geometry) AS lat
         FROM exchange_points ORDER BY sequence`,
    )
  ).rows;
  if (pcs.length === 0) throw new Error('Sem PCs — rode o seed antes.');

  // Coordenadas na ordem do percurso + volta ao ponto inicial (loop).
  const coordList = [...pcs.map((p) => `${p.lng},${p.lat}`), `${pcs[0].lng},${pcs[0].lat}`].join(';');
  const url = `${OSRM}/route/v1/driving/${coordList}?overview=full&geometries=geojson`;

  console.log(`Consultando OSRM (${pcs.length} pontos)...`);
  const res = await fetch(url);
  const j = await res.json();
  if (j.code !== 'Ok') throw new Error(`OSRM retornou: ${j.code} ${j.message ?? ''}`);

  const route = j.routes[0];
  const points = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]); // -> [lat,lng]

  await client.query(
    `INSERT INTO route_path (id, points) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET points = EXCLUDED.points`,
    [JSON.stringify(points)],
  );

  // Distância real de cada trecho (uma "leg" do OSRM por par de PCs).
  for (let i = 0; i < route.legs.length; i++) {
    await client.query('UPDATE legs SET distance_m = $1 WHERE sequence = $2', [
      Math.round(route.legs[i].distance),
      i + 1,
    ]);
  }

  await client.query(
    `UPDATE exchange_points ep
       SET km_marker = ROUND(
         COALESCE((SELECT SUM(l.distance_m) FROM legs l WHERE l.sequence < ep.sequence), 0) / 1000.0, 2)`,
  );

  console.log(
    `OK: ${points.length} pontos de geometria, ${route.legs.length} trechos, ` +
      `total ${(route.distance / 1000).toFixed(1)} km (por rua).`,
  );
  await client.end();
}

main().catch((err) => {
  console.error('Falha no build-route:', err.message);
  console.error('Backend/infra no ar? OSRM acessível?');
  process.exit(1);
});
