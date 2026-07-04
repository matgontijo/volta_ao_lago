import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { DatabaseService } from '../database/database.service';

/**
 * Gestão pela organização: equipes (nome/cor), atletas (CRUD + re-escala
 * automática do revezamento) e logins (reset de senha).
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('org')
export class ManagementController {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
  ) {}

  /** Visão completa para o painel de gestão. */
  @Get('management')
  async management() {
    const [teams, athletes, users] = await Promise.all([
      this.db.query('SELECT id, name, category, color_hex FROM teams ORDER BY id'),
      this.db.query('SELECT id, team_id, name, bib_number FROM athletes ORDER BY id'),
      this.db.query(
        `SELECT u.id, u.username, u.display_name, u.role, u.team_id, v.role AS vehicle_role
           FROM users u LEFT JOIN vehicles v ON v.id = u.vehicle_id
          WHERE u.role <> 'org' ORDER BY u.team_id, u.role DESC`,
      ),
    ]);
    return teams.rows.map((t: any) => ({
      ...t,
      athletes: athletes.rows.filter((a: any) => a.team_id === t.id),
      users: users.rows.filter((u: any) => u.team_id === t.id),
    }));
  }

  /** Renomear equipe / trocar cor do marcador. */
  @Patch('teams/:id')
  async patchTeam(@Param('id') id: string, @Body() body: { name?: string; colorHex?: string }) {
    if (body.name?.trim()) {
      await this.db.query('UPDATE teams SET name = $2 WHERE id = $1', [id, body.name.trim()]);
    }
    if (body.colorHex && /^#[0-9a-fA-F]{6}$/.test(body.colorHex)) {
      await this.db.query('UPDATE teams SET color_hex = $2 WHERE id = $1', [id, body.colorHex]);
    }
    return { ok: true };
  }

  /** Novo atleta (re-escala o revezamento da equipe). */
  @Post('teams/:teamId/athletes')
  async addAthlete(@Param('teamId') teamId: string, @Body() body: { name?: string; bib?: number }) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Nome do atleta é obrigatório');
    await this.db.query(
      'INSERT INTO athletes (team_id, name, bib_number) VALUES ($1, $2, $3)',
      [teamId, name, body.bib ?? null],
    );
    await this.reassign(Number(teamId));
    return { ok: true };
  }

  /** Renomear atleta / trocar número. */
  @Patch('athletes/:id')
  async patchAthlete(@Param('id') id: string, @Body() body: { name?: string; bib?: number }) {
    if (body.name?.trim()) {
      await this.db.query('UPDATE athletes SET name = $2 WHERE id = $1', [id, body.name.trim()]);
    }
    if (body.bib !== undefined) {
      await this.db.query('UPDATE athletes SET bib_number = $2 WHERE id = $1', [id, body.bib]);
    }
    return { ok: true };
  }

  /** Remove atleta (bloqueia se já correu; re-escala o restante). */
  @Delete('athletes/:id')
  async deleteAthlete(@Param('id') id: string) {
    const used = await this.db.query(
      'SELECT 1 FROM leg_executions WHERE athlete_id = $1 LIMIT 1',
      [id],
    );
    if (used.rows.length > 0) {
      throw new BadRequestException('Atleta já tem trecho registrado na prova — não pode ser removido.');
    }
    const team = await this.db.query<{ team_id: number }>(
      'DELETE FROM athletes WHERE id = $1 RETURNING team_id',
      [id],
    );
    if (team.rows[0]) await this.reassign(team.rows[0].team_id);
    return { ok: true };
  }

  /**
   * Gera uma nova senha para o usuário e a retorna UMA vez. Também revoga
   * todos os tokens/QR codes já emitidos (token_version + 1) — é o botão de
   * pânico para celular perdido durante o evento.
   */
  @Post('users/:id/password')
  async resetPassword(@Param('id') id: string) {
    const password = genPassword();
    const res = await this.db.query(
      `UPDATE users
          SET password_hash = crypt($2, gen_salt('bf')),
              token_version = token_version + 1
        WHERE id = $1
        RETURNING username`,
      [id, password],
    );
    if (res.rows.length === 0) throw new BadRequestException('Usuário não encontrado');
    this.auth.invalidateVersionCache(Number(id));
    return { ok: true, username: res.rows[0].username, password };
  }

  /** Reconstrói o rodízio (round-robin) dos atletas da equipe pelos trechos. */
  private async reassign(teamId: number): Promise<void> {
    await this.db.withTransaction(async (run) => {
      await run('DELETE FROM relay_assignments WHERE team_id = $1', [teamId]);
      await run(
        `INSERT INTO relay_assignments (team_id, leg_id, athlete_id)
         SELECT $1, l.id, a.id
           FROM legs l
           JOIN LATERAL (
                SELECT a.id FROM athletes a WHERE a.team_id = $1 ORDER BY a.id
                OFFSET ((l.sequence - 1) % GREATEST((SELECT count(*) FROM athletes a2 WHERE a2.team_id = $1), 1))
                LIMIT 1
           ) a ON TRUE`,
        [teamId],
      );
    });
  }
}

/** Senha legível (sem 0/O/1/l/i), gerada com aleatoriedade criptográfica. */
function genPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[randomInt(chars.length)];
  return out;
}
