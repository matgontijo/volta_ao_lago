import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { kmPtBr, paceMinPerKm, secondsToHms, toCsv } from '../common/csv';
import { formatPaceDelta, secondsToClockLabel, speedKmh } from '../common/report-utils';
import { buildEspelhoHtml } from './espelho';
import { ReportService } from './report.service';

/** Só o necessário do Response do Express (evita depender de @types/express). */
interface FileResponse {
  setHeader(name: string, value: string): void;
}

const TZ = process.env.RACE_TIMEZONE ?? 'America/Sao_Paulo';

const CATEGORIA_PT: Record<string, string> = {
  elite_masculino: 'Elite Masculino',
  elite_feminino: 'Elite Feminino',
  misto: 'Misto',
};

const ACTION_PT: Record<string, string> = {
  started: 'largada',
  advanced: 'troca',
  finished_race: 'conclusão da volta',
};

/**
 * Exportação da prova (pode ser parcial, durante) — CSVs prontos para Excel
 * pt-BR e o Espelho da Prova em HTML. Todos os dados vêm do ReportService.
 */
@Controller('admin/export')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('org')
export class ExportController {
  constructor(private readonly reports: ReportService) {}

  /** Classificação: geral + posição por categoria + gap + trocas pela torre. */
  @Get('classificacao')
  async classificacao(@Res({ passthrough: true }) res: FileResponse) {
    const standings = await this.reports.getStandings();
    const rows = standings.map((s) => [
      s.posGeral,
      s.posCategoria,
      s.teamName,
      CATEGORIA_PT[s.category] ?? s.category,
      s.finished ? 'CONCLUÍDA 🏁' : 'em prova',
      `${s.trechos}/${s.totalTrechos}`,
      kmPtBr(s.distM),
      secondsToHms(s.tempoS),
      s.tempoS,
      s.paceSecPerKm != null ? paceMinPerKm(s.paceSecPerKm) : '',
      s.gapLabel,
      s.forcedTrocas,
      s.largada,
      s.ultimaTroca,
    ]);
    return this.send(res, 'classificacao', 'csv', toCsv(
      [
        'Posição geral', 'Posição na categoria', 'Equipe', 'Categoria', 'Situação',
        'Trechos concluídos', 'Distância (km)', 'Tempo total', 'Tempo total (s)',
        'Pace médio (min/km)', 'Gap p/ líder', 'Trocas pela torre',
        `Largada (${TZ})`, `Última troca (${TZ})`,
      ],
      rows,
    ));
  }

  /** Resultados por trecho, com velocidade, delta vs equipe e posição na hora. */
  @Get('trechos')
  async trechos(@Res({ passthrough: true }) res: FileResponse) {
    const legs = await this.reports.getLegRows();
    const rows = legs.map((l) => [
      l.equipe,
      CATEGORIA_PT[l.categoria] ?? l.categoria,
      l.trecho,
      l.pcOrigem,
      l.pcDestino,
      l.distanciaM,
      kmPtBr(l.distanciaM),
      l.atleta,
      l.numero,
      l.status === 'completed' ? 'concluído' : 'em prova',
      l.inicioLocal,
      l.fimLocal,
      secondsToHms(l.duracaoS),
      l.duracaoS,
      l.paceSecPerKm != null ? paceMinPerKm(l.paceSecPerKm) : '',
      l.paceSecPerKm != null && l.duracaoS ? velKmh(l.distanciaM, l.duracaoS) : '',
      formatPaceDelta(l.paceSecPerKm, l.teamAvgPaceSecPerKm),
      l.posicaoAoConcluir != null ? `${l.posicaoAoConcluir}º` : '',
      isoOrEmpty(l.inicioUtc),
      isoOrEmpty(l.fimUtc),
      l.latInicio,
      l.lngInicio,
      l.latFim,
      l.lngFim,
      l.registradoPor,
      l.papelRegistro === 'org' ? 'TORRE (failover)' : (l.papelRegistro ?? ''),
    ]);
    return this.send(res, 'resultados_trechos', 'csv', toCsv(
      [
        'Equipe', 'Categoria', 'Trecho', 'PC origem', 'PC destino',
        'Distância (m)', 'Distância (km)', 'Atleta', 'Número', 'Status',
        `Início (${TZ})`, `Fim (${TZ})`, 'Duração', 'Duração (s)',
        'Pace (min/km)', 'Velocidade (km/h)', 'Pace vs média da equipe', 'Posição ao concluir',
        'Início ISO (UTC)', 'Fim ISO (UTC)',
        'Lat início', 'Lng início', 'Lat fim', 'Lng fim',
        'Registrado por', 'Observação',
      ],
      rows,
    ));
  }

