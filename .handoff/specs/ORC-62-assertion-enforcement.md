# ORC-62: DSPy-Style Assertion Enforcement System

## Overview

Implement a multi-layer enforcement system that validates chunk execution against contract assertions. Uses DSPy-inspired Assert/Suggest pattern with automatic retry, context accumulation, and layered validation.

## Problem Statement

Current execution has no enforcement:
- Prompts tell GLM what to do, but there's no verification
- Build validation catches type errors but not contract violations
- Chunks can create wrong exports (e.g., `HealthCheckStatus` instead of `HealthCheckResult`)
- No mechanism for retry with error context
- Integration issues not caught until manual testing

## Solution

Implement enforcement at four layers:

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: PRE-EXECUTION GATE                                    │
│  Block execution if dependencies not met                        │
└─────────────────────────────────┬───────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: CONTEXT INJECTION                                     │
│  Pass contract + available exports to GLM                       │
└─────────────────────────────────┬───────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: POST-EXECUTION VALIDATION                             │
│  Verify assertions, retry on failure                            │
└─────────────────────────────────┬───────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: CONTEXT ACCUMULATION                                  │
│  Record what was created for next chunks                        │
└─────────────────────────────────────────────────────────────────┘
```

---

# MVP vs Roadmap

## MVP Scope

| Feature | Description | Priority |
|---------|-------------|----------|
| Context accumulation | Pass git diff + exports from previous chunks | P0 |
| Pre-execution gate | Block if dependsOn chunks not completed | P0 |
| Context injection | Add available exports to prompt | P0 |
| Additive tolerance | Extra exports OK, missing/wrong = fail | P0 |
| Regex-based validation | Grep for export existence (Tier 1) | P0 |
| Retry with context | Feed error back, retry up to 3 times | P0 |

## Roadmap (Post-MVP)

| Feature | Description | Priority |
|---------|-------------|----------|
| Impact analysis | Find callers before modifying code | P1 |
| Contract amendments | Propose contract changes on repeated failure | P1 |
| AST validation (Tier 3) | TypeScript compiler for signature matching | P2 |
| LLM-as-judge | Semantic validation for complex checks | P3 |
| Parallel execution | Run independent chunks concurrently | P3 |

---

# Core Concepts

## Assert vs Suggest (DSPy Pattern)

```typescript
// ASSERT: Hard requirement - must be met or chunk fails
{
  type: 'assert',
  condition: 'exports HealthCheckResult from @specwright/shared',
  message: 'Must export HealthCheckResult type',
  check: {
    type: 'export_exists',
    target: 'HealthCheckResult',
    file: 'packages/shared/src/types.ts'
  }
}

// SUGGEST: Soft guidance - logged but doesn't fail
{
  type: 'suggest',
  condition: 'follows existing error handling patterns',
  message: 'Should use try/catch with typed errors',
  check: {
    type: 'pattern_match',
    target: 'packages/dashboard/src/lib/health-check.ts',
    pattern: 'try\\s*\\{[\\s\\S]*catch'
  }
}
```

## Additive Tolerance

GLM may discover it needs helper types/functions not in the original contract. This is OK as long as required items are created:

```typescript
// Contract says: creates: ["HealthCheckResult", "checkHealth()"]

// PASS - all required + bonus
// GLM creates: HealthCheckResult, checkHealth(), HealthCheckError (bonus)

// FAIL - missing required
// GLM creates: HealthCheckResult, validateHealth() (wrong function name)

// FAIL - wrong name
// GLM creates: HealthStatus (wrong type name), checkHealth()
```

## Tiered Validation (Regex Before AST)

```typescript
// Tier 1: Regex/Grep (microseconds) - MVP
// Catches: "does export exist?"
const tier1Check = (file: string, name: string): boolean => {
  const content = fs.readFileSync(file, 'utf-8');
  const pattern = new RegExp(`export\\s+(const|function|interface|type|class)\\s+${name}\\b`);
  return pattern.test(content);
};

// Tier 2: Extended regex (milliseconds) - MVP
// Catches: re-exports, default exports
const tier2Check = (file: string, name: string): boolean => {
  const content = fs.readFileSync(file, 'utf-8');
  // Check: export { X } from './other'
  // Check: export default X
  // Check: export { X as Y }
  return /* regex patterns */;
};

// Tier 3: AST (heavy) - Roadmap
// Catches: "does signature match?"
const tier3Check = async (file: string, name: string, expected: string): Promise<boolean> => {
  const program = ts.createProgram([file], {});
  // Parse and compare signatures
  return /* AST comparison */;
};
```

---

# Data Model

## Types (packages/shared/src/types.ts)

```typescript
// ============================================
// EXECUTION CONTEXT TYPES
// ============================================

