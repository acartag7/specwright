import type { Chunk } from '@specwright/shared';

export interface ChunkValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const ALLOWED_COMMANDS = ['pnpm', 'npm', 'yarn', 'bun', 'node', 'npx', 'tsc', 'jest', 'vitest'];

export function validateChunk(chunk: Partial<Chunk>): ChunkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!chunk.title?.trim()) {
    errors.push('Title is required');
  }

  if (!chunk.description?.trim()) {
    errors.push('Description is required');
  }

  // Files: Must be non-empty array with valid paths
  if (!chunk.files || chunk.files.length === 0) {
    errors.push('Files array is required and must not be empty');
  } else {
    for (const file of chunk.files) {
      if (!file.trim()) {
        errors.push('File paths cannot be empty');
      }
      if (file.includes('..')) {
        errors.push(`Invalid file path (path traversal): ${file}`);
      }
    }
  }

  // Verify Command: Must be non-empty and start with known tool
  if (!chunk.verifyCommand?.trim()) {
    errors.push('Verify command is required');
  } else {
    const cmd = chunk.verifyCommand.trim().split(/\s+/)[0];
    if (!ALLOWED_COMMANDS.includes(cmd)) {
      warnings.push(`Verify command "${cmd}" is not a recognized tool`);
    }
  }

  // Done Criteria: Must be non-empty
  if (!chunk.doneCriteria?.trim()) {
    errors.push('Done criteria is required');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
