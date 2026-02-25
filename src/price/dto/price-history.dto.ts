import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PriceHistoryQueryDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Page number (1-indexed)',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    description: 'Number of items per page',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class PriceHistoryItemDto {
  @ApiProperty({ example: 'bitcoin' })
  coinId: string;

  @ApiProperty({ example: 'btc' })
  symbol: string;

  @ApiProperty({ example: 'Bitcoin' })
  name: string;

  @ApiProperty({ example: 45000.5 })
  priceUsd: number;

  @ApiProperty({ example: 850000000000 })
  marketCap: number;

  @ApiProperty({ example: 25000000000 })
  volume24h: number;

  @ApiProperty({ example: 2.5 })
  priceChangePercentage24h: number;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  createdAt: Date;
}

export class PriceHistoryResponseDto {
  @ApiProperty({ type: [PriceHistoryItemDto] })
  data: PriceHistoryItemDto[];

  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}
