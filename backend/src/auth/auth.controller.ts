import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

interface LoginDto {
  username?: string;
  password?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body.username ?? '', body.password ?? '');
  }
}
