import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow no-origin (server-to-server, mobile apps, curl)
      if (!origin) return callback(null, true);

      const configured = (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      // Wildcard mode
      if (configured.length === 1 && configured[0] === '*') {
        return callback(null, true);
      }

      // Exact match
      if (configured.includes(origin)) {
        return callback(null, true);
      }

      // Match localhost / 127.0.0.1 on the same port
      // e.g. accept http://localhost:4568 when 127.0.0.1:4568 is whitelisted
      try {
        const url = new URL(origin);
        for (const allowed of configured) {
          if (allowed === '*') return callback(null, true);
          const allowedUrl = new URL(allowed);
          if (
            (allowedUrl.hostname === 'localhost' || allowedUrl.hostname === '127.0.0.1') &&
            (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
            allowedUrl.port === url.port
          ) {
            return callback(null, true);
          }
        }
      } catch {
        // ignore parse errors
      }

      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 7777);
  await app.listen(port, '0.0.0.0');
  logger.log(`Hina WMS Backend running on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
