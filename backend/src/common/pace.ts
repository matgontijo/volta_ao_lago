/**
 * Projeção de ETA (função pura, testável): usa o pace médio acumulado da
 * equipe; sem histórico, cai na velocidade instantânea; sem GPS, usa um
 * pace default de ~10,1 km/h.
 */
const DEFAULT_PACE_SEC_PER_M = 1 / 2.8;

export function computeEtaSeconds(args: {
  distanceToNextPcM: number | null;
  doneDistanceM: number;
  doneSeconds: number;
  speedMps: number | null;
}): number | null {
  const { distanceToNextPcM, doneDistanceM, doneSeconds, speedMps } = args;
  if (distanceToNextPcM == null) return null;

  const paceSecPerM =
    doneDistanceM > 0
      ? doneSeconds / doneDistanceM
      : speedMps && speedMps > 0.5
        ? 1 / speedMps
        : DEFAULT_PACE_SEC_PER_M;

  return Math.round(distanceToNextPcM * paceSecPerM);
}

/** Pace médio (s/km) sobre os trechos concluídos; null sem distância. */
export function computeAvgPaceSecPerKm(doneDistanceM: number, doneSeconds: number): number | null {
  return doneDistanceM > 0 ? doneSeconds / (doneDistanceM / 1000) : null;
}

/**
 * Distância que ainda falta para concluir a VOLTA COMPLETA (aproximação):
 * trechos oficiais ainda não corridos + o que falta do trecho atual (linha
 * reta da van ao próximo PC, limitada à distância oficial do trecho).
 */
export function computeRemainingCourseM(args: {
  legSeq: number | null;            // trecho atual em prova (null = não largou)
  legDistanceM: number | null;      // distância oficial do trecho atual
  distanceToNextPcM: number | null; // haversine van→próximo PC (pode ser null sem GPS)
  remainingAfterCurrentM: number;   // soma oficial dos trechos DEPOIS do atual
}): number | null {
  const { legSeq, legDistanceM, distanceToNextPcM, remainingAfterCurrentM } = args;
  if (legSeq == null) return null;
  const currentRemaining =
    distanceToNextPcM != null
      ? Math.min(distanceToNextPcM, legDistanceM ?? distanceToNextPcM)
      : (legDistanceM ?? 0);
  return Math.max(0, Math.round(remainingAfterCurrentM + currentRemaining));
}
