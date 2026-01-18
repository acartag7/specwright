# FIX PROMPT: Review System Code Validation (ORC-55)

## Context
You're working on Specwright, a spec-driven development platform where:
- Users write specs with Opus assistance
- Specs are broken into executable chunks
- GLM (via opencode) executes chunks in isolated git worktrees
- Each chunk gets reviewed after execution
- **PROBLEM:** Review currently only reads AI output text, doesn't validate the actual code

## Current State

**Project:** `/Users/acartagena/project/orchestrator`
**Database:** `~/.specwright/orchestrator.db`
**Tech Stack:** Next.js 16, React 19, TypeScript, SQLite, pnpm monorepo

**Critical Files:**
- `packages/dashboard/src/app/api/specs/[id]/run-all/route.ts` - Main execution loop
- `packages/dashboard/src/lib/prompts.ts` - Review prompt (BROKEN)
- `packages/dashboard/src/lib/execution.ts` - Chunk execution

**Current Review Flow (lines 317-390 in run-all/route.ts):**
```typescript
// Build review prompt and call Opus
const reviewPrompt = buildReviewPrompt(updatedChunk);
const claudeClient = new ClaudeClient();
const reviewResult = await claudeClient.execute(reviewPrompt, { timeout: 120000 });
```

**Current Review Prompt (prompts.ts:7-36):**
```
"Determine if the task was completed correctly."
[includes only chunk.output text - NO CODE VALIDATION]
```

## The Bug

**Evidence from Production:**
1. **Chunk 4 Issue:** Marked "completed" but added ZERO code
   - Review feedback: "The OpencodeManager class does not exist... The AI assistant output 'Task completed' without performing any work"
   - Review correctly detected this and marked as "fail"
   - But this should have been caught BEFORE review runs

2. **Import Errors:** PR #18 had missing import `DEFAULT_CHUNK_TIMEOUT_MS`
   - Build still succeeded (import was actually exported)
   - But timeout validation was missing
   - Review didn't catch the logic error

3. **Build Never Runs:** Review happens on chunk.output (text), not actual code changes

## What Review SHOULD Do

### Phase 1: Pre-Review Validation (NEW)
**Before calling Claude for review:**

1. **Check for file changes**
   ```bash
   git diff --name-only HEAD
   ```
   - If empty → auto-fail: "No changes detected"
   - Track: files changed count

2. **Run build in worktree**
   ```bash
   pnpm build 2>&1
   ```
   - Capture stdout + stderr
   - If exit code ≠ 0 → build failed
   - Include build output in review prompt

3. **Run TypeScript check** (optional, faster)
   ```bash
   pnpm run type-check 2>&1
   ```
   - Catches type errors without full build
   - Faster feedback loop

### Phase 2: Enhanced Review Prompt (MODIFY)
**Include in review prompt:**
- ✅ Chunk output (existing)
- ✅ Files changed count + list (NEW)
- ✅ Git diff summary (NEW)
- ✅ Build result (success/fail + errors) (NEW)
- ✅ Type check result (NEW)

**Example Enhanced Prompt:**
```
You are reviewing a completed coding task.

## Task
Title: {title}
Description: {description}

## AI Output
{output}

## Code Changes
Files changed: {filesChangedCount}
{filesChangedList}

## Build Validation
{buildResult}

## Instructions
- If build FAILED → status must be "needs_fix"
- If NO files changed → status must be "fail"
- If files changed but don't match task → "needs_fix"
- Only "pass" if build succeeds AND changes match task

Return JSON:
{
  "status": "pass" | "needs_fix" | "fail",
  "feedback": "explanation",
  "fixChunk": { ... } // only if needs_fix
}
```

### Phase 3: Auto-Fail Conditions (NEW)
**Skip Claude review entirely if:**
- No git changes detected → auto-fail
- Build fails with syntax errors → auto-fail
- Critical errors (module not found, etc.) → auto-fail

**Save time and API calls by failing fast**

## Implementation Plan

### Step 1: Add Validation Helper Functions
**Location:** `packages/dashboard/src/lib/review-validation.ts` (NEW FILE)

```typescript
export async function validateChunkCompletion(
  workingDirectory: string,
  chunkId: string
): Promise<{
  success: boolean;
  filesChanged: number;
  filesChangedList: string[];
  buildResult: { success: boolean; output: string; };
  gitDiff: string;
  autoFail?: { reason: string; feedback: string; };
}> {
  // 1. Check git changes
  // 2. Run build
  // 3. Determine auto-fail
  // 4. Return results
}
```

### Step 2: Modify run-all/route.ts
**Around line 317-320:**
```typescript
// NEW: Validate before review
const validation = await validateChunkCompletion(gitDir, chunkId);

// Auto-fail conditions
if (validation.autoFail) {
  updateChunk(chunkId, {
    reviewStatus: 'fail',
    reviewFeedback: validation.autoFail.feedback,
  });
  sendEvent(controller, encoder, isClosedRef, 'review_complete', {
    chunkId,
    status: 'fail',
    feedback: validation.autoFail.feedback,
  });
  return { success: false };
}

// Build enhanced review prompt with validation results
const reviewPrompt = buildEnhancedReviewPrompt(updatedChunk, validation);
```

### Step 3: Update prompts.ts
**Modify `buildReviewPrompt()`:**
- Add validation parameter
- Include build results
- Include git diff summary
- Add auto-fail instructions

### Step 4: Add Database Fields (if needed)
**Check if these exist in chunks table:**
- `build_success` (boolean)
- `files_changed` (integer)
- `validation_output` (text)

## Success Criteria

1. ✅ Chunks with no code changes auto-fail
2. ✅ Build failures prevent chunks from passing review
3. ✅ Review prompt includes build validation results
4. ✅ Type errors caught before commit
5. ✅ Reduced false positives (chunks passing when they shouldn't)

## Test Plan

**Create test spec with 3 chunks:**
1. **Chunk 1:** Should succeed (makes valid changes)
2. **Chunk 2:** Should fail (makes no changes)
3. **Chunk 3:** Should fail (breaks build)

**Expected Results:**
- Chunk 1: Passes review, gets committed
- Chunk 2: Auto-fails (no changes), no commit
- Chunk 3: Auto-fails (build error), no commit

## Important Notes

- **Worktrees:** All validation happens in the spec's worktree (not main directory)
- **Build Command:** Use `pnpm build` in the worktree
- **Timeout:** Build validation has separate timeout (3 min max)
- **Error Handling:** If validation itself fails, treat as chunk failure
- **Database:** Store validation results for debugging
- **Performance:** Build adds ~30-60s per chunk, but prevents bugs

## Starting Point

1. Read current files:
   - `packages/dashboard/src/app/api/specs/[id]/run-all/route.ts`
   - `packages/dashboard/src/lib/prompts.ts`
   - `packages/dashboard/src/lib/execution.ts`

2. Create new file:
   - `packages/dashboard/src/lib/review-validation.ts`

3. Test build command in worktree:
   ```bash
   cd /Users/acartagena/project/orchestrator-spec-{id}
   pnpm build
   ```

4. Implement validation function first
5. Integrate into run-all route
6. Update review prompt
7. Test with failing chunk

## Questions to Answer

- Should we run full `pnpm build` or just `tsc --noEmit`?
- Should validation timeout separately from chunk execution?
- What if build succeeds but changes are wrong? (Keep Claude review)
- Should we store build logs in database?

---

**Fix this in a new worktree/branch, test thoroughly, then create PR.**
