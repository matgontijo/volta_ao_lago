import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  bestWorstLegs,
  positionsAtLeg,
  rankStandings,
  signalGaps,
  trackDistanceM,
  RankedStanding,
  SignalGaps,
} from '../common/report-utils';

const TZ = process.env.RACE_TIMEZONE ?? 'America/Sao_Paulo';
const LOCAL_TS = 'DD/MM/YYYY HH24:MI:SS';

// ---------------------------------------------------------------------------
// Tipos dos relatórios (consumidos pelo ExportController e pelo Espelho).
// ---------------------------------------------------------------------------

export interface LegReportRow {
  equipe: string;
  categoria: string;
  colorHex: string;
  teamId: number;
  trecho: number;
  pcOrigem: string;
  pcDestino: string;
  distanciaM: number;
  atleta: string;
  numero: number | null;
  status: string;
  inicioLocal: string | null;
  fimLocal: string | null;
  inicioUtc: unknown;
  fimUtc: unknown;
  duracaoS: number | null;
  endedAtMs: number | null;
  latInicio: number | null;
  lngInicio: number | null;
  latFim: number | null;
  lngFim: number | null;
  registradoPor: string;
  papelRegistro: string | null;
  // Derivados (preenchidos pelo serviço):
  paceSecPerKm: number | null;
  teamAvgPaceSecPerKm: number | null;
  posicaoAoConcluir: number | null;
}

export interface AthleteReportRow {
  atleta: string;
  numero: number | null;
  equipe: string;
  categoria: string;
  teamId: number;
  trechosCorridos: number;
  quaisTrechos: string;
  distM: number;
  tempoS: number;
  paceSecPerKm: number | null;
  melhor: { legSeq: number; paceSecPerKm: number } | null;
  pior: { legSeq: number; paceSecPerKm: number } | null;
}

export interface StandingReportRow extends RankedStanding {
  largada: string | null;
  ultimaTroca: string | null;
}

export interface OperationalRow {
  equipe: string;
  veiculo: string;
  amostras: number;
  primeira: string | null;
  ultima: string | null;
  distanciaRastroM: number;
  velMaxKmh: number | null;
  bateriaMin: number | null;
  gaps: SignalGaps;
}

export interface AuditRow {
  id: number;
  quandoLocal: string;
  quandoUtc: unknown;
  equipe: string;
  action: string;
  trechoFechado: number | null;
  atletaSaiu: string | null;
  duracaoS: number | null;
  trechoAberto: number | null;
  atletaEntrou: string | null;
  quem: string;
  username: string | null;
  papel: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * Consultas e montagem dos relatórios da prova. O ExportController formata
 * CSV; o Espelho da Prova formata HTML — ambos a partir DESTES dados, para
 * nunca divergirem.
 */
@Injectable()
export class ReportService {
  constructor(private readonly db: DatabaseService) {}