  /** Consolidado por atleta: km, tempo, pace, melhor e pior trecho. */
  @Get('atletas')
  async atletas(@Res({ passthrough: true }) res: FileResponse) {
    const athletes = await this.reports.getAthleteRows();
    // Rank por pace médio entre quem correu; quem não correu vai ao fim.
    const ranked = [...athletes].sort((a, b) => {
      if (a.trechosCorridos === 0 && b.trechosCorridos === 0) return a.teamId - b.teamId;
      if (a.trechosCorridos === 0) return 1;
      if (b.trechosCorridos === 0) return -1;
      return (a.paceSecPerKm ?? 1e9) - (b.paceSecPerKm ?? 1e9);
    });
    const rows = ranked.map((a, i) => [
      a.trechosCorridos > 0 ? i + 1 : '',
      a.atleta,
      a.numero,
      a.equipe,
      CATEGORIA_PT[a.categoria] ?? a.categoria,
      a.trechosCorridos,
      a.quaisTrechos,
      kmPtBr(a.distM),
      secondsToHms(a.tempoS),
      a.tempoS,
      a.paceSecPerKm != null ? paceMinPerKm(a.paceSecPerKm) : '',
      a.melhor ? `trecho ${a.melhor.legSeq} (${paceMinPerKm(a.melhor.paceSecPerKm)})` : '',
      a.pior && a.pior.legSeq !== a.melhor?.legSeq
        ? `trecho ${a.pior.legSeq} (${paceMinPerKm(a.pior.paceSecPerKm)})`
        : '',
    ]);
    return this.send(res, 'atletas', 'csv', toCsv(
      [
        'Rank (pace)', 'Atleta', 'Número', 'Equipe', 'Categoria',
        'Trechos corridos', 'Quais trechos', 'Distância (km)',
        'Tempo total', 'Tempo total (s)', 'Pace médio (min/km)',
        'Melhor trecho', 'Pior trecho',
      ],
      rows,
    ));
  }

  /** Operacional: rastro por veículo — quedas de sinal, distância, bateria. */
  @Get('operacional')
  async operacional(@Res({ passthrough: true }) res: FileResponse) {
    const vehicles = await this.reports.getOperationalRows();
    const rows = vehicles.map((v) => [
      v.equipe,
      v.veiculo,
      v.amostras,
      v.primeira,
      v.ultima,
      kmPtBr(v.distanciaRastroM),
      v.velMaxKmh != null ? String(v.velMaxKmh).replace('.', ',') : '',
      v.bateriaMin,
      v.gaps.count,
      secondsToClockLabel(Math.round(v.gaps.totalMs / 1000)),
      v.gaps.maxMs > 0 ? secondsToClockLabel(Math.round(v.gaps.maxMs / 1000)) : '',
      v.gaps.maxStartMs != null
        ? new Date(v.gaps.maxStartMs).toLocaleString('pt-BR', { timeZone: TZ })
        : '',
    ]);
    return this.send(res, 'operacional', 'csv', toCsv(
      [
        'Equipe', 'Veículo', 'Amostras de rastro', `Primeira amostra (${TZ})`,
        `Última amostra (${TZ})`, 'Distância rodada (km)', 'Vel. máxima (km/h)',
        'Bateria mínima (%)', 'Quedas de sinal (> 2 min)', 'Tempo total sem sinal',
        'Maior queda', `Início da maior queda (${TZ})`,
      ],
      rows,
    ));
  }

  /** Trilha de auditoria: cada clique de troca, por quem, quando e de onde. */
  @Get('auditoria')
  async auditoria(@Res({ passthrough: true }) res: FileResponse) {
    const events = await this.reports.getAuditRows();
    const rows = events.map((x) => [
      x.id,
      x.quandoLocal,
      isoOrEmpty(x.quandoUtc),
      x.equipe,
      ACTION_PT[x.action] ?? x.action,
      x.trechoFechado,
      x.atletaSaiu,
      secondsToHms(x.duracaoS),
      x.trechoAberto,
      x.atletaEntrou,
      x.quem,
      x.username,
      x.papel === 'org' ? 'TORRE (failover)' : (x.papel ?? ''),
      x.lat,
      x.lng,
    ]);
    return this.send(res, 'auditoria_trocas', 'csv', toCsv(
      [
        'Evento', `Quando (${TZ})`, 'Quando ISO (UTC)', 'Equipe', 'Ação',
        'Trecho fechado', 'Atleta que saiu', 'Duração do trecho',
        'Trecho aberto', 'Atleta que entrou',
        'Registrado por', 'Usuário', 'Papel', 'Lat', 'Lng',
      ],
      rows,
    ));
  }

  /** Espelho da Prova: relatório HTML completo (pódio, destaques, gráfico). */
  @Get('espelho')
  async espelho(@Res({ passthrough: true }) res: FileResponse) {
    const [standings, legs, athletes] = await Promise.all([
      this.reports.getStandings(),
      this.reports.getLegRows(),
      this.reports.getAthleteRows(),
    ]);
    const geradoEm = new Date().toLocaleString('pt-BR', { timeZone: TZ });
    const html = buildEspelhoHtml({ standings, legs, athletes, geradoEm });
    return this.send(res, 'espelho_da_prova', 'html', html);
  }

  private send(res: FileResponse, base: string, ext: 'csv' | 'html', body: string): string {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    res.setHeader(
      'Content-Type',
      ext === 'csv' ? 'text/csv; charset=utf-8' : 'text/html; charset=utf-8',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${base}_${stamp}.${ext}"`);
    return body;
  }
}

function velKmh(distM: number, duracaoS: number): string {
  const v = speedKmh(distM / duracaoS);
  return v != null ? String(v).replace('.', ',') : '';
}

function isoOrEmpty(v: unknown): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
