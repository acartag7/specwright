# ORC-61: Contract Generation System

## Overview

Implement a contract generation phase in Spec Studio that produces explicit, typed contracts from natural language specs before chunking. Contracts define exactly what will be created (types, files, functions, signatures) and how chunks depend on each other.

## Problem Statement

Current chunking is vague:
- Chunks have titles and descriptions but no explicit contracts
- No definition of what each chunk creates vs consumes
- No explicit dependencies between chunks
- GLM must guess what exists, leading to broken imports

## Solution

Add a **Contract Phase** between spec refinement and chunking:

```
Spec Writing → Spec Refinement → CONTRACT GENERATION → Feasibility Check → User Review → Chunking → Execution
                                        ↑                      ↑              ↑
                                   NEW PHASE            VALIDATES        USER APPROVAL
```

---

# MVP vs Roadmap

## MVP Scope

| Feature | Description | Priority |
|---------|-------------|----------|
| SpecContract type | Core data model with types, files, chunks, creates/consumes | P0 |
| Contract generation prompt | Opus generates contract from spec | P0 |
| Feasibility check (grep) | Validate consumes exist in repo before user review | P0 |
| Basic contract review UI | Show types, files, chunks in readable format | P0 |
| Contract approval flow | Approve → generate chunks with dependencies | P0 |
| Inline warnings | Show feasibility issues in review UI | P0 |

## Roadmap (Post-MVP)

| Feature | Description | Priority |
|---------|-------------|----------|
| Contract editing UI | Full CRUD for types, files, chunks | P1 |
| Dependency graph visualization | Visual DAG of chunk dependencies | P1 |
| Progressive disclosure | Collapsed defaults, expand for details | P1 |
| Smart warnings | Highlight unusual patterns vs standard | P2 |
| Contract templates | Reusable patterns for common features | P2 |
| Contract diffing | Show what changed on regenerate | P2 |
| Import from previous specs | Copy/adapt contracts from similar work | P3 |
| Contract versioning | Track iterations of contract design | P3 |

---

# Data Model

## Core Types (packages/shared/src/types.ts)

```typescript
// ============================================
// CONTRACT TYPES
// ============================================

/**
 * Contract for a type/interface to be created
 */
export interface ContractType {
  name: string;              // "HealthCheckResult"
  file: string;              // "packages/shared/src/types.ts"
  definition: string;        // Full TypeScript definition
  exportedFrom: string;      // "@specwright/shared"
}

/**
 * Contract for a file to be created/modified
 */
export interface ContractFile {
  path: string;              // "packages/dashboard/src/lib/health-check.ts"
  action: 'create' | 'modify';
  purpose: string;           // Brief description
  exports: string[];         // ["checkHealth", "HealthChecker"]
  imports: {
    from: string;            // "@specwright/shared"
    items: string[];         // ["HealthCheckResult"]
  }[];
}

/**
 * Contract for a function signature
 */
export interface ContractFunction {
  name: string;              // "checkHealth"
  file: string;              // File where it's defined
  signature: string;         // "(options?: Options): Promise<HealthCheckResult>"
  description: string;       // What it does
}

/**
 * Assertion types for enforcement
 */
export type AssertionCheckType =
  | 'export_exists'      // Check export exists in file
  | 'file_exists'        // Check file exists
  | 'function_exists'    // Check function exists
  | 'type_matches'       // Check type has correct shape (roadmap)
  | 'pattern_match'      // Regex pattern match
  | 'custom';            // Custom validation (roadmap)

/**
 * Assertion for a chunk - DSPy-inspired Assert/Suggest
 */
export interface ContractAssertion {
  type: 'assert' | 'suggest';
  condition: string;         // Human-readable condition
  check: {
    type: AssertionCheckType;
    target: string;          // What to check
    file?: string;           // File to check in
    expected?: string;       // Expected value/shape
  };
  message: string;           // Error message if violated
}

/**
 * Contract for a single chunk
 */
export interface ContractChunk {
  order: number;
  title: string;
  description: string;
  creates: string[];         // ["HealthCheckResult", "checkHealth()"]
  consumes: string[];        // ["Chunk", "Spec from @specwright/shared"]
  dependsOn: number[];       // [1, 2] - chunk orders this depends on
  assertions: ContractAssertion[];
}

/**
 * Feasibility check result for a single item
 */
export interface FeasibilityIssue {
  severity: 'error' | 'warning';
  category: 'consumes' | 'file_path' | 'import' | 'conflict';
  item: string;              // The problematic item
  message: string;           // What's wrong
  suggestion?: string;       // How to fix
  location?: string;         // Where in contract
}

/**
 * Full feasibility check result
 */
export interface FeasibilityResult {
  feasible: boolean;         // No errors (warnings OK)
  issues: FeasibilityIssue[];
  checkedAt: string;         // ISO timestamp
}

/**
 * Full spec contract
 */
export interface SpecContract {
  version: string;           // Contract schema version "1.0"
  specId: string;
  generatedAt: string;       // ISO timestamp

  // What will be created
  types: ContractType[];
  files: ContractFile[];
  functions: ContractFunction[];

  // How work is divided
  chunks: ContractChunk[];

  // Global assertions (apply to all chunks)
  globalAssertions: ContractAssertion[];

  // Feasibility check result (populated after check)
  feasibility?: FeasibilityResult;
}

/**
 * Contract amendment proposal (Roadmap)
 */
export interface ContractAmendment {
  id: string;
  contractId: string;
  proposedBy: 'system' | 'user';
  reason: string;
  changes: {
    path: string;            // "chunks[2].creates[0]"
    oldValue: string;
    newValue: string;
  }[];
  affectedChunks: number[];
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}
```

