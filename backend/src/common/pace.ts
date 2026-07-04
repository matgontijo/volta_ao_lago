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
