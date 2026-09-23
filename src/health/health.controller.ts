import { Controller, Get } from '@nestjs/common';
import { JwksService } from '../services/jwks.service';
import { RedisService } from '../services/redis.service';

@Controller('api/v1/health')
export class HealthController {
  constructor(
    private readonly jwks: JwksService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async health(): Promise<Record<string, string>> {
    const jwksReachable = await this.jwks.isReachable();
    return {
      status: 'UP',
      service: 'kubo-gateway',
      jwks: jwksReachable ? 'UP' : 'DEGRADED',
      redis: this.redis.isHealthy() ? 'UP' : 'DEGRADED',
      time: new Date().toISOString(),
    };
  }
}
