/**
 * Goal Verification Types (v2-07)
 *
 * Types for wiring verification (cross-chunk dependency validation)
 * and spec-level goal alignment checking.
 */

// ============================================================================
// Wiring Types
// ============================================================================

/**
 * Result of wiring check before chunk execution.
 * Validates that required imports are available from previous chunks.
 */
export interface WiringCheckResult {
  canExecute: boolean;
  missingImports: MissingImport[];
  availableExports: AvailableExport[];
}

export interface MissingImport {
  name: string;
  requiredBy: string;
  expectedFrom?: string;
  suggestion?: string;
}

/**
 * Export tracked from a completed chunk.
 * Accumulated across chunk executions.
 */
export interface AvailableExport {
  name: string;
  type: 'type' | 'interface' | 'function' | 'const' | 'class';
  file: string;
  importFrom: string;
  createdByChunk: string;
  createdAt: string;
}

/**
 * Accumulated context passed between chunks.
 */
export interface AccumulatedContext {
  exports: AvailableExport[];
  filesCreated: string[];
  filesModified: string[];
}

// ============================================================================
// Goal Verification Types
// ============================================================================

/**
 * Result of spec-level goal verification.
 * Returned by final review.
 */
export interface GoalVerificationResult {
  status: 'pass' | 'needs_fix' | 'fail';
  goalAlignment: {
    specGoal: string;
    achieved: boolean;
    explanation: string;
  };
  integrationCheck: {
    passed: boolean;
    issues: IntegrationIssue[];
  };
  fixChunks?: FixChunkSuggestion[];
}

export interface IntegrationIssue {
  type: 'missing_export' | 'type_mismatch' | 'unused_code' | 'incomplete_feature';
  description: string;
  affectedFiles: string[];
  suggestedFix?: string;
}

export interface FixChunkSuggestion {
  title: string;
  description: string;
  targetChunkId?: string;
}
