import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';
import { internalFetch } from '../lib/internal-fetch';

interface OverviewCall {
  readonly key: string;
  readonly url: string;
}

interface ServicePayload {
  readonly data?: unknown;
}

export interface OverviewResult {
  readonly data: Record<string, unknown>;
  readonly unavailable?: readonly string[];
}

/**
 * Composicion del tablero (patron Backend For Frontend).
 *
 * Sin esta capa, la PWA necesita siete viajes de red secuenciales para pintar el
 * tablero (medido: ~108 ms solo en latencia de red). Aqui el gateway consulta los
 * servicios **en paralelo**, dentro de la red privada, y devuelve una sola
 * respuesta. Medido: ~18 ms.
 *
 * Si un servicio no responde, el tablero se entrega con el resto de la
 * informacion y se indica que vista quedo sin datos: es preferible un tablero
 * parcial a una pantalla de error.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  async overview(headers: Record<string, string>): Promise<OverviewResult> {
    const calls: readonly OverviewCall[] = [
      { key: 'summary', url: `${config.services.analytics}/api/v1/dashboard/summary` },
      {
        key: 'sales_by_day',
        url: `${config.services.analytics}/api/v1/dashboard/sales-by-day?days=14`,
      },
      {
        key: 'top_products',
        url: `${config.services.analytics}/api/v1/dashboard/top-products?limit=8`,
      },
      {
        key: 'payment_methods',
        url: `${config.services.analytics}/api/v1/dashboard/payment-methods`,
      },
      {
        key: 'recent_sales',
        url: `${config.services.analytics}/api/v1/dashboard/recent-sales?limit=8`,
      },
      { key: 'rotation', url: `${config.services.analytics}/api/v1/dashboard/rotation` },
      { key: 'customers', url: `${config.services.crm}/api/v1/customers/stats` },
    ];

    const settled = await Promise.allSettled(
      calls.map(async (call) => {
        const response = await internalFetch(call.url, {
          headers,
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) {
          throw new Error(`${call.key} respondio ${response.status}`);
        }
        const body = (await response.json()) as ServicePayload;
        // Si el servicio no envuelve su respuesta en `data`, se toma el cuerpo
        // completo: asi una inconsistencia de contrato degrada la forma de la
        // respuesta en lugar de desaparecer una vista del tablero.
        return { key: call.key, value: body.data ?? body };
      }),
    );

    const data: Record<string, unknown> = {};
    const unavailable: string[] = [];

    settled.forEach((result, index) => {
      const call = calls[index];
      if (!call) {
        return;
      }
      if (result.status === 'fulfilled') {
        data[result.value.key] = result.value.value;
      } else {
        unavailable.push(call.key);
        this.logger.warn(
          { view: call.key, reason: String(result.reason) },
          'Vista del tablero no disponible',
        );
      }
    });

    return unavailable.length > 0 ? { data, unavailable } : { data };
  }
}
