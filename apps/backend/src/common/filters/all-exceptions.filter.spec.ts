import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ArgumentsHost } from '@nestjs/common';

interface MockResponse {
  status: jest.Mock;
  json?: jest.Mock;
}

function makeHost(path = '/api/test'): { host: ArgumentsHost; getMockResponse: () => MockResponse } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const getRequest = jest.fn().mockReturnValue({ url: path });
  const getResponse = jest.fn().mockReturnValue({ status });
  const switchToHttp = jest.fn().mockReturnValue({ getRequest, getResponse });
  const host = { switchToHttp } as unknown as ArgumentsHost;
  const getMockResponse = (): MockResponse => ({ status, json });
  return { host, getMockResponse };
}

function getResponseBody(statusMock: jest.Mock): Record<string, unknown> {
  const result = statusMock.mock.results[0];
  if (!result) throw new Error('status() was not called');
  const jsonMock = (result as { value: { json: jest.Mock } }).value.json;
  const call = jsonMock.mock.calls[0];
  if (!call) throw new Error('json() was not called');
  return (call as [Record<string, unknown>])[0];
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('preserves HttpException status and message', () => {
    const { host, getMockResponse } = makeHost();
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);
    filter.catch(exception, host);

    const { status } = getMockResponse();
    expect(status).toHaveBeenCalledWith(404);
    const body = getResponseBody(status);
    expect(body.statusCode).toBe(404);
    expect(body.message).toContain('Not Found');
  });

  it('returns 429 with retryAfter for ThrottlerException', () => {
    const { host, getMockResponse } = makeHost();
    const exception = new ThrottlerException('Too Many Requests');
    filter.catch(exception, host);

    const { status } = getMockResponse();
    expect(status).toHaveBeenCalledWith(429);
    const body = getResponseBody(status);
    expect(body.statusCode).toBe(429);
    expect(body).toHaveProperty('retryAfter');
  });

  it('returns 500 with generic message for unknown errors', () => {
    const { host, getMockResponse } = makeHost();
    const exception = new Error('Database connection failed');
    filter.catch(exception, host);

    const { status } = getMockResponse();
    expect(status).toHaveBeenCalledWith(500);
    const body = getResponseBody(status);
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    // CRITICAL: must NOT leak the real error message
    expect(JSON.stringify(body)).not.toContain('Database connection failed');
  });

  it('does not include stack trace in response', () => {
    const { host, getMockResponse } = makeHost();
    const exception = new Error('Some internal error');
    filter.catch(exception, host);

    const { status } = getMockResponse();
    const body = getResponseBody(status);
    expect(body).not.toHaveProperty('stack');
  });
});
