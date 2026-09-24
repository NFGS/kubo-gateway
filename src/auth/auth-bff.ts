import express, { type Request, type Response, type Router } from 'express';
import { config } from '../config';
import { logger } from '../logger';

/**
 * BFF de autenticacion: el refresh token viaja en una cookie `httpOnly`.
 *
 * El IAM sigue emitiendo el refresh token (es su responsabilidad), pero el
 * gateway lo intercepta en login/refresh/logout, lo guarda en una cookie
 * `httpOnly` + `SameSite=Strict` y **nunca lo devuelve en el cuerpo**. Un XSS ya
 * no puede robarlo con `localStorage.getItem`.
 *
 * El access token (15 minutos) sigue en memoria del navegador. La cookie solo
 * viaja a `/api/v1/auth` y se marca `Secure` cuando la peticion llego por HTTPS
 * (directamente o por el proxy TLS).
 */

const COOKIE_NAME = 'kubo_refresh';
const COOKIE_PATH = '/api/v1/auth';

interface TokenPayload {
  accessToken?: string;
  refreshToken?: string;
  [key: string]: unknown;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }
  const jar: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) {
      continue;
    }
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) {
      jar[name] = decodeURIComponent(value);
    }
  }
  return jar;
}

function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers['x-forwarded-proto'];
  return config.cookieSecure || forwarded === 'https';
}

function cookieOptions(request: Request) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isSecureRequest(request),
    path: COOKIE_PATH,
    maxAge: config.refreshCookieDays * 24 * 60 * 60 * 1000,
  };
}

function clearOptions(request: Request) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isSecureRequest(request),
    path: COOKIE_PATH,
  };
}

function forwardHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const userAgent = request.headers['user-agent'];
  if (typeof userAgent === 'string') {
    headers['User-Agent'] = userAgent;
  }
  const correlation = request.headers['x-correlation-id'];
  if (typeof correlation === 'string') {
    headers['X-Correlation-Id'] = correlation;
  }
  if (request.ip) {
    headers['X-Forwarded-For'] = request.ip;
  }
  return headers;
}

async function callIam(path: string, request: Request, body: unknown): Promise<globalThis.Response> {
  return fetch(`${config.services.iam}/api/v1/auth${path}`, {
    method: 'POST',
    headers: forwardHeaders(request),
    body: JSON.stringify(body),
  });
}

function noStore(response: Response): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

function relayError(response: Response, status: number, text: string): void {
  noStore(response);
  response.status(status);
  response.setHeader('Content-Type', 'application/json');
  response.send(text || '{"code":"AUTH_ERROR","message":"Error de autenticacion"}');
}

function unavailable(response: Response, operation: string, error: unknown): void {
  logger.error({ operation, reason: String(error) }, 'Fallo el BFF de autenticacion');
  response.status(502).json({
    code: 'UPSTREAM_UNAVAILABLE',
    message: 'El servicio de identidad no esta disponible',
  });
}

/** Guarda el refresh token en cookie y devuelve el cuerpo sin el. */
function respondWithSession(request: Request, response: Response, status: number, text: string): void {
  let payload: TokenPayload;
  try {
    payload = JSON.parse(text) as TokenPayload;
  } catch {
    relayError(response, status, text);
    return;
  }

  if (typeof payload.refreshToken === 'string' && payload.refreshToken.length > 0) {
    response.cookie(COOKIE_NAME, payload.refreshToken, cookieOptions(request));
  }
  delete payload.refreshToken;

  noStore(response);
  response.status(status).json(payload);
}

async function handleLogin(request: Request, response: Response): Promise<void> {
  try {
    const iam = await callIam('/login', request, request.body ?? {});
    const text = await iam.text();
    if (!iam.ok) {
      relayError(response, iam.status, text);
      return;
    }
    respondWithSession(request, response, iam.status, text);
  } catch (error) {
    unavailable(response, 'login', error);
  }
}

async function handleRefresh(request: Request, response: Response): Promise<void> {
  const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
  if (!token) {
    response.status(401).json({
      code: 'MISSING_REFRESH_TOKEN',
      message: 'No hay una sesion que refrescar',
    });
    return;
  }

  try {
    const iam = await callIam('/refresh', request, { refreshToken: token });
    const text = await iam.text();

    if (!iam.ok) {
      response.clearCookie(COOKIE_NAME, clearOptions(request));
      relayError(response, iam.status, text);
      return;
    }

    respondWithSession(request, response, iam.status, text);
  } catch (error) {
    unavailable(response, 'refresh', error);
  }
}

async function handleLogout(request: Request, response: Response): Promise<void> {
  const token = parseCookies(request.headers.cookie)[COOKIE_NAME];

  if (token) {
    try {
      await callIam('/logout', request, { refreshToken: token });
    } catch (error) {
      // Cerrar sesion es local: aunque el IAM no responda, la cookie se borra.
      logger.warn({ reason: String(error) }, 'No se pudo revocar el token al cerrar sesion');
    }
  }

  response.clearCookie(COOKIE_NAME, clearOptions(request));
  noStore(response);
  response.status(204).end();
}

/** Router que se monta en `/api/v1/auth`; el resto de rutas sigue al proxy. */
export function createAuthBffRouter(): Router {
  const router = express.Router();

  router.post('/login', express.json({ limit: '16kb' }), (request, response) => {
    void handleLogin(request, response);
  });
  router.post('/refresh', (request, response) => {
    void handleRefresh(request, response);
  });
  router.post('/logout', (request, response) => {
    void handleLogout(request, response);
  });

  return router;
}
