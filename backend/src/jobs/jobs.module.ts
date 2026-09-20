import { Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisModule } from '../infra/redis.module.js';
import type { AppConfiguration } from '../config/configuration.js';
import { InactivityJob } from './inactivity.job.js';
import { AnonymizationJob } from './anonymization.job.js';

@Module({
  imports: [RedisModule],
  providers: [InactivityJob, AnonymizationJob],
})
export class JobsModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly inactivityJob: InactivityJob,
    private readonly anonymizationJob: AnonymizationJob,
    private readonly config: ConfigService<AppConfiguration>,
  ) {}

  onModuleInit() {
    const inactivityInterval = this.config.get('inactivityJobIntervalMs') ?? 300_000;
    const anonymizeInterval = this.config.get('anonymizeIntervalMs') ?? 3_600_000;

    this.inactivityJob.start(inactivityInterval);
    this.anonymizationJob.start(anonymizeInterval);
  }

  onModuleDestroy() {
    this.inactivityJob.stop();
    this.anonymizationJob.stop();
  }
}
