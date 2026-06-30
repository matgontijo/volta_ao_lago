import { Controller, Get } from '@nestjs/common';
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
}
