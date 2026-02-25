import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceRecord } from './entities/price-record.entity';
import { RequestBatcherService } from './services/request-batcher.service';
import { PriceResponseDto } from './dto/price-response.dto';
import {
  PriceHistoryQueryDto,
  PriceHistoryResponseDto,
} from './dto/price-history.dto';

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);

  constructor(
    @InjectRepository(PriceRecord)
    private readonly priceRecordRepository: Repository<PriceRecord>,
    private readonly requestBatcherService: RequestBatcherService,
  ) {}

  async getPrice(coinId: string): Promise<PriceResponseDto> {
    this.logger.log(`Getting price for ${coinId}`);

    // Use the batching service to get the price (DB save happens in batcher, once per batch)
    const price = await this.requestBatcherService.getPrice(coinId);

    return {
      coinId: price.id,
      symbol: price.symbol,
      name: price.name,
      priceUsd: price.current_price,
      marketCap: price.market_cap,
      volume24h: price.total_volume,
      priceChangePercentage24h: price.price_change_percentage_24h,
      timestamp: price.savedAt,
    };
  }

  async getPriceHistory(
    coinId: string,
    query: PriceHistoryQueryDto,
  ): Promise<PriceHistoryResponseDto> {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    this.logger.log(
      `Getting price history for ${coinId} (page: ${page}, limit: ${limit})`,
    );

    const [records, total] = await this.priceRecordRepository.findAndCount({
      where: { coinId: coinId.toLowerCase() },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: records.map((record) => ({
        coinId: record.coinId,
        symbol: record.symbol,
        name: record.name,
        priceUsd: Number(record.priceUsd),
        marketCap: Number(record.marketCap),
        volume24h: Number(record.volume24h),
        priceChangePercentage24h: Number(record.priceChangePercentage24h),
        createdAt: record.createdAt,
      })),
      total,
      page,
      limit,
      totalPages,
    };
  }
}
