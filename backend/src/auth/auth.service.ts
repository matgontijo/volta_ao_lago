import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { JwtProfile } from '../common/types';

interface UserRow {
  id: number;
  display_name: string;
  role: JwtProfile['role'];
  team_id: number | null;
  team_name: string | null;
  vehicle_id: number | null;
  vehicle_role: JwtProfile['vehicleRole'];
  token_version: number;
  ok: boolean;
}

/** Cache curto de token_version por usuário — evita 1 SELECT por requisição. */
const VERSION_CACHE_TTL_MS = 30_000;

@Injectable()
export class AuthService {
  private versionCache = new Map<number, { ver: number; ts: number }>();

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    // Verificação da senha feita no banco com pgcrypto (crypt) — sem trazer hash.
    const res = await this.db.query<UserRow>(
      `SELECT u.id, u.display_name, u.role, u.team_id,
              t.name AS team_name,
              u.vehicle_id, v.role AS vehicle_role,
              u.token_version,
              (u.password_hash = crypt($2, u.password_hash)) AS ok
         FROM users u
         LEFT JOIN teams t    ON t.id = u.team_id
         LEFT JOIN vehicles v ON v.id = u.vehicle_id
        WHERE u.username = $1`,
      [username, password],
    );

    const row = res.rows[0];
    if (!row || !row.ok) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    const profile = this.toProfile(row);
    return { token: await this.jwt.signAsync(profile), profile };
  }

  /**
   * Valida o JWT E a versão do token: se a senha do usuário foi trocada
   * depois da emissão, o token é rejeitado (revogação de QR/link perdido).
   * Usado pelo gateway WebSocket no handshake e pelo guard HTTP.
   */
  async verify(token: string): Promise<JwtProfile> {
    const profile = this.jwt.verify<JwtProfile>(token);
    // Espectador não existe na tabela users: vale até expirar (ou até trocar
    // o JWT_SECRET). É somente-leitura por construção — nenhum handler de
    // escrita aceita esse papel.
    if (profile.role === 'spectator') return profile;
    const current = await this.currentTokenVersion(profile.sub);
    // Tokens antigos (sem `ver`) valem apenas para a versão inicial (1).
    if ((profile.ver ?? 1) !== current) {
      throw new UnauthorizedException('Acesso revogado — peça um novo QR/senha à torre');
    }
    return profile;
  }

  /** Link público somente-leitura do mapa ao vivo (espectadores/famílias). */
  async issueSpectatorToken(
    expiresIn = '30d',
  ): Promise<{ token: string; expiresAt: string }> {
    const profile: JwtProfile = {
      sub: 0,
      name: 'Espectador',
      role: 'spectator',
      teamId: null,
      teamName: null,
      vehicleId: null,
      vehicleRole: null,
    };
    const token = await this.jwt.signAsync(profile, { expiresIn });
    const { exp } = this.jwt.decode(token) as { exp: number };
    return { token, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** Emite um token de login para um usuário (link mágico / QR). Sem senha. */
  async issueTokenForUser(
    userId: number,
    expiresIn = '7d',
  ): Promise<{ token: string; expiresAt: string }> {
    const res = await this.db.query<Omit<UserRow, 'ok'>>(
      `SELECT u.id, u.display_name, u.role, u.team_id,
              t.name AS team_name,
              u.vehicle_id, v.role AS vehicle_role,
              u.token_version
         FROM users u
         LEFT JOIN teams t    ON t.id = u.team_id
         LEFT JOIN vehicles v ON v.id = u.vehicle_id
        WHERE u.id = $1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) throw new UnauthorizedException('Usuário inexistente');
    const token = await this.jwt.signAsync(this.toProfile(row), { expiresIn });
    const { exp } = this.jwt.decode(token) as { exp: number };
    return { token, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** Invalida imediatamente o cache de versão (após reset de senha). */
  invalidateVersionCache(userId: number): void {
    this.versionCache.delete(Number(userId));
  }

  private async currentTokenVersion(userId: number): Promise<number> {
    const cached = this.versionCache.get(Number(userId));
    if (cached && Date.now() - cached.ts < VERSION_CACHE_TTL_MS) return cached.ver;
    const res = await this.db.query<{ token_version: number }>(
      'SELECT token_version FROM users WHERE id = $1',
      [userId],
    );
    if (res.rows.length === 0) throw new UnauthorizedException('Usuário inexistente');
    const ver = Number(res.rows[0].token_version);
    this.versionCache.set(Number(userId), { ver, ts: Date.now() });
    return ver;
  }

  private toProfile(row: Omit<UserRow, 'ok'>): JwtProfile {
    return {
      sub: row.id,
      name: row.display_name,
      role: row.role,
      teamId: row.team_id,
      teamName: row.team_name,
      vehicleId: row.vehicle_id,
      vehicleRole: row.vehicle_role,
      ver: Number(row.token_version ?? 1),
    };
  }
}
