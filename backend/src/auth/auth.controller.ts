import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginRateLimiter } from './login-rate-limiter';
import { JwtProfile } from '../common/types';

interface LoginDto {
  username?: string;
  password?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: LoginRateLimiter,
  ) {}

  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: { ip?: string; headers: Record<string, unknown> }) {
    const ip = clientIp(req);
    const username = (body.username ?? '').slice(0, 64);
    this.limiter.assertAllowed(ip, username);
    try {
      const result = await this.auth.login(username, body.password ?? '');
      this.limiter.registerSuccess(ip, username);
      return result;
    } catch (err) {
      this.limiter.registerFailure(ip, username);
      throw err;
    }
  }

  /**
   * Valida o token atual (assinatura + expiração + revogação) e devolve o
   * perfil autoritativo. Usado pelo mobile para validar o QR/link mágico
   * ANTES de aceitar o login — em vez de confiar no decode local do JWT.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: JwtProfile }) {
    return req.user;
  }

  /** Login SEM senha (1 toque). Desative com OPEN_LOGIN=off. */
  @Post('quick-login')
  async quickLogin(
    @Body() body: { username?: string },
    @Req() req: { ip?: string; headers: Record<string, unknown> },
  ) {
    const ip = clientIp(req);
    const username = (body.username ?? '').slice(0, 64);
    this.limiter.assertAllowed(ip, username);
    try {
      const result = await this.auth.quickLogin(username);
      this.limiter.registerSuccess(ip, username);
      return result;
    } catch (err) {
      this.limiter.registerFailure(ip, username);
      throw err;
    }
  }

  /** Botões do login sem senha: van/carro de cada equipe. */
  @Get('quick-roster')
  quickRoster() {
    return this.auth.quickRoster();
  }
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.ip ?? 'unknown';
}
