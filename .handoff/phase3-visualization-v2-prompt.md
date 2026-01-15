# Phase 3 v2: Graph Redesign + Chunk Context

## Problems to Fix

### Graph UX Issues (Current State)
1. Horizontal layout with 22 nodes in a row - useless
2. Can't see dependency relationships at a glance
3. No execution preview before "Run All"
4. "↪ 1 dependency" doesn't tell you WHAT the dependency is
5. Can't see which chunks are blocked vs ready to run
6. No critical path visualization
7. No zoom/pan for large graphs

### Missing Feature: Chunk Context
GLM needs context from previous chunks. Currently each chunk executes in isolation - GLM doesn't know what was already done.

---

## Part 1: Graph Redesign

### New Layout: Vertical Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  EXECUTION GRAPH                          [List] [Graph] [Plan] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 0 (No dependencies - run first)                          │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ ✓ Setup deps    │  │ ✓ Init config   │   ← Can run parallel  │
│  └────────┬────────┘  └────────┬────────┘                       │
│           │                    │                                │
│           ▼                    ▼                                │
│  Layer 1                                                        │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ ✓ User model    │  │ ○ Settings UI   │                       │
│  └────────┬────────┘  └─────────────────┘                       │
│           │                                                     │
│           ▼                                                     │
│  Layer 2                                                        │
│  ┌─────────────────┐                                            │
│  │ ◐ Auth routes   │  ← Currently running                       │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  Layer 3 (blocked)                                              │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ ○ Middleware    │  │ ○ Tests         │   ← Waiting on above  │
│  └─────────────────┘  └─────────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Changes

1. **Vertical flow** - Top to bottom, like a pipeline
2. **Grouped by layer** - Chunks at same depth grouped together
3. **Clear labels** - "Layer 0 (run first)", "Layer 2 (blocked)"
4. **Status indicators** - Which can run NOW (green border)
5. **Collapsible layers** - Collapse completed layers

### Execution Plan Preview

New view mode: "Plan" tab shows execution order:

```
┌─────────────────────────────────────────────────────────────────┐
│  EXECUTION PLAN                                    [Run All ▶]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: Run in parallel (2 chunks)                             │
│  ├── Setup dependencies                                         │
│  └── Initialize config                                          │
│                                                                 │
│  Step 2: Run in parallel (2 chunks)                             │
│  ├── Create user model         (depends on: Setup dependencies) │
│  └── Settings UI               (depends on: Initialize config)  │
│                                                                 │
│  Step 3: Run sequentially                                       │
│  └── Auth routes               (depends on: Create user model)  │
│                                                                 │
│  Step 4: Run in parallel (2 chunks)                             │
│  ├── Add middleware            (depends on: Auth routes)        │
│  └── Write tests               (depends on: Auth routes)        │
│                                                                 │
│  Estimated: 4 parallel steps, 7 total chunks                    │
│  Critical path: Setup → User model → Auth → Middleware          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### List View Improvements

Show dependencies inline:

```
┌─────────────────────────────────────────────────────────────────┐
│  CHUNKS                                          [List] [Graph] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ● Ready to run                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ✓ 1. Setup dependencies                                 │   │
│  │      No dependencies                          [Run] [⋮] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ● Blocked (waiting on dependencies)                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ○ 3. Create user model                                  │   │
│  │      ↪ Depends on: Setup dependencies (✓ done)          │   │
│  │      ✓ Can run now                            [Run] [⋮] │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ○ 5. Auth routes                                        │   │
│  │      ↪ Depends on: Create user model (○ pending)        │   │
│  │      ⏳ Blocked                                    [⋮]  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Node Interactions

**Hover on node:**
- Highlight all incoming edges (dependencies) in blue
- Highlight all outgoing edges (dependents) in orange
- Show tooltip: "Depends on: X, Y | Blocks: Z"

**Click on node:**
- Select node
- Show details panel on right
- Keep highlighting

**Double-click:**
- Run this chunk (if can run)

### Status Colors

```typescript
const nodeStyles = {
  completed: 'border-emerald-500 bg-emerald-500/10',
  running: 'border-amber-500 bg-amber-500/10 animate-pulse',
  canRun: 'border-emerald-400 bg-neutral-900',  // Ready to execute
  blocked: 'border-neutral-700 bg-neutral-900/50 opacity-60',
  failed: 'border-red-500 bg-red-500/10',
};
```

### Critical Path Highlighting

Option to show critical path (longest dependency chain):

```tsx
<button onClick={() => setShowCriticalPath(!showCriticalPath)}>
  Show Critical Path
</button>

// When enabled, critical path nodes have thicker border
// and edges are highlighted in a distinct color
```

---

## Part 2: Chunk Context Passing

### Problem

When GLM executes chunk 3, it doesn't know what chunks 1 and 2 accomplished. It starts fresh each time.

