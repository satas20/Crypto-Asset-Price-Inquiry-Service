import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Price API (e2e)', () => {
  let app: INestApplication<App>;
  const API_KEY = 'your-secret-api-key';

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('GET /health - should return health status', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', 'ok');
          expect(res.body).toHaveProperty('timestamp');
        });
    });
  });

  describe('Authentication', () => {
    it('GET /v1/price/bitcoin - should require API key', () => {
      return request(app.getHttpServer())
        .get('/v1/price/bitcoin')
        .expect(401)
        .expect((res) => {
          expect(res.body).toHaveProperty('message', 'API key is required');
        });
    });

    it('GET /v1/price/bitcoin - should reject invalid API key', () => {
      return request(app.getHttpServer())
        .get('/v1/price/bitcoin')
        .set('X-API-Key', 'invalid-key')
        .expect(401)
        .expect((res) => {
          expect(res.body).toHaveProperty('message', 'Invalid API key');
        });
    });

    // These tests have longer timeout because of 5-second batching window
    it('GET /v1/price/bitcoin - should accept valid API key in header', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/price/bitcoin')
        .set('X-API-Key', API_KEY);

      // Should not be 401 - either 200 or external API error (503/429)
      expect(res.status).not.toBe(401);
    }, 10000);

    it('GET /v1/price/bitcoin - should accept API key in Authorization header', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/price/bitcoin')
        .set('Authorization', `ApiKey ${API_KEY}`);

      expect(res.status).not.toBe(401);
    }, 10000);

    it('GET /v1/price/bitcoin - should accept API key as query param', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/price/bitcoin')
        .query({ api_key: API_KEY });

      expect(res.status).not.toBe(401);
    }, 10000);
  });

  describe('Price History', () => {
    it('GET /v1/price/:coinId/history - should return paginated results', () => {
      return request(app.getHttpServer())
        .get('/v1/price/bitcoin/history')
        .set('X-API-Key', API_KEY)
        .query({ page: 1, limit: 10 })
        .expect(200)
        .expect(
          (res: {
            body: {
              data: unknown;
              total: number;
              page: number;
              limit: number;
              totalPages: number;
            };
          }) => {
            expect(res.body).toHaveProperty('data');
            expect(res.body).toHaveProperty('total');
            expect(res.body).toHaveProperty('page', 1);
            expect(res.body).toHaveProperty('limit', 10);
            expect(res.body).toHaveProperty('totalPages');
            expect(Array.isArray(res.body.data)).toBe(true);
          },
        );
    });

    it('GET /v1/price/:coinId/history - should validate pagination params', () => {
      return request(app.getHttpServer())
        .get('/v1/price/bitcoin/history')
        .set('X-API-Key', API_KEY)
        .query({ page: 0 }) // Invalid: page should be >= 1
        .expect(400);
    });

    it('GET /v1/price/:coinId/history - should limit max items per page', () => {
      return request(app.getHttpServer())
        .get('/v1/price/bitcoin/history')
        .set('X-API-Key', API_KEY)
        .query({ limit: 200 }) // Invalid: max is 100
        .expect(400);
    });
  });
});
