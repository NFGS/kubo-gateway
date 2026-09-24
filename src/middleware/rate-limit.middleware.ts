import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../logger';
import type { RedisService } from '../services/redis.service';

/**
 * IP del cliente para el limite de tasa.
 *
 * Se toma la ULTIMA entrada de `X-Forwarded-For`, no la primera: la ultima la
 * agrega el proxy propio (nginx), que sobrescribe la cabecera con la IP real.
 * Usar la primera permitia a un cliente inyectar una IP falsa y saltarse el
 * limite de autenticacion. En produccion, ademas, el gateway no debe publicarse
 * al host (ver `kubo-docs/05-despliegue.md`).
 */
function clientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const partes = forwarded.split(',');
    return partes[partes.length - 1]!.trim();
  }
  return request.ip ?? 'desconocida';
}

/**
 * Limite de tasa por ventana de un minuto.
 *
 * Prioridad de identidad: **usuario** (cuando el token ya fue verificado),
 * negocio (tenant) e IP. El limite por usuario evita que una sola cuenta
 * comprometida consuma la cuota de todo el negocio. Las rutas de autenticacion
 * conservan un limite estricto por IP para frenar la fuerza bruta.
 */
export function createRateLimitMiddleware(redis: RedisService) {
  return async function rateLimitMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const isAuthPath = request.path.startsWith('/api/v1/auth');
    const userId = request.headers['x-user-id'];
    const tenant = request.headers['x-tenant-id'];

    let key: string;
    let limit: number;

    if (isAuthPath) {
      key = `kubo:rl:ip:${clientIp(request)}`;
      limit = config.authRateLimitPerMinute;
    } else if (typeof userId === 'string' && userId.length > 0) {
      key = `kubo:rl:user:${userId}`;
      limit = config.userRateLimitPerMinute;
    } else if (typeof tenant === 'string' && tenant.length > 0) {
      key = `kubo:rl:tenant:${tenant}`;
      limit = config.rateLimitPerMinute;
    } else {
      key = `kubo:rl:ip:${clientIp(request)}`;
      limit = config.rateLimitPerMinute;
    }

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