## Database Changes

```sql
-- Add contract column to specs
ALTER TABLE specs ADD COLUMN contract TEXT;  -- JSON serialized SpecContract
ALTER TABLE specs ADD COLUMN contract_approved_at TEXT;

-- Add contract fields to chunks
ALTER TABLE chunks ADD COLUMN creates TEXT;      -- JSON array
ALTER TABLE chunks ADD COLUMN consumes TEXT;     -- JSON array
ALTER TABLE chunks ADD COLUMN depends_on TEXT;   -- JSON array of chunk IDs
ALTER TABLE chunks ADD COLUMN assertions TEXT;   -- JSON array

-- Roadmap: Contract amendments table
CREATE TABLE IF NOT EXISTS contract_amendments (
  id TEXT PRIMARY KEY,
  spec_id TEXT NOT NULL,
  proposed_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  changes TEXT NOT NULL,        -- JSON
  affected_chunks TEXT NOT NULL, -- JSON array
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY (spec_id) REFERENCES specs(id)
);
```

---

# MVP Implementation

## 1. Contract Generation Prompt

```typescript
// packages/dashboard/src/prompts/contract-generator.ts

export const CONTRACT_GENERATION_SYSTEM = `You are a software architect generating implementation contracts.

Your job is to analyze a specification and produce a detailed contract that defines:
1. Exactly what types/interfaces will be created
2. Exactly what files will be created or modified
3. Exactly what functions will be implemented
4. How the work is divided into ordered chunks with dependencies

RULES:
- Every type must have a complete TypeScript definition
- Every file must list its exports and imports
- Every function must have a complete signature with parameters and return type
- Chunks must be ordered so dependencies come first
- Each chunk's consumes[] must only reference items from previous chunks' creates[] OR existing project exports
- Never create circular dependencies
- Prefer modifying existing files over creating new ones
- Use existing project patterns and conventions

ASSERTIONS:
For each chunk, include assertions that can be verified:
- ASSERT (hard requirement): "File must export X", "Function must return Promise<Y>"
- SUGGEST (soft guidance): "Should follow existing patterns", "Prefer using existing component"`;

export const CONTRACT_GENERATION_USER = `
SPECIFICATION:
{spec_content}

PROJECT CONTEXT:
Working directory: {working_dir}
Existing exports from @specwright/shared:
{existing_shared_exports}

Existing project files:
{existing_files_summary}

Generate a complete implementation contract as JSON matching this schema:
{contract_schema}

Return ONLY valid JSON, no markdown code blocks or explanation.`;
```

## 2. Feasibility Check Service

