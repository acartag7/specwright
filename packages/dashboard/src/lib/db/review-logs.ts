import type { ReviewLog, ReviewWarning } from '@specwright/shared';
import { getDb } from './connection';

interface ReviewLogRow {
  id: string;
  chunk_id: string | null;
  spec_id: string | null;
  review_type: string;
  model: string;
  status: string;
  feedback: string | null;
  error_message: string | null;
  error_type: string | null;
  attempt_number: number;
  duration_ms: number | null;
  created_at: string;
}

function rowToReviewLog(row: ReviewLogRow): ReviewLog {
  return {
    id: row.id,
    chunkId: row.chunk_id ?? undefined,
    specId: row.spec_id ?? undefined,
    reviewType: row.review_type as 'chunk' | 'final',
    model: row.model,
    status: row.status as ReviewLog['status'],
    feedback: row.feedback ?? undefined,
    errorMessage: row.error_message ?? undefined,
    errorType: row.error_type as ReviewLog['errorType'] ?? undefined,
    attemptNumber: row.attempt_number,
    durationMs: row.duration_ms ?? undefined,
    createdAt: row.created_at,
  };
}

export function getReviewLogsBySpec(specId: string): ReviewLog[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM review_logs
    WHERE spec_id = ? OR chunk_id IN (SELECT id FROM chunks WHERE spec_id = ?)
    ORDER BY created_at DESC
  `);
  return (stmt.all(specId, specId) as ReviewLogRow[]).map(rowToReviewLog);
}

export function getReviewLogsByChunk(chunkId: string): ReviewLog[] {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM review_logs WHERE chunk_id = ? ORDER BY created_at DESC`);
  return (stmt.all(chunkId) as ReviewLogRow[]).map(rowToReviewLog);
}

export function getReviewWarningsForSpec(specId: string): ReviewWarning[] {
  const logs = getReviewLogsBySpec(specId);
  const warnings: ReviewWarning[] = [];

  // Group rate limit errors
  const rateLimitLogs = logs.filter(l => l.errorType === 'rate_limit');
  if (rateLimitLogs.length > 0) {
    warnings.push({
      type: 'rate_limit',
      count: rateLimitLogs.length,
      chunkIds: [...new Set(rateLimitLogs.map(l => l.chunkId).filter((id): id is string => !!id))],
      message: `${rateLimitLogs.length} rate limit error(s) during review`,
    });
  }

  // Group review errors (excluding rate limits)
  const errorLogs = logs.filter(l => l.status === 'error' && l.errorType !== 'rate_limit');
  if (errorLogs.length > 0) {
    warnings.push({
      type: 'review_error',
      count: errorLogs.length,
      chunkIds: [...new Set(errorLogs.map(l => l.chunkId).filter((id): id is string => !!id))],
      message: `${errorLogs.length} review error(s) occurred`,
    });
  }

  // Group needs_fix
  const needsFixLogs = logs.filter(l => l.status === 'needs_fix');
  if (needsFixLogs.length > 0) {
    warnings.push({
      type: 'needs_fix',
      count: needsFixLogs.length,
      chunkIds: [...new Set(needsFixLogs.map(l => l.chunkId).filter((id): id is string => !!id))],
      message: `${needsFixLogs.length} chunk(s) needed fixes`,
    });
  }

  return warnings;
}
