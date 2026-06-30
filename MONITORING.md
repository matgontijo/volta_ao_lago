# 🛡️ Monitoramento — "não pode cair"

Alta disponibilidade em 4 camadas (tudo no plano gratuito):

## 1. Auto-restart do processo
O backend já se protege: `unhandledRejection` é logado e `uncaughtException` sai
com código ≠ 0 para o supervisor reiniciar limpo. Escolha um supervisor:

- **PM2** (auto-restart + sobe no boot):
  ```bash
  npm run build           # gera backend/dist
  npm run pm2:start       # sobe backend + watchdog com auto-restart
  pm2 save && pm2 startup  # reinicia junto com a máquina
  ```
- **Docker**: o `docker-compose.yml` já usa `restart: unless-stopped` no Postgres/
  Redis. Em produção, rode o backend a partir do `backend/Dockerfile` com a mesma
  policy (ver `DEPLOY.md`).
- **Render/Fly**: reiniciam automaticamente no crash + healthcheck em `/health`.

## 2. Watchdog (vigília + alerta)
`npm run watchdog` (ou o app `volta-watchdog` no PM2) pinga `/health` e dispara
alerta se cair. Configure o destino do alerta por env:
```bash
# Telegram (grátis): crie um bot no @BotFather e pegue o chat id
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... npm run watchdog
# ou um webhook genérico (Discord/Slack):
ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/... npm run watchdog
```

## 3. Monitor de uptime externo (grátis)
Mesmo que a máquina inteira caia, um monitor de fora avisa. Use **UptimeRobot**
ou **cron-job.org** (free) apontando para `https://SEU-BACKEND/health` a cada
1–5 min, com alerta por e-mail/Telegram. Bônus: mantém o Render free "acordado".

## 4. Monitor de frota (no painel)
O dashboard mostra, por veículo, "visto há Xs" + bateria (painel **Frota**). Se um
celular para de transmitir GPS além do limite (ajustável em Alertas), a linha fica
**vermelha** — a coordenação vê na hora qual equipe perdeu rastreio.

---

### Resiliência já embutida
- Backend sobe sem Redis (cache em memória) e tolera Postgres indisponível no boot
  (recarrega caches sob demanda).
- Mobile: buffer offline + reconexão automática (zona morta da estrada).
- Socket.io reconecta sozinho; o simulador também.
