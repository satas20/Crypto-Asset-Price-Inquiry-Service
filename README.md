# Monetari Crypto Price API

A cryptocurrency price inquiry service built with NestJS that implements request batching to optimize external API calls.

## Features

- **Request Batching**: Multiple requests for the same coin are batched together
- **5-second Window**: Requests are held for up to 5 seconds before calling external API
- **Threshold Trigger**: If 3 requests are pending, API is called immediately
- **Price History**: Query historical price records with pagination
- **API Key Authentication**: Secure endpoints with API key
- **Swagger Documentation**: Interactive API documentation
- **Structured Logging**: JSON logging with Pino
- **Docker Support**: Full containerization with docker-compose

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | NestJS |
| Database | PostgreSQL + TypeORM |
| API Docs | Swagger/OpenAPI |
| Logging | Pino |
| Auth | API Key |
| Testing | Jest |
| Container | Docker + docker-compose |
| External API | CoinGecko |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- npm

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/satas20/Crypto-Asset-Price-Inquiry-Service.git
   cd Crypto-Asset-Price-Inquiry-Service
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

4. **Start PostgreSQL with Docker**
   ```bash
   docker-compose up -d postgres
   ```

5. **Run in development mode**
   ```bash
   npm run start:dev
   ```

6. **Access the application**
   - API: http://localhost:3000
   - Swagger Docs: http://localhost:3000/api
   - Health Check: http://localhost:3000/health

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_USER` | PostgreSQL user | `monetari` |
| `DATABASE_PASSWORD` | PostgreSQL password | `monetari_secret` |
| `DATABASE_NAME` | PostgreSQL database | `monetari` |
| `PORT` | Application port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `API_KEY` | API key for authentication | `your-secret-api-key` |
| `COINGECKO_API_KEY` | CoinGecko API key (optional) | `` |

## API Endpoints

### Get Current Price
```http
GET /v1/price/:coinId
X-API-Key: your-secret-api-key
```

**Example:**
```bash
curl -H "X-API-Key: your-secret-api-key" http://localhost:3000/v1/price/bitcoin
```

**Response:**
```json
{
  "coinId": "bitcoin",
  "symbol": "btc",
  "name": "Bitcoin",
  "priceUsd": 45000.50,
  "marketCap": 850000000000,
  "volume24h": 25000000000,
  "priceChangePercentage24h": 2.5,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Get Price History
```http
GET /v1/price/:coinId/history?page=1&limit=20
X-API-Key: your-secret-api-key
```

**Example:**
```bash
curl -H "X-API-Key: your-secret-api-key" "http://localhost:3000/v1/price/bitcoin/history?page=1&limit=10"
```

**Response:**
```json
{
  "data": [
    {
      "coinId": "bitcoin",
      "symbol": "btc",
      "name": "Bitcoin",
      "priceUsd": 45000.50,
      "marketCap": 850000000000,
      "volume24h": 25000000000,
      "priceChangePercentage24h": 2.5,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 10,
  "totalPages": 10
}
```

### Health Check
```http
GET /health
```

## Authentication

All price endpoints require an API key. You can provide it in three ways:

1. **Header (Recommended)**
   ```
   X-API-Key: your-secret-api-key
   ```

2. **Authorization Header**
   ```
   Authorization: ApiKey your-secret-api-key
   ```

3. **Query Parameter**
   ```
   ?api_key=your-secret-api-key
   ```

## Request Batching Logic

The service implements smart request batching to reduce external API calls:

```
┌─────────────────────────────────────────────────────────────┐
│                    Request Flow                             │
├─────────────────────────────────────────────────────────────┤
│  Request 1 (BTC) ──┐                                        │
│  Request 2 (BTC) ──┼──► Batch Queue (BTC)                   │
│  Request 3 (BTC) ──┘         │                              │
│                              ▼                              │
│                    ┌─────────────────┐                      │
│                    │ Check Threshold │                      │
│                    └────────┬────────┘                      │
│                             │                               │
│            ┌────────────────┼────────────────┐              │
│            ▼                                 ▼              │
│   [Count >= 3?]                    [5 sec timer expired?]   │
│        │                                     │              │
│        └──────────────┬──────────────────────┘              │
│                       ▼                                     │
│              Call CoinGecko API                             │
│                       │                                     │
│                       ▼                                     │
│              Save to Database                               │
│                       │                                     │
│                       ▼                                     │
│           Resolve all pending promises                      │
└─────────────────────────────────────────────────────────────┘
```

1. First request for a coin creates a new batch with a 5-second timer
2. Subsequent requests for the same coin are added to the batch
3. When either condition is met:
   - 5 seconds elapsed, OR
   - 3 requests are pending (threshold)
4. External API is called once, and all pending requests receive the same response

## Docker

### Development (PostgreSQL only)
```bash
docker-compose up -d postgres
npm run start:dev
```

### Production (Full stack)
```bash
docker-compose up -d
```

### Build and run manually
```bash
docker build -t monetari-app .
docker run -p 3000:3000 --env-file .env monetari-app
```

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Project Structure

```
src/
├── app.module.ts              # Root module
├── main.ts                    # Application entry point
├── config/
│   └── configuration.ts       # Configuration settings
├── common/
│   └── guards/
│       └── api-key.guard.ts   # API key authentication
├── price/
│   ├── price.module.ts        # Price feature module
│   ├── price.controller.ts    # API endpoints
│   ├── price.service.ts       # Business logic
│   ├── entities/
│   │   └── price-record.entity.ts  # Database entity
│   ├── dto/
│   │   ├── price-response.dto.ts
│   │   └── price-history.dto.ts
│   └── services/
│       ├── coingecko.service.ts       # External API client
│       └── request-batcher.service.ts # Batching logic
└── health/
    └── health.controller.ts   # Health check endpoint
```

## Production Considerations

This implementation prioritizes simplicity for demonstration purposes. For a production deployment, here are the first steps to consider:

### Database Migrations

Currently uses `synchronize: true` for convenience. Production must use TypeORM migrations to prevent accidental data loss.

### Redis Integration

Redis is a perfect fit for this type of service, addressing multiple concerns:

1. **Distributed Batching**: Current batching is per-instance (in-memory). With horizontal scaling, multiple containers could hit CoinGecko simultaneously for the same coin. Redis distributed locks (e.g., Redlock) ensure only one instance fetches from the external API.

2. **Caching Layer**: Cache price responses to reduce external API calls and improve response times for frequently requested coins.

### Resilience & Protection

- **Stale-While-Revalidate**: On external API failure or rate limit, return the latest price from database history instead of a hard error.
- **Rate Limiting**: Add request throttling (e.g., `@nestjs/throttler`) to protect against abuse.

---

*Also check out my [Spring Boot version](https://github.com/satas20/CryptoPriceTrackerApp) - a similar crypto price tracker I built during the last halving!* 🚀

## License

MIT
