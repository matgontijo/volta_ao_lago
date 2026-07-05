// Funções PURAS dos relatórios — ranking, gaps, destaques e estatísticas de
// rastro. Sem banco e sem NestJS de propósito: tudo aqui é testável unitário.

import { haversineMeters, LatLng } from './geo';

// ---------------------------------------------------------------------------
// Classificação: posição geral, posição na categoria e gap para o líder.
// ---------------------------------------------------------------------------
export interface StandingInput {
  teamId: number;
  teamName: string;
  category: string;
  colorHex: string;
  trechos: number;       // trechos concluídos
  totalTrechos: number;  // total da prova
  tempoS: number;        // soma dos trechos concluídos
  distM: number;         // distância concluída
  forcedTrocas: number;  // trocas registradas pela torre (failover)
}

export interface RankedStanding extends StandingInput {
  posGeral: number;
  posCategoria: number;
  finished: boolean;
  paceSecPerKm: number | null;
  gapLabel: string; // '—' p/ o líder; '+12:34' mesmo nº de trechos; '-2 trechos' senão
}

export function rankStandings(rows: StandingInput[]): RankedStanding[] {
  const sorted = [...rows].sort(
    (a, b) => b.trechos - a.trechos || a.tempoS - b.tempoS || a.teamId - b.teamId,
  );
  const catCounter = new Map<string, number>();
  const leader = sorted[0];

  return sorted.map((r, i) => {
    const posCategoria = (catCounter.get(r.category) ?? 0) + 1;
    catCounter.set(r.category, posCategoria);

    let gapLabel = '—';
    if (leader && i > 0) {
      if (r.trechos === leader.trechos) {
        gapLabel = `+${secondsToClockLabel(r.tempoS - leader.tempoS)}`;
      } else {
        const d = leader.trechos - r.trechos;
        gapLabel = `-${d} trecho${d > 1 ? 's' : ''}`;
      }
    }

    return {
      ...r,
      posGeral: i + 1,
      posCategoria,
      finished: r.totalTrechos > 0 && r.trechos >= r.totalTrechos,
      paceSecPerKm: r.distM > 0 ? r.tempoS / (r.distM / 1000) : null,
      gapLabel,
    };
  });
}

// ---------------------------------------------------------------------------
// "Posição ao concluir o trecho N": quem fechou o mesmo trecho antes estava
// na frente naquele momento da prova.
// ---------------------------------------------------------------------------
export interface CompletedLeg {
  teamId: number;
  legSeq: number;
  endedAtMs: number;
}

export function positionsAtLeg(legs: CompletedLeg[]): Map<string, number> {
  const bySeq = new Map<number, CompletedLeg[]>();
  for (const l of legs) {
    const arr = bySeq.get(l.legSeq) ?? [];
    arr.push(l);
    bySeq.set(l.legSeq, arr);
  }
  const out = new Map<string, number>();
  for (const [seq, arr] of bySeq) {
    arr.sort((a, b) => a.endedAtMs - b.endedAtMs);
    arr.forEach((l, i) => out.set(`${seq}:${l.teamId}`, i + 1));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Melhor/pior trecho de um atleta (por pace; exige distância e tempo > 0).
// ---------------------------------------------------------------------------
export interface AthleteLeg {
  legSeq: number;
  distM: number;
  tempoS: number;
}

export interface BestWorst {
  best: (AthleteLeg & { paceSecPerKm: number }) | null;
  worst: (AthleteLeg & { paceSecPerKm: number }) | null;
}

export function bestWorstLegs(legs: AthleteLeg[]): BestWorst {
  const valid = legs
    .filter((l) => l.distM > 0 && l.tempoS > 0)
    .map((l) => ({ ...l, paceSecPerKm: l.tempoS / (l.distM / 1000) }));
  if (valid.length === 0) return { best: null, worst: null };
  const sorted = [...valid].sort((a, b) => a.paceSecPerKm - b.paceSecPerKm);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

// ---------------------------------------------------------------------------
// Operacional: quedas de sinal (buracos entre amostras) e distância do rastro.
// ---------------------------------------------------------------------------
export interface SignalGaps {
  count: number;
  totalMs: number;
  maxMs: number;
  maxStartMs: number | null; // início do maior buraco
}

export function signalGaps(sortedTsMs: number[], thresholdMs = 120_000): SignalGaps {
  const out: SignalGaps = { count: 0, totalMs: 0, maxMs: 0, maxStartMs: null };
  for (let i = 1; i < sortedTsMs.length; i++) {
    const gap = sortedTsMs[i] - sortedTsMs[i - 1];
    if (gap > thresholdMs) {
      out.count++;
      out.totalMs += gap;
      if (gap > out.maxMs) {
        out.maxMs = gap;
        out.maxStartMs = sortedTsMs[i - 1];
      }
    }
  }
  return out;
}

/** Distância real percorrida pelo rastro (soma dos segmentos consecutivos). */
export function trackDistanceM(points: LatLng[]): number {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    acc += haversineMeters(points[i - 1], points[i]);
  }
  return Math.round(acc);
}

// ---------------------------------------------------------------------------
// Formatação de deltas e relógio.
// ---------------------------------------------------------------------------

/** Diferença de pace vs a média da equipe: "+0:18" (mais lento) / "-0:05". */
export function formatPaceDelta(paceSecPerKm: number | null, avgSecPerKm: number | null): string {
  if (paceSecPerKm == null || avgSecPerKm == null) return '';
  const diff = Math.round(paceSecPerKm - avgSecPerKm);
  if (diff === 0) return '=';
  const abs = Math.abs(diff);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${diff > 0 ? '+' : '-'}${m}:${String(s).padStart(2, '0')}`;
}

/** 754 → "12:34"; 3725 → "1:02:05" (gap/relógio compacto). */
export function secondsToClockLabel(totalS: number): string {
  const t = Math.max(0, Math.round(totalS));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** m/s → km/h com 1 casa; descarta leituras absurdas de GPS (> 150 km/h). */
export function speedKmh(speedMps: number | null | undefined): number | null {
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps < 0) return null;
  const kmh = speedMps * 3.6;
  return kmh > 150 ? null : Math.round(kmh * 10) / 10;
}
