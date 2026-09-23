import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../logger';
import type { RedisService } from '../services/redis.service';

function clientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return request.ip ?? 'desconocida';
}

/**
 * Limite de tasa por ventana de un minuto.
 *
 * La identidad usada es el negocio (tenant) cuando hay token, y la direccion
 * IP cuando no lo hay. Las rutas de autenticacion tienen un limite mas
 * estricto para frenar ataques de fuerza bruta.
 */
export function createRateLimitMiddleware(redis: RedisService) {
  return async function rateLimitMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const isAuthPath = request.path.startsWith('/api/v1/auth');
    const identity = request.headers['x-tenant-id'];
    const key =
      typeof identity === 'string' && identity.length > 0
        ? `kubo:rl:tenant:${identity}`
        : `kubo:rl:ip:${clientIp(request)}`;
    const limit = isAuthPath ? config.authRateLimitPerMinute : config.rateLimitPerMinute;

    const count = await redis.incrementWindow(key);
    if (count !== null) {
      response.setHeader('X-RateLimit-Limit', String(limit));
      response.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
      if (count > limit) {
        logger.warn({ key, count, limit }, 'Limite de tasa excedido');
        response.status(429).json({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Demasiadas peticiones. Intente de nuevo en un minuto.',
        });
        return;
      }
    }
    next();
  };
}
