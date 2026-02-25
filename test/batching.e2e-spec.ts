import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import nock from 'nock';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { PriceRecord } from './../src/price/entities/price-record.entity';

// Type for price response body
interface PriceResponseBody {
  coinId: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCap: number;
  volume24h: number;
  priceChangePercentage24h: number;
  timestamp: string;
}

/**
 * These tests verify the core batching logic:
 * 1. Single request waits ~5 seconds (configured to 500ms for tests)
 * 2. Multiple requests batch together and resolve simultaneously
 * 3. Threshold (3 requests) triggers early processing
 * 4. Overflow requests start a new batch
 * 5. Different coins have independent queues
 * 6. Only one DB record per batch
 * 7. Error handling propagates to all batched requests
 */
describe('Request Batching (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const API_KEY = 'your-secret-api-key';
  const BATCH_TIMEOUT_MS = 500; // Short timeout for fast tests

  // Mock CoinGecko /coins/markets response format
  const mockBitcoinResponse = [
    {
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
      current_price: 68500,
      market_cap: 1350000000000,
      total_volume: 45000000000,
      price_change_percentage_24h: 2.5,
    },
  ];

  const mockEthereumResponse = [
    {
      id: 'ethereum',
      symbol: 'eth',
      name: 'Ethereum',
      current_price: 3500,
      market_cap: 420000000000,
      total_volume: 15000000000,
      price_change_percentage_24h: 1.8,
    },
  ];

  beforeAll(async () => {
    // Set short batch timeout for tests
    process.env.BATCH_TIMEOUT_MS = BATCH_TIMEOUT_MS.toString();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    nock.cleanAll();
    nock.restore();
    await app.close();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await dataSource.getRepository(PriceRecord).clear();
    // Clean up any pending nock interceptors
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('1. Single Request Timing', () => {
    it('should wait for batch timeout before responding', async () => {
      // Mock CoinGecko API - /coins/markets endpoint
      nock('https://api.coingecko.com')
        .get('/api/v3/coins/markets')
        .query(true)
        .reply(200, mockBitcoinResponse);

      const startTime = Date.now();

      const response = await request(app.getHttpServer())
        .get('/v1/price/bitcoin')
        .set('X-API-Key', API_KEY);

      const elapsed = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('coinId', 'bitcoin');
      expect(response.body).toHaveProperty('priceUsd', 68500);

      // Should have waited approximately BATCH_TIMEOUT_MS
      // Allow some tolerance (100ms for processing)
      expect(elapsed).toBeGreaterThanOrEqual(BATCH_TIMEOUT_MS - 50);
      expect(elapsed).toBeLessThan(BATCH_TIMEOUT_MS + 200);
    });
  });

  describe('2. Time-Based Batching (2 Requests)', () => {
    it('should batch two requests and make only one API call', async () => {
      // Track API calls
      let apiCallCount = 0;
      nock('https://api.coingecko.com')
        .get('/api/v3/coins/markets')
        .query(true)
        .reply(200, () => {
          apiCallCount++;
          return mockBitcoinResponse;
        });

      const startTime = Date.now();

      // Fire two requests simultaneously
      const [response1, response2] = await Promise.all([
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
      ]);

      const elapsed = Date.now() - startTime;

      // Both should succeed
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Both should have the same price
      expect((response1.body as PriceResponseBody).priceUsd).toBe(68500);
      expect((response2.body as PriceResponseBody).priceUsd).toBe(68500);

      // Should still wait for timeout (2 requests < threshold of 3)
      expect(elapsed).toBeGreaterThanOrEqual(BATCH_TIMEOUT_MS - 50);

      // Only one API call should have been made
      expect(apiCallCount).toBe(1);
    });
  });

  describe('3. Threshold Trigger (3 Requests - Early Return)', () => {
    it('should trigger immediately when threshold is reached', async () => {
      let apiCallCount = 0;
      nock('https://api.coingecko.com')
        .get('/api/v3/coins/markets')
        .query(true)
        .reply(200, () => {
          apiCallCount++;
          return mockBitcoinResponse;
        });

      const startTime = Date.now();

      // Fire three requests simultaneously (reaches threshold)
      const responses = await Promise.all([
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
      ]);

      const elapsed = Date.now() - startTime;

      // All should succeed
      responses.forEach((res) => {
        expect(res.status).toBe(200);
        expect((res.body as PriceResponseBody).priceUsd).toBe(68500);
      });

      // Should return MUCH faster than timeout (threshold triggered early)
      // Allow generous margin for slow CI environments
      expect(elapsed).toBeLessThan(BATCH_TIMEOUT_MS - 100);

      // Only one API call
      expect(apiCallCount).toBe(1);
    });
  });

  describe('4. Overflow Batch (4+ Requests)', () => {
    it('should process first 3 immediately and start new batch for 4th', async () => {
      let apiCallCount = 0;

      // Set up two interceptors since we expect two API calls
      nock('https://api.coingecko.com')
        .get('/api/v3/coins/markets')
        .query(true)
        .times(2)
        .reply(200, () => {
          apiCallCount++;
          return mockBitcoinResponse;
        });

      const startTime = Date.now();

      // Fire four requests simultaneously
      const responses = await Promise.all([
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
      ]);

      const elapsed = Date.now() - startTime;

      // All should succeed
      responses.forEach((res) => {
        expect(res.status).toBe(200);
        expect((res.body as PriceResponseBody).priceUsd).toBe(68500);
      });

      // The 4th request should wait for the full timeout
      // So total time should be at least BATCH_TIMEOUT_MS
      expect(elapsed).toBeGreaterThanOrEqual(BATCH_TIMEOUT_MS - 50);

      // Two API calls should have been made (one for first batch, one for overflow)
      expect(apiCallCount).toBe(2);
    });
  });

  describe('5. Independent Coin Queues', () => {
    it('should process different coins independently', async () => {
      let bitcoinCalls = 0;
      let ethereumCalls = 0;

      // Mock both coin endpoints
      nock('https://api.coingecko.com')
        .get('/api/v3/coins/markets')
        .query((query) => query.ids === 'bitcoin')
        .reply(200, () => {
          bitcoinCalls++;
          return mockBitcoinResponse;
        });

      nock('https://api.coingecko.com')
        .get('/api/v3/coins/markets')
        .query((query) => query.ids === 'ethereum')
        .reply(200, () => {
          ethereumCalls++;
          return mockEthereumResponse;
        });

      // Fire one request for each coin
      const [bitcoinRes, ethereumRes] = await Promise.all([
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/ethereum')
          .set('X-API-Key', API_KEY),
      ]);

      // Both should succeed with correct prices
      expect(bitcoinRes.status).toBe(200);
      expect((bitcoinRes.body as PriceResponseBody).priceUsd).toBe(68500);

      expect(ethereumRes.status).toBe(200);
      expect((ethereumRes.body as PriceResponseBody).priceUsd).toBe(3500);

      // Each coin should have made exactly one API call
      expect(bitcoinCalls).toBe(1);
      expect(ethereumCalls).toBe(1);
    });
  });

  describe('6. Database Record Per Batch', () => {
    it('should create only one DB record for 3 batched requests', async () => {
      nock('https://api.coingecko.com')
        .get('/api/v3/coins/markets')
        .query(true)
        .reply(200, mockBitcoinResponse);

      // Count records before
      const beforeCount = await dataSource
        .getRepository(PriceRecord)
        .count({ where: { coinId: 'bitcoin' } });

      // Fire 3 requests (threshold)
      await Promise.all([
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
      ]);

      // Count records after
      const afterCount = await dataSource
        .getRepository(PriceRecord)
        .count({ where: { coinId: 'bitcoin' } });

      // Should have added exactly 1 record
      expect(afterCount - beforeCount).toBe(1);

      // Verify the record has correct data
      const record = await dataSource.getRepository(PriceRecord).findOne({
        where: { coinId: 'bitcoin' },
        order: { createdAt: 'DESC' },
      });

      expect(record).toBeDefined();
      expect(Number(record!.priceUsd)).toBe(68500);
      expect(record!.symbol).toBe('btc');
    });
  });

  describe('7. Error Handling', () => {
    it('should propagate errors to all batched requests', async () => {
      // Mock CoinGecko returning empty array for invalid coin (404 scenario)
      nock('https://api.coingecko.com')
        .get('/api/v3/coins/markets')
        .query(true)
        .reply(200, []); // Empty array = coin not found

      // Count records before
      const beforeCount = await dataSource
        .getRepository(PriceRecord)
        .count({ where: { coinId: 'fakecoin123' } });

      // Fire 3 requests for invalid coin
      const responses = await Promise.all([
        request(app.getHttpServer())
          .get('/v1/price/fakecoin123')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/fakecoin123')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/fakecoin123')
          .set('X-API-Key', API_KEY),
      ]);

      // All should receive error response (404)
      responses.forEach((res) => {
        expect(res.status).toBe(404);
      });

      // Count records after
      const afterCount = await dataSource
        .getRepository(PriceRecord)
        .count({ where: { coinId: 'fakecoin123' } });

      // No records should have been created
      expect(afterCount).toBe(beforeCount);
    });

    it('should handle rate limiting gracefully', async () => {
      // Mock CoinGecko returning 429 (rate limited)
      nock('https://api.coingecko.com')
        .get('/api/v3/coins/markets')
        .query(true)
        .reply(429, { error: 'rate limited' });

      const responses = await Promise.all([
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
        request(app.getHttpServer())
          .get('/v1/price/bitcoin')
          .set('X-API-Key', API_KEY),
      ]);

      // All should receive 429 error
      responses.forEach((res) => {
        expect(res.status).toBe(429);
      });
    });
  });

  describe('8. Authentication Before Batching', () => {
    it('should reject unauthenticated requests before hitting batch queue', async () => {
      // This interceptor should NOT be called
      const scope = nock('https://api.coingecko.com')
        .get('/api/v3/coins/markets')
        .query(true)
        .reply(200, mockBitcoinResponse);

      const startTime = Date.now();

      const response = await request(app.getHttpServer()).get(
        '/v1/price/bitcoin',
      );
      // No API key

      const elapsed = Date.now() - startTime;

      // Should return 401 immediately
      expect(response.status).toBe(401);

      // Should be fast (no batching wait)
      expect(elapsed).toBeLessThan(100);

      // API should NOT have been called
      expect(scope.isDone()).toBe(false);
    });
  });
});
