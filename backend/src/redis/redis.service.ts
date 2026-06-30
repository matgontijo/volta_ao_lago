import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Cache efêmero do caminho quente (posições GPS) + locks de debounce de alertas.
 * Degrada graciosamente para um Map em memória quando o Redis não está
 * disponível — assim o backend roda em modo single-instance sem Docker.
 */
@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger('Redis');
  private client: Redis | null = null;
  private mem = new Map<string, { value: string; expiresAt: number }>();

  get enabled(): boolean {
    return this.client !== null;
  }

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL ausente — cache em memória (single-instance).');
      return;
    }
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: () => null, // não fica reconectando em loop no boot
    });
    client.on('error', () => {
      /* silenciado: tratamos no connect() abaixo */
    });
    try {
      await client.connect();
      await client.ping();
      this.client = client;
      this.logger.log('Conectado ao Redis (Pub/Sub adapter + cache GEO)');
    } catch {
      this.logger.warn('Redis indisponível — cache em memória (single-instance).');
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (this.client) {
      await this.client.set(key, payload, 'EX', ttlSeconds);
    } else {
      this.mem.set(key, { value: payload, expiresAt: Date.now() + ttlSeconds * 1000 });
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (this.client) {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    const entry = this.mem.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.mem.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  /** SETNX com TTL: retorna true se conseguiu o lock (debounce de alertas). */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.client) {
      const res = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    }
    const entry = this.mem.get(key);
    if (entry && entry.expiresAt > Date.now()) return false;
    this.mem.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  /** Índice GEO opcional (consultas de proximidade no dashboard). No-op sem Redis. */
  async geoAdd(key: string, lng: number, lat: number, member: string): Promise<void> {
    if (this.client) {
      await this.client.geoadd(key, lng, lat, member);
    }
  }
}
