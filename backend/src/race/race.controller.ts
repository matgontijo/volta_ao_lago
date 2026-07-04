import { Controller, Get, Param, Query } from '@nestjs/common';
import { RaceService } from './race.service';

@Controller('race')
export class RaceController {
  constructor(private readonly race: RaceService) {}

  /** Percurso + equipes para inicializar mapa e UI. */
  @Get('bootstrap')
  bootstrap() {
    return this.race.getBootstrap();
  }

  /** Estado dinâmico atual (estados das equipes + leaderboard). */
  @Get('state')
  async state() {
    const states = await this.race.getTeamStates();
    return { states, leaderboard: this.race.buildLeaderboard(states) };
  }

  /** Rastro persistido para replay pós-prova. */
  @Get('replay')
  replay() {
    return this.race.getReplay();
  }

  /** Linha do tempo da prova (trocas com atleta que entrou/saiu e tempos). */
  @Get('timeline')
  timeline(@Query('limit') limit?: string) {
    return this.race.getTimeline(Number(limit) || 100);
  }

  /** Roteirização: melhor caminho de carro da van até o próximo PC da equipe. */
  @Get('drive-route/:teamId')
  driveRoute(@Param('teamId') teamId: string) {
    return this.race.getDriveRouteToNextPc(Number(teamId));
  }
}
