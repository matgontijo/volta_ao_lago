import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

/**
 * Testes de integração da executar_troca() — o coração da prova.
 * Precisam de um Postgres+PostGIS com schema/functions/seed aplicados
 * (npm run infra:up, ou o serviço do CI). Sem banco acessível, o suite
 * inteiro é pulado com aviso.
 */
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://volta:volta@localhost:5544/volta_ao_lago';

const TEAM = 1; // Canelas do Planalto — Elite M (seed)
const ORG_USER = 1; // torre (seed)

let pool: Pool | null = null;
let dbUp = false;
let maxLegs = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function troca(p: Pool, teamId = TEAM) {
  const res = await p.query('SELECT * FROM executar_troca($1, $2, $3, $4)', [
    teamId,
    -15.8192816,
    -47.8354671,
    ORG_USER,
  ]);
  return res.rows[0];
}

// Sonda o banco na COLETA (top-level await): o skipIf precisa do resultado
// antes de o describe ser avaliado — beforeAll rodaria tarde demais.
{
  const candidate = new Pool({ connectionString: DATABASE_URL, max: 5, connectionTimeoutMillis: 3000 });
  try {
    await candidate.query('SELECT 1 FROM legs LIMIT 1');
    pool = candidate;
    dbUp = true;
    const r = await candidate.query('SELECT count(*)::int AS n FROM legs');
    maxLegs = r.rows[0].n;
  } catch {
    await candidate.end().catch(() => {});
    console.warn(
      `[troca.integration] Banco indisponível em ${DATABASE_URL} — testes de integração pulados.`,
    );
  }
}

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!dbUp)('executar_troca (integração)', () => {
  beforeEach(async () => {
    await pool!.query('TRUNCATE leg_executions, troca_events RESTART IDENTITY CASCADE');
  });

  it('largada: abre o trecho 1 para o atleta escalado', async () => {
    const r = await troca(pool!);
    expect(r.action).toBe('started');
    expect(r.current_leg_seq).toBe(1);
    expect(r.current_athlete_id).not.toBeNull();
    expect(r.next_pc_id).not.toBeNull();
  });

  it('troca normal: fecha o trecho anterior e abre o próximo', async () => {
    await troca(pool!);
    const r = await troca(pool!);
    expect(r.action).toBe('advanced');
    expect(r.current_leg_seq).toBe(2);
    expect(r.finished_exec_id).not.toBeNull();

    const fechado = await pool!.query(
      `SELECT status, ended_at, elapsed_seconds FROM leg_executions WHERE id = $1`,
      [r.finished_exec_id],
    );
    expect(fechado.rows[0].status).toBe('completed');
    expect(fechado.rows[0].ended_at).not.toBeNull();
  });

  it('LARGADA CONCORRENTE: cliques simultâneos → um started, o outro noop (sem erro)', async () => {
    // Determinístico: A abre a largada e NÃO comita; B fica bloqueado no
    // índice único; quando A comita, B recebe unique_violation → noop.
    const a = await pool!.connect();
    const b = await pool!.connect();
    try {
      await a.query('BEGIN');
      const ra = await a.query('SELECT * FROM executar_troca($1, 0, 0, $2)', [TEAM, ORG_USER]);
      expect(ra.rows[0].action).toBe('started');

      const pb = b.query('SELECT * FROM executar_troca($1, 0, 0, $2)', [TEAM, ORG_USER]);
      await sleep(150); // garante que B já está esperando o lock
      await a.query('COMMIT');
      const rb = await pb;
      expect(rb.rows[0].action).toBe('noop');
    } finally {
      a.release();
      b.release();
    }

    const running = await pool!.query(
      `SELECT count(*)::int AS n FROM leg_executions WHERE team_id = $1 AND status = 'running'`,
      [TEAM],
    );
    expect(running.rows[0].n).toBe(1);
  });

  it('duplo-clique no meio da prova: um advanced, o outro noop', async () => {
    await troca(pool!); // largada
    // A trava o trecho ativo (FOR UPDATE) sem comitar; B espera; após o
    // commit de A, o trecho já não está 'running' → B devolve noop.
    const a = await pool!.connect();
    const b = await pool!.connect();
    try {
      await a.query('BEGIN');
      const ra = await a.query('SELECT * FROM executar_troca($1, 0, 0, $2)', [TEAM, ORG_USER]);
      expect(ra.rows[0].action).toBe('advanced');

      const pb = b.query('SELECT * FROM executar_troca($1, 0, 0, $2)', [TEAM, ORG_USER]);
      await sleep(150);
      await a.query('COMMIT');
      const rb = await pb;
      expect(rb.rows[0].action).toBe('noop');
    } finally {
      a.release();
      b.release();
    }
  });

  it('percorre a volta inteira e termina com finished_race', async () => {
    let last: any = null;
    // largada + (maxLegs - 1) trocas + 1 clique final
    for (let i = 0; i <= maxLegs; i++) {
      last = await troca(pool!);
    }
    expect(last.action).toBe('finished_race');

    // clicar de novo depois do fim é noop, não erro
    const extra = await troca(pool!);
    expect(extra.action).toBe('noop');
  });

  it('equipe sem atleta escalado: erro claro (não um 500 críptico)', async () => {
    await pool!.query(`INSERT INTO teams (id, name, category) VALUES (99, 'Sem Atletas', 'misto')
                       ON CONFLICT (id) DO NOTHING`);
    try {
      await expect(troca(pool!, 99)).rejects.toThrow(/sem atleta escalado/i);
    } finally {
      await pool!.query('DELETE FROM teams WHERE id = 99');
    }
  });
});
