# FIX PROMPT: Enforce Chunk Dependencies Before Execution

## Context
You're working on Specwright, a spec-driven development platform where chunks can have dependencies on other chunks.

**PROBLEM:** Chunks run even when their prerequisite chunks have failed, leading to cascading failures.

## Current State

**Project:** `/Users/acartagena/project/orchestrator`
**Critical File:** `packages/dashboard/src/app/api/specs/[id]/run-all/route.ts`

**Current Dependency Logic (lines 38-63):**
```typescript
function findRunnableChunks(
  allChunks: Chunk[],
  completedIds: Set<string>,
  runningIds: Set<string>,
  failedIds: Set<string>
): Chunk[] {
  return allChunks.filter(chunk => {
    // Skip already completed, running, or failed
    if (completedIds.has(chunk.id) || runningIds.has(chunk.id) || failedIds.has(chunk.id)) {
      return false;
    }

    // Skip if not in a runnable state
    if (chunk.status !== 'pending' && chunk.status !== 'failed' && chunk.status !== 'cancelled') {
      return false;
    }

    // Check if all dependencies are completed
    for (const depId of chunk.dependencies) {
      if (!completedIds.has(depId)) {
        return false; // ✅ This part works
      }
    }

    return true;
  });
}
```

**The Bug:**
- ✅ Code checks if dependencies are in `completedIds`
- ❌ But chunks get added to `completedIds` even if their REVIEW FAILED
- ❌ So dependent chunks run even when prerequisites are broken

**Evidence:**
- **Chunk 4** in Opencode spec: Assumed OpencodeManager existed from chunk 2
- Chunk 2 had `review_status: 'needs_fix'` but was in `completedIds`
- Chunk 4 ran anyway, failed because prerequisite was incomplete

## What Should Happen

### Dependency States to Track

1. **completed + review_pass** → Safe to depend on ✅
2. **completed + review_needs_fix** → NOT safe, block dependents ❌
3. **completed + review_fail** → NOT safe, block dependents ❌
4. **completed + no_review** → Edge case (old chunks) → Allow? ⚠️
5. **failed** → NOT safe, already blocked ✅

### New Completion Criteria

A chunk should only satisfy dependencies if:
- Status: `completed` ✅
- Review status: `pass` ✅ (NEW)
- Committed: Has `commit_hash` ✅ (NEW)

## Implementation Plan

### Step 1: Update Completed Set Logic
**Location:** `run-all/route.ts` around line 401-406

**Current:**
```typescript
// Initialize completed set with already completed chunks
for (const chunk of allChunks) {
  if (chunk.status === 'completed') {
    completedIds.add(chunk.id);
  }
}
```

**Fixed:**
```typescript
// Initialize completed set with successfully completed chunks only
for (const chunk of allChunks) {
  if (chunk.status === 'completed' && chunk.reviewStatus === 'pass') {
    completedIds.add(chunk.id);
  }
}
```

### Step 2: Update Dependency Check
**Location:** `findRunnableChunks()` function

**Enhanced check:**
```typescript
// Check if all dependencies are SUCCESSFULLY completed
for (const depId of chunk.dependencies) {
  const depChunk = allChunks.find(c => c.id === depId);

  if (!depChunk) {
    console.error(`Dependency ${depId} not found for chunk ${chunk.id}`);
    return false; // Invalid dependency
  }

  // Dependency must be completed AND passed review
  const isDepSatisfied =
    completedIds.has(depId) &&
    depChunk.reviewStatus === 'pass';

  if (!isDepSatisfied) {
    return false; // Dependency not satisfied
  }
}
```

### Step 3: Track Failed Dependencies
**Add to run-all logic:**

```typescript
// After review fails
if (result.reviewResult.status === 'fail') {
  failedIds.add(chunk.id);

  // NEW: Find all chunks that depend on this failed chunk
  const dependentChunks = allChunks.filter(c =>
    c.dependencies.includes(chunk.id)
  );

  // Mark them as blocked
  for (const dependent of dependentChunks) {
    console.warn(`[Dependencies] Chunk "${dependent.title}" blocked by failed dependency "${chunk.title}"`);

    // Optionally: auto-fail dependent chunks
    updateChunk(dependent.id, {
      status: 'cancelled',
      error: `Dependency "${chunk.title}" failed review. This chunk cannot run.`
    });

    failedIds.add(dependent.id);
  }

  hasFailure = true;
  stopReason = `Chunk "${chunk.title}" failed review`;
  break;
}
```

### Step 4: Add Dependency Validation Helper
**New function in run-all/route.ts:**

```typescript
function validateDependencies(
  chunk: Chunk,
  allChunks: Chunk[],
  completedIds: Set<string>
): { valid: boolean; reason?: string } {
  for (const depId of chunk.dependencies) {
    const depChunk = allChunks.find(c => c.id === depId);

    if (!depChunk) {
      return {
        valid: false,
        reason: `Dependency chunk ${depId} not found`
      };
    }

    if (!completedIds.has(depId)) {
      return {
        valid: false,
        reason: `Dependency "${depChunk.title}" not completed`
      };
    }

    if (depChunk.reviewStatus !== 'pass') {
      return {
        valid: false,
        reason: `Dependency "${depChunk.title}" did not pass review (status: ${depChunk.reviewStatus})`
      };
    }

    if (!depChunk.commitHash) {
      return {
        valid: false,
        reason: `Dependency "${depChunk.title}" has no commit (changes not saved)`
      };
    }
  }

  return { valid: true };
}
```

### Step 5: Use Validation Before Execution
**In the main loop, before starting chunk:**

