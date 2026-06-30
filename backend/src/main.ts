import 'dotenv/config';
import 'reflect-metadata';
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

  app.use(helmet({ crossOriginResourcePolicy: false }));

  const corsOrigin = process.env.CORS_ORIGIN ?? '*';
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    credentials: true,
  });

  const adapter = new RedisIoAdapter(app);
  await adapter.connectToRedis();
  app.useWebSocketAdapter(adapter);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  new Logger('Bootstrap').log(`Volta do Lago backend em http://localhost:${port}`);
}

bootstrap();
