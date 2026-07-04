import { readFileSync } from 'node:fs';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow, types } from 'pg';

// BIGINT (int8) vem como string por padrão no driver — nossos ids são pequenos,
// então parseamos para number. Evita bugs de Map.get('1') vs Map.get(1).
types.setTypeParser(20, (v) => parseInt(v, 10));

/**
 * SSL do banco gerenciado:
 *  - DATABASE_CA_CERT (PEM inline) ou DATABASE_CA_FILE (caminho): valida o
 *    certificado do servidor de verdade (rejectUnauthorized: true).
 *  - Apenas DATABASE_SSL=true: modo compatível (aceita qualquer certificado) —
 *    suficiente para Supabase/Neon free tier, mas sem proteção contra MITM.
 */
export function resolvePgSsl(env = process.env): false | Record<string, unknown> {
  const ca =
    env.DATABASE_CA_CERT ??
    (env.DATABASE_CA_FILE ? readFileSync(env.DATABASE_CA_FILE, 'utf8') : undefined);
  if (ca) return { ca, rejectUnauthorized: true };
  if (env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };
  return false;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Database');
  // Pool criado no construtor (lazy connect) — garante que `this.pool` exista
  // para qualquer consumidor, independentemente da ordem dos onModuleInit.
  private readonly pool: Pool;
  private retentionTimer: NodeJS.Timeout | null = null;

  constructor() {
    const ssl = resolvePgSsl();
    this.pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        'postgres://volta:volta@localhost:5432/volta_ao_lago',
      max: Number(process.env.PG_POOL_MAX ?? 10),
      ssl: ssl === false ? undefined : ssl,
    });
    // Evita derrubar o processo se um cliente ocioso do pool emitir erro.
    this.pool.on('error', (err) =>
      this.logger.warn(`Cliente do pool com erro: ${err.message}`),
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.pool.query('SELECT 1');
      this.logger.log('Conectado ao PostgreSQL/PostGIS');
    } catch (err) {
      this.logger.error(
        `Falha ao conectar no Postgres: ${(err as Error).message}. ` +
          'Suba a infra com "npm run infra:up".',
      );
    }
    this.startPositionLogRetention();
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params as any[]);
  }

  /** Executa um bloco dentro de uma transação (BEGIN/COMMIT/ROLLBACK). */
  async withTransaction<T>(
    fn: (run: (text: string, params?: unknown[]) => Promise<QueryResult>) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn((text, params) => client.query(text, params as any[]));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retenção opcional do rastro: POSITION_LOGS_RETENTION_DAYS=N apaga amostras
   * mais antigas que N dias (na subida e a cada 6h). Sem a env, mantém tudo —
   * o "Reiniciar prova" já trunca a tabela.
   */
  private startPositionLogRetention(): void {
    const days = Number(process.env.POSITION_LOGS_RETENTION_DAYS ?? 0);
    if (!Number.isFinite(days) || days <= 0) return;

    const prune = async () => {
      try {
        const res = await this.pool.query(
          `DELETE FROM position_logs WHERE recorded_at < now() - ($1 || ' days')::interval`,
          [days],
        );
        if (res.rowCount) this.logger.log(`Retenção: ${res.rowCount} amostras de rastro apagadas`);
      } catch (err) {
        this.logger.warn(`Retenção do rastro falhou: ${(err as Error).message}`);
      }
    };
    void prune();
    this.retentionTimer = setInterval(prune, 6 * 3600 * 1000);
    this.retentionTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
    await this.pool?.end();
  }
}