```typescript
// packages/dashboard/src/lib/services/feasibility-checker.ts

import { spawnSync } from 'child_process';
import * as path from 'path';

export class FeasibilityChecker {
  constructor(private workingDir: string) {}

  async check(contract: SpecContract): Promise<FeasibilityResult> {
    const issues: FeasibilityIssue[] = [];

    // 1. Check all consumes items exist
    for (const chunk of contract.chunks) {
      for (const item of chunk.consumes) {
        const exists = await this.checkItemExists(item, contract, chunk.order);
        if (!exists.found) {
          issues.push({
            severity: 'error',
            category: 'consumes',
            item,
            message: `"${item}" not found in project or previous chunks`,
            suggestion: exists.suggestion,
            location: `chunks[${chunk.order}].consumes`
          });
        }
      }
    }

    // 2. Check file paths are valid
    for (const file of contract.files) {
      if (file.action === 'modify') {
        const exists = await this.fileExists(file.path);
        if (!exists) {
          issues.push({
            severity: 'error',
            category: 'file_path',
            item: file.path,
            message: `Cannot modify "${file.path}" - file does not exist`,
            suggestion: 'Change action to "create" or fix the path',
            location: `files[${file.path}]`
          });
        }
      }
      if (file.action === 'create') {
        const exists = await this.fileExists(file.path);
        if (exists) {
          issues.push({
            severity: 'warning',
            category: 'file_path',
            item: file.path,
            message: `File "${file.path}" already exists - will be overwritten`,
            suggestion: 'Change action to "modify" if extending existing file',
            location: `files[${file.path}]`
          });
        }
      }
    }

    // 3. Check imports reference valid packages
    for (const file of contract.files) {
      for (const imp of file.imports) {
        const valid = await this.checkImportValid(imp.from);
        if (!valid) {
          issues.push({
            severity: 'warning',
            category: 'import',
            item: `${imp.from}`,
            message: `Import from "${imp.from}" may not exist`,
            location: `files[${file.path}].imports`
          });
        }
      }
    }

    // 4. Check for dependency order violations
    const orderIssues = this.checkDependencyOrder(contract);
    issues.push(...orderIssues);

    // 5. Check for name conflicts
    const conflictIssues = this.checkNameConflicts(contract);
    issues.push(...conflictIssues);

    return {
      feasible: !issues.some(i => i.severity === 'error'),
      issues,
      checkedAt: new Date().toISOString()
    };
  }

  private async checkItemExists(
    item: string,
    contract: SpecContract,
    beforeOrder: number
  ): Promise<{ found: boolean; suggestion?: string }> {
    // Check if created by a previous chunk
    const createdBefore = contract.chunks
      .filter(c => c.order < beforeOrder)
      .some(c => c.creates.includes(item));

    if (createdBefore) {
      return { found: true };
    }

    // Check if exists in project using grep
    const grepResult = this.grepForExport(item);
    if (grepResult.found) {
      return { found: true };
    }

    // Try to find similar names for suggestion
    const similar = this.findSimilarExports(item);
    return {
      found: false,
      suggestion: similar ? `Did you mean: ${similar}?` : undefined
    };
  }

  private grepForExport(name: string): { found: boolean; file?: string } {
    // Simple grep for export
    const pattern = `export.*(const|function|interface|type|class)\\s+${name}\\b`;
    const result = spawnSync('grep', ['-r', '-l', '-E', pattern, '.'], {
      cwd: this.workingDir,
      encoding: 'utf-8',
      shell: false
    });

    if (result.status === 0 && result.stdout.trim()) {
      return { found: true, file: result.stdout.trim().split('\n')[0] };
    }

    // Also check for re-exports
    const reexportPattern = `export\\s*\\{[^}]*${name}[^}]*\\}`;
    const reexportResult = spawnSync('grep', ['-r', '-l', '-E', reexportPattern, '.'], {
      cwd: this.workingDir,
      encoding: 'utf-8',
      shell: false
    });

    if (reexportResult.status === 0 && reexportResult.stdout.trim()) {
      return { found: true, file: reexportResult.stdout.trim().split('\n')[0] };
    }

    return { found: false };
  }

  private findSimilarExports(name: string): string | undefined {
    // Simple Levenshtein-ish search for similar names
    // Could be improved with proper fuzzy matching
    const prefix = name.slice(0, 3).toLowerCase();
    const result = spawnSync('grep', ['-r', '-h', '-o', '-E',
      `export\\s+(const|function|interface|type|class)\\s+${prefix}\\w+`
    ], {
      cwd: this.workingDir,
      encoding: 'utf-8',
      shell: false
    });

    if (result.status === 0 && result.stdout.trim()) {
      const matches = result.stdout.trim().split('\n')
        .map(line => line.match(/\s(\w+)$/)?.[1])
        .filter(Boolean);
      return matches[0];
    }
    return undefined;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.workingDir, filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  private checkImportValid(importPath: string): boolean {
    // Check if it's a known package or relative import
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      return true; // Relative imports - can't validate without more context
    }
    if (importPath.startsWith('@specwright/')) {
      return true; // Our packages
    }
    // Check node_modules
    const packageName = importPath.split('/')[0];
    const packagePath = path.join(this.workingDir, 'node_modules', packageName);
    try {
      fs.accessSync(packagePath);
      return true;
    } catch {
      return false;
    }
  }

  private checkDependencyOrder(contract: SpecContract): FeasibilityIssue[] {
    const issues: FeasibilityIssue[] = [];

    for (const chunk of contract.chunks) {
      for (const depOrder of chunk.dependsOn) {
        if (depOrder >= chunk.order) {
          issues.push({
            severity: 'error',
            category: 'conflict',
            item: `Chunk ${chunk.order}`,
            message: `Depends on chunk ${depOrder} which comes after or is same`,
            location: `chunks[${chunk.order}].dependsOn`
          });
        }
      }
    }

    // Check for cycles
    const visited = new Set<number>();
    const recursionStack = new Set<number>();

    const hasCycle = (order: number): boolean => {
      visited.add(order);
      recursionStack.add(order);

      const chunk = contract.chunks.find(c => c.order === order);
      if (chunk) {
        for (const dep of chunk.dependsOn) {
          if (!visited.has(dep) && hasCycle(dep)) {
            return true;
          } else if (recursionStack.has(dep)) {
            return true;
          }
        }
      }

      recursionStack.delete(order);
      return false;
    };

    for (const chunk of contract.chunks) {
      if (!visited.has(chunk.order) && hasCycle(chunk.order)) {
        issues.push({
          severity: 'error',
          category: 'conflict',
          item: `Chunk ${chunk.order}`,
          message: 'Circular dependency detected',
          location: `chunks[${chunk.order}]`
        });
        break;
      }
    }

    return issues;
  }

  private checkNameConflicts(contract: SpecContract): FeasibilityIssue[] {
    const issues: FeasibilityIssue[] = [];
    const names = new Map<string, string>();

    // Check type names
    for (const type of contract.types) {
      if (names.has(type.name)) {
        issues.push({
          severity: 'error',
          category: 'conflict',
          item: type.name,
          message: `Type "${type.name}" defined multiple times`,
          location: `types`
        });
      }
      names.set(type.name, 'type');
    }

    // Check function names
    for (const func of contract.functions) {
      if (names.has(func.name)) {
        issues.push({
          severity: 'warning',
          category: 'conflict',
          item: func.name,
          message: `"${func.name}" conflicts with existing ${names.get(func.name)}`,
          location: `functions`
        });
      }
      names.set(func.name, 'function');
    }

    return issues;
  }
}
```