/**
 * What's available from previous chunks
 */
export interface AvailableExport {
  name: string;              // "HealthCheckResult"
  from: string;              // "@specwright/shared"
  type: 'type' | 'interface' | 'function' | 'const' | 'class';
  createdByChunk: string;    // Chunk ID that created this
  file: string;              // Actual file path
}

/**
 * Execution context passed between chunks
 */
export interface ChunkExecutionContext {
  // What previous chunks have created
  availableExports: AvailableExport[];

  // Files that exist (created or modified)
  availableFiles: {
    path: string;
    exports: string[];
    createdByChunk?: string;
    modifiedByChunk?: string;
  }[];

  // Git diff summary
  changesSoFar: {
    filesCreated: string[];
    filesModified: string[];
    totalAdditions: number;
    totalDeletions: number;
  };
}

/**
 * Result of a single assertion check
 */
export interface AssertionResult {
  assertion: ContractAssertion;
  passed: boolean;
  tier: 1 | 2 | 3;           // Which validation tier was used
  actual?: string;           // What was found
  expected?: string;         // What was expected
  error?: string;            // Error if check failed
}

/**
 * Retry context for failed chunks
 */
export interface RetryContext {
  attempt: number;
  maxAttempts: number;
  previousViolations: {
    assertion: ContractAssertion;
    actual: string;
    expected: string;
  }[];
}

/**
 * Full validation result for a chunk
 */
export interface ChunkValidationResult {
  passed: boolean;
  assertResults: AssertionResult[];
  suggestResults: AssertionResult[];
  buildPassed: boolean;
  buildOutput?: string;
  retryable: boolean;
  retryContext?: RetryContext;
}

/**
 * Impact analysis result (Roadmap)
 */
export interface ImpactAnalysis {
  filesAffected: string[];
  functionsAffected: {
    name: string;
    file: string;
    callers: { file: string; line: number }[];
  }[];
  typesAffected: {
    name: string;
    file: string;
    usages: { file: string; line: number }[];
  }[];
  summary: string;
}

/**
 * Contract amendment proposal (Roadmap)
 */
export interface AmendmentProposal {
  chunkId: string;
  reason: string;
  proposedChanges: {
    path: string;           // "functions[0].signature"
    oldValue: string;
    newValue: string;
  }[];
  additionalTypes?: ContractType[];
  affectedChunks: number[];
}
```

## Database Changes

```sql
-- Track execution context per chunk
CREATE TABLE IF NOT EXISTS chunk_contexts (
  id TEXT PRIMARY KEY,
  spec_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  context JSON NOT NULL,           -- ChunkExecutionContext
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (spec_id) REFERENCES specs(id),
  FOREIGN KEY (chunk_id) REFERENCES chunks(id)
);

-- Track validation results
CREATE TABLE IF NOT EXISTS chunk_validations (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  result JSON NOT NULL,            -- ChunkValidationResult
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id)
);

-- Roadmap: Amendment proposals
CREATE TABLE IF NOT EXISTS amendment_proposals (
  id TEXT PRIMARY KEY,
  spec_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  proposal JSON NOT NULL,          -- AmendmentProposal
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY (spec_id) REFERENCES specs(id),
  FOREIGN KEY (chunk_id) REFERENCES chunks(id)
);
```

---

# MVP Implementation

## Layer 1: Pre-Execution Gate

```typescript
// packages/dashboard/src/lib/services/pre-execution-gate.ts

export interface GateResult {
  canExecute: boolean;
  blockedBy?: {
    type: 'missing_dependency' | 'failed_chunk' | 'missing_export';
    chunkId?: string;
    details: string;
  }[];
}

export async function checkPreExecutionGate(
  chunk: Chunk,
  context: ChunkExecutionContext
): Promise<GateResult> {
  const blockers: GateResult['blockedBy'] = [];

  // 1. Check dependsOn chunks completed successfully
  if (chunk.dependsOn && chunk.dependsOn.length > 0) {
    for (const depId of chunk.dependsOn) {
      const depChunk = getChunk(depId);
      if (!depChunk) {
        blockers.push({
          type: 'missing_dependency',
          chunkId: depId,
          details: `Dependency chunk not found`
        });
        continue;
      }

      if (depChunk.status !== 'completed') {
        blockers.push({
          type: 'failed_chunk',
          chunkId: depId,
          details: `Chunk "${depChunk.title}" has status: ${depChunk.status}`
        });
      }

      if (depChunk.reviewStatus && depChunk.reviewStatus !== 'pass') {
        blockers.push({
          type: 'failed_chunk',
          chunkId: depId,
          details: `Chunk "${depChunk.title}" review: ${depChunk.reviewStatus}`
        });
      }
    }
  }

  // 2. Check consumes are available in context
  if (chunk.consumes && chunk.consumes.length > 0) {
    for (const item of chunk.consumes) {
      const available = context.availableExports.some(e => e.name === item);
      if (!available) {
        blockers.push({
          type: 'missing_export',
          details: `Required export "${item}" not available from previous chunks`
        });
      }
    }
  }

  return {
    canExecute: blockers.length === 0,
    blockedBy: blockers.length > 0 ? blockers : undefined
  };
}
```

## Layer 2: Context Injection

```typescript
// packages/dashboard/src/prompts/executor.ts

