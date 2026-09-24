import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger';
import type { JwksService } from '../services/jwks.service';

/** Rutas que no exigen token. La comparacion es exacta para evitar sorpresas. */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/.well-known/jwks.json',
  '/api/v1/health',
]);

const IDENTITY_HEADERS = ['x-user-id', 'x-tenant-id', 'x-user-role', 'x-user-email'];

/**
 * Valida el access token y propaga la identidad verificada a los servicios
 * internos mediante cabeceras.
 *
 * Las cabeceras de identidad que envie el cliente SIEMPRE se eliminan primero:
 * de lo contrario cualquiera podria suplantar a otro usuario.
 */
export function createAuthMiddleware(jwks: JwksService) {
  return async function authMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    for (const header of IDENTITY_HEADERS) {
      delete request.headers[header];
    }

    if (PUBLIC_PATHS.has(request.path)) {
      next();
      return;
    }

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      response.status(401).json({
        code: 'MISSING_TOKEN',
        message: 'Se requiere un token de acceso',
      });
      return;
    }

    try {
      const payload = await jwks.verify(authorization.slice('Bearer '.length));
      request.headers['x-user-id'] = String(payload.sub ?? '');
      request.headers['x-tenant-id'] = String(payload.tenant_id ?? '');
      request.headers['x-user-role'] = String(payload.role ?? '');
      request.headers['x-user-email'] = String(payload.email ?? '');
      next();
    } catch (error) {
      logger.warn(
        { correlationId: request.headers['x-correlation-id'], reason: String(error) },
        'Token rechazado',
      );
      response.status(401).json({
        code: 'INVALID_TOKEN',
        message: 'El token es invalido o expiro',
      });
    }
  };
}
