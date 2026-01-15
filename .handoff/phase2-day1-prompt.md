# Phase 2 Day 1: Multi-Spec Foundation

## Context

You're implementing Phase 2 of a Spec-Driven Development Platform. The MVP is complete with Spec Studio. Now we're adding support for multiple specs per project.

**Read the full spec:** `.handoff/spec-driven-dev-mvp.md` (specifically "Phase 2: Multi-Spec Workflow" section)

## What Exists

- Project CRUD working
- Single spec per project (current model)
- Spec Studio wizard for creating specs
- Chunk management and execution
- Terminal theme (emerald-400, neutral-950)

## Day 1 Goal

Change from "one spec per project" to "many specs per project", where each spec is independent and will eventually become its own PR.

## Tasks

### 1. Database Schema Changes

Update `packages/dashboard/src/lib/db.ts`:

```sql
-- Add columns to specs table
ALTER TABLE specs ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE specs ADD COLUMN branch_name TEXT;
ALTER TABLE specs ADD COLUMN pr_number INTEGER;
ALTER TABLE specs ADD COLUMN pr_url TEXT;
```

Run migration on app startup (or create migration function).

### 2. Update Shared Types

Update `packages/shared/src/types.ts`:

```typescript
type SpecStatus = 'draft' | 'ready' | 'running' | 'review' | 'completed' | 'merged';

interface Spec {
  id: string;
  projectId: string;
  title: string;
  content: string;
  version: number;
  status: SpecStatus;           // NEW
  branchName?: string;          // NEW
  prNumber?: number;            // NEW
  prUrl?: string;               // NEW
  createdAt: number;
  updatedAt: number;
}
```

### 3. Create Specs List API

Create `packages/dashboard/src/app/api/projects/[id]/specs/route.ts`:

```typescript
// GET - List all specs for a project
// POST - Create new spec (title only, content empty)
```

### 4. Create Spec Detail API

Create `packages/dashboard/src/app/api/specs/[id]/route.ts`:

```typescript
// GET - Get single spec with its chunks
// PUT - Update spec (title, content, status)
// DELETE - Delete spec and its chunks
```

### 5. Update DB Operations

Add to `packages/dashboard/src/lib/db.ts`:

```typescript
getSpecsByProject(projectId: string): Spec[]
getSpecById(specId: string): Spec | null
createSpec(projectId: string, title: string): Spec
updateSpec(specId: string, updates: Partial<Spec>): Spec
deleteSpec(specId: string): void
```

### 6. Update Project Page

Modify `packages/dashboard/src/app/project/[id]/page.tsx`:

**Current:** Shows single spec editor or Spec Studio
**New:** Shows list of specs with status badges

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back    Project: My API Backend              [+ New Spec]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SPECS                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ● Add user authentication                    ✓ Done     │   │
│  │   5/5 chunks completed                                   │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ ◐ Add REST API endpoints                     Running    │   │
│  │   2/4 chunks completed                                   │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ ○ Add unit tests                             Draft      │   │
│  │   0/0 chunks                                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [+ New Spec]                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7. Create SpecCard Component

Create `packages/dashboard/src/components/SpecCard.tsx`:

- Shows spec title
- Shows status badge (Draft/Ready/Running/Completed)
- Shows chunk progress (3/5 chunks)
- Click navigates to spec workspace
- Terminal theme styling

### 8. Create Spec Workspace Page

Create `packages/dashboard/src/app/project/[id]/spec/[specId]/page.tsx`:

This is the existing workspace but scoped to a single spec:
- Shows spec content (view/edit)
- Shows chunks for this spec
- Shows execution panel
- "Back to specs" navigation

### 9. Update Spec Studio Integration

When Spec Studio completes:
- Create the new spec in specs table
- Navigate to the spec workspace page
- Set spec status to 'ready'

When clicking "New Spec" on project page:
- Create empty spec with 'draft' status
- Open Spec Studio for that spec

## Routing Structure

```
/project/[id]                    → Specs list
/project/[id]/spec/[specId]      → Spec workspace (chunks + execution)
/project/[id]/spec/new           → Spec Studio (creates new spec)
/project/[id]/spec/[specId]/edit → Spec Studio (edits existing spec)
```

## Status Badge Colors

```tsx
const statusColors = {
  draft: 'bg-neutral-500/10 text-neutral-400',
  ready: 'bg-violet-500/10 text-violet-400',
  running: 'bg-amber-500/10 text-amber-400',
  review: 'bg-blue-500/10 text-blue-400',
  completed: 'bg-emerald-500/10 text-emerald-400',
  merged: 'bg-emerald-500/20 text-emerald-300',
};
```

## Acceptance Criteria

- [ ] Specs table has new columns (status, branch_name, pr_number, pr_url)
- [ ] Project page shows list of specs (not single spec)
- [ ] "New Spec" button opens Spec Studio
- [ ] Each spec shows status badge and chunk progress
- [ ] Click spec navigates to its workspace
- [ ] Spec workspace shows chunks for that spec only
- [ ] Spec Studio completion creates spec with 'ready' status
- [ ] All existing functionality preserved (execution, etc.)

## Notes

- Keep terminal theme consistent
- pnpm always (not npm)
- Don't break existing chunk execution
- Specs are independent - each has its own chunks
