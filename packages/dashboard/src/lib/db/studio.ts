import type { SpecStudioState, SpecStudioStep, Question, ChunkSuggestion } from '@specwright/shared';
import { getDb, generateId } from './connection';

interface StudioStateRow {
  id: string;
  project_id: string;
  spec_id: string | null;
  step: string;
  intent: string;
  questions: string;
  answers: string;
  generated_spec: string;
  suggested_chunks: string;
  created_at: number;
  updated_at: number;
}

function rowToStudioState(row: StudioStateRow): SpecStudioState {
  let questions: Question[] = [];
  let answers: Record<string, string | string[]> = {};
  let suggestedChunks: ChunkSuggestion[] = [];

  try {
    questions = JSON.parse(row.questions) as Question[];
  } catch {
    questions = [];
  }
  try {
    answers = JSON.parse(row.answers) as Record<string, string | string[]>;
  } catch {
    answers = {};
  }
  try {
    suggestedChunks = JSON.parse(row.suggested_chunks) as ChunkSuggestion[];
  } catch {
    suggestedChunks = [];
  }

  return {
    id: row.id,
    projectId: row.project_id,
    specId: row.spec_id || undefined,
    step: row.step as SpecStudioStep,
    intent: row.intent,
    questions,
    answers,
    generatedSpec: row.generated_spec,
    suggestedChunks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getStudioState(projectId: string, specId?: string): SpecStudioState | null {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM spec_studio_state
    WHERE project_id = ? AND (spec_id = ? OR (spec_id IS NULL AND ? IS NULL))
    ORDER BY created_at DESC LIMIT 1
  `);
  const row = stmt.get(projectId, specId ?? null, specId ?? null) as StudioStateRow | undefined;
  return row ? rowToStudioState(row) : null;
}

export function createStudioState(projectId: string, specId?: string): SpecStudioState {
  const database = getDb();
  const id = generateId();
  const now = Date.now();

  // Use INSERT OR IGNORE to handle race conditions where two requests
  // try to create the same state simultaneously
  const stmt = database.prepare(`
    INSERT OR IGNORE INTO spec_studio_state (id, project_id, spec_id, step, intent, questions, answers, generated_spec, suggested_chunks, created_at, updated_at)
    VALUES (?, ?, ?, 'intent', '', '[]', '{}', '', '[]', ?, ?)
  `);
  stmt.run(id, projectId, specId ?? null, now, now);

  // Return the existing or newly created state
  const existing = getStudioState(projectId, specId);
  if (existing) return existing;

  // Fallback (should rarely happen)
  return {
    id,
    projectId,
    specId,
    step: 'intent',
    intent: '',
    questions: [],
    answers: {},
    generatedSpec: '',
    suggestedChunks: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateStudioState(
  projectId: string,
  data: {
    step?: SpecStudioStep;
    intent?: string;
    questions?: Question[];
    answers?: Record<string, string | string[]>;
    generatedSpec?: string;
    suggestedChunks?: ChunkSuggestion[];
  },
  specId?: string
): SpecStudioState | null {
  const database = getDb();
  const existing = getStudioState(projectId, specId);
  if (!existing) return null;

  const now = Date.now();
  const stmt = database.prepare(`
    UPDATE spec_studio_state
    SET step = ?, intent = ?, questions = ?, answers = ?, generated_spec = ?, suggested_chunks = ?, updated_at = ?
    WHERE project_id = ? AND (spec_id = ? OR (spec_id IS NULL AND ? IS NULL))
  `);
  stmt.run(
    data.step ?? existing.step,
    data.intent ?? existing.intent,
    JSON.stringify(data.questions ?? existing.questions),
    JSON.stringify(data.answers ?? existing.answers),
    data.generatedSpec ?? existing.generatedSpec,
    JSON.stringify(data.suggestedChunks ?? existing.suggestedChunks),
    now,
    projectId,
    specId ?? null,
    specId ?? null
  );

  return getStudioState(projectId, specId);
}

export function deleteStudioState(projectId: string, specId?: string): boolean {
  const database = getDb();
  const stmt = database.prepare(`
    DELETE FROM spec_studio_state
    WHERE project_id = ? AND (spec_id = ? OR (spec_id IS NULL AND ? IS NULL))
  `);
  const result = stmt.run(projectId, specId ?? null, specId ?? null);
  return result.changes > 0;
}
