// ============================================================================
// Swarm de espectadores — teste de carga do link público ANTES do dia da prova.
//
// Simula N espectadores reais: cada um conecta no WebSocket com o token de
// espectador, recebe o snapshot e fica ouvindo posições ao vivo (e faz o
// mesmo primeiro acesso REST que o navegador faria: bootstrap + timeline).
//
// Uso:
//   node tools/swarm-espectadores.mjs <URL> <TOKEN_ESPECTADOR> [N=100] [DURACAO_S=60]
//
// Exemplo (contra produção, com o link copiado do painel Acessos/QR):
//   node tools/swarm-espectadores.mjs https://volta-ao-lago.onrender.com "eyJhbGci..." 200 90
//
// O TOKEN é a parte depois de "?s=" no link do espectador.
// Rode do seu computador; comece com 50 e vá subindo (100, 200, 300...).
// ============================================================================
import { io } from 'socket.io-client';

const [, , URL_BASE, TOKEN, N_ARG, DUR_ARG] = process.argv;
if (!URL_BASE || !TOKEN) {
  console.error('Uso: node tools/swarm-espectadores.mjs <URL> <TOKEN_ESPECTADOR> [N=100] [DURACAO_S=60]');
  process.exit(1);
}
const N = Number(N_ARG ?? 100);
const DUR_S = Number(DUR_ARG ?? 60);
const RAMP_PER_S = 25; // conexões novas por segundo (rajada realista de grupo de WhatsApp)

const stats = {
  conectados: 0,
  snapshots: 0,
  erros: 0,
  desconexoes: 0,
  msgs: 0,
  restOk: 0,
  restFalha: 0,
  tSnapshot: [], // ms do connect até o snapshot
};

console.log(`🌊 Swarm: ${N} espectadores → ${URL_BASE} por ${DUR_S}s (rampa ${RAMP_PER_S}/s)\n`);

const sockets = [];

function espectador(i) {
  const t0 = Date.now();
  const s = io(URL_BASE, {
    auth: { token: TOKEN },
    transports: ['websocket'],
    reconnection: false,
    timeout: 15000,
  });
  sockets.push(s);

  s.on('connect', () => { stats.conectados++; });
  s.on('state:snapshot', () => {
    stats.snapshots++;
    stats.tSnapshot.push(Date.now() - t0);
  });
  s.on('vehicle:position', () => { stats.msgs++; });
  s.on('team:update', () => { stats.msgs++; });
  s.on('timeline:event', () => { stats.msgs++; });
  s.on('auth:error', (e) => { stats.erros++; console.error(`  [${i}] auth:error ${e?.message ?? ''}`); });
  s.on('connect_error', () => { stats.erros++; });
  s.on('disconnect', (reason) => { if (reason !== 'io client disconnect') stats.desconexoes++; });

  // O primeiro acesso real também busca bootstrap + timeline via REST.
  Promise.all([
    fetch(`${URL_BASE}/race/bootstrap`),
    fetch(`${URL_BASE}/race/timeline?limit=100`),
  ])
    .then((rs) => (rs.every((r) => r.ok) ? stats.restOk++ : stats.restFalha++))
    .catch(() => stats.restFalha++);
}

// Rampa de entrada: RAMP_PER_S novos espectadores por segundo.
let lancados = 0;
const ramp = setInterval(() => {
  for (let i = 0; i < RAMP_PER_S && lancados < N; i++) espectador(lancados++);
  if (lancados >= N) clearInterval(ramp);
}, 1000);

const inicio = Date.now();
let msgsAnterior = 0;
const painel = setInterval(() => {
  const taxa = ((stats.msgs - msgsAnterior) / 5).toFixed(1);
  msgsAnterior = stats.msgs;
  console.log(
    `t=${Math.round((Date.now() - inicio) / 1000)}s · conectados ${stats.conectados}/${N} · ` +
      `snapshots ${stats.snapshots} · ${taxa} msg/s recebidas · erros ${stats.erros} · quedas ${stats.desconexoes}`,
  );
}, 5000);

setTimeout(() => {
  clearInterval(ramp);
  clearInterval(painel);
  sockets.forEach((s) => s.close());

  const ts = stats.tSnapshot.sort((a, b) => a - b);
  const pct = (p) => (ts.length ? ts[Math.min(ts.length - 1, Math.floor((p / 100) * ts.length))] : 0);
  console.log('\n================ RESULTADO ================');
  console.log(`Espectadores:        ${N}`);
  console.log(`Conectaram:          ${stats.conectados} (${((stats.conectados / N) * 100).toFixed(0)}%)`);
  console.log(`Snapshot recebido:   ${stats.snapshots}`);
  console.log(`Tempo até snapshot:  mediana ${pct(50)}ms · p95 ${pct(95)}ms · máx ${ts[ts.length - 1] ?? 0}ms`);
  console.log(`REST (bootstrap+timeline): ${stats.restOk} ok · ${stats.restFalha} falhas`);
  console.log(`Mensagens ao vivo:   ${stats.msgs} no total`);
  console.log(`Erros de conexão:    ${stats.erros}`);
  console.log(`Quedas no meio:      ${stats.desconexoes}`);
  console.log('===========================================');
  console.log(
    stats.conectados >= N * 0.98 && stats.desconexoes === 0 && pct(95) < 5000
      ? '✅ AGUENTOU: todos conectaram, ninguém caiu, snapshot rápido.'
      : '⚠️ ATENÇÃO: houve falhas/lentidão — considere o plano Starter do Render ou reduza expectativa de público.',
  );
  process.exit(0);
}, DUR_S * 1000);
