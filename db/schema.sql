-- ============================================================================
-- Volta do Lago — Schema relacional (PostgreSQL 16 + PostGIS)
-- ============================================================================
-- Princípio de modelagem:
--   * Percurso (exchange_points, legs)        => ESTÁTICO, cadastrado uma vez.
--   * Plano de revezamento (relay_assignments) => PRÉ-CORRIDA, define quem corre
--     qual trecho. Permite "zero digitação" na estrada: o sistema já sabe o próximo.
--   * Execução (leg_executions)               => O QUE ACONTECE, escrito pelo clique
--     da van. É o livro-razão da prova (timestamps reais + GPS real).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- crypt()/gen_salt() para senhas

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE team_category AS ENUM ('elite_masculino', 'elite_feminino', 'misto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_role AS ENUM ('carro_dropoff', 'van_pickup');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exec_status AS ENUM ('running', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('org', 'operator', 'driver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Equipes e pessoas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    category    team_category NOT NULL,
    color_hex   TEXT NOT NULL DEFAULT '#2563EB'   -- cor do marcador no mapa
);

CREATE TABLE IF NOT EXISTS athletes (
    id          BIGSERIAL PRIMARY KEY,
    team_id     BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    bib_number  INTEGER
);

CREATE TABLE IF NOT EXISTS vehicles (
    id          BIGSERIAL PRIMARY KEY,
    team_id     BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    role        vehicle_role NOT NULL,
    device_id   TEXT UNIQUE,                       -- identidade física no socket
    UNIQUE (team_id, role)                         -- exatamente 1 carro + 1 van/equipe
);

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,                    -- bcrypt via pgcrypto
    display_name  TEXT NOT NULL,
    role          user_role NOT NULL,
    team_id       BIGINT REFERENCES teams(id) ON DELETE SET NULL,
    vehicle_id    BIGINT REFERENCES vehicles(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Percurso estático
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exchange_points (   -- "PCs" / Pontos de Troca
    id          BIGSERIAL PRIMARY KEY,
    sequence    INTEGER NOT NULL UNIQUE,           -- ordem ao redor do lago (1..N)
    name        TEXT NOT NULL,
    km_marker   NUMERIC(6,2),
    location    GEOGRAPHY(Point, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS legs (              -- Trechos (de um PC ao próximo)
    id          BIGSERIAL PRIMARY KEY,
    sequence    INTEGER NOT NULL UNIQUE,           -- 1..N
    from_pc_id  BIGINT NOT NULL REFERENCES exchange_points(id),
    to_pc_id    BIGINT NOT NULL REFERENCES exchange_points(id),
    distance_m  INTEGER NOT NULL                   -- distância oficial p/ pace
);

-- Plano de revezamento: (equipe, trecho) -> atleta escalado.
CREATE TABLE IF NOT EXISTS relay_assignments (
    team_id     BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    leg_id      BIGINT NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
    athlete_id  BIGINT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    PRIMARY KEY (team_id, leg_id)
);

-- ---------------------------------------------------------------------------
-- Execução — a tabela central
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leg_executions (
    id              BIGSERIAL PRIMARY KEY,
    team_id         BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    leg_id          BIGINT NOT NULL REFERENCES legs(id),
    athlete_id      BIGINT NOT NULL REFERENCES athletes(id),

    status          exec_status NOT NULL DEFAULT 'running',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,

    start_location  GEOGRAPHY(Point, 4326),        -- GPS da van ao iniciar o trecho
    end_location    GEOGRAPHY(Point, 4326),        -- GPS da van ao clicar "Troca"

    -- Duração real, calculada e materializada pelo próprio banco.
    elapsed_seconds INTEGER GENERATED ALWAYS AS (
        CASE WHEN ended_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
        END
    ) STORED,

    created_by      BIGINT REFERENCES users(id),

    UNIQUE (team_id, leg_id)                       -- cada equipe corre cada trecho 1x
);

-- *** ÍNDICE CRÍTICO ***
-- Garante, no nível do schema, que uma equipe NUNCA tem dois trechos rodando ao
-- mesmo tempo. Torna a "Troca Realizada" à prova de race condition / duplo-clique,
-- e também é o índice usado para achar o trecho ativo em O(1).
CREATE UNIQUE INDEX IF NOT EXISTS ux_active_exec_per_team
    ON leg_executions (team_id)
    WHERE status = 'running';

CREATE INDEX IF NOT EXISTS ix_exec_team_started
    ON leg_executions (team_id, started_at DESC);

CREATE INDEX IF NOT EXISTS gix_pc_location
    ON exchange_points USING GIST (location);

-- ---------------------------------------------------------------------------
-- Rastro persistente (opcional) — para REPLAY pós-prova.
-- Posição "ao vivo" mora no Redis; aqui guardamos amostras periódicas (flush em
-- lote feito pelo backend), sem onerar o caminho quente.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS position_logs (
    id          BIGSERIAL PRIMARY KEY,
    vehicle_id  BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    location    GEOGRAPHY(Point, 4326) NOT NULL,
    speed_mps   REAL,
    heading_deg REAL
);
CREATE INDEX IF NOT EXISTS ix_poslog_vehicle_time
    ON position_logs (vehicle_id, recorded_at DESC);

-- Geometria do percurso seguindo as ruas (road-snapped via OSRM), para desenho
-- fiel da rota no dashboard. Populado por: npm run build:route
CREATE TABLE IF NOT EXISTS route_path (
    id     INTEGER PRIMARY KEY DEFAULT 1,
    points JSONB NOT NULL,
    CONSTRAINT route_path_singleton CHECK (id = 1)
);

-- Auditoria das trocas (quem clicou, quando, onde).
CREATE TABLE IF NOT EXISTS troca_events (
    id            BIGSERIAL PRIMARY KEY,
    team_id       BIGINT NOT NULL REFERENCES teams(id),
    finished_exec BIGINT REFERENCES leg_executions(id),
    new_exec      BIGINT REFERENCES leg_executions(id),
    action        TEXT NOT NULL,
    created_by    BIGINT REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    location      GEOGRAPHY(Point, 4326)
);
