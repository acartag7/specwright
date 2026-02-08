import type { StateSnapshot, ActivityEntry } from '@specwright/shared';
import { getDb, generateId } from './connection';

// ============================================================================
// Row types
// ============================================================================

interface StateSnapshotRow {
  id: string;
  project_id: string;
  current_phase_id: string | null;
  current_spec_id: string | null;
  current_chunk_id: string | null;
  recent_activity: string;
  blockers: string;
  notes: string;
  updated_at: number;
}

// ============================================================================
// Row converter
// ============================================================================

function rowToSnapshot(row: StateSnapshotRow): StateSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    currentPhaseId: row.current_phase_id,
    currentSpecId: row.current_spec_id,
    currentChunkId: row.current_chunk_id,
    recentActivity: JSON.parse(row.recent_activity || '[]'),
    blockers: JSON.parse(row.blockers || '[]'),
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// State Snapshot CRUD
// ============================================================================

export function getStateByProject(projectId: string): StateSnapshot | null {
  const db = getDb();
  const row = db.prepare(
    `SELECT * FROM state_snapshots WHERE project_id = ?`
  ).get(projectId) as StateSnapshotRow | undefined;

  return row ? rowToSnapshot(row) : null;
}

export function createOrUpdateState(
  projectId: string,
  data: {
    currentPhaseId?: string | null;
    currentSpecId?: string | null;
    currentChunkId?: string | null;
    recentActivity?: ActivityEntry[];
    blockers?: string[];
    notes?: string;
  }
): StateSnapshot {
  const db = getDb();
  const existing = db.prepare(
    `SELECT * FROM state_snapshots WHERE project_id = ?`
  ).get(projectId) as StateSnapshotRow | undefined;

  const now = Date.now();

  if (existing) {
    db.prepare(`
      UPDATE state_snapshots
      SET current_phase_id = ?, current_spec_id = ?, current_chunk_id = ?,
          recent_activity = ?, blockers = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.currentPhaseId !== undefined ? data.currentPhaseId : existing.current_phase_id,
      data.currentSpecId !== undefined ? data.currentSpecId : existing.current_spec_id,
      data.currentChunkId !== undefined ? data.currentChunkId : existing.current_chunk_id,
      data.recentActivity ? JSON.stringify(data.recentActivity) : existing.recent_activity,
      data.blockers ? JSON.stringify(data.blockers) : existing.blockers,
      data.notes ?? existing.notes,
      now,
      existing.id
    );

    const updated = db.prepare(
      `SELECT * FROM state_snapshots WHERE id = ?`
    ).get(existing.id) as StateSnapshotRow;
    return rowToSnapshot(updated);
  }

  const id = generateId();
  db.prepare(`
    INSERT INTO state_snapshots (id, project_id, current_phase_id, current_spec_id, current_chunk_id, recent_activity, blockers, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, projectId,
    data.currentPhaseId ?? null,
    data.currentSpecId ?? null,
    data.currentChunkId ?? null,
    JSON.stringify(data.recentActivity ?? []),
    JSON.stringify(data.blockers ?? []),
    data.notes ?? '',
    now
  );

  return {
    id,
    projectId,
    currentPhaseId: data.currentPhaseId ?? null,
    currentSpecId: data.currentSpecId ?? null,
    currentChunkId: data.currentChunkId ?? null,
    recentActivity: data.recentActivity ?? [],
    blockers: data.blockers ?? [],
    notes: data.notes ?? '',
    updatedAt: now,
  };
}

export function addActivity(
  projectId: string,
  entry: ActivityEntry
): StateSnapshot {
  const db = getDb();
  const existing = db.prepare(
    `SELECT * FROM state_snapshots WHERE project_id = ?`
  ).get(projectId) as StateSnapshotRow | undefined;

  const now = Date.now();

  if (!existing) {
    // Auto-create state if it doesn't exist
    return createOrUpdateState(projectId, {
      recentActivity: [entry],
    });
  }

  const activity: ActivityEntry[] = JSON.parse(existing.recent_activity || '[]');
  activity.unshift(entry);
  // Keep last 50 entries
  const trimmed = activity.slice(0, 50);

  db.prepare(`
    UPDATE state_snapshots
    SET recent_activity = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(trimmed), now, existing.id);

  const updated = db.prepare(
    `SELECT * FROM state_snapshots WHERE id = ?`
  ).get(existing.id) as StateSnapshotRow;
  return rowToSnapshot(updated);
}
