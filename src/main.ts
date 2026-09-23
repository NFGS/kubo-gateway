import 'reflect-metadata';
import type { Express } from 'express';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { pinoHttp } from 'pino-http';
import { AppModule } from './app.module';
import { config } from './config';
import { logger } from './logger';
import { correlationMiddleware } from './middleware/correlation.middleware';
import { createAuthMiddleware } from './middleware/auth.middleware';
import { createRateLimitMiddleware } from './middleware/rate-limit.middleware';
import { registerProxies } from './proxy/register';
import { JwksService } from './services/jwks.service';
import { RedisService } from './services/redis.service';

async function bootstrap(): Promise<void> {
  // `bodyParser: false` es imprescindible: el gateway no interpreta los cuerpos,
  // solo los reenvia tal cual llegan (streaming) al microservicio destino.
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
  app.enableShutdownHooks();

  const server = app.getHttpAdapter().getInstance() as Express;
  server.disable('x-powered-by');

  server.use(helmet({ contentSecurityPolicy: false }));
  server.use(correlationMiddleware);
  server.use(
    pinoHttp({
      logger,
      customProps: (request) => ({
        correlationId: request.headers['x-correlation-id'],
      }),
    }),
  );
  server.use(createAuthMiddleware(app.get(JwksService)));
  server.use(createRateLimitMiddleware(app.get(RedisService)));
  registerProxies(server);

  await app.listen(config.port, '0.0.0.0');
  logger.info(
    { port: config.port, jwksUri: config.jwksUri },
    'kubo-gateway escuchando',
  );
}

bootstrap().catch((error: unknown) => {
  logger.fatal({ reason: String(error) }, 'No fue posible iniciar el gateway');
  process.exit(1);
});
