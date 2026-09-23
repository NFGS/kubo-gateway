import { Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../config';

/**
 * Verificacion de access tokens contra el JWKS de kubo-iam.
 *
 * La llave privada vive unicamente en el servicio de identidad; el gateway
 * solo conoce la llave publica. `createRemoteJWKSet` cachea el documento y lo
 * refresca automaticamente cuando aparece un `kid` desconocido (rotacion).
 */
@Injectable()
export class JwksService {
  private readonly logger = new Logger(JwksService.name);
  private readonly jwks = createRemoteJWKSet(new URL(config.jwksUri), {
    // Si llega un `kid` desconocido (rotacion de llave), jose vuelve a pedir el
    // JWKS. El tiempo de espera entre reintentos existe para que nadie pueda
    // saturar el endpoint de identidad con tokens de `kid` inventado; 10 s es el
    // equilibrio: una rotacion se reconoce casi de inmediato sin amplificar trafico.
    cooldownDuration: 10_000,
    cacheMaxAge: 600_000,
    timeoutDuration: 5_000,
  });

  async verify(token: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: config.issuer,
      audience: config.audience,
    });
    return payload;
  }

  async isReachable(): Promise<boolean> {
    try {
      const response = await fetch(config.jwksUri, {
        signal: AbortSignal.timeout(3_000),
      });
      return response.ok;
    } catch (error) {
      this.logger.warn(`JWKS inalcanzable: ${String(error)}`);
      return false;
    }
  }
}
