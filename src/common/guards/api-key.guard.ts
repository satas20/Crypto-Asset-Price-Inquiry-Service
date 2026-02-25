import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey =
      this.configService.get<string>('apiKey') || 'your-secret-api-key';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedApiKey = this.extractApiKey(request);

    if (!providedApiKey) {
      this.logger.warn('API key missing from request');
      throw new UnauthorizedException('API key is required');
    }

    if (providedApiKey !== this.apiKey) {
      this.logger.warn('Invalid API key provided');
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }

  private extractApiKey(request: Request): string | undefined {
    // Check X-API-Key header first
    const headerKey = request.headers['x-api-key'];
    if (headerKey && typeof headerKey === 'string') {
      return headerKey;
    }

    // Check Authorization header with ApiKey prefix
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string') {
      const [type, key] = authHeader.split(' ');
      if (type === 'ApiKey' && key) {
        return key;
      }
    }

    // Check query parameter as fallback
    const queryKey = request.query['api_key'];
    if (queryKey && typeof queryKey === 'string') {
      return queryKey;
    }

    return undefined;
  }
}
