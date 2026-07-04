import { describe, expect, it } from 'vitest';
import {
  computeAvgPaceSecPerKm,
  computeEtaSeconds,
  computeRemainingCourseM,
} from '../src/common/pace';

describe('computeEtaSeconds', () => {
  it('retorna null sem distância', () => {
    expect(
      computeEtaSeconds({ distanceToNextPcM: null, doneDistanceM: 0, doneSeconds: 0, speedMps: 3 }),
    ).toBeNull();
  });

  it('usa o pace médio acumulado quando há histórico', () => {
    // 10 km em 3600s => 0,36 s/m; 1000 m => 360s
    expect(
      computeEtaSeconds({
        distanceToNextPcM: 1000,
        doneDistanceM: 10000,
        doneSeconds: 3600,
        speedMps: 99, // deve ser ignorado (histórico tem prioridade)
      }),
    ).toBe(360);
  });

  it('cai na velocidade instantânea sem histórico', () => {
    // 4 m/s => 0,25 s/m; 1000 m => 250s
    expect(
      computeEtaSeconds({ distanceToNextPcM: 1000, doneDistanceM: 0, doneSeconds: 0, speedMps: 4 }),
    ).toBe(250);
  });

  it('ignora velocidade instantânea abaixo do ruído do GPS (0.5 m/s)', () => {
    const eta = computeEtaSeconds({
      distanceToNextPcM: 1000,
      doneDistanceM: 0,
      doneSeconds: 0,
      speedMps: 0.2,
    });
    // pace default ~2,8 m/s => ~357s
    expect(eta).toBe(Math.round(1000 / 2.8));
  });

  it('largada parada: usa o pace default', () => {
    expect(
      computeEtaSeconds({ distanceToNextPcM: 2800, doneDistanceM: 0, doneSeconds: 0, speedMps: null }),
    ).toBe(1000);
  });
});

describe('computeAvgPaceSecPerKm', () => {
  it('retorna null sem distância percorrida', () => {
    expect(computeAvgPaceSecPerKm(0, 100)).toBeNull();
  });

  it('calcula s/km', () => {
    // 10 km em 3000s => 300 s/km (5 min/km)
    expect(computeAvgPaceSecPerKm(10000, 3000)).toBe(300);
  });
});

describe('computeRemainingCourseM (projeção da volta completa)', () => {
  it('null quando a equipe não largou', () => {
    expect(
      computeRemainingCourseM({
        legSeq: null,
        legDistanceM: null,
        distanceToNextPcM: null,
        remainingAfterCurrentM: 10000,
      }),
    ).toBeNull();
  });

  it('soma o que falta do trecho atual (GPS) com os trechos seguintes', () => {
    expect(
      computeRemainingCourseM({
        legSeq: 3,
        legDistanceM: 4000,
        distanceToNextPcM: 1500, // van a 1,5 km do PC
        remainingAfterCurrentM: 20000,
      }),
    ).toBe(21500);
  });

  it('haversine maior que o trecho oficial é limitado ao oficial', () => {
    // GPS ruim / linha reta maior que o trecho: não pode inflar a projeção.
    expect(
      computeRemainingCourseM({
        legSeq: 3,
        legDistanceM: 4000,
        distanceToNextPcM: 9000,
        remainingAfterCurrentM: 20000,
      }),
    ).toBe(24000);
  });

  it('sem GPS usa a distância oficial inteira do trecho atual', () => {
    expect(
      computeRemainingCourseM({
        legSeq: 1,
        legDistanceM: 4000,
        distanceToNextPcM: null,
        remainingAfterCurrentM: 30000,
      }),
    ).toBe(34000);
  });

  it('último trecho: só o que falta dele (nunca negativo)', () => {
    expect(
      computeRemainingCourseM({
        legSeq: 13,
        legDistanceM: 3000,
        distanceToNextPcM: 200,
        remainingAfterCurrentM: 0,
      }),
    ).toBe(200);
  });
});
