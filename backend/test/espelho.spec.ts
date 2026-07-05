import { describe, expect, it } from 'vitest';
import { buildEspelhoHtml } from '../src/admin/espelho';
import { positionsAtLeg, rankStandings } from '../src/common/report-utils';
import type {
  AthleteReportRow,
  LegReportRow,
  StandingReportRow,
} from '../src/admin/report.service';

// ---------------------------------------------------------------------------
// Prova simulada: 3 equipes × 13 trechos concluídos, paces plausíveis.
// ---------------------------------------------------------------------------
const TEAMS = [
  { teamId: 1, name: 'Elite M', category: 'elite_masculino', color: '#2563EB', basePace: 280 },
  { teamId: 2, name: 'Elite F', category: 'elite_feminino', color: '#DB2777', basePace: 310 },
  { teamId: 3, name: 'Misto', category: 'misto', color: '#16A34A', basePace: 340 },
];
const LEG_DIST = [5010, 2540, 5100, 3690, 3260, 5480, 7380, 6990, 8220, 4690, 4020, 1440, 2150];

function fixture() {
  const legs: LegReportRow[] = [];
  const start = 1_750_000_000_000;

  for (const t of TEAMS) {
    let clock = start;
    for (let seq = 1; seq <= 13; seq++) {
      const distM = LEG_DIST[seq - 1];
      // variação determinística de pace por trecho (+/- 30 s/km)
      const pace = t.basePace + ((seq * 7 + t.teamId * 13) % 60) - 30;
      const dur = Math.round((distM / 1000) * pace);
      clock += dur * 1000;
      legs.push({
        equipe: `Canelas do Planalto — ${t.name}`,
        categoria: t.category,
        colorHex: t.color,
        teamId: t.teamId,
        trecho: seq,
        pcOrigem: `PC ${seq - 1}`,
        pcDestino: `PC ${seq}`,
        distanciaM: distM,
        atleta: `Atleta ${((seq - 1) % 8) + 1} ${t.name}`,
        numero: t.teamId * 100 + seq,
        status: 'completed',
        inicioLocal: '05/07/2026 06:00:00',
        fimLocal: '05/07/2026 07:00:00',
        inicioUtc: null,
        fimUtc: null,
        duracaoS: dur,
        endedAtMs: clock,
        latInicio: -15.8,
        lngInicio: -47.85,
        latFim: -15.79,
        lngFim: -47.84,
        registradoPor: 'Co-piloto',
        papelRegistro: seq === 5 && t.teamId === 3 ? 'org' : 'operator',
        paceSecPerKm: pace,
        teamAvgPaceSecPerKm: t.basePace,
        posicaoAoConcluir: null,
      });
    }
  }

  const posAt = positionsAtLeg(
    legs.map((l) => ({ teamId: l.teamId, legSeq: l.trecho, endedAtMs: l.endedAtMs! })),
  );
  for (const l of legs) l.posicaoAoConcluir = posAt.get(`${l.trecho}:${l.teamId}`) ?? null;

  const standings: StandingReportRow[] = rankStandings(
    TEAMS.map((t) => {
      const mine = legs.filter((l) => l.teamId === t.teamId);
      return {
        teamId: t.teamId,
        teamName: `Canelas do Planalto — ${t.name}`,
        category: t.category,
        colorHex: t.color,
        trechos: 13,
        totalTrechos: 13,
        tempoS: mine.reduce((s, l) => s + l.duracaoS!, 0),
        distM: mine.reduce((s, l) => s + l.distanciaM, 0),
        forcedTrocas: t.teamId === 3 ? 1 : 0,
      };
    }),
  ).map((s) => ({ ...s, largada: '05/07/2026 06:00:00', ultimaTroca: '05/07/2026 11:00:00' }));

  const athletes: AthleteReportRow[] = TEAMS.flatMap((t) =>
    Array.from({ length: 8 }, (_, i) => {
      const mine = legs.filter(
        (l) => l.teamId === t.teamId && l.atleta === `Atleta ${i + 1} ${t.name}`,
      );
      const distM = mine.reduce((s, l) => s + l.distanciaM, 0);
      const tempoS = mine.reduce((s, l) => s + l.duracaoS!, 0);
      return {
        atleta: `Atleta ${i + 1} ${t.name}`,
        numero: t.teamId * 100 + i + 1,
        equipe: `Canelas do Planalto — ${t.name}`,
        categoria: t.category,
        teamId: t.teamId,
        trechosCorridos: mine.length,
        quaisTrechos: mine.map((l) => l.trecho).join(', '),
        distM,
        tempoS,
        paceSecPerKm: distM > 0 ? tempoS / (distM / 1000) : null,
        melhor: mine[0] ? { legSeq: mine[0].trecho, paceSecPerKm: mine[0].paceSecPerKm! } : null,
        pior: mine[0] ? { legSeq: mine[0].trecho, paceSecPerKm: mine[0].paceSecPerKm! } : null,
      };
    }),
  );

  return { standings, legs, athletes, geradoEm: '05/07/2026 12:00:00' };
}

describe('buildEspelhoHtml', () => {
  const html = buildEspelhoHtml(fixture());

  it('não vaza NaN/undefined/null para o HTML', () => {
    expect(html).not.toMatch(/NaN|undefined|\bnull\b/);
  });

  it('prova completa → RESULTADO FINAL com pódio por categoria', () => {
    expect(html).toContain('RESULTADO FINAL');
    expect(html).toContain('Elite Masculino');
    expect(html).toContain('Elite Feminino');
    expect(html).toContain('Misto');
    expect(html).toContain('🥇');
  });

  it('tem o gráfico SVG com uma linha por equipe', () => {
    expect(html).toContain('<svg');
    expect((html.match(/<path d="M/g) ?? []).length).toBe(3);
  });

  it('marca troca forçada pela torre (auditoria visível)', () => {
    expect(html).toContain('failover');
    expect(html).toContain('⚠');
  });

  it('prova em andamento → PARCIAL', () => {
    const data = fixture();
    data.standings[0] = { ...data.standings[0], trechos: 5, finished: false };
    const parcial = buildEspelhoHtml(data);
    expect(parcial).toContain('PARCIAL — prova em andamento');
  });

  it('sem trechos concluídos → não quebra e avisa no gráfico', () => {
    const data = fixture();
    data.legs = [];
    const vazio = buildEspelhoHtml({ ...data, legs: [] });
    expect(vazio).toContain('Sem trechos concluídos');
    expect(vazio).not.toMatch(/NaN/);
  });
});
