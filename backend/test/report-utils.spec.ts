import { describe, expect, it } from 'vitest';
import {
  bestWorstLegs,
  formatPaceDelta,
  positionsAtLeg,
  rankStandings,
  secondsToClockLabel,
  signalGaps,
  speedKmh,
  trackDistanceM,
} from '../src/common/report-utils';

const team = (over: Partial<Parameters<typeof rankStandings>[0][0]>) => ({
  teamId: 1,
  teamName: 'A',
  category: 'misto',
  colorHex: '#fff',
  trechos: 0,
  totalTrechos: 13,
  tempoS: 0,
  distM: 0,
  forcedTrocas: 0,
  ...over,
});

describe('rankStandings', () => {
  it('ordena por trechos, desempata por tempo, e numera por categoria', () => {
    const rows = rankStandings([
      team({ teamId: 1, category: 'elite_masculino', trechos: 13, tempoS: 20000, distM: 60000 }),
      team({ teamId: 2, category: 'elite_feminino', trechos: 13, tempoS: 21000, distM: 60000 }),
      team({ teamId: 3, category: 'misto', trechos: 11, tempoS: 18000, distM: 50000 }),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.posGeral)).toEqual([1, 2, 3]);
    // Cada categoria tem seu próprio pódio.
    expect(rows.map((r) => r.posCategoria)).toEqual([1, 1, 1]);
    expect(rows[0].finished).toBe(true);
    expect(rows[2].finished).toBe(false);
  });

  it('gap: tempo quando mesmo nº de trechos, trechos quando não', () => {
    const rows = rankStandings([
      team({ teamId: 1, trechos: 13, tempoS: 20000 }),
      team({ teamId: 2, trechos: 13, tempoS: 20754 }),
      team({ teamId: 3, trechos: 11, tempoS: 15000 }),
    ]);
    expect(rows[0].gapLabel).toBe('—');
    expect(rows[1].gapLabel).toBe('+12:34');
    expect(rows[2].gapLabel).toBe('-2 trechos');
  });
});

describe('positionsAtLeg', () => {
  it('quem fecha o trecho antes estava na frente naquele momento', () => {
    const pos = positionsAtLeg([
      { teamId: 1, legSeq: 1, endedAtMs: 1000 },
      { teamId: 2, legSeq: 1, endedAtMs: 900 },
      { teamId: 1, legSeq: 2, endedAtMs: 2000 },
    ]);
    expect(pos.get('1:2')).toBe(1); // equipe 2 fechou o trecho 1 primeiro
    expect(pos.get('1:1')).toBe(2);
    expect(pos.get('2:1')).toBe(1); // única a fechar o trecho 2
  });
});

describe('bestWorstLegs', () => {
  it('melhor = menor pace; ignora trechos sem distância/tempo', () => {
    const { best, worst } = bestWorstLegs([
      { legSeq: 1, distM: 5000, tempoS: 1500 }, // 5:00/km
      { legSeq: 2, distM: 4000, tempoS: 1400 }, // 5:50/km
      { legSeq: 3, distM: 0, tempoS: 100 },     // inválido
    ]);
    expect(best?.legSeq).toBe(1);
    expect(worst?.legSeq).toBe(2);
  });

  it('sem trechos válidos → nulls', () => {
    expect(bestWorstLegs([])).toEqual({ best: null, worst: null });
  });
});

describe('signalGaps', () => {
  it('conta buracos acima do limite e acha o maior', () => {
    const base = 1_000_000;
    const ts = [base, base + 15_000, base + 200_000, base + 215_000, base + 600_000];
    const g = signalGaps(ts, 120_000);
    expect(g.count).toBe(2); // 185s e 385s
    expect(g.maxMs).toBe(385_000);
    expect(g.maxStartMs).toBe(base + 215_000);
    expect(g.totalMs).toBe(185_000 + 385_000);
  });

  it('sem amostras ou sem buracos → zeros', () => {
    expect(signalGaps([], 120_000).count).toBe(0);
    expect(signalGaps([1, 2, 3].map((n) => n * 15_000), 120_000).count).toBe(0);
  });
});

describe('trackDistanceM', () => {
  it('soma os segmentos do rastro', () => {
    // ~1,11 km por 0.01 grau de latitude
    const d = trackDistanceM([
      { lat: -15.8, lng: -47.85 },
      { lat: -15.79, lng: -47.85 },
      { lat: -15.78, lng: -47.85 },
    ]);
    expect(d).toBeGreaterThan(2100);
    expect(d).toBeLessThan(2350);
  });
});

describe('formatadores', () => {
  it('formatPaceDelta', () => {
    expect(formatPaceDelta(318, 300)).toBe('+0:18');
    expect(formatPaceDelta(295, 300)).toBe('-0:05');
    expect(formatPaceDelta(300, 300)).toBe('=');
    expect(formatPaceDelta(null, 300)).toBe('');
  });

  it('secondsToClockLabel', () => {
    expect(secondsToClockLabel(754)).toBe('12:34');
    expect(secondsToClockLabel(3725)).toBe('1:02:05');
  });

  it('speedKmh descarta leituras absurdas', () => {
    expect(speedKmh(10)).toBe(36);
    expect(speedKmh(50)).toBeNull(); // 180 km/h = lixo de GPS
    expect(speedKmh(null)).toBeNull();
  });
});