export function buildExecutorPrompt(
  chunk: Chunk,
  spec: Spec,
  context: ChunkExecutionContext,
  retryContext?: RetryContext
): string {
  const sections: string[] = [];

  // 1. Task description
  sections.push(`# Task: ${chunk.title}\n\n${chunk.description}`);

  // 2. What this chunk MUST create (from contract)
  if (chunk.creates && chunk.creates.length > 0) {
    sections.push(`\n## YOU MUST CREATE\n`);
    chunk.creates.forEach(item => {
      sections.push(`- ${item}`);
    });
    sections.push(`\nThese are REQUIRED. The chunk will fail if any are missing.`);
  }

  // 3. Assertions as requirements
  if (chunk.assertions && chunk.assertions.length > 0) {
    const asserts = chunk.assertions.filter(a => a.type === 'assert');
    const suggests = chunk.assertions.filter(a => a.type === 'suggest');

    if (asserts.length > 0) {
      sections.push(`\n## REQUIREMENTS (Must Pass)\n`);
      asserts.forEach(a => sections.push(`- ✓ ${a.message}`));
    }

    if (suggests.length > 0) {
      sections.push(`\n## GUIDANCE (Should Follow)\n`);
      suggests.forEach(s => sections.push(`- ○ ${s.message}`));
    }
  }

  // 4. Available imports (from previous chunks)
  if (context.availableExports.length > 0) {
    sections.push(`\n## AVAILABLE IMPORTS (verified to exist)\n`);

    // Group by source
    const bySource = new Map<string, AvailableExport[]>();
    context.availableExports.forEach(exp => {
      const list = bySource.get(exp.from) || [];
      list.push(exp);
      bySource.set(exp.from, list);
    });

    bySource.forEach((exports, source) => {
      sections.push(`\nFrom "${source}":`);
      exports.forEach(exp => {
        sections.push(`  - ${exp.name} (${exp.type})`);
      });
    });
  }

  // 5. What NOT to import (in consumes but not yet available)
  const notYetAvailable = (chunk.consumes || []).filter(item =>
    !context.availableExports.some(e => e.name === item)
  );
  if (notYetAvailable.length > 0) {
    sections.push(`\n## DO NOT IMPORT (you must create these)\n`);
    notYetAvailable.forEach(item => {
      sections.push(`- ${item}`);
    });
  }

  // 6. Retry context (if applicable)
  if (retryContext && retryContext.attempt > 1) {
    sections.push(`\n## ⚠️ PREVIOUS ATTEMPT FAILED\n`);
    sections.push(`This is attempt ${retryContext.attempt} of ${retryContext.maxAttempts}.\n`);
    sections.push(`Fix these specific issues:\n`);

    retryContext.previousViolations.forEach(v => {
      sections.push(`\n**${v.assertion.message}**`);
      sections.push(`- Expected: ${v.expected}`);
      sections.push(`- Got: ${v.actual}`);
    });
  }

  // 7. Files changed so far
  if (context.changesSoFar.filesCreated.length > 0 ||
      context.changesSoFar.filesModified.length > 0) {
    sections.push(`\n## FILES CHANGED BY PREVIOUS CHUNKS\n`);
    if (context.changesSoFar.filesCreated.length > 0) {
      sections.push(`Created: ${context.changesSoFar.filesCreated.slice(0, 10).join(', ')}`);
    }
    if (context.changesSoFar.filesModified.length > 0) {
      sections.push(`Modified: ${context.changesSoFar.filesModified.slice(0, 10).join(', ')}`);
    }
  }

  return sections.join('\n');
}
```

## Layer 3: Post-Execution Validation (Tiered)

```typescript
// packages/dashboard/src/lib/services/assertion-validator.ts

export class AssertionValidator {
  constructor(private workingDir: string) {}

