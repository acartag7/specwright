# ORC-21: Git Integration - Ralph Loop Pattern

## Overview

Add git branch/commit/rollback workflow to spec execution following the Ralph Loop pattern.

## Context

Currently, spec execution happens on the current branch with no git integration. Failed chunks leave dirty state, and there's no way to track what was attempted vs what succeeded.

## Implementation

### 1. Database Changes

Add columns to `specs` table in `packages/dashboard/src/lib/db.ts`:

```typescript
// In initializeDatabase(), add migration:
db.exec(`ALTER TABLE specs ADD COLUMN branch_name TEXT`);
db.exec(`ALTER TABLE specs ADD COLUMN original_branch TEXT`);
db.exec(`ALTER TABLE specs ADD COLUMN pr_url TEXT`);
```

Add columns to `chunks` table:

```typescript
db.exec(`ALTER TABLE chunks ADD COLUMN commit_hash TEXT`);
db.exec(`ALTER TABLE chunks ADD COLUMN iteration INTEGER DEFAULT 0`);
```

Update types in `packages/shared/src/types.ts`:

```typescript
interface Spec {
  // ... existing
  branchName?: string;
  originalBranch?: string;
  prUrl?: string;
}

interface Chunk {
  // ... existing
  commitHash?: string;
  iteration?: number;
}
```

### 2. Create Git Helper

Create `packages/dashboard/src/lib/git.ts`:

```typescript
import { spawnSync } from 'child_process';

export function getCurrentBranch(cwd: string): string {
  const result = spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf-8' });
  return result.stdout.trim();
}

export function createBranch(cwd: string, branchName: string): void {
  spawnSync('git', ['checkout', '-b', branchName], { cwd, encoding: 'utf-8' });
}

export function commitChanges(cwd: string, message: string): string {
  spawnSync('git', ['add', '-A'], { cwd, encoding: 'utf-8' });

  const status = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' });
  if (!status.stdout.trim()) {
    return ''; // No changes to commit
  }

  // Use stdin for message to avoid shell escaping issues
  spawnSync('git', ['commit', '-F', '-'], {
    cwd,
    input: message,
    encoding: 'utf-8'
  });

  const hash = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' });
  return hash.stdout.trim();
}

export function resetHard(cwd: string): void {
  spawnSync('git', ['reset', '--hard', 'HEAD'], { cwd, encoding: 'utf-8' });
}

export function switchBranch(cwd: string, branch: string): void {
  spawnSync('git', ['checkout', branch], { cwd, encoding: 'utf-8' });
}

export function hasUncommittedChanges(cwd: string): boolean {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' });
  return result.stdout.trim().length > 0;
}
```

### 3. Update run-all/route.ts

Modify `packages/dashboard/src/app/api/specs/[id]/run-all/route.ts`:

**At start of execution (after line 118):**

```typescript
import { getCurrentBranch, createBranch, commitChanges, resetHard, switchBranch } from '@/lib/git';

// Save original branch and create spec branch
const project = getProject(spec.projectId);
const cwd = project.directory;
const originalBranch = getCurrentBranch(cwd);
const specBranch = `spec/${spec.title.toLowerCase().replace(/\s+/g, '-').slice(0, 50)}`;

try {
  createBranch(cwd, specBranch);
  updateSpec(specId, { branchName: specBranch, originalBranch });
} catch (e) {
  // Branch might already exist, try to switch to it
  switchBranch(cwd, specBranch);
}
```

**After successful chunk + review pass (around line 345):**

```typescript
// Commit the successful chunk
const commitHash = commitChanges(cwd, `chunk ${currentIndex}: ${chunk.title}`);
if (commitHash) {
  updateChunk(chunk.id, { commitHash });
}
```

**On chunk failure (around line 330):**

```typescript
// Reset to discard failed work
resetHard(cwd);
```

**In finally block:**

```typescript
} finally {
  // Switch back to original branch
  if (originalBranch) {
    switchBranch(cwd, originalBranch);
  }
  endRunAllSession(specId);
  controller.close();
}
```

## Files to Modify

- CREATE: `packages/dashboard/src/lib/git.ts`
- MODIFY: `packages/dashboard/src/lib/db.ts` (add migrations)
- MODIFY: `packages/shared/src/types.ts` (add fields)
- MODIFY: `packages/dashboard/src/app/api/specs/[id]/run-all/route.ts`

## Dependencies

- Blocked by: ORC-30 (Command injection fix - must use spawnSync, not execSync with interpolation)

## Testing

1. Create a spec with 3 chunks
2. Run all - verify branch created, commits made
3. Intentionally fail a chunk - verify git reset happens
4. Complete successfully - verify clean commit history

## Acceptance Criteria

- [ ] Branch created on spec start: `spec/{slug}`
- [ ] Commit after each successful chunk
- [ ] Git reset on chunk failure
- [ ] Switch back to original branch when done
- [ ] Branch name stored in spec record
- [ ] Commit hash stored in chunk record
