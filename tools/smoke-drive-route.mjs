// Smoke: login van -> emite 1 posição -> consulta a roteirização.
import { io } from 'socket.io-client';

const API = 'http://localhost:3001';

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'op-falcoes', password: 'volta2026' }),
});
if (!login.ok) throw new Error('login falhou: ' + login.status);
const { token, profile } = await login.json();
console.log('login ok, team:', profile.teamId);

const s = io(API, { auth: { token }, transports: ['websocket'] });
await new Promise((res, rej) => {
  s.on('connect', res);
  s.on('connect_error', rej);
  setTimeout(() => rej(new Error('timeout socket')), 8000);
});

// Posição perto da Largada (Lifebox) — a rota deve ir até o PC 1.
s.emit('position:update', { lat: -15.8192816, lng: -47.8354671, speedMps: 10, ts: Date.now() });
await new Promise((r) => setTimeout(r, 1200));

const route = await (await fetch(`${API}/race/drive-route/${profile.teamId}`)).json().catch(() => null);
if (route) {
  console.log(
    `ROTA OK -> ${route.pcName} | ${(route.distanceM / 1000).toFixed(2)} km | ` +
      `${Math.round(route.durationSec / 60)} min | ${route.points.length} pontos de geometria`,
  );
} else {
  console.log('ROTA NULL (sem próximo PC? prova não largou)');
}
s.close();
