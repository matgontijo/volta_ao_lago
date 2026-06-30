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
| Backend (API + WebSocket) | **Render** (ou Fly.io) | WebSocket persistente, HTTPS |
| PWA + Dashboard | **Render Static** / Cloudflare Pages / Vercel | build estático do Vite |
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

## 2. Backend (Render free)

Opção A — **Blueprint** (usa o `render.yaml` da raiz):
1. New → **Blueprint** → conecte o repositório.
2. No serviço `volta-backend`, defina:
   - `DATABASE_URL` = a string do Supabase
   - `DATABASE_SSL` = `true`
   - `JWT_SECRET` = (gerado automaticamente)
3. Deploy. A URL fica tipo `https://volta-backend.onrender.com`.
   Teste: abra `/health` → deve responder `{"status":"ok"}`.

Opção B — **Fly.io**: `cd backend && fly launch --no-deploy && fly deploy`,
depois `fly secrets set DATABASE_URL=... DATABASE_SSL=true JWT_SECRET=...`.

> Render free hiberna após 15 min ocioso (cold start ~30s). Durante a prova o
> tráfego é contínuo, então fica acordado. Para garantir, aponte um cron grátis
> (cron-job.org) batendo em `/health` a cada 10 min.

---

## 3. Frontends (Render Static / Vercel)

Para **cada** app (`apps/mobile` e `apps/dashboard`):
- Build command: `npm install && npm run build`
- Publish dir: `dist`
- Variável de ambiente: `VITE_API_URL` = a URL pública do backend (passo 2)
- SPA rewrite: tudo → `/index.html` (o `render.yaml` já faz isso)

No Vercel/Cloudflare Pages é igual: defina `VITE_API_URL` antes do build.

---

## 4. Conectar tudo

- Backend `CORS_ORIGIN`: pode deixar `*` (free) ou listar as URLs dos frontends
  separadas por vírgula.
- Abra o **dashboard** → `torre` / `volta2026`.
- No celular, abra a **PWA mobile** (HTTPS) → "Adicionar à tela inicial" →
  login do co-piloto → permita a localização.

---

## Custo: R$ 0

- Mapa: **OpenStreetMap** via Leaflet (sem chave, sem cobrança).
- Banco/Redis/host: planos free.
- Sem Redis, o backend roda em instância única — perfeito para uma prova com
  poucos veículos. Só precisa de Redis se for escalar para várias instâncias.
