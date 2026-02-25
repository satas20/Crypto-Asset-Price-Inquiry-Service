import { ApiProperty } from '@nestjs/swagger';

export class PriceResponseDto {
  @ApiProperty({ example: 'bitcoin', description: 'CoinGecko coin ID' })
  coinId: string;

  @ApiProperty({ example: 'btc', description: 'Coin symbol' })
  symbol: string;

  @ApiProperty({ example: 'Bitcoin', description: 'Coin name' })
  name: string;

  @ApiProperty({ example: 45000.5, description: 'Current price in USD' })
  priceUsd: number;

  @ApiProperty({ example: 850000000000, description: 'Market capitalization' })
  marketCap: number;

  @ApiProperty({ example: 25000000000, description: '24h trading volume' })
  volume24h: number;

  @ApiProperty({ example: 2.5, description: '24h price change percentage' })
  priceChangePercentage24h: number;

  @ApiProperty({ example: '2024-01-15T10:30:00Z', description: 'Timestamp' })
  timestamp: Date;
}
