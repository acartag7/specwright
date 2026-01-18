# FIX PROMPT: Strengthen Chunk Completion Criteria

## Context
You're working on Specwright, a spec-driven development platform where chunks are executed by GLM (via opencode) in isolated git worktrees.

**PROBLEM:** Chunks are marked "completed" when the AI says "Task completed" even if no actual work was done.

## Current State

**Project:** `/Users/acartagena/project/orchestrator`
**Critical File:** `packages/dashboard/src/lib/execution.ts`

**Current Completion Logic (line 499-503):**
```typescript
function handleComplete(chunkId: string): void {
  const execution = activeExecutions.get(chunkId);
  const output = execution?.textOutput || 'Task completed';
  cleanup(chunkId, 'completed', undefined, output);
}
```

**The Bug:**
- OpenCode sends `onComplete` event when AI finishes responding
- We trust this blindly and mark chunk as "completed"
- No validation that files were actually changed
- No check that the work matches the task

**Evidence:**
- **Chunk 4** in Opencode spec: Status "completed", but review found "no work performed"
- Git log showed NO commits for that chunk
- Review correctly caught it, but chunk was already marked completed

## What Should Happen

### Completion Criteria Checklist

A chunk should only be marked "completed" if:

1. ✅ **OpenCode reports completion** (existing)
2. ✅ **Files were modified** (NEW - check git status)
3. ✅ **Changes are staged** (NEW - verify not empty)
4. ✅ **Minimum content threshold** (NEW - not just whitespace)

### Edge Cases to Handle

**Valid Scenarios:**
- ✅ Chunk deletes files (negative diff)
- ✅ Chunk modifies existing files
- ✅ Chunk creates new files
- ✅ Chunk modifies configuration (package.json, tsconfig, etc.)

**Invalid Scenarios:**
- ❌ No files touched at all
- ❌ Only whitespace changes
- ❌ Only comments added
- ❌ Git status clean after execution

## Implementation Plan

### Step 1: Add File Change Detection
**Location:** Modify `handleComplete()` in `execution.ts`

```typescript
function handleComplete(chunkId: string): void {
  const execution = activeExecutions.get(chunkId);
  const output = execution?.textOutput || 'Task completed';

  // NEW: Check if any files were actually changed
  const hasChanges = checkForFileChanges(execution.directory);

  if (!hasChanges) {
    // Chunk completed but made no changes - mark as failed
    cleanup(chunkId, 'failed', 'Execution completed but no file changes detected', output);
    return;
  }

  // Original completion flow
  cleanup(chunkId, 'completed', undefined, output);
}
```

### Step 2: Create Change Detection Helper
**Location:** Add to `execution.ts` or new `execution-helpers.ts`

```typescript
function checkForFileChanges(directory: string): boolean {
  try {
    // Check git status for changes
    const result = execSync('git status --porcelain', {
      cwd: directory,
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    const status = result.trim();

    // No changes detected
    if (!status) {
      return false;
    }

    // Parse changes - could be more sophisticated
    const lines = status.split('\n').filter(Boolean);

    // Check for actual content changes (not just whitespace)
    // This is basic - could be enhanced
    return lines.length > 0;

  } catch (error) {
    console.error('[Execution] Error checking file changes:', error);
    // If we can't check, assume changes were made (fail safe)
    return true;
  }
}
```

### Step 3: Enhanced Change Detection (Optional)
**More sophisticated validation:**

```typescript
interface ChangeValidation {
  hasChanges: boolean;
  filesChanged: number;
  additions: number;
  deletions: number;
  onlyWhitespace: boolean;
}

function validateFileChanges(directory: string): ChangeValidation {
  // Get git diff stats
  const diffStat = execSync('git diff --stat', {
    cwd: directory,
    encoding: 'utf-8',
    stdio: 'pipe'
  }).trim();

  const porcelain = execSync('git status --porcelain', {
    cwd: directory,
    encoding: 'utf-8',
    stdio: 'pipe'
  }).trim();

  // Parse diff to check if only whitespace
  const diff = execSync('git diff', {
    cwd: directory,
    encoding: 'utf-8',
    stdio: 'pipe'
  });

  // Count actual content changes (ignore whitespace-only)
  const contentChanges = diff
    .split('\n')
    .filter(line => line.startsWith('+') || line.startsWith('-'))
    .filter(line => !line.startsWith('+++') && !line.startsWith('---'))
    .filter(line => line.trim().length > 1);

  return {
    hasChanges: porcelain.length > 0,
    filesChanged: porcelain.split('\n').filter(Boolean).length,
    additions: contentChanges.filter(l => l.startsWith('+')).length,
    deletions: contentChanges.filter(l => l.startsWith('-')).length,
    onlyWhitespace: contentChanges.length === 0 && porcelain.length > 0
  };
}
```

