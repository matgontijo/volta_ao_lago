import { describe, expect, it } from 'vitest';
import { haversineMeters } from '../src/common/geo';
import { RaceService } from '../src/race/race.service';
import type { TeamState } from '../src/common/types';

describe('haversineMeters', () => {
  it('distância zero para o mesmo ponto', () => {
    const p = { lat: -15.8192816, lng: -47.8354671 };
    expect(haversineMeters(p, p)).toBe(0);
  });

  it('~1 grau de latitude ≈ 111 km', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('Lifebox → Concha Acústica (Lago Paranoá) ≈ 3,7 km', () => {
    const lifebox = { lat: -15.8192816, lng: -47.8354671 };
    const concha = { lat: -15.7862043, lng: -47.837822 };
    const d = haversineMeters(lifebox, concha);
    expect(d).toBeGreaterThan(3_500);
    expect(d).toBeLessThan(3_900);
  });
});

describe('buildLeaderboard', () => {
  // buildLeaderboard é puro — não toca DB nem Redis.
  const race = new RaceService(null as never, null as never);

  const state = (over: Partial<TeamState>): TeamState => ({
    teamId: 1,
    teamName: 'A',
    category: 'misto',
    colorHex: '#fff',
    status: 'running',
    legSeq: 1,
    athleteId: 1,
    athleteName: 'x',
    fromPcName: null,
    nextPc: null,
    startedAt: null,
    elapsedSec: 0,
    legsCompleted: 0,
    avgPaceSecPerKm: null,
    distanceToNextPcM: null,
    etaSeconds: null,
    etaAt: null,
    ...over,
  });

  it('ordena por trechos concluídos, depois por proximidade do próximo PC', () => {
    const rows = race.buildLeaderboard([
      state({ teamId: 1, teamName: 'atrás', legsCompleted: 2, distanceToNextPcM: 500 }),
      state({ teamId: 2, teamName: 'líder', legsCompleted: 3, distanceToNextPcM: 900 }),
      state({ teamId: 3, teamName: 'vice', legsCompleted: 2, distanceToNextPcM: 100 }),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual([2, 3, 1]);
    expect(rows[0].rank).toBe(1);
    expect(rows[2].rank).toBe(3);
  });

  it('sem GPS (distância null) fica atrás de quem transmite', () => {
    const rows = race.buildLeaderboard([
      state({ teamId: 1, legsCompleted: 1, distanceToNextPcM: null }),
      state({ teamId: 2, legsCompleted: 1, distanceToNextPcM: 4000 }),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual([2, 1]);
  });
});
