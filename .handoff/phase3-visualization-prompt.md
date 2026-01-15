# Phase 3: Visualization & Parallel Execution

## Context

Phase 2 is complete with multi-spec support, review loop, run-all, and git integration. Now we're adding visualization - a graph view of chunks with dependency tracking and parallel execution support.

**Read the full spec:** `.handoff/spec-driven-dev-mvp.md`

## Goals

1. **Graph View** - Visual representation of chunks as nodes
2. **Dependencies** - Define which chunks depend on others
3. **Parallel Execution** - Run independent chunks simultaneously
4. **Interactive** - Click nodes to see details, run individual chunks

## Current State

- Chunks are linear (ordered list)
- Execution is sequential (one at a time)
- No dependency tracking between chunks

## New Data Model

### Chunk Dependencies

Update `packages/shared/src/types.ts`:

```typescript
interface Chunk {
  // ... existing fields
  dependencies: string[];  // IDs of chunks this depends on
}

interface ChunkNode {
  id: string;
  title: string;
  status: ChunkStatus;
  reviewStatus?: ReviewStatus;
  dependencies: string[];
  dependents: string[];  // Computed: chunks that depend on this
  canRun: boolean;       // Computed: all dependencies completed
  x?: number;            // Position for graph layout
  y?: number;
}

interface ChunkGraph {
  nodes: ChunkNode[];
  edges: Array<{ from: string; to: string }>;
}
```

### Database Changes

```sql
ALTER TABLE chunks ADD COLUMN dependencies TEXT DEFAULT '[]';
```

## Tasks

### 1. Update Chunk Schema

Add dependencies column to chunks table and update types.

### 2. Dependency Management API

```
PUT /api/chunks/[id]/dependencies
```

Request: `{ dependencies: string[] }`

Validate:
- No circular dependencies
- All referenced chunks exist in same spec
- Self-reference not allowed

### 3. Graph Layout Algorithm

Create `packages/dashboard/src/lib/graph-layout.ts`:

```typescript
interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  horizontalGap: number;
  verticalGap: number;
}

// Topological sort + layer assignment
export function calculateLayout(
  chunks: Chunk[]
): ChunkNode[] {
  // 1. Build adjacency list
  // 2. Topological sort
  // 3. Assign layers (chunks with no deps = layer 0)
  // 4. Position nodes within layers
  // 5. Return nodes with x, y coordinates
}
```

### 4. Graph View Component

Create `packages/dashboard/src/components/ChunkGraph.tsx`:

```typescript
interface ChunkGraphProps {
  chunks: Chunk[];
  onChunkClick: (chunk: Chunk) => void;
  onRunChunk: (chunk: Chunk) => void;
  onAddDependency: (fromId: string, toId: string) => void;
  runningChunkId?: string;
  selectedChunkId?: string;
}
```

UI Elements:
- Nodes: Rounded rectangles with chunk title, status icon
- Edges: Arrows connecting dependent chunks
- Colors: Status-based (pending=gray, running=amber, completed=emerald, failed=red)
- Interactions: Click to select, double-click to run, drag to connect

```
┌─────────────────────────────────────────────────────────────────┐
│  CHUNK GRAPH                                    [List View]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│    ┌──────────────┐                                             │
│    │ ✓ Setup deps │                                             │
│    └──────┬───────┘                                             │
│           │                                                     │
│           ▼                                                     │
│    ┌──────────────┐      ┌──────────────┐                       │
│    │ ✓ User model │─────▶│ ◐ Auth routes│                       │
│    └──────────────┘      └──────┬───────┘                       │
│                                 │                               │
│                                 ▼                               │
│                          ┌──────────────┐                       │
│                          │ ○ Middleware │                       │
│                          └──────┬───────┘                       │
│                                 │                               │
│                                 ▼                               │
│                          ┌──────────────┐                       │
│                          │ ○ Tests      │                       │
│                          └──────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5. SVG Rendering

Use SVG for the graph:

```tsx
<svg width={width} height={height}>
  {/* Edges */}
  {edges.map(edge => (
    <path
      key={`${edge.from}-${edge.to}`}
      d={calculateEdgePath(edge)}
      stroke="currentColor"
      fill="none"
      markerEnd="url(#arrowhead)"
    />
  ))}

  {/* Nodes */}
  {nodes.map(node => (
    <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
      <rect ... />
      <text>{node.title}</text>
      <StatusIcon status={node.status} />
    </g>
  ))}
</svg>
```

### 6. Parallel Execution

Update run-all to execute independent chunks in parallel:

```typescript
// In /api/specs/[id]/run-all/route.ts

async function runAllParallel(chunks: Chunk[]) {
  const completed = new Set<string>();
  const running = new Map<string, Promise<void>>();

  while (completed.size < chunks.length) {
    // Find chunks that can run (all deps completed, not yet started)
    const canRun = chunks.filter(c =>
      !completed.has(c.id) &&
      !running.has(c.id) &&
      c.dependencies.every(d => completed.has(d))
    );

    // Start all runnable chunks in parallel
    for (const chunk of canRun) {
      running.set(chunk.id, executeChunk(chunk).then(() => {
        completed.add(chunk.id);
        running.delete(chunk.id);
      }));
    }

    // Wait for at least one to complete
    if (running.size > 0) {
      await Promise.race(running.values());
    }
  }
}
```

### 7. Dependency Editor UI

Add UI to connect chunks:

Option A: Drag from node to node
Option B: Dropdown selector in chunk edit modal
Option C: Right-click context menu

Recommend **Option B** for simplicity:

```tsx
// In ChunkEditor or ChunkItem
<label>Depends on:</label>
<select multiple value={selectedDeps} onChange={handleDepsChange}>
  {otherChunks.map(c => (
    <option key={c.id} value={c.id}>{c.title}</option>
  ))}
</select>
```

### 8. View Toggle

Add toggle between list view and graph view:

```tsx
const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');

{viewMode === 'list' ? (
  <ChunkList ... />
) : (
  <ChunkGraph ... />
)}
```

### 9. Auto-Dependency Detection (Optional)

When Opus generates chunks, have it suggest dependencies:

Update chunks generation prompt:
```
Return chunks with dependencies:
[
  {
    "id": "chunk_1",
    "title": "Setup dependencies",
    "description": "...",
    "dependencies": []
  },
  {
    "id": "chunk_2",
    "title": "Create user model",
    "description": "...",
    "dependencies": ["chunk_1"]
  }
]
```

## Component Structure

```
packages/dashboard/src/
├── components/
│   ├── ChunkGraph.tsx          # Main graph component
│   ├── ChunkNode.tsx           # Individual node
│   ├── ChunkEdge.tsx           # Arrow between nodes
│   ├── DependencyEditor.tsx    # Edit dependencies UI
│   └── ViewModeToggle.tsx      # List/Graph toggle
├── lib/
│   └── graph-layout.ts         # Layout algorithm
└── hooks/
    └── useChunkGraph.ts        # Graph state management
```

## Acceptance Criteria

- [ ] Chunks can have dependencies (array of chunk IDs)
- [ ] Graph view shows chunks as nodes with arrows
- [ ] Nodes colored by status
- [ ] Click node to select, see details
- [ ] Can add/remove dependencies via UI
- [ ] Circular dependency validation
- [ ] Parallel execution runs independent chunks together
- [ ] Toggle between list and graph view
- [ ] Graph auto-layouts based on dependencies

## Notes

- Terminal theme: emerald-400 accents
- Use SVG for graph rendering (no heavy libraries)
- Keep list view as default (graph is optional)
- Parallel execution is optional - can still run sequentially
