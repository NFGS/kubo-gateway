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
  { prefix: '/api/v1/dashboard', target: config.services.analytics, service: 'kubo-analytics' },
  { prefix: '/api/v1/events', target: config.services.analytics, service: 'kubo-analytics' },
];

export function findRoute(path: string): ProxyRoute | undefined {
  return proxyRoutes.find(
    (route) => path === route.prefix || path.startsWith(`${route.prefix}/`),
  );
}
