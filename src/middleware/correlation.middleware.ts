import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Asigna un identificador unico a cada peticion y lo propaga a los servicios.
 * Permite reconstruir el recorrido completo de una operacion en los logs.
 */
export function correlationMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.headers[CORRELATION_HEADER];
  const correlationId =
    typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
      ? incoming
      : randomUUID();

  request.headers[CORRELATION_HEADER] = correlationId;
  response.setHeader(CORRELATION_HEADER, correlationId);
  next();
}
