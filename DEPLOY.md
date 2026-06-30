# 🚀 Deploy 100% gratuito

Tudo aqui roda em **planos free**. Nenhum cartão obrigatório.

> ⚠️ **HTTPS é obrigatório.** A `navigator.geolocation` do navegador só funciona
> em contexto seguro. `localhost` funciona; um IP de LAN (`http://192.168...`)
> **não**. Por isso a PWA tem que ser servida por HTTPS — o que todos os hosts
> abaixo já dão de graça.

## Stack gratuita recomendada

| Peça | Serviço free | Observação |
|---|---|---|
| Banco | **Supabase** ou **Neon** | Postgres com PostGIS + pgcrypto |
| Tudo-em-um (API + WS + frontends) | **Render** (ou Fly.io) | 1 serviço Node serve tudo |
| Redis | **OPCIONAL** (Upstash free) | sem ele = 1 instância (graceful) |

---

## 1. Banco (Supabase free)

1. Crie um projeto em supabase.com.
2. No **SQL Editor**, cole e rode, nesta ordem, o conteúdo de:
   `db/schema.sql` → `db/functions.sql` → `db/seed.sql`.
   (PostGIS e pgcrypto são habilitados pelos próprios scripts.)
3. Em **Project Settings → Database**, copie a **Connection string** (URI).
   Use a porta do *pooler* se disponível.

> Alternativa por linha de comando, sem abrir o editor:
> ```bash
> DATABASE_URL="postgres://...supabase..." DATABASE_SSL=true \
>   npm --workspace backend run db:migrate
> ```

---

## 2. Deploy unificado (Render free — 1 serviço)

O backend NestJS serve a API, WebSocket **e** os dois frontends estáticos:
- `/` → Dashboard (torre de comando)
- `/mobile/` → PWA do co-piloto
- `/health`, `/auth/*`, `/race/*`, `/admin/*` → API REST
- `/socket.io` → WebSocket

**Via Blueprint** (usa o `render.yaml` da raiz):
1. New → **Blueprint** → conecte o repositório.
2. No serviço `volta-ao-lago`, defina:
   - `DATABASE_URL` = a string do Supabase
   - `DATABASE_SSL` = `true`
   - `JWT_SECRET` = (gerado automaticamente)
3. Deploy. A URL fica tipo `https://volta-ao-lago.onrender.com`.
   Teste: abra `/health` → deve responder `{"status":"ok"}`.

> Render free hiberna após 15 min ocioso (cold start ~30s). Durante a prova o
> tráfego é contínuo, então fica acordado. Para garantir, aponte um cron grátis
> (cron-job.org) batendo em `/health` a cada 10 min.

---

## 3. Conectar tudo

Tudo está no mesmo serviço — sem configuração de CORS entre serviços!
- Abra **`/`** (dashboard) → `torre` / `volta2026`.
- No celular, abra **`/mobile/`** (HTTPS) → "Adicionar à tela inicial" →
  login do co-piloto → permita a localização.

---

## Custo: R$ 0

- Mapa: **OpenStreetMap** via Leaflet (sem chave, sem cobrança).
- Banco/Redis/host: planos free.
- Sem Redis, o backend roda em instância única — perfeito para uma prova com
  poucos veículos. Só precisa de Redis se for escalar para várias instâncias.
