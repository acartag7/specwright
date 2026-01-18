/**
 * Review Library - Pure functions for review logic
 *
 * This module contains pure functions (no side effects, no DB, no Claude calls)
 * for review-related operations. These are designed to be easily testable.
 */

// ============================================================================
// Types
// ============================================================================

export type ReviewStatus = 'pending' | 'reviewing' | 'pass' | 'fail' | 'needs_fix' | 'error' | 'skipped';

export type ErrorType = 'rate_limit' | 'timeout' | 'parse_error' | 'unknown';

export interface ChunkReviewResult {
  status: 'pass' | 'fail' | 'needs_fix' | 'error';
  feedback?: string;
  fixChunk?: { title: string; description: string };
  error?: string;
  errorType?: ErrorType;
}

export interface FinalReviewResult {
  status: 'pass' | 'fail' | 'needs_fix' | 'error';
  feedback: string;
  integrationIssues?: string[];
  missingRequirements?: string[];
  fixChunks?: Array<{ title: string; description: string }>;
  error?: string;
  errorType?: ErrorType;
}

export interface ReviewConfig {
  model: string;
  timeout: number;
  maxRetries: number;
  retryBackoffMs: number;
  cliPath: string;
}

// ============================================================================
// Error Detection
// ============================================================================

/**
 * Detect if an error is a rate limit error (429 status or 'rate limit' in message)
 */
export function detectRateLimit(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }

  // Check for Error objects
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }
    // Check for status property on error objects (e.g., fetch errors)
    if ('status' in error && (error as { status: number }).status === 429) {
      return true;
    }
  }

  // Check for string errors
  if (typeof error === 'string') {
    const lower = error.toLowerCase();
    return lower.includes('rate limit') || lower.includes('429');
  }

  // Check for objects with status or message
  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    if (obj.status === 429) {
      return true;
    }
    if (typeof obj.message === 'string') {
      const message = obj.message.toLowerCase();
      if (message.includes('rate limit') || message.includes('429')) {
        return true;
      }
    }
    if (typeof obj.statusCode === 'number' && obj.statusCode === 429) {
      return true;
    }
  }

  return false;
}

/**
 * Classify an error into one of the known error types
 */
export function classifyError(error: unknown): ErrorType {
  if (error === null || error === undefined) {
    return 'unknown';
  }

  // Check for rate limit first (most specific)
  if (detectRateLimit(error)) {
    return 'rate_limit';
  }

  // Get error message
  let message = '';
  if (error instanceof Error) {
    message = error.message.toLowerCase();
  } else if (typeof error === 'string') {
    message = error.toLowerCase();
  } else if (typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') {
      message = obj.message.toLowerCase();
    }
  }

  // Check for timeout
  if (message.includes('timeout') || message.includes('timed out') || message.includes('etimedout')) {
    return 'timeout';
  }

  // Check for parse errors
  if (
    message.includes('parse') ||
    message.includes('json') ||
    message.includes('unexpected token') ||
    message.includes('syntax error')
  ) {
    return 'parse_error';
  }

  return 'unknown';
}

// ============================================================================
// Retry Logic
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Execute a function with exponential backoff retry logic
 *
 * @param fn - The async function to execute
 * @param config - Retry configuration
 * @returns The result of fn() if successful
 * @throws The last error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  const { maxRetries, backoffMs, onRetry } = config;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If we've exhausted retries, throw
      if (attempt >= maxRetries) {
        throw error;
      }

      // Only retry on rate limit errors
      if (!detectRateLimit(error)) {
        throw error;
      }

      // Call onRetry callback if provided
      onRetry?.(attempt + 1, error);

      // Wait with exponential backoff: backoffMs * 2^attempt
      const delay = backoffMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