### Step 4: Update Error Messages
**Make failures informative:**

```typescript
if (!validation.hasChanges) {
  cleanup(
    chunkId,
    'failed',
    'Execution completed but no file changes detected. The AI may have misunderstood the task or encountered an error.',
    output
  );
  return;
}

if (validation.onlyWhitespace) {
  cleanup(
    chunkId,
    'failed',
    'Execution completed but only whitespace changes detected. No meaningful code changes were made.',
    output
  );
  return;
}
```

### Step 5: Log Analytics
**Track false completions:**

```typescript
console.log('[EXECUTION VALIDATION]', {
  chunkId,
  specId: getChunk(chunkId)?.specId,
  chunkTitle: getChunk(chunkId)?.title,
  hasChanges: validation.hasChanges,
  filesChanged: validation.filesChanged,
  additions: validation.additions,
  deletions: validation.deletions,
  onlyWhitespace: validation.onlyWhitespace,
  outcome: validation.hasChanges ? 'completed' : 'failed',
  timestamp: new Date().toISOString()
});
```

## Alternative Approaches

### Option A: Fail Fast (Recommended)
- Check changes in `handleComplete()`
- Mark as failed immediately if no changes
- Review never runs for empty chunks
- **Pros:** Fast, saves API calls
- **Cons:** Can't distinguish "no changes needed" from "failed to change"

### Option B: Validation Before Review (Safer)
- Check changes after execution, before review
- Include in review prompt: "Files changed: 0"
- Let reviewer decide if this is valid
- **Pros:** More nuanced decisions
- **Cons:** Wastes API calls on obvious failures

### Option C: Hybrid (Best)
- Auto-fail if absolutely no changes
- Allow review if minimal changes (to decide quality)
- **This is the recommended approach**

## Database Schema

**Add to chunks table (optional):**
```sql
ALTER TABLE chunks ADD COLUMN files_changed INTEGER DEFAULT 0;
ALTER TABLE chunks ADD COLUMN lines_added INTEGER DEFAULT 0;
ALTER TABLE chunks ADD COLUMN lines_deleted INTEGER DEFAULT 0;
```

**Update in updateChunk():**
```typescript
updateChunk(chunkId, {
  status: 'completed',
  output: finalOutput,
  filesChanged: validation.filesChanged,
  linesAdded: validation.additions,
  linesDeleted: validation.deletions
});
```

## Success Criteria

1. ✅ Chunks with no file changes auto-fail
2. ✅ Clear error messages explaining why chunk failed
3. ✅ Analytics track false completions
4. ✅ Whitespace-only changes caught
5. ✅ Valid deletions still pass (negative changes)

## Test Plan

**Test Scenarios:**

1. **No Changes:** Create chunk that does nothing
   - Expected: Status "failed", error "no file changes detected"

2. **Whitespace Only:** Add blank lines
   - Expected: Status "failed", error "only whitespace changes"

3. **Valid Deletion:** Delete files
   - Expected: Status "completed" (deletions are valid)

4. **Comment Only:** Add comments
   - Expected: Depends on strategy (could be valid)

5. **Mixed Changes:** Add code + whitespace
   - Expected: Status "completed"

## Important Notes

- **Git Commands:** All run in worktree directory (execution.directory)
- **Error Handling:** If git check fails, default to marking completed (fail-safe)
- **Performance:** Git status is fast (~10ms)
- **Review Integration:** This works with ORC-55 review validation
- **Backwards Compat:** Old chunks in DB won't have change counts (nullable)

## Dependencies

- ✅ Git must be available (already required for worktrees)
- ✅ Working directory must be git repository (already is)
- ⚠️ Requires Node.js `child_process` (already used)

## Related Issues

- **ORC-55:** Review validation (checks build, this checks changes)
- **ORC-54:** Worktree execution (FIXED - changes now in right place)
- Complements review, doesn't replace it

## Starting Point

1. Read `packages/dashboard/src/lib/execution.ts`
2. Find `handleComplete()` function (around line 499)
3. Test git commands in a worktree:
   ```bash
   cd /path/to/worktree
   git status --porcelain
   git diff --stat
   ```
4. Implement `checkForFileChanges()` helper
5. Modify `handleComplete()` to validate
6. Test with empty chunk
7. Verify error message is clear

---

**Fix this in a new worktree/branch, test thoroughly, then create PR.**
