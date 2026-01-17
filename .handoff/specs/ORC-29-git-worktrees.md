# ORC-29: Git Worktrees for Parallel Spec Execution

## Overview

Each spec runs in its own git worktree, enabling parallel spec execution. Worktree cleanup happens after PR is merged.

## Context

Currently specs run sequentially on the same codebase. With git worktrees, each spec gets its own isolated directory, enabling parallel execution of multiple specs.

## Lifecycle

```
Create Spec → Create Worktree → Run Chunks → Create PR → PR Merged → Cleanup
```

## Why This Matters

- **Parallelization**: Run 5-10 specs simultaneously instead of sequentially
- **Isolation**: One spec's failures don't affect others
- **Clean PRs**: Each spec = one branch = one PR
- **Resume capability**: Switch between spec work easily

## Implementation

### 1. Database Changes

Add to `specs` table:

```typescript
db.exec(`ALTER TABLE specs ADD COLUMN worktree_path TEXT`);
db.exec(`ALTER TABLE specs ADD COLUMN pr_url TEXT`);
db.exec(`ALTER TABLE specs ADD COLUMN pr_merged INTEGER DEFAULT 0`);
```

### 2. Worktree Creation

When spec starts running:

```typescript
import { spawnSync } from 'child_process';

function createWorktree(projectPath: string, specId: string, branchName: string): string {
  const shortId = specId.slice(0, 8);
  const worktreePath = `${projectPath}-spec-${shortId}`;

  spawnSync('git', ['worktree', 'add', worktreePath, '-b', branchName], {
    cwd: projectPath,
    encoding: 'utf-8',
  });

  return worktreePath;
}
```

### 3. Run Chunks in Worktree

Update execution to use `spec.worktreePath` instead of `project.directory`:

```typescript
const cwd = spec.worktreePath || project.directory;
```

### 4. PR Merge Detection

Option A: Webhook from GitHub
Option B: Polling via `gh pr view --json merged`

### 5. Cleanup

When PR is merged:

```typescript
function cleanupWorktree(projectPath: string, worktreePath: string): void {
  spawnSync('git', ['worktree', 'remove', worktreePath], {
    cwd: projectPath,
    encoding: 'utf-8',
  });
}
```

## Files to Modify

- MODIFY: `packages/dashboard/src/lib/db.ts` (add columns)
- MODIFY: `packages/dashboard/src/lib/git.ts` (add worktree functions)
- MODIFY: `packages/dashboard/src/app/api/specs/[id]/run-all/route.ts`
- CREATE: `packages/dashboard/src/app/api/specs/[id]/worktree/route.ts`

## Dependencies

- Blocked by: ORC-21 (Git Integration - Ralph Loop Pattern)

## Out of Scope

- Spec-to-spec dependencies (managed in Linear, not orchestrator)
- Automatic merge conflict resolution

## Acceptance Criteria

- [ ] Spec creates worktree on first run
- [ ] Chunks execute in worktree directory
- [ ] Spec tracks `pr_url` and `pr_merged`
- [ ] Worktree cleaned up after PR merge
- [ ] Multiple specs can run in parallel
- [ ] UI shows worktree status
