import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { CoingeckoService } from './coingecko.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CoingeckoService', () => {
  let service: CoingeckoService;
  let mockHttpClient: { get: jest.Mock };

  const mockCoinData = {
    id: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    current_price: 45000,
    market_cap: 850000000000,
    total_volume: 25000000000,
    price_change_percentage_24h: 2.5,
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          'coingecko.baseUrl': 'https://api.coingecko.com/api/v3',
          'coingecko.apiKey': '',
        };
        return config[key];
      }),
    };

    // Mock axios.create to return a mock instance
    mockHttpClient = {
      get: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(
      mockHttpClient as unknown as AxiosInstance,
    );
    mockedAxios.isAxiosError = jest.fn(
      (error): error is axios.AxiosError =>
        typeof error === 'object' &&
        error !== null &&
        'isAxiosError' in error &&
        (error as { isAxiosError: boolean }).isAxiosError === true,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoingeckoService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CoingeckoService>(CoingeckoService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPrice', () => {
    it('should return price data for valid coin', async () => {
      mockHttpClient.get.mockResolvedValue({ data: [mockCoinData] });

      const result = await service.getPrice('bitcoin');

      expect(result).toEqual({
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        current_price: 45000,
        market_cap: 850000000000,
        total_volume: 25000000000,
        price_change_percentage_24h: 2.5,
      });
      expect(mockHttpClient.get).toHaveBeenCalledWith('/coins/markets', {
        params: {
          vs_currency: 'usd',
          ids: 'bitcoin',
          order: 'market_cap_desc',
          per_page: 1,
          page: 1,
          sparkline: false,
          price_change_percentage: '24h',
        },
      });
    });

    it('should throw NOT_FOUND for unknown coin', async () => {
      mockHttpClient.get.mockResolvedValue({ data: [] });

      await expect(service.getPrice('unknowncoin')).rejects.toThrow(
        HttpException,
      );
      await expect(service.getPrice('unknowncoin')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('should throw TOO_MANY_REQUESTS on rate limit', async () => {
      const rateLimitError = {
        isAxiosError: true,
        response: { status: 429 },
        message: 'Rate limited',
      };
      mockHttpClient.get.mockRejectedValue(rateLimitError);

      await expect(service.getPrice('bitcoin')).rejects.toThrow(HttpException);
      await expect(service.getPrice('bitcoin')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it('should throw SERVICE_UNAVAILABLE on network error', async () => {
      const networkError = {
        isAxiosError: true,
        message: 'Network Error',
      };
      mockHttpClient.get.mockRejectedValue(networkError);

      await expect(service.getPrice('bitcoin')).rejects.toThrow(HttpException);
      await expect(service.getPrice('bitcoin')).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    });
  });
});
