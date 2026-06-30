import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';

/**
 * Adapter que pluga o Redis no Socket.io para fan-out entre múltiplas instâncias
 * Node atrás do load balancer. Sem Redis, cai no adapter em memória (1 instância).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger('WS');
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('Sem REDIS_URL — Socket.io em memória (instância única).');
      return;
    }
    const opts = { lazyConnect: true, maxRetriesPerRequest: 2, retryStrategy: () => null };
    const pub = new Redis(url, opts);
    const sub = pub.duplicate();
    pub.on('error', () => {});
    sub.on('error', () => {});
    try {
      await Promise.all([pub.connect(), sub.connect()]);
      this.adapterConstructor = createAdapter(pub, sub);
      this.logger.log('Socket.io + Redis adapter (escala horizontal) ativo.');
    } catch {
      this.logger.warn('Redis indisponível — Socket.io em memória (instância única).');
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: true, credentials: true },
    });
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
