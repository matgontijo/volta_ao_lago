# 🚀 Tutorial — Deploy no Render (grátis, passo a passo)

Tudo no ar com **1 único serviço Render** (plano free/basic): backend + mobile +
dashboard, tudo no mesmo processo. Banco no **Supabase** (grátis).

> ⚠️ **HTTPS é obrigatório.** O rastreio por GPS do navegador (Geolocation) só
> funciona em `https://`. O Render já entrega HTTPS de graça — então funciona.

Tempo estimado: ~10 min. Pré-requisito: o código já no GitHub.

---

## Passo 1 — Banco de dados grátis (Supabase)

1. Crie conta em **supabase.com** → **New project**. Anote a **senha** do banco.
2. Espere o projeto criar (~2 min).
3. Menu **SQL Editor** → **New query**. Cole e rode, **nesta ordem** (um de cada vez):
   - todo o conteúdo de [`db/schema.sql`](db/schema.sql) → **Run**
   - todo o conteúdo de [`db/functions.sql`](db/functions.sql) → **Run**
   - todo o conteúdo de [`db/seed.sql`](db/seed.sql) → **Run**
4. Menu **Project Settings → Database** → seção **Connection string** → copie a
   **URI** (algo como `postgresql://postgres:[SENHA]@db.xxxx.supabase.co:5432/postgres`).
   Troque `[SENHA]` pela senha do passo 1. **Guarde essa URL** — é a `DATABASE_URL`.

> Alternativa ao Supabase: **Neon** (neon.tech) funciona igual.

---

## Passo 2 — Criar conta no Render

1. Vá em **render.com** → **Get Started** → entre **com o GitHub** (Sign in with GitHub).
2. Autorize o Render a acessar seus repositórios.

---

## Passo 3 — Subir tudo com 1 clique (Blueprint)

O projeto tem um `render.yaml` que cria **1 serviço** com tudo junto.

1. No Render: **New +** → **Blueprint**.
2. Selecione o repositório **volta_ao_lago** → **Connect**.
3. O Render lê o `render.yaml` e mostra 1 serviço: `volta-ao-lago` (Web Service).
4. Clique **Apply**. Ele começa a criar.

---

## Passo 4 — Variáveis de ambiente

No serviço **volta-ao-lago** (Environment):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a URI do Supabase (Passo 1) |
| `DATABASE_SSL` | `true` (já definido) |
| `JWT_SECRET` | (o Render já gera sozinho) |

Salve → ele faz o deploy. Quando ficar **Live**, teste:
- `https://volta-ao-lago.onrender.com/health` → deve responder `{"status":"ok"}`
- `https://volta-ao-lago.onrender.com/` → dashboard
- `https://volta-ao-lago.onrender.com/mobile/` → PWA do co-piloto

---

## Passo 5 — Usar

- Abra a **raiz** (dashboard) → entre com **`torre` / `volta2026`**.
- No celular, abra **`/mobile/`** → **Adicionar à tela inicial** → entre como
  co-piloto (ou escaneie o QR no dashboard em **Acessos / QR**) → permita a localização.

---

## Detalhes importantes

- **Serviço único:** backend NestJS serve API + WebSocket + os dois frontends
  estáticos, tudo na mesma URL. Sem complicação de CORS ou múltiplos serviços.
- **Redis é opcional.** Sem `REDIS_URL`, o backend roda em instância única (modo
  memória) — perfeito pro plano free. Só precisa de Redis pra escalar em várias
  instâncias (aí use **Upstash** free e adicione `REDIS_URL`).
- **Cold start:** o Render free hiberna após 15 min ocioso (~30s pra acordar). Durante
  a prova o tráfego é contínuo, então fica acordado. Pra garantir, crie um monitor
  grátis em **cron-job.org** ou **UptimeRobot** batendo em `…/health` a cada 10 min
  (ver [MONITORING.md](MONITORING.md)).
- **Troque as senhas** dos usuários do seed em produção.

## URLs no deploy

| O quê | URL |
|---|---|
| Dashboard (torre) | `https://SEU-SERVICO.onrender.com/` |
| Mobile (co-piloto) | `https://SEU-SERVICO.onrender.com/mobile/` |
| API / WebSocket | `https://SEU-SERVICO.onrender.com/` (mesma origem) |
| Health check | `https://SEU-SERVICO.onrender.com/health` |

## Custo: R$ 0
Supabase free + Render free + OpenStreetMap/OSRM (sem chave) + Redis opcional.