```typescript
for (const chunk of runnableChunks) {
  // Validate dependencies one more time before starting
  const depValidation = validateDependencies(chunk, currentChunks, completedIds);

  if (!depValidation.valid) {
    console.warn(`[Dependencies] Skipping chunk "${chunk.title}": ${depValidation.reason}`);

    updateChunk(chunk.id, {
      status: 'cancelled',
      error: `Cannot run: ${depValidation.reason}`
    });

    failedIds.add(chunk.id);
    continue; // Skip this chunk
  }

  // Proceed with execution
  const result = await runChunk(chunk.id, chunk.title, currentIndex, false);
  // ... rest of logic
}
```

## Dependency Graph Visualization (Future Enhancement)

**Track dependency chains:**
```typescript
interface DependencyInfo {
  chunkId: string;
  title: string;
  dependencies: string[];
  dependents: string[]; // NEW: track reverse dependencies
  status: string;
  reviewStatus: string;
  blockedBy: string[]; // NEW: which failed deps are blocking this
}

function buildDependencyGraph(chunks: Chunk[]): Map<string, DependencyInfo> {
  const graph = new Map<string, DependencyInfo>();

  // Build forward dependencies
  for (const chunk of chunks) {
    graph.set(chunk.id, {
      chunkId: chunk.id,
      title: chunk.title,
      dependencies: chunk.dependencies,
      dependents: [],
      status: chunk.status,
      reviewStatus: chunk.reviewStatus || 'pending',
      blockedBy: []
    });
  }

  // Build reverse dependencies
  for (const chunk of chunks) {
    for (const depId of chunk.dependencies) {
      const depInfo = graph.get(depId);
      if (depInfo) {
        depInfo.dependents.push(chunk.id);
      }
    }
  }

  return graph;
}
```

## Database Schema (Optional Enhancement)

**Track dependency failures:**
```sql
-- Add to chunks table
ALTER TABLE chunks ADD COLUMN blocked_by TEXT; -- JSON array of blocking chunk IDs
ALTER TABLE chunks ADD COLUMN dependency_error TEXT; -- Why dependencies failed
```

## Success Criteria

1. ✅ Chunks don't run if dependencies failed review
2. ✅ Chunks don't run if dependencies have no commit
3. ✅ Clear error messages show which dependency blocked execution
4. ✅ Cascading failures stop early (don't waste time on doomed chunks)
5. ✅ completedIds only contains successfully reviewed chunks

## Test Plan

**Create test spec with dependency chain:**

```
Chunk 1: Create base class ← no dependencies
  ↓
Chunk 2: Add method A ← depends on Chunk 1
  ↓
Chunk 3: Add method B ← depends on Chunk 2
  ↓
Chunk 4: Use both methods ← depends on Chunk 3
```

**Test Scenarios:**

1. **All Pass:** 1→2→3→4 all pass review
   - Expected: All chunks complete successfully

2. **Chunk 2 Fails:** 1 passes, 2 fails review
   - Expected: Chunks 3 and 4 never run (blocked)

3. **Chunk 2 Needs Fix:** 1 passes, 2 gets "needs_fix"
   - Expected: Chunks 3 and 4 never run (blocked)
   - After fix chunk created and passes, 3 and 4 can run

4. **Chunk 2 Has No Commit:** 1 passes, 2 completes but no commit_hash
   - Expected: Chunks 3 and 4 blocked

## Edge Cases

**1. Circular Dependencies:**
- Already prevented at chunk creation (Studio validates)
- But add runtime check as safety:
```typescript
function hasCircularDependency(chunk: Chunk, allChunks: Chunk[]): boolean {
  // Simple cycle detection
  const visited = new Set<string>();
  const stack = [chunk.id];

  while (stack.length > 0) {
    const currentId = stack.pop()!;

    if (visited.has(currentId)) {
      return true; // Cycle detected
    }

    visited.add(currentId);
    const current = allChunks.find(c => c.id === currentId);
    if (current) {
      stack.push(...current.dependencies);
    }
  }

  return false;
}
```

**2. Orphaned Dependencies:**
- Dependency chunk was deleted
- Handle gracefully with error message

**3. Old Chunks (No Review Status):**
- Chunks from before review system
- Treat as "pass" (backwards compatibility)

## Important Notes

- **Performance:** Dependency validation is O(n) per chunk, acceptable
- **SSE Events:** Send `dependency_blocked` event to UI
- **Retry Logic:** If dependency gets fixed, re-run dependent chunks
- **Parallel Execution:** Dependencies already prevent parallel issues
- **Database Queries:** Fetch all chunks once, validate in memory

## UI Enhancement (Future)

**Show dependency status in UI:**
```typescript
// In chunk list, show why chunk is blocked
if (chunk.status === 'cancelled' && chunk.dependencyError) {
  return (
    <div className="text-yellow-400 text-xs">
      Blocked: {chunk.dependencyError}
    </div>
  );
}
```

## Related Issues

- **ORC-55:** Review validation (determines pass/fail)
- **Chunk Completion:** Chunks must complete AND pass to satisfy dependencies
- **Fix Chunks:** When dependency fails, create fix chunk, then retry dependents

## Starting Point

1. Read `packages/dashboard/src/app/api/specs/[id]/run-all/route.ts`
2. Find `findRunnableChunks()` (line 38)
3. Find completed set initialization (line 401)
4. Test with dependency chain spec
5. Implement validation helper
6. Update completion logic
7. Test cascading failure scenario

---

**Fix this in a new worktree/branch, test thoroughly, then create PR.**
