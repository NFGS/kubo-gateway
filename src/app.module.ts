import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { HealthController } from './health/health.controller';
import { JwksService } from './services/jwks.service';
import { RedisService } from './services/redis.service';

@Module({
  controllers: [HealthController, DashboardController],
  providers: [JwksService, RedisService, DashboardService],
})
export class AppModule {}