### Solution

Pass context from completed dependency chunks in the prompt.

### New Prompt Structure

```
You are implementing part of a larger feature. Here's the context:

## Spec Overview
{spec.content}

## Previously Completed (your dependencies)
### Chunk: "Setup dependencies"
Status: Completed
Output: Installed bcrypt, jsonwebtoken. Added TypeScript types.
Files modified: package.json, package-lock.json

### Chunk: "Create user model"
Status: Completed
Output: Created User model with email, password_hash fields. Added migration.
Files modified: src/models/user.ts, src/migrations/001_users.ts

## Your Task
Title: Auth routes
Description: Create POST /auth/login and POST /auth/register endpoints using the user model created above.

## Important
- Build on the work already done above
- Don't recreate files that already exist
- Reference the user model at src/models/user.ts
```

### Implementation

1. **Store chunk output summaries**

Already have `chunk.output` - use it.

2. **Fetch dependency outputs**

```typescript
async function buildChunkPrompt(chunk: Chunk, spec: Spec): Promise<string> {
  // Get all dependency chunks
  const depChunks = await Promise.all(
    chunk.dependencies.map(id => getChunk(id))
  );

  // Filter to completed ones
  const completedDeps = depChunks.filter(c => c?.status === 'completed');

  // Build context section
  const contextSection = completedDeps.map(dep => `
### Chunk: "${dep.title}"
Status: Completed
Output: ${dep.output || 'No output recorded'}
`).join('\n');

  return `
You are implementing part of a larger feature.

## Spec Overview
${spec.content}

## Previously Completed (your dependencies)
${contextSection || 'This is the first chunk - no prior work.'}

## Your Task
Title: ${chunk.title}
Description: ${chunk.description}

## Important
- Build on the work already done above
- Don't recreate files that already exist
- Reference existing code created by previous chunks
`;
}
```

3. **Update execution service**

Modify `startChunkExecution` to use the new prompt builder.

4. **Output summarization (optional)**

After chunk completes, have Opus summarize what was done:

```typescript
async function summarizeChunkOutput(chunk: Chunk): Promise<string> {
  const prompt = `
Summarize what was accomplished in this task in 2-3 sentences.
Focus on: files created/modified, key functions added, important decisions made.

Task: ${chunk.title}
Output: ${chunk.output}
`;
  return await claudeClient.executePrompt(prompt, workDir);
}
```

Store summary in a new field `chunk.outputSummary` for cleaner context passing.

---

## Tasks

### Graph Redesign

1. **Update graph layout algorithm** - Vertical layers instead of horizontal
2. **Create LayerGroup component** - Collapsible layer with label
3. **Add "Plan" view** - Execution order preview
4. **Update List view** - Show dependencies inline with status
5. **Add node hover states** - Highlight connections
6. **Add critical path toggle** - Highlight longest chain
7. **Add "Can run" indicators** - Green border for ready chunks
8. **Add zoom/pan** - For large graphs

### Chunk Context

9. **Create prompt builder** - `buildChunkPrompt(chunk, spec)`
10. **Fetch dependency outputs** - Include in prompt
11. **Update execution service** - Use new prompt builder
12. **Optional: Output summarization** - Opus summarizes after completion

---

## File Changes

```
packages/dashboard/src/
├── components/
│   ├── ChunkGraph.tsx          # Complete rewrite - vertical layout
│   ├── LayerGroup.tsx          # NEW - collapsible layer
│   ├── ExecutionPlan.tsx       # NEW - plan preview
│   ├── ChunkList.tsx           # Update - inline deps
│   └── ChunkNode.tsx           # Update - hover states
├── lib/
│   ├── graph-layout.ts         # Update - vertical algorithm
│   └── prompt-builder.ts       # NEW - context-aware prompts
└── hooks/
    └── useChunkGraph.ts        # Update - critical path calc
```

---

## Acceptance Criteria

### Graph
- [ ] Vertical layout with layers
- [ ] Layer labels ("Layer 0 - run first")
- [ ] "Can run" green indicators
- [ ] "Blocked" dimmed styling
- [ ] Hover highlights connections
- [ ] Critical path toggle
- [ ] Execution plan preview tab
- [ ] Collapsible completed layers

### List View
- [ ] Shows dependency names (not just count)
- [ ] Shows "✓ Can run now" vs "⏳ Blocked"
- [ ] Dependency status (done/pending)

### Chunk Context
- [ ] Prompt includes dependency outputs
- [ ] GLM knows what previous chunks did
- [ ] Files created by deps mentioned in prompt
- [ ] "Don't recreate existing files" instruction

---

## Notes

- Keep it simple - don't over-engineer
- Test with 5-10 chunks first, then scale
- Context passing is MORE important than fancy graph
- Terminal theme: emerald-400 accents
