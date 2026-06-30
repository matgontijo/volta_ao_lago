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
  ok: boolean;
}

@Injectable()
export class AuthService {
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

    const profile: JwtProfile = {
      sub: row.id,
      name: row.display_name,
      role: row.role,
      teamId: row.team_id,
      teamName: row.team_name,
      vehicleId: row.vehicle_id,
      vehicleRole: row.vehicle_role,
    };

    return { token: await this.jwt.signAsync(profile), profile };
  }

  /** Usado pelo gateway WebSocket no handshake. */
  verify(token: string): JwtProfile {
    return this.jwt.verify<JwtProfile>(token);
  }

  /** Emite um token de login para um usuário (link mágico / QR). Sem senha. */
  async issueTokenForUser(userId: number, expiresIn = '7d'): Promise<string> {
    const res = await this.db.query<Omit<UserRow, 'ok'>>(
      `SELECT u.id, u.display_name, u.role, u.team_id,
              t.name AS team_name,
              u.vehicle_id, v.role AS vehicle_role
         FROM users u
         LEFT JOIN teams t    ON t.id = u.team_id
         LEFT JOIN vehicles v ON v.id = u.vehicle_id
        WHERE u.id = $1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) throw new UnauthorizedException('Usuário inexistente');
    const profile: JwtProfile = {
      sub: row.id,
      name: row.display_name,
      role: row.role,
      teamId: row.team_id,
      teamName: row.team_name,
      vehicleId: row.vehicle_id,
      vehicleRole: row.vehicle_role,
    };
    return this.jwt.signAsync(profile, { expiresIn });
  }
}
