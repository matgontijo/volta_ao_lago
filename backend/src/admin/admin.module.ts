import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RaceModule } from '../race/race.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RelayModule } from '../relay/relay.module';
import { AdminController } from './admin.controller';
import { RouteService } from './route.service';

@Module({
  imports: [AuthModule, RaceModule, RelayModule, RealtimeModule],
  controllers: [AdminController],
  providers: [JwtAuthGuard, RouteService],
})
export class AdminModule {}
