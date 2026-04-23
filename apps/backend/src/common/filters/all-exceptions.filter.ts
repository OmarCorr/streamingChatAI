import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const timestamp = new Date().toISOString();
    const path = request.url;

    if (exception instanceof ThrottlerException) {
      response.status(429).json({
        statusCode: 429,
        message: 'Too many requests — slow down a bit.',
        retryAfter: 60,
        timestamp,
        path,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as Record<string, unknown>).message ?? exception.message;

      response.status(status).json({
        statusCode: status,
        message,
        timestamp,
        path,
      });
      return;
    }

    // Unknown error — log real message, return generic to client
    this.logger.error(
      `Unhandled exception at ${path}: ${(exception as Error)?.message ?? String(exception)}`,
      (exception as Error)?.stack,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: 'Internal server error',
      timestamp,
      path,
    });
  }
}
