import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtProfile, UserRole } from '../common/types';

export const ROLES_KEY = 'roles';

/**
 * Restringe um controller/handler a papéis específicos. Usar SEMPRE junto do
 * JwtAuthGuard (que popula req.user): @UseGuards(JwtAuthGuard, RolesGuard).
 *
 * Declarativo no nível do controller — impossível esquecer a checagem num
 * endpoint novo (era o risco do antigo requireOrg() chamado à mão).
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest().user as JwtProfile | undefined;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('Ação restrita à organização');
    }
    return true;
  }
}