  // -------------------------------------------------------------------------
  // Trechos: cada execução + pace, delta vs equipe e posição ao concluir.
  // -------------------------------------------------------------------------
  async getLegRows(): Promise<LegReportRow[]> {
    const r = await this.db.query<any>(
      `SELECT t.id AS team_id, t.name AS equipe, t.category AS categoria, t.color_hex,
              l.sequence AS trecho, fp.name AS pc_origem, tp.name AS pc_destino,
              l.distance_m AS distancia_m,
              a.name AS atleta, a.bib_number AS numero,
              le.status,
              to_char(le.started_at AT TIME ZONE '${TZ}', '${LOCAL_TS}') AS inicio_local,
              to_char(le.ended_at   AT TIME ZONE '${TZ}', '${LOCAL_TS}') AS fim_local,
              le.started_at AS inicio_utc, le.ended_at AS fim_utc,
              le.elapsed_seconds AS duracao_s,
              EXTRACT(EPOCH FROM le.ended_at) * 1000 AS ended_ms,
              ST_Y(le.start_location::geometry) AS lat_inicio,
              ST_X(le.start_location::geometry) AS lng_inicio,
              ST_Y(le.end_location::geometry)   AS lat_fim,
              ST_X(le.end_location::geometry)   AS lng_fim,
              coalesce(u.display_name, '—') AS registrado_por,
              u.role AS papel_registro
         FROM leg_executions le
         JOIN teams t  ON t.id = le.team_id
         JOIN legs l   ON l.id = le.leg_id
         JOIN exchange_points fp ON fp.id = l.from_pc_id
         JOIN exchange_points tp ON tp.id = l.to_pc_id
         JOIN athletes a ON a.id = le.athlete_id
         LEFT JOIN users u ON u.id = le.created_by
        ORDER BY t.id, l.sequence`,
    );

    // Pace médio por equipe (só trechos concluídos) e posição ao concluir.
    const doneByTeam = new Map<number, { distM: number; tempoS: number }>();
    const completed: { teamId: number; legSeq: number; endedAtMs: number }[] = [];
    for (const x of r.rows) {
      if (x.status !== 'completed' || x.duracao_s == null) continue;
      const acc = doneByTeam.get(x.team_id) ?? { distM: 0, tempoS: 0 };
      acc.distM += Number(x.distancia_m);
      acc.tempoS += Number(x.duracao_s);
      doneByTeam.set(x.team_id, acc);
      completed.push({ teamId: x.team_id, legSeq: x.trecho, endedAtMs: Number(x.ended_ms) });
    }
    const posAt = positionsAtLeg(completed);

    return r.rows.map((x: any): LegReportRow => {
      const acc = doneByTeam.get(x.team_id);
      const teamAvg = acc && acc.distM > 0 ? acc.tempoS / (acc.distM / 1000) : null;
      const pace =
        x.duracao_s != null && x.distancia_m > 0
          ? Number(x.duracao_s) / (Number(x.distancia_m) / 1000)
          : null;
      return {
        equipe: x.equipe,
        categoria: x.categoria,
        colorHex: x.color_hex,
        teamId: x.team_id,
        trecho: x.trecho,
        pcOrigem: x.pc_origem,
        pcDestino: x.pc_destino,
        distanciaM: Number(x.distancia_m),
        atleta: x.atleta,
        numero: x.numero,
        status: x.status,
        inicioLocal: x.inicio_local,
        fimLocal: x.fim_local,
        inicioUtc: x.inicio_utc,
        fimUtc: x.fim_utc,
        duracaoS: x.duracao_s,
        endedAtMs: x.ended_ms != null ? Number(x.ended_ms) : null,
        latInicio: x.lat_inicio,
        lngInicio: x.lng_inicio,
        latFim: x.lat_fim,
        lngFim: x.lng_fim,
        registradoPor: x.registrado_por,
        papelRegistro: x.papel_registro,
        paceSecPerKm: pace,
        teamAvgPaceSecPerKm: teamAvg,
        posicaoAoConcluir:
          x.status === 'completed' ? (posAt.get(`${x.trecho}:${x.team_id}`) ?? null) : null,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Classificação: geral + categoria + gap + trocas pela torre.
  // -------------------------------------------------------------------------
  async getStandings(): Promise<StandingReportRow[]> {
    const r = await this.db.query<any>(
      `SELECT t.id AS team_id, t.name AS equipe, t.category AS categoria, t.color_hex,
              count(*) FILTER (WHERE le.status = 'completed')::int AS trechos,
              coalesce(sum(le.elapsed_seconds) FILTER (WHERE le.status = 'completed'), 0)::int AS tempo_s,
              coalesce(sum(l.distance_m) FILTER (WHERE le.status = 'completed'), 0)::int AS dist_m,
              to_char(min(le.started_at) AT TIME ZONE '${TZ}', '${LOCAL_TS}') AS largada,
              to_char(max(le.ended_at) FILTER (WHERE le.status = 'completed') AT TIME ZONE '${TZ}', '${LOCAL_TS}') AS ultima_troca,
              (SELECT count(*)::int FROM legs) AS total_trechos,
              (SELECT count(*)::int
                 FROM troca_events te JOIN users u ON u.id = te.created_by
                WHERE te.team_id = t.id AND u.role = 'org') AS trocas_torre
         FROM teams t
         LEFT JOIN leg_executions le ON le.team_id = t.id
         LEFT JOIN legs l ON l.id = le.leg_id
        GROUP BY t.id, t.name, t.category, t.color_hex
        ORDER BY t.id`,
    );

    const ranked = rankStandings(
      r.rows.map((x: any) => ({
        teamId: x.team_id,
        teamName: x.equipe,
        category: x.categoria,
        colorHex: x.color_hex,
        trechos: x.trechos,
        totalTrechos: x.total_trechos,
        tempoS: x.tempo_s,
        distM: x.dist_m,
        forcedTrocas: x.trocas_torre,
      })),
    );

    const extras = new Map(
      r.rows.map((x: any) => [x.team_id, { largada: x.largada, ultimaTroca: x.ultima_troca }]),
    );
    return ranked.map((s) => ({
      ...s,
      largada: extras.get(s.teamId)?.largada ?? null,
      ultimaTroca: extras.get(s.teamId)?.ultimaTroca ?? null,
    }));
  }

  // -------------------------------------------------------------------------
  // Atletas: consolidado individual com melhor/pior trecho.
  // -------------------------------------------------------------------------
  async getAthleteRows(): Promise<AthleteReportRow[]> {
    const roster = await this.db.query<any>(
      `SELECT a.id, a.name AS atleta, a.bib_number AS numero,
              t.id AS team_id, t.name AS equipe, t.category AS categoria
         FROM athletes a JOIN teams t ON t.id = a.team_id
        ORDER BY t.id, a.id`,
    );
    const runs = await this.db.query<any>(
      `SELECT le.athlete_id, l.sequence AS trecho, l.distance_m, le.elapsed_seconds
         FROM leg_executions le JOIN legs l ON l.id = le.leg_id
        WHERE le.status = 'completed'
        ORDER BY le.athlete_id, l.sequence`,
    );

    const byAthlete = new Map<number, { trecho: number; distance_m: number; elapsed_seconds: number }[]>();
    for (const x of runs.rows) {
      const arr = byAthlete.get(x.athlete_id) ?? [];
      arr.push(x);
      byAthlete.set(x.athlete_id, arr);
    }

    return roster.rows.map((a: any): AthleteReportRow => {
      const legs = byAthlete.get(a.id) ?? [];
      const distM = legs.reduce((s, l) => s + Number(l.distance_m), 0);
      const tempoS = legs.reduce((s, l) => s + Number(l.elapsed_seconds), 0);
      const { best, worst } = bestWorstLegs(
        legs.map((l) => ({ legSeq: l.trecho, distM: Number(l.distance_m), tempoS: Number(l.elapsed_seconds) })),
      );
      return {
        atleta: a.atleta,
        numero: a.numero,
        equipe: a.equipe,
        categoria: a.categoria,
        teamId: a.team_id,
        trechosCorridos: legs.length,
        quaisTrechos: legs.map((l) => l.trecho).join(', '),
        distM,
        tempoS,
        paceSecPerKm: distM > 0 ? tempoS / (distM / 1000) : null,
        melhor: best ? { legSeq: best.legSeq, paceSecPerKm: best.paceSecPerKm } : null,
        pior: worst ? { legSeq: worst.legSeq, paceSecPerKm: worst.paceSecPerKm } : null,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Operacional: rastro GPS por veículo (quedas de sinal, distância, bateria).
  // -------------------------------------------------------------------------
  async getOperationalRows(): Promise<OperationalRow[]> {
    const vehicles = await this.db.query<any>(
      `SELECT v.id, v.role, t.name AS equipe
         FROM vehicles v JOIN teams t ON t.id = v.team_id
        ORDER BY t.id, v.role DESC`,
    );
    const logs = await this.db.query<any>(
      `SELECT vehicle_id,
              EXTRACT(EPOCH FROM recorded_at) * 1000 AS ts,
              to_char(recorded_at AT TIME ZONE '${TZ}', '${LOCAL_TS}') AS quando,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
              speed_mps, battery_pct
         FROM position_logs
        ORDER BY vehicle_id, recorded_at`,
    );

    const byVehicle = new Map<number, any[]>();
    for (const x of logs.rows) {
      const arr = byVehicle.get(x.vehicle_id) ?? [];
      arr.push(x);
      byVehicle.set(x.vehicle_id, arr);
    }

    return vehicles.rows.map((v: any): OperationalRow => {
      const samples = byVehicle.get(v.id) ?? [];
      const speeds = samples
        .map((s) => Number(s.speed_mps))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 42); // > 150 km/h = lixo
      const batteries = samples
        .map((s) => (s.battery_pct != null ? Number(s.battery_pct) : null))
        .filter((n): n is number => n != null);
      return {
        equipe: v.equipe,
        veiculo: v.role === 'van_pickup' ? 'Van (pick-up)' : 'Carro (drop-off)',
        amostras: samples.length,
        primeira: samples[0]?.quando ?? null,
        ultima: samples[samples.length - 1]?.quando ?? null,
        distanciaRastroM: trackDistanceM(samples.map((s) => ({ lat: s.lat, lng: s.lng }))),
        velMaxKmh: speeds.length ? Math.round(Math.max(...speeds) * 3.6 * 10) / 10 : null,
        bateriaMin: batteries.length ? Math.round(Math.min(...batteries)) : null,
        gaps: signalGaps(samples.map((s) => Number(s.ts))),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Auditoria: trilha completa de cliques de troca.
  // -------------------------------------------------------------------------
  async getAuditRows(): Promise<AuditRow[]> {
    const r = await this.db.query<any>(
      `SELECT te.id, te.action,
              to_char(te.created_at AT TIME ZONE '${TZ}', '${LOCAL_TS}') AS quando_local,
              te.created_at AS quando_utc,
              t.name AS equipe,
              fl.sequence AS trecho_fechado, fa.name AS atleta_saiu,
              fe.elapsed_seconds AS duracao_s,
              nl.sequence AS trecho_aberto, na.name AS atleta_entrou,
              u.username, coalesce(u.display_name, '—') AS quem, u.role AS papel,
              ST_Y(te.location::geometry) AS lat, ST_X(te.location::geometry) AS lng
         FROM troca_events te
         JOIN teams t ON t.id = te.team_id
         LEFT JOIN leg_executions fe ON fe.id = te.finished_exec
         LEFT JOIN legs fl ON fl.id = fe.leg_id
         LEFT JOIN athletes fa ON fa.id = fe.athlete_id
         LEFT JOIN leg_executions ne ON ne.id = te.new_exec
         LEFT JOIN legs nl ON nl.id = ne.leg_id
         LEFT JOIN athletes na ON na.id = ne.athlete_id
         LEFT JOIN users u ON u.id = te.created_by
        ORDER BY te.id ASC`,
    );
    return r.rows.map((x: any) => ({
      id: x.id,
      quandoLocal: x.quando_local,
      quandoUtc: x.quando_utc,
      equipe: x.equipe,
      action: x.action,
      trechoFechado: x.trecho_fechado,
      atletaSaiu: x.atleta_saiu,
      duracaoS: x.duracao_s,
      trechoAberto: x.trecho_aberto,
      atletaEntrou: x.atleta_entrou,
      quem: x.quem,
      username: x.username,
      papel: x.papel,
      lat: x.lat,
      lng: x.lng,
    }));
  }
}
