/**
 * Execution Validation - File change validation for chunk execution
 *
 * Extracted from lib/execution.ts (ORC-115)
 * Validates that actual file changes were made during chunk execution.
 */

import { gitSync } from '../git';

/**
 * Result of validating file changes in worktree
 */
export interface ChangeValidation {
  hasChanges: boolean;
  filesChanged: number;
  additions: number;
  deletions: number;
  onlyWhitespace: boolean;
}

/**
 * Structural status codes from git porcelain that indicate real content changes
 * A = Added, D = Deleted, R = Renamed, C = Copied, ? = Untracked
 * These should never be considered "whitespace-only" changes
 */
const STRUCTURAL_STATUS_CODES = new Set(['A', 'D', 'R', 'C', '?']);

/**
 * Parse diff output to extract content change lines
 */
function extractContentChanges(diffOutput: string): string[] {
  return diffOutput
    .split('\n')
    .filter(line => line.startsWith('+') || line.startsWith('-'))
    .filter(line => !line.startsWith('+++') && !line.startsWith('---'));
}

/**
 * Validate that actual file changes were made during chunk execution
 * This prevents marking chunks as "completed" when no work was done
 */
export function validateFileChanges(directory: string): ChangeValidation {
  const statusResult = gitSync(['status', '--porcelain'], directory);
  const porcelain = statusResult.status === 0 ? statusResult.stdout.trim() : '';

  if (!porcelain) {
    return {
      hasChanges: false,
      filesChanged: 0,
      additions: 0,
      deletions: 0,
      onlyWhitespace: false,
    };
  }

  const porcelainLines = porcelain.split('\n').filter(Boolean);
  const filesChanged = porcelainLines.length;

  let hasStructuralChanges = false;
  for (const line of porcelainLines) {
    const indexStatus = line[0];
    const worktreeStatus = line[1];
    if (STRUCTURAL_STATUS_CODES.has(indexStatus) || STRUCTURAL_STATUS_CODES.has(worktreeStatus)) {
      hasStructuralChanges = true;
      break;
    }
  }

  const diffResult = gitSync(['diff'], directory);
  const diff = diffResult.status === 0 ? diffResult.stdout : '';
  const stagedDiffResult = gitSync(['diff', '--staged'], directory);
  const stagedDiff = stagedDiffResult.status === 0 ? stagedDiffResult.stdout : '';
  const fullDiff = diff + stagedDiff;

  const diffNoWhitespaceResult = gitSync(['diff', '-w'], directory);
  const diffNoWhitespace = diffNoWhitespaceResult.status === 0 ? diffNoWhitespaceResult.stdout : '';
  const stagedDiffNoWhitespaceResult = gitSync(['diff', '--staged', '-w'], directory);
  const stagedDiffNoWhitespace = stagedDiffNoWhitespaceResult.status === 0 ? stagedDiffNoWhitespaceResult.stdout : '';
  const fullDiffNoWhitespace = diffNoWhitespace + stagedDiffNoWhitespace;

  const contentChanges = extractContentChanges(fullDiff);
  const additions = contentChanges.filter(l => l.startsWith('+')).length;
  const deletions = contentChanges.filter(l => l.startsWith('-')).length;

  const contentChangesNoWhitespace = extractContentChanges(fullDiffNoWhitespace);

  let onlyWhitespace = contentChanges.length > 0 && contentChangesNoWhitespace.length === 0;
  if (hasStructuralChanges) {
    onlyWhitespace = false;
  }

  return {
    hasChanges: filesChanged > 0,
    filesChanged,
    additions,
    deletions,
    onlyWhitespace,
  };
}
