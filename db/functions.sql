-- ============================================================================
-- executar_troca() — a operação atômica do clique "Troca Realizada".
-- ============================================================================
-- Tudo em UMA transação, UM round-trip do backend:
--   1. Trava (FOR UPDATE) o trecho ativo da equipe -> serializa duplo-clique.
--   2. Fecha o trecho do atleta anterior (ended_at, end_location).
--   3. Descobre o próximo trecho (sequence + 1) e o atleta escalado.
--   4. Abre o trecho do próximo atleta (started_at, start_location).
--
-- Retorna 'action':
--   'started'        -> largada da prova (criou o trecho 1)
--   'advanced'       -> troca normal (fechou um, abriu o próximo)
--   'finished_race'  -> fechou o último trecho; equipe concluiu a volta
--   'noop'           -> clique duplicado/concorrente; nada a fazer (idempotente)
-- ============================================================================
CREATE OR REPLACE FUNCTION executar_troca(
    p_team_id BIGINT,
    p_lat     DOUBLE PRECISION,
    p_lng     DOUBLE PRECISION,
    p_user_id BIGINT
)
RETURNS TABLE (
    action               TEXT,
    finished_exec_id     BIGINT,
    new_exec_id          BIGINT,
    current_leg_seq      INTEGER,
    current_athlete_id   BIGINT,
    current_athlete_name TEXT,
    next_pc_id           BIGINT,
    next_pc_name         TEXT,
    next_pc_lat          DOUBLE PRECISION,
    next_pc_lng          DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_run      leg_executions%ROWTYPE;
    v_point    GEOGRAPHY := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
    v_has_any  BOOLEAN;
    v_next_seq INTEGER;
    v_max_seq  INTEGER;
    v_leg      legs%ROWTYPE;
    v_ath_id   BIGINT;
    v_ath_name TEXT;
    v_new_id   BIGINT;
    v_fin_id   BIGINT;
BEGIN
    SELECT max(sequence) INTO v_max_seq FROM legs;

    -- 1) Trava o trecho ativo (se houver). Concorrência fica serializada aqui.
    SELECT * INTO v_run
    FROM leg_executions
    WHERE team_id = p_team_id AND status = 'running'
    FOR UPDATE;

    IF FOUND THEN
        -- 2) Fecha o trecho anterior.
        UPDATE leg_executions
           SET status = 'completed', ended_at = now(), end_location = v_point
         WHERE id = v_run.id;
        v_fin_id := v_run.id;

        SELECT l.sequence + 1 INTO v_next_seq FROM legs l WHERE l.id = v_run.leg_id;
    ELSE
        -- Sem trecho ativo: ou é a largada, ou é um clique duplicado pós-troca.
        SELECT EXISTS(SELECT 1 FROM leg_executions WHERE team_id = p_team_id)
          INTO v_has_any;

        IF v_has_any THEN
            action := 'noop';
            RETURN NEXT;
            RETURN;
        END IF;

        v_next_seq := 1;  -- largada
    END IF;

    -- 3) A volta acabou?
    IF v_next_seq > v_max_seq THEN
        INSERT INTO troca_events(team_id, finished_exec, new_exec, action, created_by, location)
        VALUES (p_team_id, v_fin_id, NULL, 'finished_race', p_user_id, v_point);

        action := 'finished_race';
        finished_exec_id := v_fin_id;
        RETURN NEXT;
        RETURN;
    END IF;

    -- 4) Abre o próximo trecho para o atleta escalado.
    SELECT * INTO v_leg FROM legs WHERE sequence = v_next_seq;

    SELECT ra.athlete_id, a.name
      INTO v_ath_id, v_ath_name
      FROM relay_assignments ra
      JOIN athletes a ON a.id = ra.athlete_id
     WHERE ra.team_id = p_team_id AND ra.leg_id = v_leg.id;

    INSERT INTO leg_executions
        (team_id, leg_id, athlete_id, status, started_at, start_location, created_by)
    VALUES
        (p_team_id, v_leg.id, v_ath_id, 'running', now(), v_point, p_user_id)
    RETURNING id INTO v_new_id;

    INSERT INTO troca_events(team_id, finished_exec, new_exec, action, created_by, location)
    VALUES (p_team_id, v_fin_id, v_new_id,
            CASE WHEN v_fin_id IS NULL THEN 'started' ELSE 'advanced' END,
            p_user_id, v_point);

    -- Monta o retorno.
    action               := CASE WHEN v_fin_id IS NULL THEN 'started' ELSE 'advanced' END;
    finished_exec_id     := v_fin_id;
    new_exec_id          := v_new_id;
    current_leg_seq      := v_leg.sequence;
    current_athlete_id   := v_ath_id;
    current_athlete_name := v_ath_name;

    SELECT ep.id, ep.name, ST_Y(ep.location::geometry), ST_X(ep.location::geometry)
      INTO next_pc_id, next_pc_name, next_pc_lat, next_pc_lng
      FROM exchange_points ep
     WHERE ep.id = v_leg.to_pc_id;

    RETURN NEXT;
END;
$$;

-- ============================================================================
-- estado_equipes() — snapshot do estado de prova de todas as equipes.
-- Usado no bootstrap do dashboard e como base para pace/ETA (o backend cruza
-- isto com a última posição GPS vinda do Redis).
-- ============================================================================
CREATE OR REPLACE VIEW vw_team_state AS
SELECT
    t.id                                            AS team_id,
    t.name                                          AS team_name,
    t.category                                      AS category,
    t.color_hex                                     AS color_hex,
    le.id                                           AS exec_id,
    le.started_at                                   AS started_at,
    l.sequence                                      AS leg_seq,
    l.distance_m                                    AS leg_distance_m,
    ath.id                                          AS athlete_id,
    ath.name                                        AS athlete_name,
    fp.name                                         AS from_pc_name,
    tp.id                                           AS next_pc_id,
    tp.name                                         AS next_pc_name,
    ST_Y(tp.location::geometry)                     AS next_pc_lat,
    ST_X(tp.location::geometry)                     AS next_pc_lng,
    (SELECT count(*) FROM leg_executions x
       WHERE x.team_id = t.id AND x.status = 'completed')          AS legs_completed,
    (SELECT coalesce(sum(l2.distance_m), 0) FROM leg_executions x
       JOIN legs l2 ON l2.id = x.leg_id
      WHERE x.team_id = t.id AND x.status = 'completed')           AS done_distance_m,
    (SELECT coalesce(sum(x.elapsed_seconds), 0) FROM leg_executions x
      WHERE x.team_id = t.id AND x.status = 'completed')           AS done_seconds
FROM teams t
LEFT JOIN leg_executions le ON le.team_id = t.id AND le.status = 'running'
LEFT JOIN legs l            ON l.id = le.leg_id
LEFT JOIN exchange_points fp ON fp.id = l.from_pc_id
LEFT JOIN exchange_points tp ON tp.id = l.to_pc_id
LEFT JOIN athletes ath       ON ath.id = le.athlete_id
ORDER BY t.id;
