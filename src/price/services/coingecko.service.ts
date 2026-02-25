import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface CoinGeckoPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number;
}

interface CoinGeckoMarketResponse {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number;
}

@Injectable()
export class CoingeckoService {
  private readonly logger = new Logger(CoingeckoService.name);
  private readonly httpClient: AxiosInstance;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('coingecko.baseUrl') ||
      'https://api.coingecko.com/api/v3';
    this.apiKey = this.configService.get<string>('coingecko.apiKey') || '';

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        Accept: 'application/json',
        ...(this.apiKey && { 'x-cg-demo-api-key': this.apiKey }),
      },
    });
  }

  async getPrice(coinId: string): Promise<CoinGeckoPrice> {
    try {
      this.logger.log(`Fetching price for ${coinId} from CoinGecko`);

      const response = await this.httpClient.get<CoinGeckoMarketResponse[]>(
        '/coins/markets',
        {
          params: {
            vs_currency: 'usd',
            ids: coinId,
            order: 'market_cap_desc',
            per_page: 1,
            page: 1,
            sparkline: false,
            price_change_percentage: '24h',
          },
        },
      );

      if (!response.data || response.data.length === 0) {
        throw new HttpException(
          `Coin '${coinId}' not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      const coin = response.data[0];
      this.logger.log(
        `Successfully fetched price for ${coinId}: $${coin.current_price}`,
      );

      return {
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        current_price: coin.current_price,
        market_cap: coin.market_cap,
        total_volume: coin.total_volume,
        price_change_percentage_24h: coin.price_change_percentage_24h,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to fetch price for ${coinId}: ${errorMessage}`);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new HttpException(
            'Rate limit exceeded. Please try again later.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        if (error.response?.status === 404) {
          throw new HttpException(
            `Coin '${coinId}' not found`,
            HttpStatus.NOT_FOUND,
          );
        }
      }

      throw new HttpException(
        'Failed to fetch price from external API',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
