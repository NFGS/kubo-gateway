import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../config';

/**
 * Cliente Redis para limites de tasa distribuidos.
 *
 * Si Redis no esta disponible el gateway opera en modo "fail open": se registra
 * la advertencia y se permite la peticion. Es preferible degradar el control de
 * trafico antes que tumbar el sistema del negocio.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private healthy = false;

  constructor() {
    this.client = new Redis(config.redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 500, 5_000),
    });

    this.client.on('ready', () => {
      this.healthy = true;
      this.logger.log('Redis conectado');
    });
    this.client.on('error', (error) => {
      this.healthy = false;
      this.logger.warn(`Redis con error: ${error.message}`);
    });
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  /**
   * Ventana fija de un minuto. Devuelve el conteo actual de la ventana o
   * `null` si Redis no responde (el llamador decide permitir el paso).
   */
  async incrementWindow(key: string, ttlSeconds = 60): Promise<number | null> {
    if (!this.healthy) {
      return null;
    }
    try {
      const windowKey = `${key}:${Math.floor(Date.now() / (ttlSeconds * 1000))}`;
      const count = await this.client.incr(windowKey);
      if (count === 1) {
        await this.client.expire(windowKey, ttlSeconds);
      }
      return count;
    } catch (error) {
      this.logger.warn(`Limite de tasa no aplicado: ${String(error)}`);
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
