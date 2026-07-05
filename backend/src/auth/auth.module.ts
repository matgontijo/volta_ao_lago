import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { jwtSecret } from './jwt-secret';
import { LoginRateLimiter } from './login-rate-limiter';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LoginRateLimiter, JwtAuthGuard],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
