# 🚀 Tutorial — Deploy no Render (grátis, passo a passo)

Vamos colocar tudo no ar **sem pagar nada**: banco no **Supabase**, backend +
2 frontends no **Render**. No fim você terá URLs HTTPS para abrir no celular.

> ⚠️ **HTTPS é obrigatório.** O rastreio por GPS do navegador (Geolocation) só
> funciona em `https://`. O Render já entrega HTTPS de graça — então funciona.

Tempo estimado: ~20 min. Pré-requisito: o código já no GitHub (ver o final).

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

O projeto já tem um `render.yaml` que cria os **3 serviços** de uma vez.

1. No Render: **New +** → **Blueprint**.
2. Selecione o repositório **volta-ao-lago** → **Connect**.
3. O Render lê o `render.yaml` e mostra 3 serviços:
   - `volta-backend` (Web Service — API + WebSocket)
   - `volta-mobile` (Static Site — PWA do co-piloto)
   - `volta-dashboard` (Static Site — torre)
4. Clique **Apply**. Ele começa a criar. (Vai pedir as variáveis que faltam — passo 4.)

---

## Passo 4 — Variáveis de ambiente

### No serviço **volta-backend** (Environment):
| Variável | Valor |
|---|---|
| `DATABASE_URL` | a URI do Supabase (Passo 1) |
| `DATABASE_SSL` | `true` |
| `JWT_SECRET` | (o Render já gera sozinho) |

Salve → ele faz o deploy. Quando ficar **Live**, copie a URL do backend (algo como
`https://volta-backend.onrender.com`). Teste abrindo `…/health` → deve responder
`{"status":"ok"}`.

### Nos serviços **volta-mobile** e **volta-dashboard** (Environment):
| Variável | Valor |
|---|---|
| `VITE_API_URL` | a URL do backend (ex.: `https://volta-backend.onrender.com`) |

E **só no volta-dashboard**, adicione também:
| Variável | Valor |
|---|---|
| `VITE_MOBILE_URL` | a URL do mobile (ex.: `https://volta-mobile.onrender.com`) |

Depois de salvar, clique **Manual Deploy → Clear build cache & deploy** nos dois
frontends (pra eles pegarem as variáveis novas).

> `VITE_*` é lida **na hora do build** — por isso precisa redeployar após mudar.

---

## Passo 5 — Desenhar a rota nas ruas (uma vez)

A rota road-snapped fica numa tabela do banco. Gere apontando para o banco de produção
(rode no seu PC, uma vez):

```bash
DATABASE_URL="postgresql://postgres:SENHA@db.xxxx.supabase.co:5432/postgres" \
DATABASE_SSL=true \
npm run build:route
```

(Ou edite o trajeto direto no dashboard depois: **Editar trajeto → 📌 Definir trajeto**.)

---

## Passo 6 — Usar

- Abra o **volta-dashboard** (torre) → entre com **`torre` / `volta2026`**.
- No celular, abra o **volta-mobile** → **Adicionar à tela inicial** → entre como
  co-piloto (ou escaneie o QR em **Acessos / QR** no dashboard) → permita a localização.
- O dashboard também é instalável no celular (a torre no bolso): abra a URL do
  dashboard no celular → **Adicionar à tela inicial**.

---

## Detalhes importantes

- **Redis é opcional.** Sem `REDIS_URL`, o backend roda em instância única (modo
  memória) — perfeito pro plano free. Só precisa de Redis pra escalar em várias
  instâncias (aí use **Upstash** free e adicione `REDIS_URL`).
- **Cold start:** o Render free hiberna após 15 min ocioso (~30s pra acordar). Durante
  a prova o tráfego é contínuo, então fica acordado. Pra garantir, crie um monitor
  grátis em **cron-job.org** ou **UptimeRobot** batendo em `…/health` a cada 10 min
  (ver [MONITORING.md](MONITORING.md)).
- **Troque o `JWT_SECRET`** (o Render já gera um aleatório — ótimo) e, em produção,
  **troque as senhas** dos usuários do seed.
- **CORS:** já está liberado (`*`). Pra restringir, defina `CORS_ORIGIN` no backend
  com as URLs dos frontends separadas por vírgula.

## Custo: R$ 0
Supabase free + Render free + OpenStreetMap/OSRM (sem chave) + Redis opcional.
