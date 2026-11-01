import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { ENV, type Env } from './config/env.js';

async function bootstrap() {
  // rawBody: webhook HMACs are checked against the exact bytes received.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const env = app.get<Env>(ENV);
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });

  const docs = new DocumentBuilder().setTitle('Kolab API').addBearerAuth().build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, docs));

  await app.listen(env.PORT);
}
await bootstrap();
