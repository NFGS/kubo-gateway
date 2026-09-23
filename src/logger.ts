import pino from 'pino';
import { config } from './config';

/**
 * Logger estructurado en JSON. Nunca se registran cabeceras de autorizacion
 * ni cuerpos de peticion: pueden contener credenciales o datos personales.
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: 'kubo-gateway' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[redactado]',
  },
});
