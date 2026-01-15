# Phase 4: Multiple GLM Workers

## Context

The platform supports multiple specs per project. Now we need to run GLM workers on different projects/specs simultaneously - true parallelism across projects.

## Goals

1. **Multiple Workers** - Run GLM on different projects at the same time
2. **Worker Dashboard** - See all active workers and their status
3. **Queue Management** - Queue specs to run, workers pick from queue
4. **Resource Awareness** - Don't overload the system

## Current State

- One execution at a time (global)
- Run-all blocks until complete
- No visibility into other project activity

## Architecture Options

### Option A: Browser Tabs (Simple)

Each project/spec runs in its own browser tab. No backend changes needed.

Pros:
- Zero backend work
- Already works (just open multiple tabs)

Cons:
- No unified dashboard
- No queue management
- User manages tabs manually

### Option B: Backend Workers (Recommended)

Backend manages multiple concurrent executions with a unified dashboard.

```
┌─────────────────────────────────────────────────────────────────┐
│  WORKER DASHBOARD                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Active Workers: 3/5                          [+ Add Worker]    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Worker 1    my-api-project / Add authentication         │   │
│  │ ◐ Running   Chunk 3/5: "Add login endpoint"            │   │
│  │             Started 2m ago                    [Stop]    │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ Worker 2    frontend-app / Implement dashboard          │   │
│  │ ◐ Running   Chunk 1/3: "Setup components"              │   │
│  │             Started 45s ago                   [Stop]    │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ Worker 3    data-pipeline / Add ETL process             │   │
│  │ ◎ Reviewing Chunk 2/4: "Create extractors"             │   │
│  │             Started 5m ago                    [Stop]    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Queue: 2 specs waiting                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. mobile-app / Push notifications          [Remove]    │   │
│  │ 2. backend-service / Add caching            [Remove]    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Model

### Worker

```typescript
interface Worker {
  id: string;
  specId: string;
  projectId: string;
  status: WorkerStatus;
  currentChunkId?: string;
  currentStep?: 'executing' | 'reviewing';
  progress: {
    current: number;
    total: number;
    passed: number;
    failed: number;
  };
  startedAt: number;
  error?: string;
}

type WorkerStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

interface WorkerQueue {
  id: string;
  specId: string;
  projectId: string;
  priority: number;
  addedAt: number;
}
```

### Database Schema

```sql
-- Workers table
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  spec_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  current_chunk_id TEXT,
  current_step TEXT,
  progress_current INTEGER DEFAULT 0,
  progress_total INTEGER DEFAULT 0,
  progress_passed INTEGER DEFAULT 0,
  progress_failed INTEGER DEFAULT 0,
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT,
  FOREIGN KEY (spec_id) REFERENCES specs(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Worker queue
CREATE TABLE IF NOT EXISTS worker_queue (
  id TEXT PRIMARY KEY,
  spec_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  added_at INTEGER NOT NULL,
  FOREIGN KEY (spec_id) REFERENCES specs(id) ON DELETE CASCADE
);

CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_queue_priority ON worker_queue(priority DESC, added_at ASC);
```

## Tasks

### 1. Worker Management API

```
GET    /api/workers              # List all workers
POST   /api/workers              # Create worker for spec
GET    /api/workers/[id]         # Get worker status
DELETE /api/workers/[id]         # Stop and remove worker
POST   /api/workers/[id]/pause   # Pause worker
POST   /api/workers/[id]/resume  # Resume worker
```

### 2. Queue Management API

```
GET    /api/queue                # List queued specs
POST   /api/queue                # Add spec to queue
DELETE /api/queue/[id]           # Remove from queue
POST   /api/queue/reorder        # Change priority
```

### 3. Worker Orchestrator

Create `packages/dashboard/src/lib/worker-orchestrator.ts`:

```typescript
class WorkerOrchestrator {
  private maxWorkers: number = 5;
  private workers: Map<string, WorkerInstance> = new Map();

  async startWorker(specId: string): Promise<Worker>;
  async stopWorker(workerId: string): Promise<void>;
  async pauseWorker(workerId: string): Promise<void>;
  async resumeWorker(workerId: string): Promise<void>;

  // Auto-start workers from queue when slots available
  private async processQueue(): Promise<void>;

  // Get all worker statuses
  getWorkers(): Worker[];
}

// Singleton
export const orchestrator = new WorkerOrchestrator();
```

### 4. Worker Instance

Each worker runs in its own async context:

```typescript
class WorkerInstance {
  private specId: string;
  private abortController: AbortController;

  async run(): Promise<void> {
    // Same logic as run-all, but:
    // - Updates worker table instead of just SSE
    // - Can be paused/resumed
    // - Reports to orchestrator
  }

  pause(): void;
  resume(): void;
  abort(): void;
}
```

### 5. Worker Dashboard Page

Create `packages/dashboard/src/app/workers/page.tsx`:

- List of active workers with progress
- Queue of waiting specs
- Add to queue button
- Global controls (stop all, pause all)

### 6. Worker Dashboard Component

Create `packages/dashboard/src/components/WorkerDashboard.tsx`:

```typescript
interface WorkerDashboardProps {
  workers: Worker[];
  queue: WorkerQueue[];
  onStopWorker: (id: string) => void;
  onPauseWorker: (id: string) => void;
  onResumeWorker: (id: string) => void;
  onRemoveFromQueue: (id: string) => void;
  onAddToQueue: (specId: string) => void;
}
```

### 7. Worker Card Component

Create `packages/dashboard/src/components/WorkerCard.tsx`:

Shows:
- Project name / Spec title
- Current status (Running, Reviewing, Paused)
- Current chunk being executed
- Progress bar
- Time running
- Stop/Pause buttons

### 8. useWorkers Hook

Create `packages/dashboard/src/hooks/useWorkers.ts`:

```typescript
function useWorkers() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [queue, setQueue] = useState<WorkerQueue[]>([]);

  // Poll for updates or use SSE
  useEffect(() => {
    const interval = setInterval(fetchWorkers, 2000);
    return () => clearInterval(interval);
  }, []);

  return {
    workers,
    queue,
    startWorker,
    stopWorker,
    pauseWorker,
    resumeWorker,
    addToQueue,
    removeFromQueue,
  };
}
```

### 9. SSE for Worker Updates

Create `/api/workers/events` SSE endpoint:

```typescript
// Events
type WorkerEvent =
  | { type: 'worker_started'; worker: Worker }
  | { type: 'worker_progress'; workerId: string; progress: Progress }
  | { type: 'worker_completed'; workerId: string }
  | { type: 'worker_failed'; workerId: string; error: string }
  | { type: 'queue_updated'; queue: WorkerQueue[] };
