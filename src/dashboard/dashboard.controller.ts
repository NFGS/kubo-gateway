import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { DashboardService, type OverviewResult } from './dashboard.service';

/**
 * Vista compuesta del tablero.
 *
 * La identidad ya fue validada por el middleware del gateway; aqui solo se
 * propaga a los servicios internos. El gateway atiende esta ruta por si mismo
 * (no la reenvia) porque su valor esta en consultar a varios servicios a la vez.
 */
@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  async overview(@Req() request: Request): Promise<OverviewResult> {
    return this.dashboard.overview({
      'x-tenant-id': String(request.headers['x-tenant-id'] ?? ''),
      'x-user-id': String(request.headers['x-user-id'] ?? ''),
      'x-user-role': String(request.headers['x-user-role'] ?? ''),
      'x-correlation-id': String(request.headers['x-correlation-id'] ?? ''),
    });
  }
}
