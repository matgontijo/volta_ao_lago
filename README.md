# 🏁 Volta do Lago

Sistema de **logística, cronometragem e rastreamento GPS em tempo real** para a
ultramaratona de revezamento *Volta do Lago*. Arquitetura orientada a eventos,
baixa latência e escalável horizontalmente.

Cada equipe (**Elite Masculino**, **Elite Feminino**, **Misto**) tem dois
veículos: o **Carro** (drop-off) leva o próximo atleta ao próximo PC, e a **Van**
(pick-up) recolhe quem terminou — o co-piloto da van opera o sistema.

---

## Arquitetura

Dois caminhos de dados com perfis opostos, deliberadamente separados:

```
        PWA (Van + Carro)                      Dashboard Web (Torre)
        big buttons, GPS 5s                    mapa + telemetria ao vivo
                │  ▲                                    ▲
   WS position  │  │ team:update                        │ vehicle:position
   WS troca     ▼  │                                     │ team:update / alerts
        ┌───────────────────────── NestJS · Socket.io Gateway ─────────────────────────┐
        │  WebSocket persistente · auth JWT no handshake · cluster horizontal           │
        └──────────────┬───────────────────────────────────────────────┬───────────────┘
        CAMINHO QUENTE  │ SETEX pos + PUBLISH (fan-out)     CAMINHO FRIO │ executar_troca() (TX atômica)
                        ▼                                                ▼
                ┌──────────────┐                                 ┌─────────────────────┐
                │    Redis     │  Pub/Sub adapter + cache GEO     │ PostgreSQL + PostGIS │
                │  TTL ~30s    │  (posição efêmera, descartável)  │  trechos, timestamps │
                └──────────────┘                                 └─────────────────────┘
```

- **Caminho quente (GPS):** posição → Redis (`SETEX`, TTL) + `PUBLISH` → fan-out
  para o dashboard. **Nunca toca o Postgres.** Posição é dado efêmero.
- **Caminho frio (troca):** clique → função PL/pgSQL atômica (1 transação, 1
  round-trip) → broadcast do novo estado. Aqui consistência > latência.
- **Redis** não é cache opcional: é o que permite **escalar WebSocket
  horizontalmente** (Socket.io Redis Adapter) e absorve o *write storm* de GPS.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | **NestJS** + **Socket.io** + Redis Adapter |
| Tempo real / cache | **Redis 7** (Pub/Sub + GEO + locks) |
| Persistência | **PostgreSQL 16 + PostGIS** (função atômica de troca) |
| PWA Co-piloto | **React + Vite** (Geolocation, Wake Lock, offline buffer) |
| Dashboard | **React + Vite + Leaflet** (OpenStreetMap, zero API key) |
| Simulador | Node + socket.io-client |

---

## Pré-requisitos

- **Node.js 20+**
- **Docker** (para Postgres + Redis). Sem Docker, veja "Modo sem Docker" abaixo.

---

## Quickstart

```bash
# 1. Instalar dependências (monorepo npm workspaces)
npm install

# 2. Subir Postgres+PostGIS e Redis (schema + seed aplicados automaticamente)
npm run infra:up

# 3. Subir backend + os dois frontends de uma vez
npm run dev
#   backend    -> http://localhost:3001
#   mobile PWA -> http://localhost:5173
#   dashboard  -> http://localhost:5174

# 4. (Opcional, recomendado) Ver tudo ao vivo sem celulares:
npm run sim
```

Abra o **dashboard** (5174) → clique *Entrar* → veja os veículos correndo a
volta. Abra o **mobile** (5173) → login rápido como co-piloto → botões grandes de
troca e navegação.

### Contas de exemplo (senha: `volta2026`)

| Usuário | Papel | Equipe |
|---|---|---|
| `torre` | Torre de comando (dashboard) | — |
| `op-falcoes` / `op-aguias` / `op-lobos` | Co-piloto da Van (faz a troca) | Falcões / Águias / Lobos |
| `mot-falcoes` / `mot-aguias` / `mot-lobos` | Motorista do Carro | idem |

