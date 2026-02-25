import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiSecurity,
} from '@nestjs/swagger';
import { PriceService } from './price.service';
import { PriceResponseDto } from './dto/price-response.dto';
import {
  PriceHistoryQueryDto,
  PriceHistoryResponseDto,
} from './dto/price-history.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@ApiTags('Price')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('v1/price')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Get(':coinId')
  @ApiOperation({
    summary: 'Get current price for a cryptocurrency',
    description:
      'Returns the current price of the specified cryptocurrency. ' +
      'Requests are batched for efficiency: the system waits up to 5 seconds ' +
      'to collect requests for the same coin, or triggers immediately when 3 requests are pending.',
  })
  @ApiParam({
    name: 'coinId',
    description: 'CoinGecko coin ID (e.g., bitcoin, ethereum, solana)',
    example: 'bitcoin',
  })
  @ApiResponse({
    status: 200,
    description: 'Current price information',
    type: PriceResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Coin not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 503, description: 'External API unavailable' })
  async getPrice(@Param('coinId') coinId: string): Promise<PriceResponseDto> {
    return this.priceService.getPrice(coinId);
  }

  @Get(':coinId/history')
  @ApiOperation({
    summary: 'Get price history for a cryptocurrency',
    description:
      'Returns paginated historical price records for the specified cryptocurrency.',
  })
  @ApiParam({
    name: 'coinId',
    description: 'CoinGecko coin ID (e.g., bitcoin, ethereum, solana)',
    example: 'bitcoin',
  })
  @ApiResponse({
    status: 200,
    description: 'Historical price records',
    type: PriceHistoryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async getPriceHistory(
    @Param('coinId') coinId: string,
    @Query() query: PriceHistoryQueryDto,
  ): Promise<PriceHistoryResponseDto> {
    return this.priceService.getPriceHistory(coinId, query);
  }
}
