import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Aplica schema + functions + seed em um Postgres já existente.
 * Útil quando NÃO se usa o Docker (que já roda esses scripts no init).
 * Uso: npm run db:migrate
 */
async function main() {
  const dbDir = join(__dirname, '..', '..', 'db');
  const files = ['schema.sql', 'functions.sql', 'seed.sql'];

  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://volta:volta@localhost:5432/volta_ao_lago',
    ssl:
      process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  for (const file of files) {
    const sql = readFileSync(join(dbDir, file), 'utf8');
    process.stdout.write(`Aplicando ${file}... `);
    try {
      await client.query(sql);
      console.log('ok');
    } catch (err) {
      console.log('FALHOU');
      console.error((err as Error).message);
      if (file === 'seed.sql') {
        console.error('(seed pode falhar se os dados já existirem — ignore se for o caso)');
      } else {
        throw err;
      }
    }
  }

  await client.end();
  console.log('Migração concluída.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
