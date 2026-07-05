// Espelho da Prova — relatório HTML autocontido (zero dependências externas),
// gerado no servidor a partir dos MESMOS dados dos CSVs. Feito para ser
// baixado, mandado no grupo e impresso.

import { kmPtBr, paceMinPerKm, secondsToHms } from '../common/csv';
import { formatPaceDelta, secondsToClockLabel } from '../common/report-utils';
import type { AthleteReportRow, LegReportRow, StandingReportRow } from './report.service';

export interface EspelhoData {
  standings: StandingReportRow[];
  legs: LegReportRow[];
  athletes: AthleteReportRow[];
  geradoEm: string; // já formatado no fuso da prova
}

const CATEGORIA_PT: Record<string, string> = {
  elite_masculino: 'Elite Masculino',
  elite_feminino: 'Elite Feminino',
  misto: 'Misto',
};

const MEDALHAS = ['🥇', '🥈', '🥉'];

export function buildEspelhoHtml(d: EspelhoData): string {
  const done = d.legs.filter((l) => l.status === 'completed' && l.paceSecPerKm != null);
  const isFinal = d.standings.length > 0 && d.standings.every((s) => s.finished);

  // ---- Destaques ----------------------------------------------------------
  const fastestLeg = [...done].sort((a, b) => a.paceSecPerKm! - b.paceSecPerKm!)[0] ?? null;
  const ranAthletes = d.athletes.filter((a) => a.trechosCorridos > 0);
  const bestAthlete =
    [...ranAthletes].sort((a, b) => (a.paceSecPerKm ?? 1e9) - (b.paceSecPerKm ?? 1e9))[0] ?? null;
  const totalKm = d.standings.reduce((s, x) => s + x.distM, 0);
  const totalTrocas = done.length;
  const trocasTorre = d.standings.reduce((s, x) => s + x.forcedTrocas, 0);

  // ---- Pódio por categoria -------------------------------------------------
  const categorias = [...new Set(d.standings.map((s) => s.category))];
  const podios = categorias
    .map((cat) => ({
      cat,
      teams: d.standings
        .filter((s) => s.category === cat)
        .sort((a, b) => a.posCategoria - b.posCategoria)
        .slice(0, 3),
    }))
    .filter((p) => p.teams.length > 0);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Espelho da Prova — Volta do Lago</title>
<style>
  :root { --bg:#06101c; --card:#0c1626; --line:#1c2a3f; --text:#e8eef7; --muted:#8aa0b8; --gold:#f7c948; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif; padding:24px 14px 48px; max-width:840px; margin:0 auto; }
  header { text-align:center; margin-bottom:22px; }
  h1 { font-size:26px; letter-spacing:-.5px; }
  .sub { color:var(--muted); font-size:13px; text-transform:uppercase; letter-spacing:2px; margin-top:4px; }
  .status { display:inline-block; margin-top:10px; border:1px solid var(--gold); color:var(--gold); border-radius:999px; padding:5px 16px; font-size:13px; font-weight:700; }
  .status.parcial { border-color:#38bdf8; color:#38bdf8; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:1.6px; color:var(--muted); margin:28px 0 12px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px; }
  .podios { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:12px; }
  .podio h3 { font-size:13px; color:var(--gold); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; }
  .podio-row { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--line); font-size:14px; }
  .podio-row:last-child { border-bottom:none; }
  .podio-row .tempo { margin-left:auto; color:var(--muted); font-variant-numeric:tabular-nums; font-size:13px; }
  .sw { width:10px; height:10px; border-radius:3px; display:inline-block; flex-shrink:0; }
  .destaques { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px; }
  .stat .v { font-size:20px; font-weight:800; margin-top:4px; }
  .stat .k { color:var(--muted); font-size:12px; }
  .stat small { display:block; color:var(--muted); font-size:11px; margin-top:3px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { text-align:left; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:1px; padding:8px 8px; border-bottom:1px solid var(--line); }
  td { padding:8px; border-bottom:1px solid var(--line); }
  tr:last-child td { border-bottom:none; }
  .num { font-variant-numeric:tabular-nums; }
  .pos { font-weight:800; }
  .muted { color:var(--muted); }
  .forced { color:#fbbf24; font-weight:700; }
  .chart-wrap { overflow-x:auto; }
  .legend { display:flex; flex-wrap:wrap; gap:14px; margin-top:10px; font-size:12px; color:var(--muted); }
  .legend span { display:inline-flex; align-items:center; gap:6px; }
  .team-sec { margin-bottom:14px; }
  .team-head { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:800; margin-bottom:8px; }
  footer { text-align:center; color:var(--muted); font-size:12px; margin-top:30px; line-height:1.6; }
  @media print {
    body { background:#fff; color:#000; }
    .card,.stat { background:#fff; border-color:#bbb; }
    th,td { border-color:#ccc; }
    .muted,.sub,.stat .k,footer { color:#444; }
  }
</style>
</head>
<body>
<header>
  <h1>🏁 Espelho da Prova</h1>
  <div class="sub">Volta do Lago · Canelas do Planalto</div>
  <div class="status ${isFinal ? '' : 'parcial'}">${isFinal ? 'RESULTADO FINAL' : 'PARCIAL — prova em andamento'}</div>
</header>

<h2>Pódio por categoria</h2>
<div class="podios">
${podios
  .map(
    (p) => `  <div class="card podio">
    <h3>${esc(CATEGORIA_PT[p.cat] ?? p.cat)}</h3>
${p.teams
  .map(
    (t, i) => `    <div class="podio-row">${MEDALHAS[i] ?? `${i + 1}º`}
      <i class="sw" style="background:${esc(t.colorHex)}"></i> ${esc(shortTeam(t.teamName))}
      <span class="tempo">${t.trechos}/${t.totalTrechos} · ${secondsToHms(t.tempoS)}</span>
    </div>`,
  )
  .join('\n')}
  </div>`,
  )
  .join('\n')}
</div>

<h2>Destaques</h2>
<div class="destaques">
  <div class="stat"><div class="k">⚡ Trecho mais rápido</div>
    <div class="v">${fastestLeg ? paceMinPerKm(fastestLeg.paceSecPerKm) + '/km' : '—'}</div>
    <small>${fastestLeg ? `${esc(fastestLeg.atleta)} · trecho ${fastestLeg.trecho} · ${esc(shortTeam(fastestLeg.equipe))}` : 'sem trechos concluídos'}</small>
  </div>
  <div class="stat"><div class="k">🏃 Melhor pace médio</div>
    <div class="v">${bestAthlete?.paceSecPerKm != null ? paceMinPerKm(bestAthlete.paceSecPerKm) + '/km' : '—'}</div>
    <small>${bestAthlete ? `${esc(bestAthlete.atleta)} · ${bestAthlete.trechosCorridos} trecho(s) · ${esc(shortTeam(bestAthlete.equipe))}` : ''}</small>
  </div>
  <div class="stat"><div class="k">📏 Km somados (equipes)</div>
    <div class="v">${kmPtBr(totalKm, 1)} km</div>
    <small>${ranAthletes.length} atleta(s) correram</small>
  </div>
  <div class="stat"><div class="k">🔁 Trechos concluídos</div>
    <div class="v">${totalTrocas}</div>
    <small>${trocasTorre > 0 ? `<span class="forced">⚠ ${trocasTorre} troca(s) pela torre (failover)</span>` : 'nenhuma troca forçada pela torre'}</small>
  </div>
</div>

<h2>Classificação geral</h2>
<div class="card">
<table>
  <thead><tr><th>Pos</th><th>Equipe</th><th>Categoria</th><th>Pos. cat</th><th>Trechos</th><th>Tempo</th><th>Pace</th><th>Gap</th></tr></thead>
  <tbody>
${d.standings
  .map(
    (s) => `    <tr>
      <td class="pos num">${s.posGeral}º</td>
      <td><i class="sw" style="background:${esc(s.colorHex)}"></i> ${esc(shortTeam(s.teamName))}${s.forcedTrocas > 0 ? ` <span class="forced" title="trocas pela torre">⚠${s.forcedTrocas}</span>` : ''}</td>
      <td class="muted">${esc(CATEGORIA_PT[s.category] ?? s.category)}</td>
      <td class="num">${s.posCategoria}º</td>
      <td class="num">${s.trechos}/${s.totalTrechos}${s.finished ? ' 🏁' : ''}</td>
      <td class="num">${secondsToHms(s.tempoS)}</td>
      <td class="num">${s.paceSecPerKm != null ? paceMinPerKm(s.paceSecPerKm) : '—'}</td>
      <td class="num muted">${esc(s.gapLabel)}</td>
    </tr>`,
  )
  .join('\n')}
  </tbody>
</table>
</div>

<h2>Pace por trecho</h2>
<div class="card chart-wrap">
${buildPaceChartSvg(d.standings, done)}
<div class="legend">
${d.standings
  .map((s) => `  <span><i class="sw" style="background:${esc(s.colorHex)}"></i>${esc(shortTeam(s.teamName))}</span>`)
  .join('\n')}
</div>
</div>

<h2>Trecho a trecho, por equipe</h2>
${d.standings
  .map((s) => {
    const rows = d.legs.filter((l) => l.teamId === s.teamId && l.status === 'completed');
    if (rows.length === 0) return '';
    return `<div class="team-sec card">
  <div class="team-head"><i class="sw" style="background:${esc(s.colorHex)}"></i>${esc(shortTeam(s.teamName))}</div>
  <table>
    <thead><tr><th>Trecho</th><th>Atleta</th><th>Tempo</th><th>Pace</th><th>vs média</th><th>Posição na hora</th></tr></thead>
    <tbody>
${rows
  .map(
    (l) => `      <tr>
        <td class="num">${l.trecho} <span class="muted">(${kmPtBr(l.distanciaM, 1)} km)</span></td>
        <td>${esc(l.atleta)}${l.papelRegistro === 'org' ? ' <span class="forced" title="registrado pela torre">⚠</span>' : ''}</td>
        <td class="num">${l.duracaoS != null ? secondsToClockLabel(l.duracaoS) : '—'}</td>
        <td class="num">${l.paceSecPerKm != null ? paceMinPerKm(l.paceSecPerKm) : '—'}</td>
        <td class="num muted">${formatPaceDelta(l.paceSecPerKm, l.teamAvgPaceSecPerKm)}</td>
        <td class="num">${l.posicaoAoConcluir != null ? `${l.posicaoAoConcluir}º` : '—'}</td>
      </tr>`,
  )
  .join('\n')}
    </tbody>
  </table>
</div>`;
  })
  .join('\n')}

<footer>
  Gerado em ${esc(d.geradoEm)} pelo sistema de cronometragem da Volta do Lago.<br>
  Trocas marcadas com ⚠ foram registradas pela torre (failover) — ver CSV de auditoria.
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Gráfico SVG: pace (y, invertido — mais rápido em cima) por trecho (x),
// uma linha por equipe. Sem biblioteca: paths calculados aqui.
// ---------------------------------------------------------------------------
function buildPaceChartSvg(standings: StandingReportRow[], done: LegReportRow[]): string {
  if (done.length === 0) {
    return '<p class="muted">Sem trechos concluídos ainda — o gráfico aparece conforme a prova anda.</p>';
  }
  const W = 760;
  const H = 300;
  const M = { l: 62, r: 16, t: 14, b: 34 };
  const maxLeg = Math.max(...done.map((l) => l.trecho), standings[0]?.totalTrechos ?? 1);
  const paces = done.map((l) => l.paceSecPerKm!);
  const minP = Math.min(...paces);
  const maxP = Math.max(...paces);
  const pad = Math.max((maxP - minP) * 0.1, 15);
  const yMin = Math.max(0, minP - pad);
  const yMax = maxP + pad;

  const x = (leg: number) => M.l + ((leg - 1) / Math.max(maxLeg - 1, 1)) * (W - M.l - M.r);
  const y = (pace: number) => M.t + ((pace - yMin) / (yMax - yMin)) * (H - M.t - M.b);

  // Grade horizontal com rótulos de pace.
  const ticks = 4;
  let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const p = yMin + ((yMax - yMin) * i) / ticks;
    const yy = y(p).toFixed(1);
    grid += `<line x1="${M.l}" y1="${yy}" x2="${W - M.r}" y2="${yy}" stroke="#1c2a3f" stroke-width="1"/>`;
    grid += `<text x="${M.l - 8}" y="${yy}" fill="#8aa0b8" font-size="11" text-anchor="end" dominant-baseline="middle">${paceMinPerKm(p)}</text>`;
  }
  // Rótulos do eixo x (trechos).
  let xlabels = '';
  for (let leg = 1; leg <= maxLeg; leg++) {
    xlabels += `<text x="${x(leg).toFixed(1)}" y="${H - 10}" fill="#8aa0b8" font-size="11" text-anchor="middle">${leg}</text>`;
  }

  // Linhas por equipe (quebra o traço quando falta um trecho no meio).
  let series = '';
  for (const s of standings) {
    const rows = done
      .filter((l) => l.teamId === s.teamId)
      .sort((a, b) => a.trecho - b.trecho);
    if (rows.length === 0) continue;
    let path = '';
    let prevLeg: number | null = null;
    for (const l of rows) {
      const cmd = prevLeg != null && l.trecho === prevLeg + 1 ? 'L' : 'M';
      path += `${cmd}${x(l.trecho).toFixed(1)},${y(l.paceSecPerKm!).toFixed(1)} `;
      prevLeg = l.trecho;
    }
    series += `<path d="${path.trim()}" fill="none" stroke="${esc(s.colorHex)}" stroke-width="2.5" stroke-linejoin="round"/>`;
    for (const l of rows) {
      series += `<circle cx="${x(l.trecho).toFixed(1)}" cy="${y(l.paceSecPerKm!).toFixed(1)}" r="3.2" fill="${esc(s.colorHex)}"/>`;
    }
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Pace por trecho de cada equipe (mais rápido em cima)">
${grid}${xlabels}${series}
<text x="${M.l}" y="${H - 10}" fill="#8aa0b8" font-size="11">trecho →</text>
</svg>`;
}

function shortTeam(name: string): string {
  return name.replace('Canelas do Planalto — ', '');
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