  async validateChunk(
    chunk: Chunk,
    buildResult: { passed: boolean; output: string }
  ): Promise<ChunkValidationResult> {
    const assertResults: AssertionResult[] = [];
    const suggestResults: AssertionResult[] = [];

    // Check each assertion
    for (const assertion of chunk.assertions || []) {
      const result = await this.checkAssertion(assertion);

      if (assertion.type === 'assert') {
        assertResults.push(result);
      } else {
        suggestResults.push(result);
      }
    }

    // Check creates[] items exist (additive tolerance)
    if (chunk.creates) {
      for (const item of chunk.creates) {
        const exists = await this.checkExportExists(item);
        if (!exists.found) {
          assertResults.push({
            assertion: {
              type: 'assert',
              condition: `creates ${item}`,
              message: `Must create ${item}`,
              check: { type: 'export_exists', target: item }
            },
            passed: false,
            tier: 1,
            expected: item,
            actual: 'not found'
          });
        }
      }
    }

    const assertsPassed = assertResults.every(r => r.passed);
    const failedAsserts = assertResults.filter(r => !r.passed);

    return {
      passed: assertsPassed && buildResult.passed,
      assertResults,
      suggestResults,
      buildPassed: buildResult.passed,
      buildOutput: buildResult.output,
      retryable: !assertsPassed && failedAsserts.length > 0,
      retryContext: failedAsserts.length > 0 ? {
        attempt: 1,
        maxAttempts: 3,
        previousViolations: failedAsserts.map(r => ({
          assertion: r.assertion,
          actual: r.actual || 'not found',
          expected: r.expected || r.assertion.message
        }))
      } : undefined
    };
  }

  private async checkAssertion(assertion: ContractAssertion): Promise<AssertionResult> {
    switch (assertion.check.type) {
      case 'export_exists':
        return this.checkExportExistsAssertion(assertion);
      case 'file_exists':
        return this.checkFileExistsAssertion(assertion);
      case 'pattern_match':
        return this.checkPatternMatchAssertion(assertion);
      default:
        return {
          assertion,
          passed: true,
          tier: 1,
          error: `Unknown check type: ${assertion.check.type}`
        };
    }
  }

  // Tier 1: Regex-based export check
  private async checkExportExists(name: string): Promise<{ found: boolean; file?: string }> {
    // Search all TypeScript files
    const pattern = `export\\s+(const|function|interface|type|class)\\s+${name}\\b`;

    const result = spawnSync('grep', [
      '-r', '-l', '-E', pattern,
      '--include=*.ts', '--include=*.tsx',
      '.'
    ], {
      cwd: this.workingDir,
      encoding: 'utf-8',
      shell: false
    });

    if (result.status === 0 && result.stdout.trim()) {
      return { found: true, file: result.stdout.trim().split('\n')[0] };
    }

    // Tier 2: Check re-exports
    const reexportPattern = `export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`;
    const reexportResult = spawnSync('grep', [
      '-r', '-l', '-E', reexportPattern,
      '--include=*.ts', '--include=*.tsx',
      '.'
    ], {
      cwd: this.workingDir,
      encoding: 'utf-8',
      shell: false
    });

    if (reexportResult.status === 0 && reexportResult.stdout.trim()) {
      return { found: true, file: reexportResult.stdout.trim().split('\n')[0] };
    }

    return { found: false };
  }

  private async checkExportExistsAssertion(assertion: ContractAssertion): Promise<AssertionResult> {
    const { target, file } = assertion.check;
    const result = await this.checkExportExists(target);

    return {
      assertion,
      passed: result.found,
      tier: 1,
      expected: `Export "${target}"`,
      actual: result.found ? `Found in ${result.file}` : 'Not found'
    };
  }

  private async checkFileExistsAssertion(assertion: ContractAssertion): Promise<AssertionResult> {
    const { target } = assertion.check;
    const fullPath = path.join(this.workingDir, target);

    try {
      await fs.access(fullPath);
      return {
        assertion,
        passed: true,
        tier: 1,
        expected: `File ${target}`,
        actual: 'File exists'
      };
    } catch {
      return {
        assertion,
        passed: false,
        tier: 1,
        expected: `File ${target}`,
        actual: 'File not found'
      };
    }
  }

  private async checkPatternMatchAssertion(assertion: ContractAssertion): Promise<AssertionResult> {
    const { target, pattern } = assertion.check as { target: string; pattern: string };
    const fullPath = path.join(this.workingDir, target);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const regex = new RegExp(pattern);
      const matches = regex.test(content);

      return {
        assertion,
        passed: matches,
        tier: 1,
        expected: `Pattern /${pattern}/`,
        actual: matches ? 'Pattern found' : 'Pattern not found'
      };
    } catch (error) {
      return {
        assertion,
        passed: false,
        tier: 1,
        error: `Could not read file: ${error}`
      };
    }
  }
}
```

## Layer 4: Context Accumulation

```typescript
// packages/dashboard/src/lib/services/context-accumulator.ts

