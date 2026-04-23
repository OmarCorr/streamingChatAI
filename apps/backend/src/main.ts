import 'reflect-metadata';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { validateEnv, env } from './env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  // Load .env before validateEnv() so Zod can read the vars
  dotenvConfig({ path: resolve(__dirname, '../../..', '.env') });

  validateEnv(); // (1) fail-fast BEFORE NestFactory

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.use(cookieParser(env.COOKIE_SECRET));
  app.enableCors({ origin: env.FRONTEND_URL, credentials: true });

  // Required for @nestjs/throttler to resolve real client IP behind nginx
  (app.getHttpAdapter().getInstance() as { set: (key: string, val: number) => void }).set(
    'trust proxy',
    1,
  );

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Streaming Chat API')
    .setDescription('SSE-based Gemini streaming chat demo')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  app.enableShutdownHooks(); // required so OnModuleDestroy fires (Langfuse flush)

  await app.listen(env.PORT);
}

void bootstrap();
