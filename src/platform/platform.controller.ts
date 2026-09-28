import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PlatformService, type PlatformUsageResult } from './platform.service';

/**
 * Vista compuesta de uso para el panel de plataforma (ADR-0025).
 *
 * El gateway la atiende por si mismo: su valor esta en unir la lista de negocios
 * (IAM) con los conteos del ERP en un solo viaje. El middleware ya exigio el
 * token de plataforma, asi que aqui solo se propaga la identidad del operador.
 */
@Controller('api/v1/platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('usage')
  async usage(@Req() request: Request): Promise<PlatformUsageResult> {
    return this.platform.usage({
      'x-platform-admin-id': String(request.headers['x-platform-admin-id'] ?? ''),
      'x-platform-admin-email': String(request.headers['x-platform-admin-email'] ?? ''),
      'x-correlation-id': String(request.headers['x-correlation-id'] ?? ''),
    });
  }
}
