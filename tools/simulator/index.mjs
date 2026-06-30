// ============================================================================
// Simulador da Volta do Lago — move as vans/carros SOBRE A ROTA (seguindo as
// ruas, geometria road-snapped do OSRM) e dispara as trocas ao chegar em cada
// PC de coleta. Vê o dashboard "ao vivo" sem celulares.
//
//   1. npm run infra:up
//   2. npm run dev:backend   (e: npm run build:route, uma vez)
//   3. node tools/simulator/index.mjs   (ou: npm run sim)
// ============================================================================
import { io } from 'socket.io-client';

const API = process.env.VITE_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'volta2026';
const EMIT_MS = 1500; // emite mais rápido que 5s só para o mapa fluir
const ARRIVE_M = 150; // raio para considerar "chegou no PC" e trocar

// Velocidades ACELERADAS de demo (a prova real é em pace de corrida).
const TEAMS = [
  { operator: 'op-falcoes', driver: 'mot-falcoes', speed: 80 },
  { operator: 'op-aguias', driver: 'mot-aguias', speed: 65 },
  { operator: 'op-lobos', driver: 'mot-lobos', speed: 50 },
];

const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function lerp(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

// Constrói segmentos cumulativos a partir da polyline [[lat,lng],...].
function buildPath(route) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = { lat: route[i][0], lng: route[i][1] };
    const b = { lat: route[i + 1][0], lng: route[i + 1][1] };
    const d = haversine(a, b) || 0.0001;
    segs.push({ a, b, d, acc: total });
    total += d;
  }
  return { segs, total };
}
// Posição a `dist` metros ao longo da rota (faz wrap no loop).
function posAt(path, dist) {
  let x = ((dist % path.total) + path.total) % path.total;
  for (const s of path.segs) {
    if (x <= s.acc + s.d) return lerp(s.a, s.b, (x - s.acc) / s.d);
  }
  return path.segs[path.segs.length - 1].b;
}

async function login(username) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login falhou para ${username}`);
  return (await res.json()).token;
}

async function main() {
  const boot = await (await fetch(`${API}/race/bootstrap`)).json();
  const pcs = boot.exchangePoints
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((p) => ({ lat: p.lat, lng: p.lng, name: p.name }));

  // Geometria fiel às ruas (cai em retas entre PCs se não houver routePath).
  const routeLatLng =
    boot.routePath && boot.routePath.length > 1
      ? boot.routePath
      : [...pcs.map((p) => [p.lat, p.lng]), [pcs[0].lat, pcs[0].lng]];
  const path = buildPath(routeLatLng);

  // Ordem de chegada nos PCs: do 2º ponto até o último, e fim na largada/chegada.
  const targets = [...pcs.slice(1), pcs[0]];
  console.log(`Rota: ${(path.total / 1000).toFixed(1)} km por rua, ${targets.length} trocas.`);

  for (const team of TEAMS) {
    const [opToken, drvToken] = await Promise.all([login(team.operator), login(team.driver)]);
    const van = io(API, { auth: { token: opToken }, transports: ['websocket'] });
    const car = io(API, { auth: { token: drvToken }, transports: ['websocket'] });
    await new Promise((r) => van.on('connect', r));

    let dist = 0;
    let ti = 0; // índice do próximo PC alvo
    let finished = false;

    van.emit('troca:execute', { lat: pcs[0].lat, lng: pcs[0].lng }, (ack) =>
      console.log(`[${team.operator}] largada:`, ack?.action),
    );

    const tick = setInterval(() => {
      if (finished) return;
      dist += team.speed * (EMIT_MS / 1000);
      const pos = posAt(path, dist);

      if (ti < targets.length && haversine(pos, targets[ti]) < ARRIVE_M) {
        const reached = targets[ti];
        ti += 1;
        van.emit('troca:execute', { lat: pos.lat, lng: pos.lng }, (ack) => {
          console.log(`[${team.operator}] troca em ${reached.name}:`, ack?.action);
          if (ack?.action === 'finished_race') {
            finished = true;
            clearInterval(tick);
            setTimeout(() => {
              van.close();
              car.close();
            }, 1000);
          }
        });
      }

      van.emit('position:update', {
        lat: pos.lat,
        lng: pos.lng,
        speedMps: team.speed,
        ts: Date.now(),
        batteryPct: 80,
      });
      // Carro (drop-off) vai à frente, esperando no próximo PC.
      const next = targets[Math.min(ti, targets.length - 1)];
      car.emit('position:update', {
        lat: next.lat + (Math.random() - 0.5) * 0.0004,
        lng: next.lng + (Math.random() - 0.5) * 0.0004,
        speedMps: 0,
        ts: Date.now(),
        batteryPct: 90,
      });
    }, EMIT_MS);
  }

  console.log('Simulação rodando (veículos seguindo as ruas). Ctrl+C para parar.');
}

main().catch((err) => {
  console.error('Erro no simulador:', err.message);
  console.error('Backend no ar em', API, '? Rodou "npm run build:route"?');
  process.exit(1);
});
