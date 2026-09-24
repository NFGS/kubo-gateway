import { config } from '../config';

export interface ProxyRoute {
  /** Prefijo de ruta publica que atiende el servicio. */
  readonly prefix: string;
  /** URL interna del microservicio. */
  readonly target: string;
  /** Nombre corto usado en logs. */
  readonly service: string;
}

/**
 * Tabla de enrutamiento del gateway.
 *
 * Los servicios comparten el mismo espacio de rutas (`/api/v1/...`), por lo que
 * no hay reescritura de camino: el gateway solo decide a quien entregar.
 */
export const proxyRoutes: readonly ProxyRoute[] = [
  { prefix: '/api/v1/auth', target: config.services.iam, service: 'kubo-iam' },
  { prefix: '/api/v1/users', target: config.services.iam, service: 'kubo-iam' },
  { prefix: '/api/v1/audit', target: config.services.iam, service: 'kubo-iam' },
  { prefix: '/api/v1/customers', target: config.services.crm, service: 'kubo-crm' },
  { prefix: '/api/v1/products', target: config.services.erp, service: 'kubo-erp' },
  { prefix: '/api/v1/sales', target: config.services.erp, service: 'kubo-erp' },
  { prefix: '/api/v1/stock', target: config.services.erp, service: 'kubo-erp' },
  { prefix: '/api/v1/suppliers', target: config.services.erp, service: 'kubo-erp' },
  { prefix: '/api/v1/purchases', target: config.services.erp, service: 'kubo-erp' },
  { prefix: '/api/v1/cash-sessions', target: config.services.erp, service: 'kubo-erp' },
  { prefix: '/api/v1/reports', target: config.services.erp, service: 'kubo-erp' },
  { prefix: '/api/v1/dashboard', target: config.services.analytics, service: 'kubo-analytics' },
  { prefix: '/api/v1/events', target: config.services.analytics, service: 'kubo-analytics' },
];

export function findRoute(path: string): ProxyRoute | undefined {
  return proxyRoutes.find(
    (route) => path === route.prefix || path.startsWith(`${route.prefix}/`),
  );
}

/**
 * Rutas que el gateway atiende por si mismo y no debe reenviar:
 *
 * - `/api/v1/health`: sonda propia (no depende de los servicios).
 * - `/api/v1/dashboard/overview`: vista compuesta que consulta a varios
 *   servicios en paralelo (patron BFF).
 */
export const GATEWAY_OWNED_PATHS: ReadonlySet<string> = new Set([
  '/api/v1/health',
  '/api/v1/dashboard/overview',
]);

export function isGatewayOwned(path: string): boolean {
  return GATEWAY_OWNED_PATHS.has(path);
}
