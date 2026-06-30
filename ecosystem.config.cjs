// PM2 — mantém o backend SEMPRE de pé (auto-restart) + o watchdog.
// Uso:  npm run build  (gera backend/dist)  &&  pm2 start ecosystem.config.cjs
//       pm2 logs   |   pm2 status   |   pm2 save && pm2 startup (sobe no boot)
module.exports = {
  apps: [
    {
      name: 'volta-backend',
      cwd: './backend',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      max_restarts: 100,
      restart_delay: 2000,
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'volta-watchdog',
      script: './tools/watchdog.mjs',
      autorestart: true,
      restart_delay: 5000,
    },
  ],
};
