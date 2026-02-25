import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoingeckoService, CoinGeckoPrice } from './coingecko.service';
import { PriceRecord } from '../entities/price-record.entity';

// Extended price with saved timestamp
export interface BatchedPriceResult extends CoinGeckoPrice {
  savedAt: Date;
}

interface PendingRequest {
  resolve: (value: BatchedPriceResult) => void;
  reject: (reason: Error) => void;
}

interface BatchState {
  requests: PendingRequest[];
  timer: NodeJS.Timeout | null;
  startTime: number;
}

@Injectable()
export class RequestBatcherService implements OnModuleDestroy {
  private readonly logger = new Logger(RequestBatcherService.name);
  private readonly batches: Map<string, BatchState> = new Map();
  private readonly timeoutMs: number;
  private readonly threshold: number;

  constructor(
    private readonly coingeckoService: CoingeckoService,
    private readonly configService: ConfigService,
    @InjectRepository(PriceRecord)
    private readonly priceRecordRepository: Repository<PriceRecord>,
  ) {
    this.timeoutMs =
      this.configService.get<number>('batching.timeoutMs') ?? 5000;
    this.threshold = this.configService.get<number>('batching.threshold') ?? 3;
  }

  onModuleDestroy() {
    // Clean up all timers on shutdown
    for (const [coinId, batch] of this.batches) {
      if (batch.timer) {
        clearTimeout(batch.timer);
        this.logger.log(`Cleared timer for ${coinId} on shutdown`);
      }
    }
    this.batches.clear();
  }

  async getPrice(coinId: string): Promise<BatchedPriceResult> {
    const normalizedCoinId = coinId.toLowerCase();

    return new Promise<BatchedPriceResult>((resolve, reject) => {
      const pendingRequest: PendingRequest = { resolve, reject };

      if (!this.batches.has(normalizedCoinId)) {
        // First request for this coin - create new batch
        this.createBatch(normalizedCoinId, pendingRequest);
      } else {
        // Add to existing batch
        this.addToBatch(normalizedCoinId, pendingRequest);
      }
    });
  }

  private createBatch(coinId: string, request: PendingRequest): void {
    this.logger.log(`Creating new batch for ${coinId}`);

    const batch: BatchState = {
      requests: [request],
      timer: null,
      startTime: Date.now(),
    };

    // Set up the 5-second timeout
    batch.timer = setTimeout(() => {
      void this.processBatch(coinId, 'timeout');
    }, this.timeoutMs);

    this.batches.set(coinId, batch);
  }

  private addToBatch(coinId: string, request: PendingRequest): void {
    const batch = this.batches.get(coinId);
    if (!batch) return;

    batch.requests.push(request);

    this.logger.log(
      `Added request to batch for ${coinId} (count: ${batch.requests.length}, threshold: ${this.threshold})`,
    );

    // Check if threshold reached
    if (batch.requests.length >= this.threshold) {
      this.logger.log(
        `Threshold of ${this.threshold} reached for ${coinId}, triggering early`,
      );
      // Clear the timeout and process immediately
      if (batch.timer) {
        clearTimeout(batch.timer);
        batch.timer = null;
      }
      void this.processBatch(coinId, 'threshold');
    }
  }

  private async processBatch(
    coinId: string,
    trigger: 'timeout' | 'threshold',
  ): Promise<void> {
    const batch = this.batches.get(coinId);
    if (!batch) return;

    // Remove batch from map immediately to prevent new requests being added
    this.batches.delete(coinId);

    const requestCount = batch.requests.length;
    const waitTime = Date.now() - batch.startTime;

    this.logger.log(
      `Processing batch for ${coinId}: ${requestCount} requests, trigger: ${trigger}, wait time: ${waitTime}ms`,
    );

    try {
      // Make the actual API call
      const price = await this.coingeckoService.getPrice(coinId);

      // Save to database ONCE per batch
      const record = this.priceRecordRepository.create({
        coinId: price.id,
        symbol: price.symbol,
        name: price.name,
        priceUsd: price.current_price,
        marketCap: price.market_cap,
        volume24h: price.total_volume,
        priceChangePercentage24h: price.price_change_percentage_24h,
      });

      await this.priceRecordRepository.save(record);
      this.logger.log(
        `Saved single price record for ${coinId} batch (${requestCount} requests)`,
      );

      // Create result with saved timestamp
      const result: BatchedPriceResult = {
        ...price,
        savedAt: record.createdAt,
      };

      // Resolve all pending requests with the same result
      for (const request of batch.requests) {
        request.resolve(result);
      }

      this.logger.log(
        `Successfully resolved ${requestCount} requests for ${coinId}`,
      );
    } catch (error) {
      // Reject all pending requests with the same error
      for (const request of batch.requests) {
        request.reject(error as Error);
      }

      this.logger.error(
        `Failed to process batch for ${coinId}: ${(error as Error).message}`,
      );
    }
  }

  // For testing purposes - get batch status
  getBatchStatus(coinId: string): {
    exists: boolean;
    requestCount?: number;
    waitingTimeMs?: number;
  } {
    const batch = this.batches.get(coinId.toLowerCase());
    if (!batch) {
      return { exists: false };
    }

    return {
      exists: true,
      requestCount: batch.requests.length,
      waitingTimeMs: Date.now() - batch.startTime,
    };
  }
}
