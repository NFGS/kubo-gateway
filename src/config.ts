/**
 * Configuracion del gateway, centralizada y con valores por defecto seguros
 * para desarrollo local. En produccion todo llega por variables de entorno.
 */
export interface ServiceTargets {
  readonly iam: string;
  readonly crm: string;
  readonly erp: string;
  readonly analytics: string;
}

export interface GatewayConfig {
  readonly port: number;
  readonly redisUrl: string;
  readonly jwksUri: string;
  readonly issuer: string;
  readonly audience: string;
  readonly rateLimitPerMinute: number;
  readonly authRateLimitPerMinute: number;
  readonly userRateLimitPerMinute: number;
  readonly cookieSecure: boolean;
  readonly refreshCookieDays: number;
  readonly services: ServiceTargets;
  readonly logLevel: string;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config: GatewayConfig = {
  port: num(process.env.PORT, 8080),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6380',
  jwksUri:
    process.env.KUBO_JWKS_URI ??
    'http://localhost:9081/api/v1/auth/.well-known/jwks.json',
  issuer: process.env.KUBO_JWT_ISSUER ?? 'kubo-iam',
  audience: process.env.KUBO_JWT_AUDIENCE ?? 'kubo-api',
  rateLimitPerMinute: num(process.env.KUBO_RATE_LIMIT_PER_MINUTE, 600),
  authRateLimitPerMinute: num(process.env.KUBO_AUTH_RATE_LIMIT_PER_MINUTE, 40),
  userRateLimitPerMinute: num(process.env.KUBO_USER_RATE_LIMIT_PER_MINUTE, 300),
  cookieSecure: process.env.KUBO_COOKIE_SECURE === 'true',
  refreshCookieDays: num(process.env.KUBO_REFRESH_COOKIE_DAYS, 7),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  services: {
    iam: process.env.KUBO_IAM_URL ?? 'http://localhost:9081',
    crm: process.env.KUBO_CRM_URL ?? 'http://localhost:9082',
    erp: process.env.KUBO_ERP_URL ?? 'http://localhost:9083',
    analytics: process.env.KUBO_ANALYTICS_URL ?? 'http://localhost:9084',
  },
};
