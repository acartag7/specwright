/**
 * Tests for review.ts pure functions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectRateLimit,
  classifyError,
  retryWithBackoff,
  type ErrorType,
} from '../review';

describe('detectRateLimit', () => {
  it('returns false for null/undefined', () => {
    expect(detectRateLimit(null)).toBe(false);
    expect(detectRateLimit(undefined)).toBe(false);
  });

  it('detects rate limit in Error message', () => {
    expect(detectRateLimit(new Error('Rate limit exceeded'))).toBe(true);
    expect(detectRateLimit(new Error('Error 429: Too many requests'))).toBe(true);
    expect(detectRateLimit(new Error('rate limit reached'))).toBe(true);
  });

  it('detects rate limit in Error with status property', () => {
    const error = new Error('Request failed') as Error & { status: number };
    error.status = 429;
    expect(detectRateLimit(error)).toBe(true);
  });

  it('detects rate limit in string errors', () => {
    expect(detectRateLimit('Rate limit exceeded')).toBe(true);
    expect(detectRateLimit('429 Too Many Requests')).toBe(true);
    expect(detectRateLimit('rate limit')).toBe(true);
  });

  it('detects rate limit in objects with status', () => {
    expect(detectRateLimit({ status: 429 })).toBe(true);
    expect(detectRateLimit({ statusCode: 429 })).toBe(true);
    expect(detectRateLimit({ message: 'Rate limit exceeded' })).toBe(true);
  });

  it('returns false for non-rate-limit errors', () => {
    expect(detectRateLimit(new Error('Connection timeout'))).toBe(false);
    expect(detectRateLimit(new Error('Parse error'))).toBe(false);
    expect(detectRateLimit({ status: 500 })).toBe(false);
    expect(detectRateLimit('Server error')).toBe(false);
  });
});

describe('classifyError', () => {
  it('returns unknown for null/undefined', () => {
    expect(classifyError(null)).toBe('unknown');
    expect(classifyError(undefined)).toBe('unknown');
  });

  it('classifies rate limit errors', () => {
    expect(classifyError(new Error('Rate limit exceeded'))).toBe('rate_limit');
    expect(classifyError(new Error('429 error'))).toBe('rate_limit');
    expect(classifyError('rate limit')).toBe('rate_limit');
  });

  it('classifies timeout errors', () => {
    expect(classifyError(new Error('Connection timeout'))).toBe('timeout');
    expect(classifyError(new Error('Request timed out'))).toBe('timeout');
    expect(classifyError(new Error('ETIMEDOUT'))).toBe('timeout');
    expect(classifyError('timeout')).toBe('timeout');
  });

  it('classifies parse errors', () => {
    expect(classifyError(new Error('JSON parse error'))).toBe('parse_error');
    expect(classifyError(new Error('Unexpected token'))).toBe('parse_error');
    expect(classifyError(new Error('Syntax error in response'))).toBe('parse_error');
    expect(classifyError('parse failed')).toBe('parse_error');
  });

  it('classifies unknown errors', () => {
    expect(classifyError(new Error('Something went wrong'))).toBe('unknown');
    expect(classifyError('generic error')).toBe('unknown');
    expect(classifyError({ code: 'UNKNOWN' })).toBe('unknown');
  });

  it('handles objects with message property', () => {
    expect(classifyError({ message: 'Rate limit exceeded' })).toBe('rate_limit');
    expect(classifyError({ message: 'Connection timeout' })).toBe('timeout');
    expect(classifyError({ message: 'JSON parse error' })).toBe('parse_error');
  });
});

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const resultPromise = retryWithBackoff(fn, {
      maxRetries: 3,
      backoffMs: 1000,
    });

    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on rate limit errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockRejectedValueOnce(new Error('429 too many requests'))
      .mockResolvedValue('success');

    const onRetry = vi.fn();

    const resultPromise = retryWithBackoff(fn, {
      maxRetries: 3,
      backoffMs: 1000,
      onRetry,
    });

    // First retry after 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // Second retry after 2000ms (exponential backoff)
    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error));
  });

  it('throws immediately for non-rate-limit errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Connection timeout'));

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, backoffMs: 1000 })
    ).rejects.toThrow('Connection timeout');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries exhausted', async () => {
    // Use real timers for this test to avoid unhandled rejection issues
    vi.useRealTimers();

    const fn = vi.fn().mockRejectedValue(new Error('Rate limit exceeded'));
    const onRetry = vi.fn();

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 2,
        backoffMs: 1, // Use 1ms for fast test
        onRetry,
      })
    ).rejects.toThrow('Rate limit exceeded');

    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    expect(onRetry).toHaveBeenCalledTimes(2);

    // Restore fake timers for other tests
    vi.useFakeTimers();
  });

  it('uses exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Rate limit'))
      .mockRejectedValueOnce(new Error('Rate limit'))
      .mockRejectedValueOnce(new Error('Rate limit'))
      .mockResolvedValue('success');

    const resultPromise = retryWithBackoff(fn, {
      maxRetries: 3,
      backoffMs: 100,
    });

    // First backoff: 100ms * 2^0 = 100ms
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);

    // Second backoff: 100ms * 2^1 = 200ms
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);

    // Third backoff: 100ms * 2^2 = 400ms
    await vi.advanceTimersByTimeAsync(400);
    expect(fn).toHaveBeenCalledTimes(4);

    const result = await resultPromise;
    expect(result).toBe('success');
  });

  it('works without onRetry callback', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Rate limit'))
      .mockResolvedValue('success');

    const resultPromise = retryWithBackoff(fn, {
      maxRetries: 1,
      backoffMs: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    const result = await resultPromise;

    expect(result).toBe('success');
  });
});
