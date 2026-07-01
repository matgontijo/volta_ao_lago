import 'dotenv/config';
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const expressStatic = require('express').static;
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

// Blindagem do processo: um erro solto não pode derrubar o servidor em silêncio.
process.on('unhandledRejection', (reason) => {
  new Logger('Process').error(`unhandledRejection: ${reason}`);
});
process.on('uncaughtException', (err) => {
  // Loga e sai com código != 0 -> o supervisor (PM2/Docker) reinicia limpo.
  new Logger('Process').error(`uncaughtException: ${err?.stack ?? err}`);
  process.exit(1);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet({ 
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
    referrerPolicy: false,
  }));

  const corsOrigin = process.env.CORS_ORIGIN ?? '*';
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    credentials: true,
  });

  const adapter = new RedisIoAdapter(app);
  await adapter.connectToRedis();
  app.useWebSocketAdapter(adapter);

  // ---------------------------------------------------------------------------
  // Serve os frontends estáticos quando existem (deploy unificado no Render).
  // Em dev local, os frontends rodam via `vite dev` separado — essas pastas não
  // existem, então o bloco é simplesmente ignorado.
  // ---------------------------------------------------------------------------
  const projectRoot = path.resolve(__dirname, '..', '..');
  const mobileDist = path.join(projectRoot, 'apps', 'mobile', 'dist');
  const dashDist = path.join(projectRoot, 'apps', 'dashboard', 'dist');
  const logger = new Logger('StaticFiles');

  if (fs.existsSync(mobileDist)) {
    app.use('/mobile', expressStatic(mobileDist));
    // SPA fallback: qualquer rota /mobile/* que não bata em arquivo → index.html
    app.use('/mobile/*', (_req: any, res: any) => {
      res.sendFile(path.join(mobileDist, 'index.html'));
    });
    logger.log(`PWA Mobile servida em /mobile/`);
  }

  if (fs.existsSync(dashDist)) {
    // Registra DEPOIS das rotas da API (NestJS já registrou /health, /auth, etc.)
    app.use(expressStatic(dashDist));
    logger.log(`Dashboard servido na raiz /`);
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  // SPA fallback para o dashboard: qualquer rota que não bateu em nada → index.html
  // (precisa ser registrado DEPOIS do app.listen para vir após todas as rotas NestJS)
  if (fs.existsSync(dashDist)) {
    const httpAdapter = app.getHttpAdapter();
    httpAdapter.getInstance().get('*', (req: any, res: any, next: any) => {
      // Não intercepta rotas da API, WebSocket ou mobile
      if (req.path.startsWith('/mobile') || req.path.startsWith('/auth') ||
          req.path.startsWith('/health') || req.path.startsWith('/race') ||
          req.path.startsWith('/admin') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(dashDist, 'index.html'));
    });
  }

  new Logger('Bootstrap').log(`Volta do Lago backend em http://localhost:${port}`);
}

bootstrap();

