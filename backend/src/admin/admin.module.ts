import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RaceModule } from '../race/race.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RelayModule } from '../relay/relay.module';
import { AdminController } from './admin.controller';
import { ExportController } from './export.controller';
import { ManagementController } from './management.controller';
import { ReportService } from './report.service';
import { RouteService } from './route.service';

@Module({
  imports: [AuthModule, RaceModule, RelayModule, RealtimeModule],
  controllers: [AdminController, ManagementController, ExportController],
  providers: [JwtAuthGuard, RouteService, ReportService],
})
export class AdminModule {}
