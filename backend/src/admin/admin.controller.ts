import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseService } from '../database/database.service';
import { RaceService } from '../race/race.service';
import { RelayService } from '../relay/relay.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RouteService } from './route.service';
import { SettingsService } from '../settings/settings.service';
import { JwtProfile } from '../common/types';

/** Endpoints operacionais da organização (exigem JWT de papel 'org'). */
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly db: DatabaseService,
    private readonly race: RaceService,
    private readonly relay: RelayService,
    private readonly gateway: RealtimeGateway,
    private readonly route: RouteService,
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
  ) {}

  /** Configurações ajustáveis (raio do geofence etc.). */
  @Get('settings')
  getSettings(@Req() req: { user: JwtProfile }) {
    requireOrg(req.user);
    return this.settings.get();
  }

  @Post('settings')
  updateSettings(@Body() body: { geofenceRadiusM?: number }, @Req() req: { user: JwtProfile }) {
    requireOrg(req.user);
    return this.settings.update(body);
  }

  /** Roster (operadores/motoristas) para o painel de cadastro/QR. */
  @Get('users')
  async users(@Req() req: { user: JwtProfile }) {
    requireOrg(req.user);
    const res = await this.db.query(
      `SELECT u.id, u.username, u.display_name, u.role,
              t.name AS team_name, t.color_hex, v.role AS vehicle_role
         FROM users u
         LEFT JOIN teams t ON t.id = u.team_id
         LEFT JOIN vehicles v ON v.id = u.vehicle_id
        WHERE u.role <> 'org'
        ORDER BY u.team_id, u.role DESC`,
    );
    return res.rows;
  }

  /** Token de login (link mágico / QR) para um usuário. */
  @Get('magic-link/:userId')
  async magicLink(@Param('userId') userId: string, @Req() req: { user: JwtProfile }) {
    requireOrg(req.user);
    const token = await this.auth.issueTokenForUser(Number(userId));
    return { token };
  }

  /** Editor de trajeto: move um PC (drag no mapa). */
  @Post('pc/:id/move')
  async movePc(
    @Param('id') id: string,
    @Body() body: { lat: number; lng: number },
    @Req() req: { user: JwtProfile },
  ) {
    requireOrg(req.user);
    await this.route.movePc(Number(id), Number(body.lat), Number(body.lng));
    return { ok: true };
  }

  /** Editor de trajeto: recalcula a rota nas ruas após arrastar os PCs. */
  @Post('route/rebuild')
  async rebuildRoute(@Req() req: { user: JwtProfile }) {
    requireOrg(req.user);
    const result = await this.route.rebuild();
    this.gateway.pushRoute(result.points);
    return { ok: true, ...result };
  }

  /** Define TODO o trajeto a partir de uma lista de pontos (cola/KML). */
  @Post('course/import')
  async importCourse(
    @Body() body: { points: { lat: number; lng: number; name?: string }[] },
    @Req() req: { user: JwtProfile },
  ) {
    requireOrg(req.user);
    const result = await this.route.importCourse(body.points ?? []);
    await this.race.reload();
    this.gateway.pushRoute(result.points);
    await this.gateway.pushFullReset();
    return { ok: true, count: result.count, totalKm: result.totalKm };
  }

  /** Editor de trajeto: otimiza automaticamente a ordem (loop sem ziguezague). */
  @Post('route/optimize')
  async optimizeRoute(@Req() req: { user: JwtProfile }) {
    requireOrg(req.user);
    const result = await this.route.optimize();
    this.gateway.pushRoute(result.points);
    return { ok: true, ...result };
  }

  /** Editor de trajeto: reordena a sequência dos PCs. */
  @Post('route/reorder')
  async reorderRoute(@Body() body: { order: number[] }, @Req() req: { user: JwtProfile }) {
    requireOrg(req.user);
    const result = await this.route.reorder(body.order ?? []);
    this.gateway.pushRoute(result.points);
    return { ok: true, ...result };
  }

  /** Zera a prova (execuções, auditoria e rastro) para um novo start. */
  @Post('reset')
  async reset(@Req() req: { user: JwtProfile }) {
    requireOrg(req.user);
    await this.db.query(
      'TRUNCATE leg_executions, troca_events, position_logs RESTART IDENTITY CASCADE',
    );
    this.race.resetCaches();
    await this.gateway.pushFullReset();
    return { ok: true };
  }

  /**
   * Failover: a torre registra a troca de uma equipe caso o celular do
   * co-piloto falhe. Usa a última posição conhecida da van.
   */
  @Post('troca/:teamId')
  async forceTroca(
    @Param('teamId') teamId: string,
    @Req() req: { user: JwtProfile },
  ) {
    requireOrg(req.user);
    const id = Number(teamId);
    const pos = await this.race.getLastVanLatLng(id);
    const res = await this.relay.executarTroca(
      id,
      pos?.lat ?? 0,
      pos?.lng ?? 0,
      req.user.sub,
    );
    const state = await this.gateway.pushTeamUpdate(id);
    return { ok: true, action: res.action, state };
  }
}

function requireOrg(user: JwtProfile): void {
  if (user?.role !== 'org') {
    throw new ForbiddenException('Ação restrita à organização');
  }
}