export class ContextAccumulator {
  constructor(
    private specId: string,
    private workingDir: string
  ) {}

  /**
   * Get accumulated context for a chunk
   */
  async getContextForChunk(chunkOrder: number): Promise<ChunkExecutionContext> {
    // Get all completed chunks before this one
    const allChunks = getChunksBySpec(this.specId);
    const previousChunks = allChunks
      .filter(c => c.order < chunkOrder && c.status === 'completed')
      .sort((a, b) => a.order - b.order);

    const context: ChunkExecutionContext = {
      availableExports: [],
      availableFiles: [],
      changesSoFar: {
        filesCreated: [],
        filesModified: [],
        totalAdditions: 0,
        totalDeletions: 0
      }
    };

    // Accumulate from each previous chunk
    for (const chunk of previousChunks) {
      const chunkContext = await this.getStoredContext(chunk.id);
      if (chunkContext) {
        context.availableExports.push(...chunkContext.availableExports);
        context.availableFiles.push(...chunkContext.availableFiles);
        context.changesSoFar.filesCreated.push(...chunkContext.changesSoFar.filesCreated);
        context.changesSoFar.filesModified.push(...chunkContext.changesSoFar.filesModified);
        context.changesSoFar.totalAdditions += chunkContext.changesSoFar.totalAdditions;
        context.changesSoFar.totalDeletions += chunkContext.changesSoFar.totalDeletions;
      }
    }

    // Deduplicate
    context.availableExports = this.deduplicateExports(context.availableExports);

    return context;
  }

  /**
   * Record what a chunk created (called after successful execution)
   */
  async recordChunkContext(chunkId: string): Promise<ChunkExecutionContext> {
    // Get git diff for uncommitted changes
    const diff = await this.parseGitDiff();

    // Find exports in changed files
    const exports: AvailableExport[] = [];

    for (const file of [...diff.created, ...diff.modified]) {
      const fileExports = await this.findExportsInFile(file);
      exports.push(...fileExports.map(exp => ({
        ...exp,
        createdByChunk: chunkId,
        file
      })));
    }

    const context: ChunkExecutionContext = {
      availableExports: exports,
      availableFiles: [
        ...diff.created.map(p => ({ path: p, exports: [], createdByChunk: chunkId })),
        ...diff.modified.map(p => ({ path: p, exports: [], modifiedByChunk: chunkId }))
      ],
      changesSoFar: {
        filesCreated: diff.created,
        filesModified: diff.modified,
        totalAdditions: diff.additions,
        totalDeletions: diff.deletions
      }
    };

    // Store in database
    await this.storeContext(chunkId, context);

    return context;
  }

  private async parseGitDiff(): Promise<{
    created: string[];
    modified: string[];
    additions: number;
    deletions: number;
  }> {
    // Get file status
    const statusResult = spawnSync('git', ['status', '--porcelain'], {
      cwd: this.workingDir,
      encoding: 'utf-8',
      shell: false
    });

    const created: string[] = [];
    const modified: string[] = [];

    if (statusResult.status === 0) {
      const lines = statusResult.stdout.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const status = line.slice(0, 2);
        const file = line.slice(3);

        if (status.includes('A') || status.includes('?')) {
          created.push(file);
        } else if (status.includes('M')) {
          modified.push(file);
        }
      }
    }

    // Get line counts
    const diffStatResult = spawnSync('git', ['diff', '--numstat'], {
      cwd: this.workingDir,
      encoding: 'utf-8',
      shell: false
    });

    let additions = 0;
    let deletions = 0;