### Modo sem Docker

Tendo um Postgres+PostGIS e (opcional) Redis próprios, ajuste `backend/.env` e
rode `npm --workspace backend run db:migrate` para aplicar schema+seed. Sem
`REDIS_URL`, o backend roda em **modo memória** (instância única) — funciona para
desenvolvimento.

---

## Como funciona a "Troca Realizada" (a parte crítica)

O clique do co-piloto dispara a função `executar_troca()` no banco, que em **uma
transação** fecha o trecho do atleta anterior e abre o do próximo:

1. `SELECT ... FOR UPDATE` trava o trecho ativo da equipe → serializa duplo-clique.
2. Fecha o anterior (`ended_at`, `end_location` = GPS da van).
3. Descobre o próximo trecho (`sequence + 1`) e o atleta escalado no plano.
4. Abre o próximo trecho (`started_at`, `start_location`).

Um **índice único parcial** (`WHERE status = 'running'`) garante, no nível do
schema, que cada equipe nunca tem dois trechos rodando — a troca é à prova de
race condition por construção, não por lógica de aplicação.

---

## Features

Núcleo (do escopo):
- ✅ Tracking GPS contínuo, envio via WebSocket a cada 5s
- ✅ Troca atômica (fim do trecho anterior + início do próximo na mesma transação)
- ✅ Deep link do Waze para o próximo PC
- ✅ Mapa ao vivo + painel de telemetria (pace e ETA dinâmicos)

Além do escopo:
- ✅ **Auth JWT** por equipe e papel (operador / motorista / organização)
- ✅ **Buffer offline + auto-reconnect** (van em zona morta da estrada)
- ✅ **Wake Lock** (tela não apaga com o celular fixado na van)
- ✅ **Geofencing**: alerta de aproximação do próximo PC (Redis + debounce)
- ✅ **Leaderboard ao vivo** (ranking por trechos concluídos)
- ✅ **Projeção de ETA + pace** calculados no servidor
- ✅ **Troca forçada pela torre** (failover se o celular do co-piloto morrer)
- ✅ **Reiniciar prova** pelo dashboard (limpa execuções/rastro)
- ✅ **Replay pós-prova** animado no mapa (rastro de `position_logs`)
- ✅ **Auditoria de trocas** (`troca_events`)
- ✅ **Health-check** (`/health`) + **helmet** + SSL para banco gerenciado
- ✅ **Telemetria de bateria/sinal** e **degradação graciosa** sem Redis
- ✅ **PWA instalável** (manifest + service worker)
- ✅ **Simulador** de prova completo

## Deploy gratuito

Path 100% free (Render/Fly + Supabase/Neon, sem Mapbox, Redis opcional) em
**[DEPLOY.md](DEPLOY.md)**. ⚠️ A PWA precisa ser servida por **HTTPS** — a
Geolocation API não funciona em `http://` num celular.

---

## Estrutura

```
volta-ao-lago/
├─ db/                      # schema.sql, functions.sql (executar_troca), seed.sql
├─ backend/                 # NestJS (gateway, auth, race, relay, redis, database)
│  └─ src/realtime/realtime.gateway.ts   <- recebe troca/posição e faz broadcast
├─ apps/
│  ├─ mobile/               # PWA do co-piloto
│  │  └─ src/hooks/useGeoTracking.ts     <- captura GPS + envio 5s + buffer offline
│  └─ dashboard/            # Torre de comando (mapa + telemetria)
├─ tools/simulator/         # demo automatizada
└─ docker-compose.yml
```

---

## Notas de escala

- **WebSocket horizontal:** com `REDIS_URL` setado, o Socket.io Redis Adapter
  costura o fan-out entre N instâncias Node atrás de um load balancer. Vans e
  dashboards podem estar em instâncias diferentes.
- **Caminho quente isolado:** GPS vai só ao Redis (memória). O Postgres só recebe
  trocas (raras) e amostras de rastro em lote (a cada 15s/veículo).
- **PostGIS** habilita consultas geográficas (proximidade, distâncias) e o tipo
  `geography` indexado com GiST.
