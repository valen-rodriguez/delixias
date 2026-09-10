import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiResponse } from '../types/api-response.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
      HttpExceptionFilter.name,
    );

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno del servidor';
    let error = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const body = exResponse as Record<string, unknown>;

        if (typeof body.message === 'string') {
          message = body.message;
        } else if (Array.isArray(body.message)) {
          message = body.message.join('; ');
        }

        if (typeof body.error === 'string') {
          error = body.error.toUpperCase().replace(/\s+/g, '_');
        }
      }

      error = this.mapStatusToErrorCode(status, error);
    }

    const body: ApiResponse<null> = {
      data: null,
      error,
      message,
    };

    response.status(status).json(body);
  }

  private mapStatusToErrorCode(status: number, fallback: string): string {
    switch (status) {
      case 400:
        return 'VALIDATION_ERROR';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return fallback === 'FORBIDDEN' ? 'CONFLICT' : fallback;
      default:
        return fallback;
    }
  }
}
