// ============================================================================
// Watchdog — vigia o /health do backend e ALERTA se cair. "Não pode cair":
// combine com PM2/Docker (auto-restart) + um monitor de uptime externo grátis.
//
// Env:
//   HEALTH_URL              (default http://localhost:3001/health)
//   WATCHDOG_INTERVAL_MS    (default 30000)
//   WATCHDOG_FAILS          (falhas seguidas p/ alertar, default 3)
//   ALERT_WEBHOOK_URL       (POST {text} genérico — Discord/Slack/etc.)
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID  (alerta no Telegram)
// ============================================================================
const URL = process.env.HEALTH_URL ?? 'http://localhost:3001/health';
const INTERVAL = Number(process.env.WATCHDOG_INTERVAL_MS ?? 30000);
const FAILS = Number(process.env.WATCHDOG_FAILS ?? 3);
const WEBHOOK = process.env.ALERT_WEBHOOK_URL;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

let fails = 0;
let alerted = false;

async function alert(text) {
  console.error('[watchdog] ALERTA:', text);
  try {
    if (WEBHOOK)
      await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, content: text }),
      });
  } catch {}
  try {
    if (TG_TOKEN && TG_CHAT)
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT, text }),
      });
  } catch {}
}

async function tick() {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(8000) });
    const j = await res.json();
    if (!res.ok || !j.status) throw new Error('HTTP ' + res.status);
    if (alerted) await alert('✅ Volta do Lago: backend RECUPERADO.');
    fails = 0;
    alerted = false;
    console.log(`[watchdog] ok · db=${j.db} redis=${j.redis} uptime=${j.uptimeSec}s`);
  } catch (e) {
    fails++;
    console.error(`[watchdog] falha ${fails}/${FAILS}: ${e.message}`);
    if (fails >= FAILS && !alerted) {
      await alert(`🚨 Volta do Lago: backend FORA DO AR (${fails} falhas) — ${URL}`);
      alerted = true;
    }
  }
}

console.log(`[watchdog] vigiando ${URL} a cada ${INTERVAL / 1000}s (alerta após ${FAILS} falhas)`);
setInterval(tick, INTERVAL);
tick();
