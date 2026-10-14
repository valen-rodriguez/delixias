import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../config/configuration.js';
import { OrdersService } from '../orders/orders.service.js';

@Injectable()
export class OrderTimeoutJob {
  private readonly logger = new Logger(OrderTimeoutJob.name);
  private readonly batchSize: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ordersService: OrdersService,
    config: ConfigService<AppConfiguration>,
  ) {
    this.batchSize = config.get('orderTimeoutBatchSize') ?? 100;
  }

  start(intervalMs: number) {
    if (this.intervalId) return;
    this.logger.log(`Starting order timeout job every ${intervalMs}ms`);
    this.intervalId = setInterval(() => void this.run(), intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async run() {
    try {
      const count = await this.ordersService.expireTimedOutOrders(
        this.batchSize,
      );
      if (count > 0) {
        this.logger.log(`Expired ${count} timed out pedidos`);
      }
    } catch (err) {
      this.logger.error(`Order timeout job failed: ${err}`);
    }
  }
}
