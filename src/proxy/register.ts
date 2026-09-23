import type { Express, NextFunction, Request, Response } from 'express';
import { createProxyMiddleware, type RequestHandler } from 'http-proxy-middleware';
import { logger } from '../logger';
import { findRoute, proxyRoutes, type ProxyRoute } from './routes';

interface RouteHandler {
  readonly route: ProxyRoute;
  readonly handler: RequestHandler;
}

function buildHandler(route: ProxyRoute): RequestHandler {
  return createProxyMiddleware({
    target: route.target,
    changeOrigin: true,
    xfwd: true,
    timeout: 20_000,
    proxyTimeout: 20_000,
    on: {
      proxyReq: (proxyRequest, request) => {
        const correlationId = request.headers['x-correlation-id'];
        if (typeof correlationId === 'string') {
          proxyRequest.setHeader('x-correlation-id', correlationId);
        }
      },
      error: (error, request, response) => {
        logger.error(
          {
            service: route.service,
            target: route.target,
            path: request.url,
            correlationId: request.headers['x-correlation-id'],
            reason: error.message,
          },
          'Fallo al contactar el microservicio',
        );
        const res = response as unknown as {
          headersSent?: boolean;
          status: (code: number) => { json: (body: unknown) => void };
        };
        if (!res.headersSent) {
          res.status(502).json({
            code: 'UPSTREAM_UNAVAILABLE',
            message: `El servicio ${route.service} no esta disponible`,
          });
        }
      },
    },
  }) as unknown as RequestHandler;
}

/**
 * Enruta cada peticion al microservicio que le corresponde.
 *
 * Se registra un unico middleware despachador en lugar de montar cada proxy con
 * `app.use(prefijo, ...)`: asi Express no recorta el prefijo de `req.url` y el
 * microservicio recibe exactamente la ruta original (`/api/v1/...`).
 */
export function registerProxies(app: Express): void {
  const handlers: RouteHandler[] = proxyRoutes.map((route) => ({
    route,
    handler: buildHandler(route),
  }));

  app.use((request: Request, response: Response, next: NextFunction) => {
    const route = findRoute(request.path);
    if (!route) {
      next();
      return;
    }
    const match = handlers.find((candidate) => candidate.route === route);
    if (!match) {
      next();
      return;
    }
    match.handler(request, response, next);
  });

  logger.info(
    { routes: proxyRoutes.map((route) => `${route.prefix} -> ${route.service}`) },
    'Tabla de enrutamiento registrada',
  );
}
