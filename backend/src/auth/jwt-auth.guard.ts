import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtProfile } from '../common/types';

/** Guard HTTP simples: valida o Bearer token e injeta o perfil em req.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Token ausente');
    try {
      req.user = this.jwt.verify<JwtProfile>(token);
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }
}
