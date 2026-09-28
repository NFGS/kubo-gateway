import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { HealthController } from './health/health.controller';
import { PlatformController } from './platform/platform.controller';
import { PlatformService } from './platform/platform.service';
import { JwksService } from './services/jwks.service';
import { RedisService } from './services/redis.service';

@Module({
  controllers: [HealthController, DashboardController, PlatformController],
  providers: [JwksService, RedisService, DashboardService, PlatformService],
})
export class AppModule {}
