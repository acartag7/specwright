import type { MetaSpec, Phase, PhaseStatus } from '@specwright/shared';
import { getDb, generateId } from './connection';

// ============================================================================
// Row types
// ============================================================================

interface MetaSpecRow {
  id: string;
  project_id: string;
  vision: string;
  architecture: string;
  constraints: string;
  non_goals: string;
  created_at: number;
  updated_at: number;
}

interface PhaseRow {
  id: string;
  meta_spec_id: string;
  name: string;
  description: string;
  success_criteria: string;
  status: string;
  order_index: number;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// Row converters
// ============================================================================

function rowToPhase(row: PhaseRow): Phase {
  return {
    id: row.id,
    metaSpecId: row.meta_spec_id,
    name: row.name,
    description: row.description,
    successCriteria: JSON.parse(row.success_criteria || '[]'),
    status: row.status as PhaseStatus,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMetaSpec(row: MetaSpecRow, phases: Phase[]): MetaSpec {
  return {
    id: row.id,
    projectId: row.project_id,
    vision: row.vision,
    architecture: row.architecture,
    constraints: row.constraints,
    nonGoals: row.non_goals,
    phases,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// Meta-Spec CRUD
// ============================================================================

export function getMetaSpecByProject(projectId: string): MetaSpec | null {
  const db = getDb();
  const row = db.prepare(
    `SELECT * FROM meta_specs WHERE project_id = ?`
  ).get(projectId) as MetaSpecRow | undefined;

  if (!row) return null;

  const phaseRows = db.prepare(
    `SELECT * FROM phases WHERE meta_spec_id = ? ORDER BY order_index ASC`
  ).all(row.id) as PhaseRow[];

  return rowToMetaSpec(row, phaseRows.map(rowToPhase));
}

export function createMetaSpec(
  projectId: string,
  data: {
    vision?: string;
    architecture?: string;
    constraints?: string;
    nonGoals?: string;
  }
): MetaSpec {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  db.prepare(`
    INSERT INTO meta_specs (id, project_id, vision, architecture, constraints, non_goals, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, projectId,
    data.vision ?? '', data.architecture ?? '',
    data.constraints ?? '', data.nonGoals ?? '',
    now, now
  );

  return {
    id,
    projectId,
    vision: data.vision ?? '',
    architecture: data.architecture ?? '',
    constraints: data.constraints ?? '',
    nonGoals: data.nonGoals ?? '',
    phases: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateMetaSpec(
  id: string,
  data: {
    vision?: string;
    architecture?: string;
    constraints?: string;
    nonGoals?: string;
  }
): MetaSpec | null {
  const db = getDb();
  const existing = db.prepare(
    `SELECT * FROM meta_specs WHERE id = ?`
  ).get(id) as MetaSpecRow | undefined;

  if (!existing) return null;

  const now = Date.now();
  db.prepare(`
    UPDATE meta_specs
    SET vision = ?, architecture = ?, constraints = ?, non_goals = ?, updated_at = ?
    WHERE id = ?
  `).run(
    data.vision ?? existing.vision,
    data.architecture ?? existing.architecture,
    data.constraints ?? existing.constraints,
    data.nonGoals ?? existing.non_goals,
    now, id
  );

  const phaseRows = db.prepare(
    `SELECT * FROM phases WHERE meta_spec_id = ? ORDER BY order_index ASC`
  ).all(id) as PhaseRow[];

  return rowToMetaSpec(
    { ...existing, vision: data.vision ?? existing.vision, architecture: data.architecture ?? existing.architecture, constraints: data.constraints ?? existing.constraints, non_goals: data.nonGoals ?? existing.non_goals, updated_at: now },
    phaseRows.map(rowToPhase)
  );
}

export function deleteMetaSpec(id: string): boolean {
  const db = getDb();
  const result = db.prepare(`DELETE FROM meta_specs WHERE id = ?`).run(id);
  return result.changes > 0;
}

// ============================================================================
// Phase CRUD
// ============================================================================

export function createPhase(
  metaSpecId: string,
  data: {
    name: string;
    description?: string;
    successCriteria?: string[];
    status?: PhaseStatus;
    orderIndex?: number;
  }
): Phase {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  // Auto-calculate order if not provided
  let orderIndex = data.orderIndex;
  if (orderIndex === undefined) {
    const maxRow = db.prepare(
      `SELECT MAX(order_index) as max_order FROM phases WHERE meta_spec_id = ?`
    ).get(metaSpecId) as { max_order: number | null };
    orderIndex = (maxRow.max_order ?? -1) + 1;
  }

  db.prepare(`
    INSERT INTO phases (id, meta_spec_id, name, description, success_criteria, status, order_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, metaSpecId,
    data.name,
    data.description ?? '',
    JSON.stringify(data.successCriteria ?? []),
    data.status ?? 'not_started',
    orderIndex,
    now, now
  );

  // Update parent meta-spec timestamp
  db.prepare(`UPDATE meta_specs SET updated_at = ? WHERE id = ?`).run(now, metaSpecId);

  return {
    id,
    metaSpecId,
    name: data.name,
    description: data.description ?? '',
    successCriteria: data.successCriteria ?? [],
    status: data.status ?? 'not_started',
    orderIndex,
    createdAt: now,
    updatedAt: now,
  };
}

export function updatePhase(
  id: string,
  data: {
    name?: string;
    description?: string;
    successCriteria?: string[];
    status?: PhaseStatus;
    orderIndex?: number;
  }
): Phase | null {
  const db = getDb();
  const existing = db.prepare(
    `SELECT * FROM phases WHERE id = ?`
  ).get(id) as PhaseRow | undefined;

  if (!existing) return null;

  const now = Date.now();
  db.prepare(`
    UPDATE phases
    SET name = ?, description = ?, success_criteria = ?, status = ?, order_index = ?, updated_at = ?
    WHERE id = ?
  `).run(
    data.name ?? existing.name,
    data.description ?? existing.description,
    data.successCriteria ? JSON.stringify(data.successCriteria) : existing.success_criteria,
    data.status ?? existing.status,
    data.orderIndex ?? existing.order_index,
    now, id
  );

  // Update parent meta-spec timestamp
  db.prepare(`UPDATE meta_specs SET updated_at = ? WHERE id = ?`).run(now, existing.meta_spec_id);

  const updated = db.prepare(`SELECT * FROM phases WHERE id = ?`).get(id) as PhaseRow;
  return rowToPhase(updated);
}

export function deletePhase(id: string): boolean {
  const db = getDb();
  const existing = db.prepare(
    `SELECT meta_spec_id FROM phases WHERE id = ?`
  ).get(id) as { meta_spec_id: string } | undefined;

  if (!existing) return false;

  const result = db.prepare(`DELETE FROM phases WHERE id = ?`).run(id);

  if (result.changes > 0) {
    db.prepare(`UPDATE meta_specs SET updated_at = ? WHERE id = ?`).run(Date.now(), existing.meta_spec_id);
  }

  return result.changes > 0;
}

export function reorderPhases(phaseIds: string[]): void {
  const db = getDb();
  const reorder = db.transaction(() => {
    for (let i = 0; i < phaseIds.length; i++) {
      db.prepare(
        `UPDATE phases SET order_index = ?, updated_at = ? WHERE id = ?`
      ).run(i, Date.now(), phaseIds[i]);
    }
  });
  reorder();
}
