-- ============================================================================
-- Seed — Volta do Lago (percurso real: Volta ao Lago Paranoá, Brasília/DF)
-- Coordenadas extraídas dos 2 trajetos do Google Maps do organizador.
-- Equipes em OCTETO (8 atletas). Senha de todos os usuários: "volta2026"
-- ============================================================================

-- --- Equipes ---------------------------------------------------------------
INSERT INTO teams (id, name, category, color_hex) VALUES
  (1, 'Canelas do Planalto — Elite M', 'elite_masculino', '#2563EB'),
  (2, 'Canelas do Planalto — Elite F', 'elite_feminino',  '#DB2777'),
  (3, 'Canelas do Planalto — Misto',   'misto',           '#16A34A');

-- --- Atletas: OCTETO (8 por equipe) ----------------------------------------
INSERT INTO athletes (team_id, name, bib_number)
SELECT t.id, 'Atleta ' || g, t.id * 100 + g
FROM teams t CROSS JOIN generate_series(1, 8) AS g;

-- --- Veículos (1 carro drop-off + 1 van pick-up por equipe) ----------------
INSERT INTO vehicles (id, team_id, role, device_id) VALUES
  (1,1,'carro_dropoff','CARRO-FALCOES'),(2,1,'van_pickup','VAN-FALCOES'),
  (3,2,'carro_dropoff','CARRO-AGUIAS'), (4,2,'van_pickup','VAN-AGUIAS'),
  (5,3,'carro_dropoff','CARRO-LOBOS'),  (6,3,'van_pickup','VAN-LOBOS');

-- --- Usuários (org + operador da van + motorista do carro por equipe) ------
INSERT INTO users (id, username, password_hash, display_name, role, team_id, vehicle_id) VALUES
  (1,'torre',       crypt('volta2026', gen_salt('bf')), 'Torre de Comando',   'org',      NULL, NULL),
  (2,'op-falcoes',  crypt('volta2026', gen_salt('bf')), 'Co-piloto Elite M',  'operator', 1, 2),
  (3,'mot-falcoes', crypt('volta2026', gen_salt('bf')), 'Motorista Elite M',  'driver',   1, 1),
  (4,'op-aguias',   crypt('volta2026', gen_salt('bf')), 'Co-piloto Elite F',  'operator', 2, 4),
  (5,'mot-aguias',  crypt('volta2026', gen_salt('bf')), 'Motorista Elite F',  'driver',   2, 3),
  (6,'op-lobos',    crypt('volta2026', gen_salt('bf')), 'Co-piloto Misto',    'operator', 3, 6),
  (7,'mot-lobos',   crypt('volta2026', gen_salt('bf')), 'Motorista Misto',    'driver',   3, 5);

-- --- Pontos do percurso — traçado real do Lago Paranoá --------------------
-- O ponto 1 (Lifebox Burger) é a LARGADA/CHEGADA, não um ponto de coleta.
-- Os pontos de coleta (onde ocorre a troca) são PC 1..PC 12 (sequence 2..13).
-- ST_MakePoint(longitude, latitude). km_marker é calculado mais abaixo.
-- Sentido do loop: largada no Lifebox -> Ponte JK / Lago Sul no FINAL (sentido
-- corrigido em relação à 1ª importação). PC 1..12 = pontos de coleta.
INSERT INTO exchange_points (sequence, name, location) VALUES
  (1,  'Largada / Chegada — Lifebox Burger', ST_SetSRID(ST_MakePoint(-47.8354671, -15.8192816), 4326)),
  (2,  'PC 1 — Igreja presbiteriana lago sul',       ST_SetSRID(ST_MakePoint(-47.8729706, -15.8462124), 4326)),
  (3,  'PC 2 — Igreja Perpétuo socorro lago sul',    ST_SetSRID(ST_MakePoint(-47.8961411, -15.8412399), 4326)),
  (4,  'PC 3 — Estacionamento do STJ',               ST_SetSRID(ST_MakePoint(-47.8650856, -15.8064833), 4326)),
  (5,  'PC 4 — Concha acústica',                     ST_SetSRID(ST_MakePoint(-47.8378220, -15.7862043), 4326)),
  (6,  'PC 5 — Estacionamento centro olímpico unb',  ST_SetSRID(ST_MakePoint(-47.8587227, -15.7649040), 4326)),
  (7,  'PC 6 — Parque ecológico do lago norte',      ST_SetSRID(ST_MakePoint(-47.8929291, -15.7281866), 4326)),
  (8,  'PC 7 — Ql igreja batista do lago',           ST_SetSRID(ST_MakePoint(-47.8322144, -15.7596302), 4326)),
  (9,  'PC 8 — CA 3',                                ST_SetSRID(ST_MakePoint(-47.8786278, -15.7153816), 4326)),
  (10, 'PC 9 — MIML7',                               ST_SetSRID(ST_MakePoint(-47.8171005, -15.7596121), 4326)),
  (11, 'PC 10 — Parque urbano do Paranoá',           ST_SetSRID(ST_MakePoint(-47.7831116, -15.7863016), 4326)),
  (12, 'PC 11 — Qi 28 conjunto 2/3',                 ST_SetSRID(ST_MakePoint(-47.8064079, -15.8146868), 4326)),
  (13, 'PC 12 — Saída do parque ecológico copaíba',  ST_SetSRID(ST_MakePoint(-47.8159332, -15.8238792), 4326));

-- --- Trechos: loop PC g -> PC g+1, distância REAL via PostGIS ---------------
INSERT INTO legs (sequence, from_pc_id, to_pc_id, distance_m)
SELECT g, fp.id, tp.id, ROUND(ST_Distance(fp.location, tp.location))::int
FROM generate_series(1, (SELECT count(*) FROM exchange_points)) AS g
JOIN exchange_points fp ON fp.sequence = g
JOIN exchange_points tp ON tp.sequence = (g % (SELECT count(*) FROM exchange_points)) + 1;

-- --- km_marker acumulado de cada PC (distância percorrida até ele) ----------
UPDATE exchange_points ep
SET km_marker = ROUND(
  COALESCE((SELECT SUM(l.distance_m) FROM legs l WHERE l.sequence < ep.sequence), 0) / 1000.0,
  2);

-- --- Plano de revezamento: rodízio circular dos 8 atletas pelos trechos -----
INSERT INTO relay_assignments (team_id, leg_id, athlete_id)
SELECT t.id, l.id,
       (SELECT a.id FROM athletes a
         WHERE a.team_id = t.id
         ORDER BY a.id
         OFFSET ((l.sequence - 1) % (SELECT count(*) FROM athletes a2 WHERE a2.team_id = t.id))
         LIMIT 1)
FROM teams t CROSS JOIN legs l;

-- --- Sincroniza sequences após inserts com id explícito --------------------
SELECT setval('teams_id_seq',           (SELECT max(id) FROM teams));
SELECT setval('athletes_id_seq',        (SELECT max(id) FROM athletes));
SELECT setval('vehicles_id_seq',        (SELECT max(id) FROM vehicles));
SELECT setval('users_id_seq',           (SELECT max(id) FROM users));
SELECT setval('exchange_points_id_seq', (SELECT max(id) FROM exchange_points));
SELECT setval('legs_id_seq',            (SELECT max(id) FROM legs));
