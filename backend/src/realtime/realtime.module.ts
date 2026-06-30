import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RaceModule } from '../race/race.module';
import { RelayModule } from '../relay/relay.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, RaceModule, RelayModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
