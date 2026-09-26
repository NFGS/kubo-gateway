import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import type { Express, NextFunction, Request, Response } from 'express';
import { createProxyMiddleware, type RequestHandler } from 'http-proxy-middleware';
import { config } from '../config';
import { logger } from '../logger';
import { findRoute, isGatewayOwned, proxyRoutes, type ProxyRoute } from './routes';

interface RouteHandler {
  readonly route: ProxyRoute;
  readonly handler: RequestHandler;
}

/**
 * Agente de la malla interna (P-28, ADR-0020): el gateway presenta su
 * certificado y verifica el del servicio contra la CA interna. Sin esto, un
 * contenedor añadido a la red podria hablar con los servicios.
 */
function agenteInterno(): Agent | undefined {
  if (!config.internalTls) {
    return undefined;
  }

  return new Agent({
    ca: readFileSync(config.internalCa),
    cert: readFileSync(config.internalCert),
    key: readFileSync(config.internalKey),
    rejectUnauthorized: true,
  });
}

function buildHandler(route: ProxyRoute): RequestHandler {
  // El agente mTLS solo aplica a destinos HTTPS: pasarlo en un salto HTTP
  // rompe la conexion (y mientras un servicio no este migrado, sigue en HTTP).
  const agent = route.target.startsWith('https://') ? agenteInterno() : undefined;

  return createProxyMiddleware({
    target: route.target,
    changeOrigin: true,
    ...(agent ? { agent } : {}),
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
    if (isGatewayOwned(request.path)) {
      next();
      return;
    }
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