    if (diffStatResult.status === 0) {
      const lines = diffStatResult.stdout.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const [add, del] = line.split('\t');
        additions += parseInt(add, 10) || 0;
        deletions += parseInt(del, 10) || 0;
      }
    }

    return { created, modified, additions, deletions };
  }

  private async findExportsInFile(filePath: string): Promise<Omit<AvailableExport, 'createdByChunk' | 'file'>[]> {
    const fullPath = path.join(this.workingDir, filePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const exports: Omit<AvailableExport, 'createdByChunk' | 'file'>[] = [];

      // Match: export const/function/interface/type/class Name
      const pattern = /export\s+(const|function|interface|type|class)\s+(\w+)/g;
      let match;

      while ((match = pattern.exec(content)) !== null) {
        exports.push({
          name: match[2],
          from: this.getImportPath(filePath),
          type: match[1] as AvailableExport['type']
        });
      }

      return exports;
    } catch {
      return [];
    }
  }

  private getImportPath(filePath: string): string {
    // Convert file path to import path
    if (filePath.startsWith('packages/shared/')) {
      return '@specwright/shared';
    }
    if (filePath.startsWith('packages/dashboard/')) {
      return filePath
        .replace('packages/dashboard/src/', '@/')
        .replace(/\.tsx?$/, '');
    }
    return filePath;
  }

  private deduplicateExports(exports: AvailableExport[]): AvailableExport[] {
    const seen = new Map<string, AvailableExport>();
    for (const exp of exports) {
      const key = `${exp.from}:${exp.name}`;
      if (!seen.has(key)) {
        seen.set(key, exp);
      }
    }
    return Array.from(seen.values());
  }

  private async getStoredContext(chunkId: string): Promise<ChunkExecutionContext | null> {
    // Retrieve from database
    const db = getDb();
    const row = db.prepare('SELECT context FROM chunk_contexts WHERE chunk_id = ?').get(chunkId);
    return row ? JSON.parse(row.context) : null;
  }

  private async storeContext(chunkId: string, context: ChunkExecutionContext): Promise<void> {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO chunk_contexts (id, spec_id, chunk_id, context)
      VALUES (?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      this.specId,
      chunkId,
      JSON.stringify(context)
    );
  }
}
```

## Integrated Chunk Pipeline

```typescript
// packages/dashboard/src/lib/services/chunk-pipeline.ts (updated)

export async function executeChunkWithEnforcement(
  chunk: Chunk,
  spec: Spec,
  gitState: GitWorkflowState,
  events: ChunkPipelineEvents
): Promise<ChunkPipelineResult> {
  const accumulator = new ContextAccumulator(spec.id, gitState.workingDir);
  const validator = new AssertionValidator(gitState.workingDir);

  // LAYER 1: Pre-execution gate
  const context = await accumulator.getContextForChunk(chunk.order);
  const gateResult = await checkPreExecutionGate(chunk, context);

  if (!gateResult.canExecute) {
    const reasons = gateResult.blockedBy?.map(b => b.details).join(', ');
    events.onError?.(chunk.id, `Blocked: ${reasons}`);

    return {
      status: 'fail',
      error: `Preconditions not met: ${reasons}`
    };
  }

  let attempt = 1;
  const maxAttempts = 3;
  let retryContext: RetryContext | undefined;

  while (attempt <= maxAttempts) {
    events.onExecutionStart?.(chunk.id);

    // LAYER 2: Context injection
    const prompt = buildExecutorPrompt(chunk, spec, context, retryContext);

    // Execute with GLM
    const executionResult = await chunkExecutor.execute(
      chunk.id,
      prompt,
      gitState.workingDir
    );

    events.onExecutionComplete?.(chunk.id, executionResult);

    // Run build
    const buildResult = await runBuild(gitState.workingDir);

    // LAYER 3: Post-execution validation
    const validationResult = await validator.validateChunk(chunk, buildResult);

    events.onValidationComplete?.(chunk.id, validationResult);

    if (validationResult.passed) {
      // LAYER 4: Context accumulation
      await accumulator.recordChunkContext(chunk.id);

      // Commit changes
      if (gitState.enabled) {
        await gitService.commit(gitState, `chunk: ${chunk.title}`);
      }

      return {
        status: 'pass',
        output: executionResult.output
      };
    }

    // Check if retryable
    if (!validationResult.retryable || attempt >= maxAttempts) {
      // Reset git state
      if (gitState.enabled) {
        gitService.resetHard(gitState);
      }

      return {
        status: 'fail',
        error: formatValidationErrors(validationResult),
        reviewFeedback: formatValidationErrors(validationResult)
      };
    }

    // Prepare retry
    retryContext = {
      ...validationResult.retryContext!,
      attempt: attempt + 1
    };

    // Reset for retry
    if (gitState.enabled) {
      gitService.resetHard(gitState);
    }

    console.log(`[Pipeline] Validation failed, retrying (${attempt + 1}/${maxAttempts})`);
    attempt++;
  }

  return { status: 'fail', error: 'Max retries exceeded' };
}

function formatValidationErrors(result: ChunkValidationResult): string {
  const parts: string[] = [];

  if (!result.buildPassed) {
    parts.push('BUILD FAILED:');
    parts.push(result.buildOutput?.slice(0, 500) || 'Unknown error');
  }

  const failedAsserts = result.assertResults.filter(r => !r.passed);
  if (failedAsserts.length > 0) {
    parts.push('\nASSERTION FAILURES:');
    for (const r of failedAsserts) {
      parts.push(`• ${r.assertion.message}`);
      parts.push(`  Expected: ${r.expected}`);
      parts.push(`  Actual: ${r.actual}`);
    }
  }

  return parts.join('\n');
}
```

---

# Roadmap Implementation

## Impact Analysis (P1)

Before modifying existing files, analyze what depends on them:

```typescript
// packages/dashboard/src/lib/services/impact-analyzer.ts

