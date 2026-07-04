import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimiter } from './login-rate-limiter';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        // Em produção o segredo é obrigatório: o fallback de dev está público
        // no repositório e permitiria forjar tokens de organização.
        if (!secret && process.env.NODE_ENV === 'production') {
          throw new Error(
            'JWT_SECRET não definido. Configure a variável de ambiente antes de subir em produção.',
          );
        }
        return {
          secret: secret ?? 'dev-secret-volta-ao-lago',
          signOptions: { expiresIn: '12h' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LoginRateLimiter, JwtAuthGuard],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
