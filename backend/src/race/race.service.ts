import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { haversineMeters } from '../common/geo';
import {
  computeAvgPaceSecPerKm,
  computeEtaSeconds,
  computeRemainingCourseM,
} from '../common/pace';
import {
  DriveRoute,
  LeaderboardRow,
  NextPc,
  TeamState,
  TimelineEvent,
  VehiclePosition,
  VehicleRole,
} from '../common/types';

const OSRM = process.env.OSRM_URL ?? 'https://router.project-osrm.org';

// TTL do "próximo PC" no Redis: 48h cobre qualquer prova; renovado a cada troca.
const NEXTPC_TTL_S = 48 * 3600;

interface StateRow {
  team_id: number;
  team_name: string;
  category: string;
  color_hex: string;
  exec_id: number | null;
  started_at: string | null;
  leg_seq: number | null;
  leg_distance_m: number | null;
  athlete_id: number | null;
  athlete_name: string | null;
  from_pc_name: string | null;
  next_pc_id: number | null;
  next_pc_name: string | null;
  next_pc_lat: number | null;
  next_pc_lng: number | null;
  legs_completed: number;
  done_distance_m: number;
  done_seconds: number;
}

interface VehicleMeta {
  teamId: number;
  teamName: string;
  colorHex: string;
  role: VehicleRole;
}

/** Posição GPS bruta como salva no Redis pelo gateway. */
interface CachedPos {
  lat: number;
  lng: number;
  speedMps: number | null;
  ts: number;
}

@Injectable()
export class RaceService implements OnModuleInit {
  private readonly logger = new Logger('Race');

