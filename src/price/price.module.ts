import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceController } from './price.controller';
import { PriceService } from './price.service';
import { CoingeckoService } from './services/coingecko.service';
import { RequestBatcherService } from './services/request-batcher.service';
import { PriceRecord } from './entities/price-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PriceRecord])],
  controllers: [PriceController],
  providers: [PriceService, CoingeckoService, RequestBatcherService],
  exports: [PriceService],
})
export class PriceModule {}
