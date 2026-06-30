import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { RaceModule } from './race/race.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { RelayModule } from './relay/relay.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    DatabaseModule, // @Global
    RedisModule, // @Global
    SettingsModule, // @Global
    AuthModule,
    RaceModule,
    RelayModule,
    RealtimeModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