## 3. Contract Review UI (MVP)

```typescript
// packages/dashboard/src/components/spec-studio/ContractReviewStep.tsx

interface Props {
  contract: SpecContract;
  onApprove: () => void;
  onRegenerate: () => void;
  onBack: () => void;
}

export function ContractReviewStep({ contract, onApprove, onRegenerate, onBack }: Props) {
  const hasErrors = contract.feasibility?.issues.some(i => i.severity === 'error');
  const warnings = contract.feasibility?.issues.filter(i => i.severity === 'warning') || [];
  const errors = contract.feasibility?.issues.filter(i => i.severity === 'error') || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Review Contract</h2>
        <button
          onClick={onRegenerate}
          className="px-3 py-1.5 text-sm bg-neutral-800 hover:bg-neutral-700 rounded"
        >
          Regenerate
        </button>
      </div>

      {/* Feasibility Issues */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="space-y-2">
          {errors.map((issue, i) => (
            <div key={i} className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-300">{issue.item}</span>
              </div>
              <p className="text-sm text-red-200 mt-1">{issue.message}</p>
              {issue.suggestion && (
                <p className="text-xs text-red-300/70 mt-1">💡 {issue.suggestion}</p>
              )}
            </div>
          ))}
          {warnings.map((issue, i) => (
            <div key={i} className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-yellow-300">{issue.item}</span>
              </div>
              <p className="text-sm text-yellow-200 mt-1">{issue.message}</p>
              {issue.suggestion && (
                <p className="text-xs text-yellow-300/70 mt-1">💡 {issue.suggestion}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Types Section */}
      <CollapsibleSection
        title={`Types (${contract.types.length})`}
        defaultOpen={contract.types.length <= 3}
      >
        <div className="space-y-2">
          {contract.types.map((type, i) => (
            <div key={i} className="p-3 bg-neutral-800/50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-emerald-400">{type.name}</span>
                <span className="text-xs text-neutral-500">{type.exportedFrom}</span>
              </div>
              <pre className="mt-2 text-xs text-neutral-300 overflow-x-auto">
                {type.definition}
              </pre>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Files Section */}
      <CollapsibleSection
        title={`Files (${contract.files.length})`}
        defaultOpen={contract.files.length <= 5}
      >
        <div className="space-y-2">
          {contract.files.map((file, i) => (
            <div key={i} className="p-3 bg-neutral-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  file.action === 'create'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {file.action.toUpperCase()}
                </span>
                <span className="font-mono text-sm text-neutral-300">{file.path}</span>
              </div>
              <p className="text-xs text-neutral-500 mt-1">{file.purpose}</p>
              <div className="mt-2 text-xs">
                <span className="text-neutral-500">Exports: </span>
                <span className="text-neutral-300">{file.exports.join(', ')}</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Chunks Section */}
      <CollapsibleSection title={`Chunks (${contract.chunks.length})`} defaultOpen>
        <div className="space-y-3">
          {contract.chunks.map((chunk, i) => (
            <div key={i} className="p-4 bg-neutral-800/50 rounded-lg border border-neutral-700">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs">
                  {chunk.order}
                </span>
                <span className="font-medium text-white">{chunk.title}</span>
              </div>

              <p className="text-sm text-neutral-400 mt-2">{chunk.description}</p>

              <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-neutral-500">Creates:</span>
                  <div className="mt-1 space-y-1">
                    {chunk.creates.map((item, j) => (
                      <div key={j} className="text-emerald-400">+ {item}</div>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-neutral-500">Consumes:</span>
                  <div className="mt-1 space-y-1">
                    {chunk.consumes.map((item, j) => (
                      <div key={j} className="text-blue-400">← {item}</div>
                    ))}
                    {chunk.consumes.length === 0 && (
                      <div className="text-neutral-600">(none)</div>
                    )}
                  </div>
                </div>
              </div>

              {chunk.dependsOn.length > 0 && (
                <div className="mt-2 text-xs">
                  <span className="text-neutral-500">Depends on: </span>
                  <span className="text-neutral-400">
                    Chunk {chunk.dependsOn.join(', Chunk ')}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
        >
          ← Back to Refine
        </button>
        <button
          onClick={onApprove}
          disabled={hasErrors}
          className={`px-4 py-2 text-sm rounded-lg ${
            hasErrors
              ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {hasErrors ? 'Fix Errors to Continue' : 'Approve Contract →'}
        </button>
      </div>
    </div>
  );
}
```

## 4. API Endpoints

### POST /api/specs/[id]/contract/generate

```typescript
export async function POST(request: Request, context: RouteContext) {
  const { id: specId } = await context.params;

  const spec = getSpec(specId);
  if (!spec) {
    return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
  }

  const project = getProject(spec.projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Gather project context
  const existingExports = await gatherExistingExports(project.directory);
  const existingFiles = await gatherExistingFiles(project.directory);

  // Generate contract with Opus
  const contractJson = await generateContract(spec.content, {
    workingDir: project.directory,
    existingExports,
    existingFiles
  });

  const contract: SpecContract = JSON.parse(contractJson);
  contract.specId = specId;
  contract.generatedAt = new Date().toISOString();
  contract.version = '1.0';

  // Run feasibility check
  const checker = new FeasibilityChecker(project.directory);
  contract.feasibility = await checker.check(contract);

  return NextResponse.json({ contract });
}
```

### POST /api/specs/[id]/contract/approve

```typescript
export async function POST(request: Request, context: RouteContext) {
  const { id: specId } = await context.params;
  const { contract } = await request.json();

  // Validate contract has no errors
  if (contract.feasibility?.issues.some(i => i.severity === 'error')) {
    return NextResponse.json(
      { error: 'Cannot approve contract with errors' },
      { status: 400 }
    );
  }

  // Save contract to spec
  updateSpec(specId, {
    contract: JSON.stringify(contract),
    contractApprovedAt: new Date().toISOString()
  });

  // Generate chunks from contract
  const chunks = await generateChunksFromContract(specId, contract);

  return NextResponse.json({ success: true, chunks });
}
```

---

# Roadmap Implementation

## Contract Editing UI (P1)

Full CRUD interface for editing contract before approval:

```
┌─────────────────────────────────────────────────────────────────┐
│  EDIT CONTRACT                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [+ Add Type] [+ Add File] [+ Add Chunk]                       │
│                                                                 │
│  Types ─────────────────────────────────────────────────────── │
│  ┌─────────────────────────────────────────────────────────────┐
│  │ HealthCheckResult                         [Edit] [Delete]   │
│  │ interface HealthCheckResult {                               │
│  │   healthy: boolean;                                         │
│  │   dependencies: HealthCheckDependency[];                    │
│  │ }                                                           │
│  └─────────────────────────────────────────────────────────────┘
│                                                                 │
│  Chunks ────────────────────────────────────────────────────── │
│  [Drag to reorder - dependencies auto-update]                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Dependency Graph Visualization (P1)

```
┌─────────────────────────────────────────────────────────────────┐
│  DEPENDENCY GRAPH                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│         ┌───────────────────┐                                   │
│         │  1. Create Types  │                                   │
│         └─────────┬─────────┘                                   │
│                   │                                             │
│         ┌─────────▼─────────┐                                   │
│         │  2. Health Logic  │                                   │
│         └─────────┬─────────┘                                   │
│                   │                                             │
│         ┌─────────▼─────────┐                                   │
│         │  3. UI Component  │                                   │
│         └─────────┬─────────┘                                   │
│                   │                                             │
│         ┌─────────▼─────────┐                                   │
│         │  4. Integration   │                                   │
│         └───────────────────┘                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Contract Amendments (P2)

When a chunk fails repeatedly or discovers it needs something not in the contract:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ CONTRACT AMENDMENT PROPOSED                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Chunk 2 discovered: checkHealth needs options parameter        │
│                                                                 │
│  PROPOSED CHANGE:                                               │
│  ┌─────────────────────────────────────────────────────────────┐
│  │ functions[0].signature                                      │
│  │                                                             │
│  │ - (): Promise<HealthCheckResult>                            │
│  │ + (options?: HealthCheckOptions): Promise<HealthCheckResult>│
│  └─────────────────────────────────────────────────────────────┘
│                                                                 │
│  ADDITIONAL TYPE NEEDED:                                        │
│  ┌─────────────────────────────────────────────────────────────┐
│  │ + interface HealthCheckOptions {                            │
│  │ +   timeout?: number;                                       │
│  │ +   verbose?: boolean;                                      │
│  │ + }                                                         │
│  └─────────────────────────────────────────────────────────────┘
│                                                                 │
│  AFFECTS:                                                       │
│  • Chunk 3: Create HealthPanel component (uses checkHealth)    │
│  • Chunk 4: Integration (calls checkHealth)                    │
│                                                                 │
│  ┌──────────────────────┐  ┌─────────────────────────────────┐ │
│  │  Accept Amendment    │  │  Reject & Fail Chunk            │ │
│  └──────────────────────┘  └─────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

# Acceptance Criteria

## MVP

- [ ] SpecContract type defined in shared package
- [ ] Database migration adds contract/creates/consumes/dependsOn columns
- [ ] Contract generation prompt produces valid contracts
- [ ] Feasibility checker validates consumes exist (grep-based)
- [ ] Feasibility checker catches dependency order issues
- [ ] Contract review UI shows types, files, chunks
- [ ] Feasibility issues shown inline with warnings/errors
- [ ] Cannot approve contract with errors
- [ ] Contract approval generates chunks with proper dependencies
- [ ] Chunks include creates/consumes/dependsOn fields

## Roadmap

- [ ] Contract editing UI (add/edit/delete types, files, chunks)
- [ ] Dependency graph visualization
- [ ] Progressive disclosure (collapsed by default, expand details)
- [ ] Contract amendment proposals
- [ ] Amendment acceptance updates contract and affected chunks
- [ ] Contract templates for common patterns
- [ ] Contract diffing on regenerate