```

### 10. Integration with Spec Workspace

Add "Run in Background" option:

```tsx
// In spec workspace header
<button onClick={handleRunAll}>Run All</button>
<button onClick={handleRunInBackground}>
  Run in Background
</button>
```

"Run in Background" creates a worker and returns to dashboard.

### 11. Navigation Integration

Add Workers link to main navigation:

```tsx
// In header or sidebar
<Link href="/workers">
  Workers {activeCount > 0 && `(${activeCount})`}
</Link>
```

### 12. Resource Limits

Configure max concurrent workers:

```typescript
// Environment variable or settings
const MAX_CONCURRENT_WORKERS = process.env.MAX_WORKERS || 5;
```

Show warning when at capacity:
```
⚠ All worker slots in use (5/5). New specs will be queued.
```

## File Structure

```
packages/dashboard/src/
├── app/
│   └── workers/
│       └── page.tsx              # Worker dashboard page
├── components/
│   ├── WorkerDashboard.tsx       # Main dashboard component
│   ├── WorkerCard.tsx            # Individual worker card
│   ├── WorkerQueue.tsx           # Queue list
│   └── AddToQueueModal.tsx       # Add spec to queue
├── hooks/
│   └── useWorkers.ts             # Worker state management
├── lib/
│   └── worker-orchestrator.ts    # Worker management logic
└── app/api/
    ├── workers/
    │   ├── route.ts              # List/create workers
    │   ├── [id]/
    │   │   ├── route.ts          # Get/delete worker
    │   │   ├── pause/route.ts
    │   │   └── resume/route.ts
    │   └── events/route.ts       # SSE stream
    └── queue/
        ├── route.ts              # List/add to queue
        └── [id]/route.ts         # Remove from queue
```

## Acceptance Criteria

- [ ] Can run multiple specs simultaneously (up to max limit)
- [ ] Worker dashboard shows all active workers
- [ ] Each worker shows project, spec, current chunk, progress
- [ ] Can stop individual workers
- [ ] Can pause/resume workers
- [ ] Queue holds specs when at capacity
- [ ] Queue auto-processes when workers free up
- [ ] "Run in Background" option in spec workspace
- [ ] Workers link in navigation shows active count
- [ ] SSE updates dashboard in real-time

## Notes

- Terminal theme: emerald-400 accents
- Default max workers: 5 (configurable)
- Workers persist across page refreshes
- Queue ordered by priority, then add time
- Consider memory/CPU impact of parallel GLM calls
- Each worker uses separate opencode session
