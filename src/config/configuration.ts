export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'monetari',
    password: process.env.DATABASE_PASSWORD || 'monetari_secret',
    database: process.env.DATABASE_NAME || 'monetari',
  },
  apiKey: process.env.API_KEY || 'your-secret-api-key',
  coingecko: {
    apiKey: process.env.COINGECKO_API_KEY || '',
    baseUrl: 'https://api.coingecko.com/api/v3',
  },
  batching: {
    timeoutMs: parseInt(process.env.BATCH_TIMEOUT_MS || '5000', 10), // 5 seconds default
    threshold: parseInt(process.env.BATCH_THRESHOLD || '3', 10), // Number of requests before early trigger
  },
});
