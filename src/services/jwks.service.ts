import { Injectable, Logger } from '@nestjs/common';
import {
  createLocalJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { config } from '../config';
import { internalFetch } from '../lib/internal-fetch';

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
  private llaves?: JWTVerifyGetKey;
  private traidasEn = 0;

  // El JWKS se pide con el certificado de la malla (P-28) y se cachea; jose no
  // permite inyectar un `fetch` propio en su variante remota.
  private async llavesVigentes(forzar = false): Promise<JWTVerifyGetKey> {
    const vencidas = Date.now() - this.traidasEn > 600_000;

    if (!this.llaves || vencidas || forzar) {
      const response = await internalFetch(config.jwksUri, {
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        throw new Error(`El JWKS respondio ${response.status}`);
      }

      this.llaves = createLocalJWKSet((await response.json()) as JSONWebKeySet);
      this.traidasEn = Date.now();
    }

    return this.llaves;
  }

  async verify(token: string): Promise<JWTPayload> {
    try {
      return await this.verificarCon(await this.llavesVigentes(), token);
    } catch (error) {
      // Un `kid` desconocido puede ser una rotacion de llave: se refresca una vez
      // y, si sigue fallando, el error original es el que importa.
      return await this.verificarCon(await this.llavesVigentes(true), token);
    }
  }

  private async verificarCon(llaves: JWTVerifyGetKey, token: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, llaves, {
      issuer: config.issuer,
      audience: config.audience,
    });

    // Solo los tokens de acceso abren la API. El desafio del segundo factor
    // (P-30) se firma con la misma llave pero con `typ=totp`: sin esta
    // comprobacion, un desafio serviria como credencial de API.
    if (payload.typ !== 'access') {
      throw new Error('El token no es un token de acceso');
    }

    return payload;
  }

  async isReachable(): Promise<boolean> {
    try {
      const response = await internalFetch(config.jwksUri, {
        signal: AbortSignal.timeout(3_000),
      });
      return response.ok;
    } catch (error) {
      this.logger.warn(`JWKS inalcanzable: ${String(error)}`);
      return false;
    }
  }
}
