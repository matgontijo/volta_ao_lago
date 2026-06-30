import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Database');
  // Pool criado no construtor (lazy connect) — garante que `this.pool` exista
  // para qualquer consumidor, independentemente da ordem dos onModuleInit.
  private readonly pool: Pool;

  constructor() {
    // Bancos gerenciados gratuitos (Supabase/Neon) exigem SSL. Ative com
    // DATABASE_SSL=true no ambiente de produção.
    const ssl =
      process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
    this.pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        'postgres://volta:volta@localhost:5432/volta_ao_lago',
      max: Number(process.env.PG_POOL_MAX ?? 10),
      ssl,
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

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
