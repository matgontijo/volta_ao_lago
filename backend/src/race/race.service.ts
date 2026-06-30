import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { haversineMeters } from '../common/geo';
import {
  LeaderboardRow,
  NextPc,
  TeamState,
  VehiclePosition,
  VehicleRole,
} from '../common/types';

interface StateRow {
  team_id: number;
  team_name: string;
  category: string;
  color_hex: string;
  exec_id: number | null;
  started_at: string | null;
  leg_seq: number | null;
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
    const legs = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM legs');
    this.maxLegs = legs.rows[0]?.n ?? 0;

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

    this.allVehicleIds = vehicles.rows.map((v) => v.id);
    for (const v of vehicles.rows) {
      this.vehicleMeta.set(v.id, {
        teamId: v.team_id,
        teamName: v.team_name,
        colorHex: v.color_hex,
        role: v.role,
      });
      if (v.role === 'van_pickup') this.vanByTeam.set(v.team_id, v.id);
    }
  }

  getVehicleMeta(vehicleId: number): VehicleMeta | undefined {
    return this.vehicleMeta.get(vehicleId);
  }

  getNextPc(teamId: number): NextPc | null {
    return this.nextPcByTeam.get(teamId) ?? null;
  }

  /** Limpa o cache de próximos PCs (após reset de prova). */
  resetCaches(): void {
    for (const teamId of this.nextPcByTeam.keys()) {
      this.nextPcByTeam.set(teamId, null);
    }
  }

  /** Última posição conhecida da van (para failover de troca pela torre). */
  async getLastVanLatLng(teamId: number): Promise<{ lat: number; lng: number } | null> {
    const vanId = this.vanByTeam.get(teamId);
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
    this.nextPcByTeam.set(teamId, res.rows[0] ?? null);
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
    const vanId = this.vanByTeam.get(r.team_id);
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

    const avgPaceSecPerKm =
      r.done_distance_m > 0 ? (r.done_seconds / (r.done_distance_m / 1000)) : null;

    const distanceToNextPcM =
      pos && nextPc ? Math.round(haversineMeters(pos, nextPc)) : null;

    // Projeção de ETA: pace médio acumulado; fallback na velocidade instantânea.
    let etaSeconds: number | null = null;
    if (distanceToNextPcM != null) {
      const paceSecPerM =
        r.done_distance_m > 0
          ? r.done_seconds / r.done_distance_m
          : pos && pos.speedMps && pos.speedMps > 0.5
            ? 1 / pos.speedMps
            : 1 / 2.8; // ~10,1 km/h default
      etaSeconds = Math.round(distanceToNextPcM * paceSecPerM);
    }

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
