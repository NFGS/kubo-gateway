import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { JwksService } from './services/jwks.service';
import { RedisService } from './services/redis.service';

@Module({
  controllers: [HealthController],
  providers: [JwksService, RedisService],
})
export class AppModule {}
