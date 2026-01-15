# Phase 2 Day 2: Review Loop

## Context

You're implementing Phase 2 of the Spec-Driven Development Platform. Day 1 (Multi-Spec Foundation) is complete. Now we're adding the Review Loop - Opus reviews GLM output after each chunk execution.

**Read the full spec:** `.handoff/spec-driven-dev-mvp.md` (specifically "Phase 2: Multi-Spec Workflow" → "2. Review Loop" section)

## What Exists (Day 1 Complete)

- Multiple specs per project
- Project page shows specs list with status badges
- Spec workspace with chunks and execution panel
- SpecStatus: 'draft' | 'ready' | 'running' | 'review' | 'completed' | 'merged'

## Day 2 Goal

After each chunk executes, Opus automatically reviews the output and determines: pass, needs_fix, or fail.

## Flow

```
Chunk executes → GLM output captured →
    ↓
Opus reviews (output + file changes) →
    ↓
┌─────────────────────────────────────────┐
│  PASS        → Mark chunk done          │
│  NEEDS_FIX   → Create fix chunk, run it │
│  FAIL        → Stop, alert user         │
└─────────────────────────────────────────┘
```

## Tasks

### 1. Add Review Types

Update `packages/shared/src/types.ts`:

```typescript
export interface ReviewResult {
  status: 'pass' | 'needs_fix' | 'fail';
  feedback: string;
  fixChunk?: {
    title: string;
    description: string;
  };
}

// Update Chunk to include review info
export interface Chunk {
  // ... existing fields
  reviewStatus?: 'pass' | 'needs_fix' | 'fail';
  reviewFeedback?: string;
}
```

### 2. Update Database Schema

Add columns to chunks table for review data:

```sql
ALTER TABLE chunks ADD COLUMN review_status TEXT;
ALTER TABLE chunks ADD COLUMN review_feedback TEXT;
```

Update `packages/shared/src/schema.ts` and migration in `db.ts`.

### 3. Create Review API

Create `packages/dashboard/src/app/api/chunks/[id]/review/route.ts`:

```typescript
// POST /api/chunks/[id]/review
// - Fetches chunk output and spec context
// - Calls Opus with review prompt
// - Saves review result to chunk
// - If needs_fix, creates fix chunk
// - Returns ReviewResult
```

### 4. Opus Review Prompt

Use this prompt template (from spec):

```
You are reviewing the output of an AI coding assistant that just completed a task.

## Task
Title: {chunk.title}
Description: {chunk.description}

## Output from AI Assistant
{chunk.output}

## Your Job
Determine if the task was completed correctly.

Return JSON:
{
  "status": "pass" | "needs_fix" | "fail",
  "feedback": "Brief explanation of your assessment",
  "fixChunk": {  // Only include if status is "needs_fix"
    "title": "Short title for the fix",
    "description": "Detailed instructions to fix the issue"
  }
}

Rules:
- "pass" = Task completed correctly, no issues found
- "needs_fix" = Task partially done or has fixable issues
- "fail" = Task cannot be completed, fundamental problem
- Be specific in feedback
- Fix descriptions should be actionable
- Return ONLY valid JSON
```

### 5. Update Chunk DB Operations

Update `packages/dashboard/src/lib/db.ts`:

```typescript
// Update updateChunk to handle review fields
export function updateChunk(id: string, data: {
  // ... existing
  reviewStatus?: 'pass' | 'needs_fix' | 'fail';
  reviewFeedback?: string;
}): Chunk | null

// Add function to insert fix chunk after a chunk
export function insertFixChunk(afterChunkId: string, fixData: {
  title: string;
  description: string;
}): Chunk
```

### 6. Update Execution Flow

Modify the execution completion flow to trigger review:

Option A: Client-side (ExecutionPanel triggers review after completion)
Option B: Server-side (run endpoint auto-triggers review after GLM completes)

**Recommend Option A** for better UX (user sees "Reviewing..." state).

### 7. Update ExecutionPanel

Modify `packages/dashboard/src/components/ExecutionPanel.tsx`:

Add review states and UI:

```
┌─────────────────────────────────────────────────────────────────┐
│  EXECUTION                                                      │
├─────────────────────────────────────────────────────────────────┤
│  Chunk: Add login endpoint                                      │
│  Status: Reviewing...                                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ✓ Execution complete                                    │   │
│  │ ◐ Opus reviewing...                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Review Result:                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⚠ NEEDS_FIX                                             │   │
│  │                                                         │   │
│  │ Password hashing is missing. The login endpoint stores  │   │
│  │ passwords in plain text.                                │   │
│  │                                                         │   │
│  │ Fix chunk created: "Add password hashing"               │   │
│  │ [Run Fix] [Skip] [Mark as Done Anyway]                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8. Update useExecution Hook

Modify `packages/dashboard/src/hooks/useExecution.ts`:

Add review state:

```typescript
interface ExecutionState {
  // ... existing
  isReviewing: boolean;
  reviewResult: ReviewResult | null;
}

// Add function to trigger review
async function reviewChunk(chunkId: string): Promise<ReviewResult>
```

### 9. ChunkList Review Indicators

Update `packages/dashboard/src/components/ChunkList.tsx` or `ChunkItem.tsx`:

Show review status on chunks:
- ✓ with green = passed review
- ⚠ with amber = needs fix
- ✗ with red = failed

## Review Status Colors

```tsx
const reviewColors = {
  pass: 'text-emerald-400',
  needs_fix: 'text-amber-400',
  fail: 'text-red-400',
};
```

## Acceptance Criteria

- [ ] After chunk execution completes, review is triggered automatically
- [ ] "Reviewing..." state shows while Opus analyzes
- [ ] Review result (pass/needs_fix/fail) displayed in ExecutionPanel
- [ ] Feedback message shown to user
- [ ] If needs_fix: fix chunk created and user can run it
- [ ] User can skip review or mark done anyway
- [ ] Review status persisted to database
- [ ] Chunk list shows review indicators
- [ ] Fix chunks inserted in correct order (after original chunk)

## Notes

- Terminal theme: emerald-400 accents, neutral-950 background
- Use existing ClaudeClient for Opus calls
- pnpm always (not npm)
- Don't break existing execution flow
- Review is optional - user can skip or override