  private maxLegs = 0;
  private loaded = false;
  private vanByTeam = new Map<number, number>();          // teamId -> vehicleId (van)
  private vehicleMeta = new Map<number, VehicleMeta>();    // vehicleId -> meta
  private allVehicleIds: number[] = [];
  private nextPcByTeam = new Map<number, NextPc | null>(); // cache p/ geofence
  private legDistanceBySeq = new Map<number, number>();    // seq -> distância oficial (m)

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureLoaded();
    } catch (err) {
      // DB pode ainda estar subindo; recarrega sob demanda na 1ª requisição.
      this.logger.warn(`Pré-carga adiada: ${(err as Error).message}`);
    }
  }

  /** Recarrega tudo do zero (após importar/editar o trajeto). */
  async reload(): Promise<void> {
    this.loaded = false;
    this.maxLegs = 0;
    this.vanByTeam.clear();
    this.vehicleMeta.clear();
    this.allVehicleIds = [];
    this.nextPcByTeam.clear();
    await this.ensureLoaded();
  }

  /** Carrega (uma vez) os mapas estáticos. Resiliente a DB que sobe depois. */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.loadStaticMaps();
    if (this.allVehicleIds.length > 0) {
      this.loaded = true;
      for (const teamId of this.vanByTeam.keys()) {
        await this.refreshNextPc(teamId);
      }
      this.logger.log('Mapas estáticos de prova carregados');
    }
  }

  private async loadStaticMaps(): Promise<void> {
    const legs = await this.db.query<{ sequence: number; distance_m: number }>(
      'SELECT sequence, distance_m FROM legs ORDER BY sequence',
    );
    this.maxLegs = legs.rows.length;
    this.legDistanceBySeq.clear();
    for (const l of legs.rows) this.legDistanceBySeq.set(Number(l.sequence), Number(l.distance_m));

    const vehicles = await this.db.query<{
      id: number;
      team_id: number;
      role: VehicleRole;
      team_name: string;
      color_hex: string;
    }>(
      `SELECT v.id, v.team_id, v.role, t.name AS team_name, t.color_hex
         FROM vehicles v JOIN teams t ON t.id = v.team_id`,
    );

    // Number() defensivo: ids podem chegar como string (JWTs antigos, bigint).
    this.allVehicleIds = vehicles.rows.map((v) => Number(v.id));
    for (const v of vehicles.rows) {
      this.vehicleMeta.set(Number(v.id), {
        teamId: Number(v.team_id),
        teamName: v.team_name,
        colorHex: v.color_hex,
        role: v.role,
      });
      if (v.role === 'van_pickup') this.vanByTeam.set(Number(v.team_id), Number(v.id));
    }
  }

  getVehicleMeta(vehicleId: number): VehicleMeta | undefined {
    return this.vehicleMeta.get(Number(vehicleId));
  }

  /**
   * Próximo PC da equipe (para geofence). Com Redis, a leitura é compartilhada
   * entre instâncias — a troca processada em um nó atualiza o geofence de todos.
   * Sem Redis (single-instance), cai no cache em memória.
   */
  async getNextPc(teamId: number): Promise<NextPc | null> {
    if (this.redis.enabled) {
      const wrapper = await this.redis.getJson<{ pc: NextPc | null }>(`nextpc:${teamId}`);
      if (wrapper) return wrapper.pc;
      await this.refreshNextPc(teamId);
      const fresh = await this.redis.getJson<{ pc: NextPc | null }>(`nextpc:${teamId}`);
      return fresh?.pc ?? null;
    }
    return this.nextPcByTeam.get(Number(teamId)) ?? null;
  }

  /** Limpa o cache de próximos PCs (após reset de prova) — memória e Redis. */
  async resetCaches(): Promise<void> {
    for (const teamId of this.nextPcByTeam.keys()) {
      this.nextPcByTeam.set(teamId, null);
      await this.redis.setJson(`nextpc:${teamId}`, { pc: null }, NEXTPC_TTL_S);
    }
  }

  // Roteirização: cache por equipe (20s) para não sobrecarregar o OSRM público.
  private driveRouteCache = new Map<number, { ts: number; data: DriveRoute | null }>();

  /**
   * Melhor caminho DE CARRO (pelas ruas) da posição atual da van até o próximo
   * PC da equipe, com distância e ETA de direção. Usado pela torre e pela van.
   */
  async getDriveRouteToNextPc(teamId: number): Promise<DriveRoute | null> {
    await this.ensureLoaded();

    const cached = this.driveRouteCache.get(teamId);
    if (cached && Date.now() - cached.ts < 20000) return cached.data;

    const van = await this.getLastVanLatLng(teamId);
    let pc = await this.getNextPc(teamId);
    if (!pc) {
      await this.refreshNextPc(teamId);
      pc = await this.getNextPc(teamId);
    }
    if (!van || !pc) {
      this.driveRouteCache.set(teamId, { ts: Date.now(), data: null });
      return null;
    }

    try {
      const url =
        `${OSRM}/route/v1/driving/${van.lng},${van.lat};${pc.lng},${pc.lat}` +
        `?overview=full&geometries=geojson`;
      // Timeout: o OSRM público pode ficar lento/indisponível — um request
      // pendurado não pode segurar o handler indefinidamente.
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const j: any = await res.json();
      if (j.code !== 'Ok' || !j.routes?.[0]) throw new Error(j.code);
      const r = j.routes[0];
      const data: DriveRoute = {
        teamId,
        pcId: pc.id,
        pcName: pc.name,
        points: r.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
        distanceM: Math.round(r.distance),
        durationSec: Math.round(r.duration),
        computedAt: Date.now(),
      };
      this.driveRouteCache.set(teamId, { ts: Date.now(), data });
      return data;
    } catch (err) {
      this.logger.warn(`Roteirização indisponível p/ equipe ${teamId}: ${(err as Error).message}`);
      this.driveRouteCache.set(teamId, { ts: Date.now(), data: null });
      return null;
    }
  }

  /** Última posição conhecida da van (para failover de troca pela torre). */
  async getLastVanLatLng(teamId: number): Promise<{ lat: number; lng: number } | null> {
    const vanId = this.vanByTeam.get(Number(teamId));
    if (!vanId) return null;
    const pos = await this.redis.getJson<{ lat: number; lng: number }>(`pos:${vanId}`);
    return pos ? { lat: pos.lat, lng: pos.lng } : null;
  }

  /** Rastro persistido para replay pós-prova. */
  async getReplay(): Promise<
    {
      vehicleId: number;
      teamId: number;
      teamName: string;
      colorHex: string;
      role: VehicleRole;
      lat: number;
      lng: number;
      ts: number;
    }[]
  > {
    const res = await this.db.query<{
      vehicle_id: number;
      team_id: number;
      team_name: string;
      color_hex: string;
      role: VehicleRole;
      lat: number;
      lng: number;
      ts: string;
    }>(
      `SELECT pl.vehicle_id, v.team_id, t.name AS team_name, t.color_hex, v.role,
              ST_Y(pl.location::geometry) AS lat, ST_X(pl.location::geometry) AS lng,
              EXTRACT(EPOCH FROM pl.recorded_at) * 1000 AS ts
         FROM position_logs pl
         JOIN vehicles v ON v.id = pl.vehicle_id
         JOIN teams t ON t.id = v.team_id
        ORDER BY pl.recorded_at ASC
        LIMIT 8000`,
    );
    return res.rows.map((r) => ({
      vehicleId: r.vehicle_id,
      teamId: r.team_id,
      teamName: r.team_name,
      colorHex: r.color_hex,
      role: r.role,
      lat: r.lat,
      lng: r.lng,
      ts: Number(r.ts),
    }));
  }

  // -------------------------------------------------------------------------
  // Linha do tempo da prova (feed ao vivo + auditoria de trocas).
  // -------------------------------------------------------------------------
  async getTimeline(limit = 100, teamId?: number): Promise<TimelineEvent[]> {
    const params: unknown[] = [Math.min(Math.max(limit, 1), 500)];
    if (teamId != null) params.push(teamId);
    const res = await this.db.query<{
      id: number;
      ts: string;
      action: TimelineEvent['action'];
      team_id: number;
      team_name: string;
      color_hex: string;
      finished_leg_seq: number | null;
      finished_athlete: string | null;
      finished_seconds: number | null;
      finished_distance_m: number | null;
      new_leg_seq: number | null;
      new_athlete: string | null;
      created_by_name: string | null;
      created_by_role: TimelineEvent['createdByRole'];
      lat: number | null;
      lng: number | null;
    }>(
      `SELECT te.id,
              EXTRACT(EPOCH FROM te.created_at) * 1000 AS ts,
              te.action, te.team_id, t.name AS team_name, t.color_hex,
              fl.sequence          AS finished_leg_seq,
              fa.name              AS finished_athlete,
              fe.elapsed_seconds   AS finished_seconds,
              fl.distance_m        AS finished_distance_m,
              nl.sequence          AS new_leg_seq,
              na.name              AS new_athlete,
              u.display_name       AS created_by_name,
              u.role               AS created_by_role,
              ST_Y(te.location::geometry) AS lat,
              ST_X(te.location::geometry) AS lng
         FROM troca_events te
         JOIN teams t              ON t.id  = te.team_id
         LEFT JOIN leg_executions fe ON fe.id = te.finished_exec
         LEFT JOIN legs fl           ON fl.id = fe.leg_id
         LEFT JOIN athletes fa       ON fa.id = fe.athlete_id
         LEFT JOIN leg_executions ne ON ne.id = te.new_exec
         LEFT JOIN legs nl           ON nl.id = ne.leg_id
         LEFT JOIN athletes na       ON na.id = ne.athlete_id
         LEFT JOIN users u           ON u.id  = te.created_by
        ${teamId != null ? 'WHERE te.team_id = $2' : ''}
        ORDER BY te.id DESC
        LIMIT $1`,
      params,
    );
    return res.rows.map((r) => ({
      id: Number(r.id),
      ts: Number(r.ts),
      action: r.action,
      teamId: Number(r.team_id),
      teamName: r.team_name,
      colorHex: r.color_hex,
      finishedLegSeq: r.finished_leg_seq,
      finishedAthlete: r.finished_athlete,
      finishedSeconds: r.finished_seconds,
      finishedDistanceM: r.finished_distance_m,
      newLegSeq: r.new_leg_seq,
      newAthlete: r.new_athlete,
      createdByName: r.created_by_name,
      createdByRole: r.created_by_role,
      lat: r.lat,
      lng: r.lng,
    }));
  }

  /** Recarrega o próximo PC da equipe (chamado após cada troca). */
  async refreshNextPc(teamId: number): Promise<void> {
    const res = await this.db.query<{
      id: number;
      name: string;
      lat: number;
      lng: number;
    }>(
      `SELECT tp.id, tp.name,
              ST_Y(tp.location::geometry) AS lat,
              ST_X(tp.location::geometry) AS lng
         FROM leg_executions le
         JOIN legs l ON l.id = le.leg_id
         JOIN exchange_points tp ON tp.id = l.to_pc_id
        WHERE le.team_id = $1 AND le.status = 'running'`,
      [teamId],
    );
    const pc = res.rows[0] ?? null;
    this.nextPcByTeam.set(Number(teamId), pc);
    await this.redis.setJson(`nextpc:${teamId}`, { pc }, NEXTPC_TTL_S);
  }

  // -------------------------------------------------------------------------
  // Estado de prova (DB + última posição GPS do Redis) com pace e ETA.
  // -------------------------------------------------------------------------
  async getTeamStates(): Promise<TeamState[]> {
    await this.ensureLoaded();
    const rows = await this.db.query<StateRow>('SELECT * FROM vw_team_state');
    const states: TeamState[] = [];
    for (const r of rows.rows) {
      states.push(await this.buildState(r));
    }
    return states;
  }

  async getTeamState(teamId: number): Promise<TeamState | null> {
    await this.ensureLoaded();
    const rows = await this.db.query<StateRow>(
      'SELECT * FROM vw_team_state WHERE team_id = $1',
      [teamId],
    );
    const r = rows.rows[0];
    return r ? this.buildState(r) : null;
  }

  private async buildState(r: StateRow): Promise<TeamState> {
    const vanId = this.vanByTeam.get(Number(r.team_id));
    const pos = vanId ? await this.redis.getJson<CachedPos>(`pos:${vanId}`) : null;

    const nextPc: NextPc | null =
      r.next_pc_id != null
        ? { id: r.next_pc_id, name: r.next_pc_name!, lat: r.next_pc_lat!, lng: r.next_pc_lng! }
        : null;

    let status: TeamState['status'] = 'running';
    if (!r.exec_id) status = r.legs_completed >= this.maxLegs ? 'finished' : 'idle';

    const elapsedSec = r.started_at
      ? Math.max(0, Math.floor((Date.now() - new Date(r.started_at).getTime()) / 1000))
      : 0;

    const avgPaceSecPerKm = computeAvgPaceSecPerKm(r.done_distance_m, r.done_seconds);

    const distanceToNextPcM =
      pos && nextPc ? Math.round(haversineMeters(pos, nextPc)) : null;

    // Projeção de ETA: pace médio acumulado; fallback na velocidade instantânea.
    const etaSeconds = computeEtaSeconds({
      distanceToNextPcM,
      doneDistanceM: r.done_distance_m,
      doneSeconds: r.done_seconds,
      speedMps: pos?.speedMps ?? null,
    });

    // Projeção da VOLTA COMPLETA (🏁) — separada do ETA do próximo PC.
    let remainingAfterCurrentM = 0;
    if (r.leg_seq != null) {
      for (const [seq, dist] of this.legDistanceBySeq) {
        if (seq > r.leg_seq) remainingAfterCurrentM += dist;
      }
    }
    const remainingCourseM =
      status === 'running'
        ? computeRemainingCourseM({
            legSeq: r.leg_seq,
            legDistanceM: r.leg_distance_m != null ? Number(r.leg_distance_m) : null,
            distanceToNextPcM,
            remainingAfterCurrentM,
          })
        : null;
    const finishEtaSeconds =
      remainingCourseM != null
        ? computeEtaSeconds({
            distanceToNextPcM: remainingCourseM,
            doneDistanceM: r.done_distance_m,
            doneSeconds: r.done_seconds,
            speedMps: pos?.speedMps ?? null,
          })
        : null;

    return {
      teamId: r.team_id,
      teamName: r.team_name,
      category: r.category,
      colorHex: r.color_hex,
      status,
      legSeq: r.leg_seq,
      athleteId: r.athlete_id,
      athleteName: r.athlete_name,
      fromPcName: r.from_pc_name,
      nextPc,
      startedAt: r.started_at,
      elapsedSec,
      legsCompleted: Number(r.legs_completed),
      avgPaceSecPerKm,
      distanceToNextPcM,
      etaSeconds,
      etaAt: etaSeconds != null ? new Date(Date.now() + etaSeconds * 1000).toISOString() : null,
      remainingCourseM,
      finishEtaSeconds,
      finishEtaAt:
        finishEtaSeconds != null
          ? new Date(Date.now() + finishEtaSeconds * 1000).toISOString()
          : null,
    };
  }

  buildLeaderboard(states: TeamState[]): LeaderboardRow[] {
    const ranked = [...states].sort((a, b) => {
      if (b.legsCompleted !== a.legsCompleted) return b.legsCompleted - a.legsCompleted;
      const da = a.distanceToNextPcM ?? Number.POSITIVE_INFINITY;
      const dbb = b.distanceToNextPcM ?? Number.POSITIVE_INFINITY;
      return da - dbb; // mais perto do próximo PC = na frente
    });
    return ranked.map((s, i) => ({
      rank: i + 1,
      teamId: s.teamId,
      teamName: s.teamName,
      colorHex: s.colorHex,
      legsCompleted: s.legsCompleted,
      distanceToNextPcM: s.distanceToNextPcM,
      status: s.status,
    }));
  }

  async getLeaderboard(): Promise<LeaderboardRow[]> {
    return this.buildLeaderboard(await this.getTeamStates());
  }

  /** Últimas posições de todos os veículos (para o snapshot inicial). */
  async getSnapshotPositions(): Promise<VehiclePosition[]> {
    await this.ensureLoaded();
    const out: VehiclePosition[] = [];
    for (const vehicleId of this.allVehicleIds) {
      const p = await this.redis.getJson<VehiclePosition>(`pos:${vehicleId}`);
      if (p) out.push(p);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Bootstrap (percurso + equipes) para inicializar o dashboard/mobile.
  // -------------------------------------------------------------------------
  async getBootstrap() {
    await this.ensureLoaded();
    const [teams, vehicles, athletes, pcs, legs, route] = await Promise.all([
      this.db.query('SELECT id, name, category, color_hex FROM teams ORDER BY id'),
      this.db.query('SELECT id, team_id, role, device_id FROM vehicles ORDER BY id'),
      this.db.query('SELECT id, team_id, name, bib_number FROM athletes ORDER BY id'),
      this.db.query(
        `SELECT id, sequence, name, km_marker,
                ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
           FROM exchange_points ORDER BY sequence`,
      ),
      this.db.query('SELECT id, sequence, from_pc_id, to_pc_id, distance_m FROM legs ORDER BY sequence'),
      this.db.query('SELECT points FROM route_path WHERE id = 1'),
    ]);
    return {
      teams: teams.rows,
      vehicles: vehicles.rows,
      athletes: athletes.rows,
      exchangePoints: pcs.rows,
      legs: legs.rows,
      routePath: (route.rows[0]?.points as [number, number][] | undefined) ?? null,
    };
  }
}
