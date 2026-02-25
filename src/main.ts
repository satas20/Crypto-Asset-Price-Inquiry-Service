import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Use Pino logger
  app.useLogger(app.get(Logger));

  // Validation pipe for DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable CORS
  app.enableCors();

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Monetari Crypto Price API')
    .setDescription(
      'Cryptocurrency price inquiry service with request batching.\n\n' +
        '## Features\n' +
        '- **Request Batching**: Multiple requests for the same coin are batched together\n' +
        '- **5-second Window**: Requests are held for up to 5 seconds before calling external API\n' +
        '- **Threshold Trigger**: If 3 requests are pending, API is called immediately\n' +
        '- **Price History**: Query historical price records with pagination\n\n' +
        '## Authentication\n' +
        'All endpoints require an API key. Provide it via:\n' +
        '- Header: `X-API-Key: your-api-key`\n' +
        '- Header: `Authorization: ApiKey your-api-key`\n' +
        '- Query: `?api_key=your-api-key`',
    )
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API key for authentication',
      },
      'api-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 Monetari Crypto Price API                               ║
║                                                              ║
║   Server:    http://localhost:${port}                          ║
║   Swagger:   http://localhost:${port}/api                      ║
║   Health:    http://localhost:${port}/health                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
}
void bootstrap();
