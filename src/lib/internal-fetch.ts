import { readFileSync } from 'node:fs';
import { Agent, fetch as undiciFetch } from 'undici';
import { config } from '../config';

/**
 * Cliente HTTP de la malla interna (P-28, ADR-0020).
 *
 * `fetch` nativo no sabe presentar un certificado de cliente, y con la malla
 * cifrada los servicios no responden sin el. Este modulo construye un agente de
 * undici con la CA y el certificado del gateway y lo usa en todas las llamadas
 * internas (BFF de autenticacion, tablero compuesto y JWKS).
 */
let agente: Agent | undefined;

function agenteInterno(): Agent | undefined {
  if (!config.internalTls) {
    return undefined;
  }

  if (!agente) {
    agente = new Agent({
      connect: {
        ca: readFileSync(config.internalCa),
        cert: readFileSync(config.internalCert),
        key: readFileSync(config.internalKey),
      },
    });
  }

  return agente;
}

export function internalFetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
  const dispatcher = agenteInterno();

  return undiciFetch(url as string, {
    ...(init as Record<string, unknown>),
    ...(dispatcher ? { dispatcher } : {}),
  }) as unknown as Promise<Response>;
}