export async function analyzeImpact(
  chunk: Chunk,
  workingDir: string
): Promise<ImpactAnalysis> {
  const impact: ImpactAnalysis = {
    filesAffected: [],
    functionsAffected: [],
    typesAffected: [],
    summary: ''
  };

  // Find files this chunk will modify
  const filesToModify = getFilesToModify(chunk);

  for (const file of filesToModify) {
    // Find all files that import from this file
    const importers = await findImporters(file, workingDir);
    impact.filesAffected.push(...importers);

    // Find specific exports that are used elsewhere
    const exports = await findExportsInFile(file, workingDir);

    for (const exp of exports) {
      const usages = await findUsages(exp.name, workingDir);
      if (usages.length > 0) {
        if (exp.type === 'function') {
          impact.functionsAffected.push({
            name: exp.name,
            file,
            callers: usages
          });
        } else {
          impact.typesAffected.push({
            name: exp.name,
            file,
            usages
          });
        }
      }
    }
  }

  impact.summary = generateSummary(impact);
  return impact;
}

function generateSummary(impact: ImpactAnalysis): string {
  const parts: string[] = ['## IMPACT ANALYSIS\n'];

  if (impact.functionsAffected.length > 0) {
    parts.push('Functions you are modifying:');
    impact.functionsAffected.forEach(f => {
      parts.push(`• ${f.name} - called by ${f.callers.length} places`);
    });
  }

  if (impact.typesAffected.length > 0) {
    parts.push('\nTypes you are modifying:');
    impact.typesAffected.forEach(t => {
      parts.push(`• ${t.name} - used in ${t.usages.length} places`);
    });
  }

  if (parts.length > 1) {
    parts.push('\n⚠️ Verify your changes don\'t break these usages.');
  }

  return parts.join('\n');
}
```

## Contract Amendments (P1)

When chunks fail repeatedly with the same issue, propose a contract amendment:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ CONTRACT AMENDMENT PROPOSED                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Chunk 2 failed 3 times with the same issue:                    │
│  "checkHealth signature doesn't match contract"                 │
│                                                                 │
│  The chunk discovered it needs an options parameter.            │
│                                                                 │
│  PROPOSED CHANGE:                                               │
│  ┌─────────────────────────────────────────────────────────────┐
│  │ functions[0].signature                                      │
│  │                                                             │
│  │ - (): Promise<HealthCheckResult>                            │
│  │ + (options?: HealthCheckOptions): Promise<HealthCheckResult>│
│  └─────────────────────────────────────────────────────────────┘
│                                                                 │
│  NEW TYPE NEEDED:                                               │
│  ┌─────────────────────────────────────────────────────────────┐
│  │ interface HealthCheckOptions {                              │
│  │   timeout?: number;                                         │
│  │   skipGit?: boolean;                                        │
│  │ }                                                           │
│  └─────────────────────────────────────────────────────────────┘
│                                                                 │
│  DOWNSTREAM EFFECTS:                                            │
│  • Chunk 3: Will need to pass options when calling checkHealth │
│  • Chunk 4: Integration - signature change propagates          │
│                                                                 │
│  ┌────────────────────────┐  ┌───────────────────────────────┐ │
│  │  ✓ Accept & Continue   │  │  ✗ Reject & Fail Chunk        │ │
│  └────────────────────────┘  └───────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

```typescript
// packages/dashboard/src/lib/services/amendment-proposer.ts

export async function proposeAmendment(
  chunk: Chunk,
  failures: AssertionResult[],
  executionOutput: string
): Promise<AmendmentProposal | null> {
  // Analyze failures to see if they indicate a contract problem
  const signatureFailures = failures.filter(f =>
    f.assertion.check.type === 'function_exists' ||
    f.error?.includes('signature')
  );

  if (signatureFailures.length === 0) {
    return null; // Not a contract issue
  }

  // Use LLM to propose an amendment
  const proposal = await generateAmendmentProposal(chunk, failures, executionOutput);

  if (proposal) {
    // Find affected downstream chunks
    proposal.affectedChunks = findAffectedChunks(chunk, proposal);
  }

  return proposal;
}
```

## AST Validation (P2)

For signature matching when regex isn't enough:

```typescript
// packages/dashboard/src/lib/services/ast-validator.ts

import * as ts from 'typescript';

