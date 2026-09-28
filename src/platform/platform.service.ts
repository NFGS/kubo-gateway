import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';
import { internalFetch } from '../lib/internal-fetch';

interface PlatformTenant {
  readonly id: string;
}

interface TenantUsage {
  readonly tenant_id: string;
  readonly products: number;
  readonly warehouses: number;
  readonly sales_month: { readonly count: number; readonly revenue: string };
  readonly documents: { readonly count: number; readonly bytes: number };
}

export interface PlatformUsageResult {
  readonly data: readonly TenantUsage[];
  readonly unavailable?: readonly string[];
}

/**
 * Uso agregado del ERP para el panel de plataforma (ADR-0025).
 *
 * El operador ve **conteos**, nunca datos de negocio. La lista de negocios vive
 * en IAM y los conteos en el ERP, asi que esta vista compuesta (BFF) une ambos
 * dentro de la malla: consulta los negocios con el token de plataforma y luego
 * pide al ERP los conteos de esos negocios. El ERP no amplia su RLS: consulta
 * cada negocio con su propia marca de aislamiento.
 *
 * Si el ERP no responde, se devuelve la lista vacia marcada como no disponible:
 * es preferible un panel parcial a una pantalla de error.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  async usage(headers: Record<string, string>): Promise<PlatformUsageResult> {
    const negocios = await this.tenants(headers);
    if (!negocios) {
      return { data: [], unavailable: ['tenants'] };
    }

    if (negocios.length === 0) {
      return { data: [] };
    }

    const ids = negocios.map((negocio) => negocio.id).join(',');
    const url = `${config.services.erp}/api/v1/internal/usage?tenant_ids=${encodeURIComponent(ids)}`;

    try {
      const response = await internalFetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) {
        throw new Error(`el ERP respondio ${response.status}`);
      }

      const body = (await response.json()) as { data?: readonly TenantUsage[] };

      return { data: body.data ?? [] };
    } catch (error) {
      this.logger.warn(`Sin uso del ERP: ${String(error)}`);

      return { data: [], unavailable: ['erp'] };
    }
  }

  private async tenants(headers: Record<string, string>): Promise<readonly PlatformTenant[] | null> {
    try {
      const response = await internalFetch(`${config.services.iam}/api/v1/platform/tenants`, {
        headers,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        throw new Error(`IAM respondio ${response.status}`);
      }

      return (await response.json()) as readonly PlatformTenant[];
    } catch (error) {
      this.logger.warn(`Sin lista de negocios: ${String(error)}`);

      return null;
    }
  }
}
