import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { kmPtBr, paceMinPerKm, secondsToHms, toCsv } from '../common/csv';
import { DatabaseService } from '../database/database.service';

/** Só o necessário do Response do Express (evita depender de @types/express). */
interface CsvResponse {
  setHeader(name: string, value: string): void;
}

const TZ = process.env.RACE_TIMEZONE ?? 'America/Sao_Paulo';
const LOCAL_TS = `DD/MM/YYYY HH24:MI:SS`;

/**
 * Exportação pós-prova (ou parcial, durante) em CSV pronto para Excel pt-BR.
 * Três planilhas: resultados por trecho, classificação final e a trilha de
 * auditoria das trocas (quem registrou, quando, de onde).
 */
@Controller('admin/export')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('org')
export class ExportController {
  constructor(private readonly db: DatabaseService) {}

  /** Resultado por trecho: atleta, tempos reais, pace, GPS e quem registrou. */
  @Get('trechos')
  async trechos(@Res({ passthrough: true }) res: CsvResponse) {
    const r = await this.db.query<any>(
      `SELECT t.name AS equipe, t.category AS categoria,
              l.sequence AS trecho, fp.name AS pc_origem, tp.name AS pc_destino,
              l.distance_m AS distancia_m,
              a.name AS atleta, a.bib_number AS numero,
              le.status,
              to_char(le.started_at AT TIME ZONE '${TZ}', '${LOCAL_TS}') AS inicio_local,
              to_char(le.ended_at   AT TIME ZONE '${TZ}', '${LOCAL_TS}') AS fim_local,
              le.started_at AS inicio_utc, le.ended_at AS fim_utc,
              le.elapsed_seconds AS duracao_s,
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

    const rows = r.rows.map((x: any) => [
      x.equipe,
      x.categoria,
      x.trecho,
      x.pc_origem,
      x.pc_destino,
      x.distancia_m,
      kmPtBr(x.distancia_m),
      x.atleta,
      x.numero,
      x.status === 'completed' ? 'concluído' : 'em prova',
      x.inicio_local,
      x.fim_local,
      secondsToHms(x.duracao_s),
      x.duracao_s,
      paceMinPerKm(x.duracao_s != null && x.distancia_m > 0 ? x.duracao_s / (x.distancia_m / 1000) : null),
      isoOrEmpty(x.inicio_utc),
      isoOrEmpty(x.fim_utc),
      x.lat_inicio,
      x.lng_inicio,
      x.lat_fim,
      x.lng_fim,
      x.registrado_por,
      x.papel_registro === 'org' ? 'TORRE (failover)' : (x.papel_registro ?? ''),
    ]);

    return this.send(res, 'resultados_trechos', toCsv(
      [
        'Equipe', 'Categoria', 'Trecho', 'PC origem', 'PC destino',
        'Distância (m)', 'Distância (km)', 'Atleta', 'Número', 'Status',
        `Início (${TZ})`, `Fim (${TZ})`, 'Duração', 'Duração (s)', 'Pace (min/km)',
        'Início ISO (UTC)', 'Fim ISO (UTC)',
        'Lat início', 'Lng início', 'Lat fim', 'Lng fim',
        'Registrado por', 'Observação',
      ],
      rows,
    ));
  }

  /** Classificação: rank, trechos concluídos, tempo total e pace médio. */
  @Get('classificacao')
  async classificacao(@Res({ passthrough: true }) res: CsvResponse) {
    const r = await this.db.query<any>(
      `SELECT t.name AS equipe, t.category AS categoria,
              count(*) FILTER (WHERE le.status = 'completed')::int AS trechos,
              coalesce(sum(le.elapsed_seconds) FILTER (WHERE le.status = 'completed'), 0)::int AS tempo_s,
              coalesce(sum(l.distance_m) FILTER (WHERE le.status = 'completed'), 0)::int AS dist_m,
              to_char(min(le.started_at) AT TIME ZONE '${TZ}', '${LOCAL_TS}') AS largada,
              to_char(max(le.ended_at) FILTER (WHERE le.status = 'completed') AT TIME ZONE '${TZ}', '${LOCAL_TS}') AS ultima_troca,
              (SELECT count(*)::int FROM legs) AS total_trechos
         FROM teams t
         LEFT JOIN leg_executions le ON le.team_id = t.id
         LEFT JOIN legs l ON l.id = le.leg_id
        GROUP BY t.id, t.name, t.category
        ORDER BY trechos DESC, tempo_s ASC, t.id`,
    );

    const rows = r.rows.map((x: any, i: number) => [
      i + 1,
      x.equipe,
      x.categoria,
      x.trechos === x.total_trechos && x.total_trechos > 0 ? 'CONCLUÍDA 🏁' : 'em prova',
      `${x.trechos}/${x.total_trechos}`,
      kmPtBr(x.dist_m),
      secondsToHms(x.tempo_s),
      x.tempo_s,
      paceMinPerKm(x.dist_m > 0 ? x.tempo_s / (x.dist_m / 1000) : null),
      x.largada,
      x.ultima_troca,
    ]);

    return this.send(res, 'classificacao', toCsv(
      [
        'Posição', 'Equipe', 'Categoria', 'Situação', 'Trechos concluídos',
        'Distância (km)', 'Tempo total', 'Tempo total (s)', 'Pace médio (min/km)',
        `Largada (${TZ})`, `Última troca (${TZ})`,
      ],
      rows,
    ));
  }

  /** Trilha de auditoria: cada clique de troca, por quem, quando e de onde. */
  @Get('auditoria')
  async auditoria(@Res({ passthrough: true }) res: CsvResponse) {
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

    const ACTION_PT: Record<string, string> = {
      started: 'largada',
      advanced: 'troca',
      finished_race: 'conclusão da volta',
    };

    const rows = r.rows.map((x: any) => [
      x.id,
      x.quando_local,
      isoOrEmpty(x.quando_utc),
      x.equipe,
      ACTION_PT[x.action] ?? x.action,
      x.trecho_fechado,
      x.atleta_saiu,
      secondsToHms(x.duracao_s),
      x.trecho_aberto,
      x.atleta_entrou,
      x.quem,
      x.username,
      x.papel === 'org' ? 'TORRE (failover)' : (x.papel ?? ''),
      x.lat,
      x.lng,
    ]);

    return this.send(res, 'auditoria_trocas', toCsv(
      [
        'Evento', `Quando (${TZ})`, 'Quando ISO (UTC)', 'Equipe', 'Ação',
        'Trecho fechado', 'Atleta que saiu', 'Duração do trecho',
        'Trecho aberto', 'Atleta que entrou',
        'Registrado por', 'Usuário', 'Papel', 'Lat', 'Lng',
      ],
      rows,
    ));
  }

  private send(res: CsvResponse, base: string, csv: string): string {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}_${stamp}.csv"`);
    return csv;
  }
}

function isoOrEmpty(v: unknown): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