export async function checkSignatureMatch(
  file: string,
  functionName: string,
  expectedSignature: string
): Promise<AssertionResult> {
  const program = ts.createProgram([file], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext
  });

  const sourceFile = program.getSourceFile(file);
  if (!sourceFile) {
    return {
      assertion: { /* ... */ },
      passed: false,
      tier: 3,
      error: 'Could not parse file'
    };
  }

  const checker = program.getTypeChecker();

  // Find the function declaration
  let foundFunction: ts.FunctionDeclaration | ts.ArrowFunction | undefined;

  ts.forEachChild(sourceFile, node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      foundFunction = node;
    }
    // Also check variable declarations with arrow functions
    if (ts.isVariableStatement(node)) {
      // ...
    }
  });

  if (!foundFunction) {
    return {
      assertion: { /* ... */ },
      passed: false,
      tier: 3,
      expected: functionName,
      actual: 'Function not found'
    };
  }

  // Compare signatures
  const actualSignature = checker.signatureToString(
    checker.getSignatureFromDeclaration(foundFunction)!
  );

  const matches = normalizeSignature(actualSignature) === normalizeSignature(expectedSignature);

  return {
    assertion: { /* ... */ },
    passed: matches,
    tier: 3,
    expected: expectedSignature,
    actual: actualSignature
  };
}

function normalizeSignature(sig: string): string {
  // Remove whitespace differences, normalize optional markers, etc.
  return sig.replace(/\s+/g, ' ').trim();
}
```

---

# UI: Validation Results

```typescript
// packages/dashboard/src/components/ValidationResultsPanel.tsx

export function ValidationResultsPanel({ result }: { result: ChunkValidationResult }) {
  return (
    <div className="space-y-4 p-4 bg-neutral-900 rounded-lg">
      {/* Overall Status */}
      <div className={`flex items-center gap-2 p-3 rounded ${
        result.passed ? 'bg-emerald-500/10' : 'bg-red-500/10'
      }`}>
        {result.passed ? (
          <CheckCircle className="w-5 h-5 text-emerald-400" />
        ) : (
          <XCircle className="w-5 h-5 text-red-400" />
        )}
        <span className="font-medium">
          {result.passed ? 'All checks passed' : 'Validation failed'}
        </span>
      </div>

      {/* Build Status */}
      <div className={`p-3 rounded ${
        result.buildPassed ? 'bg-neutral-800' : 'bg-red-500/10'
      }`}>
        <div className="flex items-center gap-2">
          {result.buildPassed ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <X className="w-4 h-4 text-red-400" />
          )}
          <span className="text-sm">Build {result.buildPassed ? 'passed' : 'failed'}</span>
        </div>
        {!result.buildPassed && result.buildOutput && (
          <pre className="mt-2 text-xs text-red-300 overflow-auto max-h-32">
            {result.buildOutput}
          </pre>
        )}
      </div>

      {/* Assertions */}
      {result.assertResults.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-neutral-400 mb-2">
            Requirements ({result.assertResults.filter(r => r.passed).length}/{result.assertResults.length})
          </h4>
          <div className="space-y-2">
            {result.assertResults.map((r, i) => (
              <div key={i} className={`p-2 rounded text-sm ${
                r.passed ? 'bg-emerald-500/5' : 'bg-red-500/10'
              }`}>
                <div className="flex items-center gap-2">
                  {r.passed ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <X className="w-4 h-4 text-red-400" />
                  )}
                  <span>{r.assertion.message}</span>
                  <span className="text-xs text-neutral-500">Tier {r.tier}</span>
                </div>
                {!r.passed && (
                  <div className="mt-1 pl-6 text-xs text-neutral-400">
                    <div>Expected: {r.expected}</div>
                    <div>Actual: {r.actual}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retry Info */}
      {result.retryContext && (
        <div className="p-3 bg-yellow-500/10 rounded">
          <div className="flex items-center gap-2 text-yellow-400">
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm">
              Retry {result.retryContext.attempt}/{result.retryContext.maxAttempts}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

# Acceptance Criteria

## MVP

- [ ] Pre-execution gate blocks if dependencies not completed
- [ ] Pre-execution gate blocks if consumes not available
- [ ] Context accumulated from previous chunks (git diff + exports)
- [ ] Prompt includes available exports section
- [ ] Prompt includes retry context on failures
- [ ] Regex-based export existence check (Tier 1)
- [ ] Additive tolerance: extra exports OK, missing = fail
- [ ] Automatic retry up to 3 times with error context
- [ ] Validation results displayed in UI
- [ ] Context stored in database per chunk

## Roadmap

- [ ] Impact analysis before modifying existing code
- [ ] Impact summary included in prompt
- [ ] Contract amendment proposal on repeated failures
- [ ] Amendment UI with accept/reject
- [ ] AST-based signature validation (Tier 3)
- [ ] LLM-as-judge for semantic checks
- [ ] Parallel chunk execution for independent chunks
