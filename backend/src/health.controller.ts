import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { RedisService } from './redis/redis.service';

/**
 * Health-check para hosts gratuitos (Render/Fly/Koyeb) e para keep-alive.
 * GET /health
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async health() {
    let dbOk = false;
    try {
      await this.db.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk,
      redis: this.redis.enabled,
      uptimeSec: Math.floor(process.uptime()),
      ts: Date.now(),
    };
  }
}
