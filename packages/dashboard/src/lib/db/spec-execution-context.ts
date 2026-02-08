/**
 * CRUD operations for the spec_execution_context table (v2-07)
 *
 * Stores accumulated context (exports, files) across chunk executions
 * for a spec, enabling wiring verification between chunks.
 */

import type { AccumulatedContext } from '@/lib/services/goal-verifier/types';
import { getDb, generateId } from './connection';

interface SpecExecutionContextRow {
  id: string;
  spec_id: string;
  accumulated_exports: string;
  files_created: string;
  files_modified: string;
  updated_at: string;
}

function rowToContext(row: SpecExecutionContextRow): AccumulatedContext {
  return {
    exports: JSON.parse(row.accumulated_exports),
    filesCreated: JSON.parse(row.files_created),
    filesModified: JSON.parse(row.files_modified),
  };
}

export function getContext(specId: string): AccumulatedContext | null {
  const db = getDb();
  const stmt = db.prepare(
    `SELECT * FROM spec_execution_context WHERE spec_id = ?`
  );
  const row = stmt.get(specId) as SpecExecutionContextRow | undefined;
  return row ? rowToContext(row) : null;
}

export function saveContext(specId: string, context: AccumulatedContext): void {
  const db = getDb();

  const existing = db
    .prepare(`SELECT id FROM spec_execution_context WHERE spec_id = ?`)
    .get(specId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE spec_execution_context
       SET accumulated_exports = ?, files_created = ?, files_modified = ?, updated_at = CURRENT_TIMESTAMP
       WHERE spec_id = ?`
    ).run(
      JSON.stringify(context.exports),
      JSON.stringify(context.filesCreated),
      JSON.stringify(context.filesModified),
      specId
    );
  } else {
    db.prepare(
      `INSERT INTO spec_execution_context (id, spec_id, accumulated_exports, files_created, files_modified)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      generateId(),
      specId,
      JSON.stringify(context.exports),
      JSON.stringify(context.filesCreated),
      JSON.stringify(context.filesModified)
    );
  }
}

export function clearContext(specId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM spec_execution_context WHERE spec_id = ?`).run(specId);
}
