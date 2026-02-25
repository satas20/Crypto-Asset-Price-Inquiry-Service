import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  RequestBatcherService,
  BatchedPriceResult,
} from './request-batcher.service';
import { CoingeckoService, CoinGeckoPrice } from './coingecko.service';
import { PriceRecord } from '../entities/price-record.entity';

describe('RequestBatcherService', () => {
  let service: RequestBatcherService;
  let mockGetPrice: jest.Mock;
  let mockSave: jest.Mock;
  let mockCreate: jest.Mock;

  const mockPrice: CoinGeckoPrice = {
    id: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    current_price: 45000,
    market_cap: 850000000000,
    total_volume: 25000000000,
    price_change_percentage_24h: 2.5,
  };

  const mockSavedRecord = {
    id: 'test-uuid',
    coinId: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    priceUsd: 45000,
    marketCap: 850000000000,
    volume24h: 25000000000,
    priceChangePercentage24h: 2.5,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };

  // Expected result includes savedAt from the saved record
  const expectedResult: BatchedPriceResult = {
    ...mockPrice,
    savedAt: mockSavedRecord.createdAt,
  };

  // Use shorter timeout for tests
  const TEST_TIMEOUT_MS = 100;
  const TEST_THRESHOLD = 3;

  beforeEach(async () => {
    jest.useFakeTimers();

    mockGetPrice = jest.fn();
    const mockCoingeckoService = {
      getPrice: mockGetPrice,
    };

    mockSave = jest.fn().mockResolvedValue(mockSavedRecord);
    mockCreate = jest.fn().mockReturnValue(mockSavedRecord);
    const mockRepository = {
      create: mockCreate,
      save: mockSave,
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, unknown> = {
          'batching.timeoutMs': TEST_TIMEOUT_MS,
          'batching.threshold': TEST_THRESHOLD,
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestBatcherService,
        { provide: CoingeckoService, useValue: mockCoingeckoService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRepositoryToken(PriceRecord), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<RequestBatcherService>(RequestBatcherService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Request Batching', () => {
    it('should create a new batch for first request', async () => {
      mockGetPrice.mockResolvedValue(mockPrice);

      const promise = service.getPrice('bitcoin');
      const status = service.getBatchStatus('bitcoin');

      expect(status.exists).toBe(true);
      expect(status.requestCount).toBe(1);

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(TEST_TIMEOUT_MS);

      await expect(promise).resolves.toEqual(expectedResult);
      expect(mockGetPrice).toHaveBeenCalledTimes(1);
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('should batch multiple requests for the same coin', async () => {
      mockGetPrice.mockResolvedValue(mockPrice);

      const promise1 = service.getPrice('bitcoin');
      const promise2 = service.getPrice('bitcoin');

      const status = service.getBatchStatus('bitcoin');
      expect(status.requestCount).toBe(2);

      jest.advanceTimersByTime(TEST_TIMEOUT_MS);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual(expectedResult);
      expect(result2).toEqual(expectedResult);
      // Should only call API once for both requests
      expect(mockGetPrice).toHaveBeenCalledTimes(1);
      // Should only save to DB once
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('should trigger early when threshold is reached', async () => {
      mockGetPrice.mockResolvedValue(mockPrice);

      // Create 3 requests (threshold)
      const promise1 = service.getPrice('bitcoin');
      const promise2 = service.getPrice('bitcoin');
      const promise3 = service.getPrice('bitcoin');

      // After threshold, batch should be processed immediately
      // No need to advance timers

      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      expect(result1).toEqual(expectedResult);
      expect(result2).toEqual(expectedResult);
      expect(result3).toEqual(expectedResult);
      expect(mockGetPrice).toHaveBeenCalledTimes(1);
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('should handle different coins separately', async () => {
      const ethPrice: CoinGeckoPrice = {
        ...mockPrice,
        id: 'ethereum',
        symbol: 'eth',
        name: 'Ethereum',
        current_price: 3000,
      };

      const ethSavedRecord = {
        ...mockSavedRecord,
        coinId: 'ethereum',
        symbol: 'eth',
        name: 'Ethereum',
        priceUsd: 3000,
      };

      mockGetPrice
        .mockResolvedValueOnce(mockPrice)
        .mockResolvedValueOnce(ethPrice);

      mockSave
        .mockResolvedValueOnce(mockSavedRecord)
        .mockResolvedValueOnce(ethSavedRecord);

      const btcPromise = service.getPrice('bitcoin');
      const ethPromise = service.getPrice('ethereum');

      expect(service.getBatchStatus('bitcoin').exists).toBe(true);
      expect(service.getBatchStatus('ethereum').exists).toBe(true);

      jest.advanceTimersByTime(TEST_TIMEOUT_MS);

      const [btcResult, ethResult] = await Promise.all([
        btcPromise,
        ethPromise,
      ]);

      expect(btcResult.id).toBe('bitcoin');
      expect(ethResult.id).toBe('ethereum');
      expect(mockGetPrice).toHaveBeenCalledTimes(2);
      expect(mockSave).toHaveBeenCalledTimes(2);
    });

    it('should normalize coin IDs to lowercase', async () => {
      mockGetPrice.mockResolvedValue(mockPrice);

      const promise1 = service.getPrice('Bitcoin');
      const promise2 = service.getPrice('BITCOIN');
      const promise3 = service.getPrice('bitcoin');

      // Should all be in the same batch (threshold reached, immediate trigger)
      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      expect(result1).toEqual(expectedResult);
      expect(result2).toEqual(expectedResult);
      expect(result3).toEqual(expectedResult);
      expect(mockGetPrice).toHaveBeenCalledTimes(1);
      expect(mockGetPrice).toHaveBeenCalledWith('bitcoin');
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('should reject all requests when API call fails', async () => {
      const error = new Error('API Error');
      mockGetPrice.mockRejectedValue(error);

      // Create 3 requests (threshold) to trigger immediately
      const promise1 = service.getPrice('bitcoin');
      const promise2 = service.getPrice('bitcoin');
      const promise3 = service.getPrice('bitcoin');

      await expect(promise1).rejects.toThrow('API Error');
      await expect(promise2).rejects.toThrow('API Error');
      await expect(promise3).rejects.toThrow('API Error');
      // Should not save to DB on error
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should allow new batch after previous batch completes', async () => {
      mockGetPrice.mockResolvedValue(mockPrice);

      // First batch with threshold
      const batch1Promise1 = service.getPrice('bitcoin');
      const batch1Promise2 = service.getPrice('bitcoin');
      const batch1Promise3 = service.getPrice('bitcoin');

      await Promise.all([batch1Promise1, batch1Promise2, batch1Promise3]);

      // Start new batch
      const batch2Promise = service.getPrice('bitcoin');

      expect(service.getBatchStatus('bitcoin').exists).toBe(true);
      expect(service.getBatchStatus('bitcoin').requestCount).toBe(1);

      jest.advanceTimersByTime(TEST_TIMEOUT_MS);

      await expect(batch2Promise).resolves.toEqual(expectedResult);
      expect(mockGetPrice).toHaveBeenCalledTimes(2);
      expect(mockSave).toHaveBeenCalledTimes(2);
    });
  });

  describe('getBatchStatus', () => {
    it('should return exists: false for non-existent batch', () => {
      const status = service.getBatchStatus('nonexistent');
      expect(status.exists).toBe(false);
      expect(status.requestCount).toBeUndefined();
    });

    it('should return correct status for existing batch', () => {
      mockGetPrice.mockResolvedValue(mockPrice);

      void service.getPrice('bitcoin');
      void service.getPrice('bitcoin');

      const status = service.getBatchStatus('bitcoin');
      expect(status.exists).toBe(true);
      expect(status.requestCount).toBe(2);
      expect(status.waitingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear all pending timers', () => {
      mockGetPrice.mockResolvedValue(mockPrice);

      // Create batches
      void service.getPrice('bitcoin');
      void service.getPrice('ethereum');

      expect(service.getBatchStatus('bitcoin').exists).toBe(true);
      expect(service.getBatchStatus('ethereum').exists).toBe(true);

      // Destroy module
      service.onModuleDestroy();

      // Batches should be cleared
      expect(service.getBatchStatus('bitcoin').exists).toBe(false);
      expect(service.getBatchStatus('ethereum').exists).toBe(false);
    });
  });
});
