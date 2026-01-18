# Dogfood Blockers Implementation (ORC-43, ORC-17, ORC-12)

## Overview

This specification addresses three critical dogfood blockers that make Specwright difficult to use in practice. Each blocker is solved with an independent service following the architecture established in ORC-51.

**Blockers addressed:**
- **ORC-43**: Users must manually start opencode server before using Specwright
- **ORC-17**: Stop button on running chunks doesn't work (no onClick handler)
- **ORC-12**: Chunk output disappears when navigating away from spec page

**Key behaviors:**
- Opencode server auto-starts on dashboard launch and auto-restarts on crash
- Individual chunks can be cancelled mid-execution with the stop button
- Chunk output persists across page navigation (loaded from DB)

**Architecture approach:** Each blocker gets an independent service that can be tested and deployed separately.

## Current State Analysis

### ORC-43: Opencode Server Management

**Problem:**
```
$ pnpm --filter @specwright/dashboard dev
# User must separately run:
$ opencode
# If they forget, they get "connection refused" errors
```

**Current flow:**
1. User starts dashboard
2. User navigates to spec page
3. User clicks "Run All"
4. ChunkExecutor calls `http://localhost:4096/sessions`
5. **FAILURE**: Connection refused (opencode not running)
6. User is confused, no helpful error message

### ORC-17: Stop Button Broken

**Problem in `ChunkItem.tsx` lines 285-294:**
```typescript
{chunk.status === 'running' && (
  <button
    className="p-1 text-red-500 hover:text-red-400..."
    title="Stop"
  >
    {/* NO onClick HANDLER! */}
    <svg>...</svg>
  </button>
)}
```

**Current flow:**
1. Chunk starts running
2. User clicks stop button
3. **NOTHING HAPPENS** - button has no handler
4. User can only abort entire run-all, losing all progress

### ORC-12: Output Disappears

**Problem:**
- `chunks.output` column exists in DB and is populated
- `useRunAll.ts` stores output in React state only
- On navigation, React state is lost
- On return, output panel is empty

**Current flow:**
1. Run chunk, output appears in panel
2. Navigate to home page
3. Navigate back to spec page
4. **Output panel empty** - all context lost
5. User must re-run to see output (wasteful)

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    FRONTEND                                              │
│                                                                                          │
│  _app.tsx                      ChunkItem.tsx                   spec/[specId]/page.tsx   │
│  └── OpencodeStatusProvider    └── onStop prop                 └── selectedOutput state │
│      └── useOpencodeHealth()       └── calls abort API             └── loads from DB    │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                │                         │                              │
                ▼                         ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    API Routes                                            │
│                                                                                          │
│  /api/health/opencode           /api/chunks/[id]/abort          (existing chunk routes) │
│  └── GET: check status          └── POST: abort execution       └── output in response  │
│  └── POST: start/restart                                                                │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                │                         │
                ▼                         ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│   opencode-manager.ts        │ │   chunk-executor.ts          │
│                              │ │   (enhanced)                 │
│   - startServer()            │ │                              │
│   - stopServer()             │ │   - abort(chunkId)           │
│   - checkHealth()            │ │   - abortAll(specId)         │
│   - autoRestart()            │ │   - running: Map<id, ctrl>   │
│                              │ │                              │
│   Singleton process manager  │ │   AbortController per chunk  │
│                              │ │                              │
└──────────────────────────────┘ └──────────────────────────────┘
```

## File Structure

```
packages/dashboard/src/
├── lib/
│   └── services/
│       ├── opencode-manager.ts      # NEW: Server lifecycle management
│       └── chunk-executor.ts        # MODIFY: Add abort support
├── app/
│   └── api/
│       ├── health/
│       │   └── opencode/
│       │       └── route.ts         # NEW: Health check + start/restart
│       └── chunks/
│           └── [id]/
│               └── abort/
│                   └── route.ts     # NEW: Abort single chunk
├── components/
│   ├── ChunkItem.tsx                # MODIFY: Wire stop button
│   └── OpencodeStatus.tsx           # NEW: Status indicator component
├── contexts/
│   └── OpencodeContext.tsx          # NEW: Global opencode state
└── hooks/
    └── useOpencodeHealth.ts         # NEW: Health polling hook
```

## Requirements

### 1. Opencode Manager Service (`packages/dashboard/src/lib/services/opencode-manager.ts`)

Singleton service that manages the opencode server process:

```typescript
export interface OpencodeStatus {
  running: boolean;
  pid?: number;
  port: number;
  startedAt?: number;
  lastHealthCheck?: number;
  error?: string;
}

export interface OpencodeManagerConfig {
  port: number;                    // Default: 4096
  healthCheckInterval: number;     // Default: 5000 (5s)
  startTimeout: number;            // Default: 10000 (10s)
  restartDelay: number;            // Default: 2000 (2s)
  maxRestartAttempts: number;      // Default: 3
}

export class OpencodeManager {
  private process: ChildProcess | null = null;
  private status: OpencodeStatus = { running: false, port: 4096 };
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private restartAttempts: number = 0;
  private config: OpencodeManagerConfig;

  constructor(config?: Partial<OpencodeManagerConfig>);

  /**
   * Start opencode server if not running
   * - Spawns `opencode` process
   * - Waits for health check to pass
   * - Sets up auto-restart on crash
   */
  async start(): Promise<{ success: boolean; error?: string }>;

  /**
   * Stop opencode server gracefully
   * - Sends SIGTERM
   * - Waits for process to exit
   * - Falls back to SIGKILL after timeout
   */
  async stop(): Promise<void>;

  /**
   * Restart opencode server
   * - Stop if running
   * - Start fresh
   */
  async restart(): Promise<{ success: boolean; error?: string }>;

  /**
   * Check if opencode is healthy
   * - GET http://localhost:4096/sessions
   * - Returns true if 200 response
   */
  async checkHealth(): Promise<boolean>;

  /**
   * Get current status
   */
  getStatus(): OpencodeStatus;

  /**
   * Start continuous health monitoring
   * - Polls every healthCheckInterval
   * - Auto-restarts on failure (up to maxRestartAttempts)
   */
  startHealthMonitor(): void;

  /**
   * Stop health monitoring
   */
  stopHealthMonitor(): void;
}

// Singleton instance
export const opencodeManager = new OpencodeManager();
```

**Implementation details:**

```typescript
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

class OpencodeManager extends EventEmitter {
  async start(): Promise<{ success: boolean; error?: string }> {
    // Check if already running
    if (await this.checkHealth()) {
      this.status.running = true;
      return { success: true };
    }

    return new Promise((resolve) => {
      try {
        // Spawn opencode process
        this.process = spawn('opencode', [], {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, PORT: String(this.config.port) },
        });

        this.status.pid = this.process.pid;

        // Handle process events
        this.process.on('error', (err) => {
          console.error('[OpencodeManager] Process error:', err.message);
          this.status.running = false;
          this.status.error = err.message;
          this.emit('error', err);
        });

        this.process.on('exit', (code) => {
          console.log(`[OpencodeManager] Process exited with code ${code}`);
          this.status.running = false;
          this.process = null;
          this.emit('exit', code);

          // Auto-restart if unexpected exit
          if (code !== 0 && this.restartAttempts < this.config.maxRestartAttempts) {
            this.scheduleRestart();
          }
        });

        // Wait for health check
        const startTime = Date.now();
        const checkReady = async () => {
          if (Date.now() - startTime > this.config.startTimeout) {
            resolve({ success: false, error: 'Startup timeout' });
            return;
          }

          if (await this.checkHealth()) {
            this.status.running = true;
            this.status.startedAt = Date.now();
            this.restartAttempts = 0;
            console.log('[OpencodeManager] Server started successfully');
            resolve({ success: true });
          } else {
            setTimeout(checkReady, 500);
          }
        };

        setTimeout(checkReady, 1000); // Initial delay for server to bind port
      } catch (err) {
        resolve({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    });
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${this.config.port}/sessions`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      this.status.lastHealthCheck = Date.now();
      return response.ok;
    } catch {
      return false;
    }
  }

  private scheduleRestart(): void {
    this.restartAttempts++;
    console.log(`[OpencodeManager] Scheduling restart attempt ${this.restartAttempts}/${this.config.maxRestartAttempts}`);

    setTimeout(async () => {
      const result = await this.start();
      if (!result.success) {
        console.error(`[OpencodeManager] Restart failed: ${result.error}`);
        this.emit('restart_failed', this.restartAttempts);
      }
    }, this.config.restartDelay);
  }
}
```

### 2. Opencode Health API (`packages/dashboard/src/app/api/health/opencode/route.ts`)

```typescript
import { NextResponse } from 'next/server';
import { opencodeManager } from '@/lib/services/opencode-manager';

// GET /api/health/opencode - Check status
export async function GET() {
  const status = opencodeManager.getStatus();
  const healthy = await opencodeManager.checkHealth();

  return NextResponse.json({
    ...status,
    healthy,
  });
}

// POST /api/health/opencode - Start or restart
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action || 'start';

  if (action === 'restart') {
    const result = await opencodeManager.restart();
    return NextResponse.json(result);
  }

  const result = await opencodeManager.start();
  return NextResponse.json(result);
}
```

### 3. Opencode Context & Hook (`packages/dashboard/src/contexts/OpencodeContext.tsx`)

```typescript
'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

interface OpencodeContextType {
  status: 'unknown' | 'starting' | 'running' | 'stopped' | 'error';
  error?: string;
  start: () => Promise<void>;
  restart: () => Promise<void>;
}

const OpencodeContext = createContext<OpencodeContextType | null>(null);

export function OpencodeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OpencodeContextType['status']>('unknown');
  const [error, setError] = useState<string>();

  // Poll health every 5 seconds
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health/opencode');
        const data = await res.json();

        if (data.healthy) {
          setStatus('running');
          setError(undefined);
        } else if (data.error) {
          setStatus('error');
          setError(data.error);
        } else {
          setStatus('stopped');
        }
      } catch {
        setStatus('error');
        setError('Failed to check opencode status');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-start on mount if not running
  useEffect(() => {
    if (status === 'stopped') {
      start();
    }
  }, [status]);

  const start = useCallback(async () => {
    setStatus('starting');
    try {
      const res = await fetch('/api/health/opencode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus('running');
        setError(undefined);
      } else {
        setStatus('error');
        setError(data.error);
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to start');
    }
  }, []);

  const restart = useCallback(async () => {
    setStatus('starting');
    try {
      const res = await fetch('/api/health/opencode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus('running');
        setError(undefined);
      } else {
        setStatus('error');
        setError(data.error);
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to restart');
    }
  }, []);

  return (
    <OpencodeContext.Provider value={{ status, error, start, restart }}>
      {children}
    </OpencodeContext.Provider>
  );
}

export function useOpencode() {
  const context = useContext(OpencodeContext);
  if (!context) {
    throw new Error('useOpencode must be used within OpencodeProvider');
  }
  return context;
}
```

### 4. Opencode Status Component (`packages/dashboard/src/components/OpencodeStatus.tsx`)

```typescript
'use client';

import { useOpencode } from '@/contexts/OpencodeContext';

export function OpencodeStatus() {
  const { status, error, start, restart } = useOpencode();

  const statusConfig = {
    unknown: { icon: '○', color: 'text-neutral-500', label: 'Checking...' },
    starting: { icon: '◐', color: 'text-amber-400', label: 'Starting...' },
    running: { icon: '●', color: 'text-emerald-400', label: 'Running' },
    stopped: { icon: '○', color: 'text-red-400', label: 'Stopped' },
    error: { icon: '✕', color: 'text-red-400', label: 'Error' },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className={config.color}>{config.icon}</span>
      <span className="text-neutral-400">opencode:</span>
      <span className={config.color}>{config.label}</span>

      {status === 'stopped' && (
        <button
          onClick={start}
          className="ml-2 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 rounded text-white"
        >
          Start
        </button>
      )}

      {status === 'error' && (
        <>
          <span className="text-red-400 truncate max-w-[200px]" title={error}>
            {error}
          </span>
          <button
            onClick={restart}
            className="ml-2 px-2 py-0.5 bg-amber-600 hover:bg-amber-500 rounded text-white"
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}
```

### 5. Chunk Executor Abort Support (`packages/dashboard/src/lib/services/chunk-executor.ts`)

Enhance existing chunk-executor with abort capability:

```typescript
// Add to existing ChunkExecutor class:

export class ChunkExecutor {
  // Track running executions with AbortControllers
  private runningExecutions: Map<string, AbortController> = new Map();

  async execute(
    chunkId: string,
    callbacks?: {
      onToolCall?: (toolCall: ChunkToolCall) => void;
      onText?: (text: string) => void;
    }
  ): Promise<ExecutionResult> {
    // Create abort controller for this execution
    const abortController = new AbortController();
    this.runningExecutions.set(chunkId, abortController);

    try {
      // ... existing execution logic ...
      // Pass abortController.signal to fetch calls

      const response = await fetch(`http://localhost:4096/sessions/${sessionId}/prompt`, {
        method: 'POST',
        signal: abortController.signal,
        // ...
      });

      // Handle SSE with abort support
      const reader = response.body?.getReader();
      while (true) {
        if (abortController.signal.aborted) {
          return { status: 'cancelled', output: accumulatedOutput };
        }

        const { done, value } = await reader!.read();
        if (done) break;
        // ... process SSE events ...
      }

      return { status: 'completed', output: accumulatedOutput };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { status: 'cancelled', output: '' };
      }
      return { status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' };
    } finally {
      this.runningExecutions.delete(chunkId);
    }
  }

  /**
   * Abort a running chunk execution
   */
  abort(chunkId: string): { success: boolean; error?: string } {
    const controller = this.runningExecutions.get(chunkId);
    if (!controller) {
      return { success: false, error: 'Chunk not running' };
    }

    controller.abort();
    console.log(`[ChunkExecutor] Aborted chunk ${chunkId}`);
    return { success: true };
  }

  /**
   * Abort all running executions for a spec
   */
  abortAll(specId: string): number {
    // Get all chunks for spec that are running
    let aborted = 0;
    for (const [chunkId, controller] of this.runningExecutions) {
      // Note: We'd need to track specId per chunk, or query DB
      controller.abort();
      aborted++;
    }
    console.log(`[ChunkExecutor] Aborted ${aborted} chunks`);
    return aborted;
  }

  /**
   * Check if a specific chunk is running
   */
  isRunning(chunkId: string): boolean {
    return this.runningExecutions.has(chunkId);
  }

  /**
   * Get all running chunk IDs
   */
  getRunningChunks(): string[] {
    return Array.from(this.runningExecutions.keys());
  }
}
```

### 6. Chunk Abort API (`packages/dashboard/src/app/api/chunks/[id]/abort/route.ts`)

```typescript
import { NextResponse } from 'next/server';
import { chunkExecutor } from '@/lib/services/chunk-executor';
import { getChunk, updateChunk } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id: chunkId } = await context.params;

  // Validate chunk exists
  const chunk = getChunk(chunkId);
  if (!chunk) {
    return NextResponse.json({ error: 'Chunk not found' }, { status: 404 });
  }

  // Check if actually running
  if (!chunkExecutor.isRunning(chunkId)) {
    return NextResponse.json({ error: 'Chunk not running' }, { status: 400 });
  }

  // Abort execution
  const result = chunkExecutor.abort(chunkId);

  if (result.success) {
    // Update chunk status in DB
    updateChunk(chunkId, {
      status: 'cancelled',
      completedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: result.error }, { status: 500 });
}
```

### 7. ChunkItem Stop Button (`packages/dashboard/src/components/ChunkItem.tsx`)

Add `onStop` prop and wire up the button:

```typescript
interface ChunkItemProps {
  chunk: Chunk;
  // ... existing props ...
  onStop?: () => void;  // NEW
}

export default function ChunkItem({
  // ... existing props ...
  onStop,
}: ChunkItemProps) {
  // ... existing code ...

  return (
    <div className={...}>
      {/* ... existing content ... */}

      <div className="flex-shrink-0 flex items-center gap-0.5 ...">
        {/* ... other buttons ... */}

        {/* Stop (when running) - NOW WITH onClick */}
        {chunk.status === 'running' && onStop && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStop();
            }}
            className="p-1 text-red-500 hover:text-red-400 hover:bg-neutral-800 rounded transition-colors"
            title="Stop"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
```

### 8. Wire Stop in Spec Page (`packages/dashboard/src/app/project/[id]/spec/[specId]/page.tsx`)

```typescript
// Add abort handler
const handleStopChunk = async (chunkId: string) => {
  try {
    const res = await fetch(`/api/chunks/${chunkId}/abort`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      // Refresh chunks to show cancelled status
      refreshChunks();
    } else {
      console.error('Failed to stop chunk:', data.error);
    }
  } catch (err) {
    console.error('Failed to stop chunk:', err);
  }
};

// In render, pass to ChunkItem:
<ChunkItem
  chunk={chunk}
  // ... other props ...
  onStop={() => handleStopChunk(chunk.id)}
/>
```

### 9. Output Persistence - Load from DB (`packages/dashboard/src/app/project/[id]/spec/[specId]/page.tsx`)

Update the page to load output from DB when selecting a chunk:

```typescript
// State for selected chunk output
const [selectedOutput, setSelectedOutput] = useState<string | null>(null);

// When selecting a chunk, load output from DB if not in live state
const handleSelectChunk = async (chunkId: string) => {
  setSelectedChunkId(chunkId);

  // Check if we have live output from current run
  if (runState?.events?.some(e => e.chunkId === chunkId)) {
    // Use live output from SSE
    const chunkEvents = runState.events.filter(e => e.chunkId === chunkId);
    const output = chunkEvents
      .filter(e => e.type === 'tool_call')
      .map(e => formatToolCall(e.data))
      .join('\n');
    setSelectedOutput(output);
  } else {
    // Load from database
    const chunk = chunks.find(c => c.id === chunkId);
    if (chunk?.output) {
      setSelectedOutput(chunk.output);
    } else {
      // Fetch fresh from API
      try {
        const res = await fetch(`/api/chunks/${chunkId}`);
        const data = await res.json();
        setSelectedOutput(data.output || null);
      } catch {
        setSelectedOutput(null);
      }
    }
  }
};

// Initial load - if a chunk was previously selected, load its output
useEffect(() => {
  if (selectedChunkId) {
    handleSelectChunk(selectedChunkId);
  }
}, []);
```

### 10. Ensure Output Saved to DB (`packages/dashboard/src/lib/services/chunk-executor.ts`)

Verify output is saved after execution:

```typescript
// In execute(), after completion:
if (result.status === 'completed' && result.output) {
  updateChunk(chunkId, {
    output: result.output,
    outputSummary: summarizeOutput(result.output), // Generate summary for context
  });
}
```

### 11. Layout Integration (`packages/dashboard/src/app/layout.tsx`)

Wrap app with OpencodeProvider and show status:

```typescript
import { OpencodeProvider } from '@/contexts/OpencodeContext';
import { OpencodeStatus } from '@/components/OpencodeStatus';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OpencodeProvider>
          {/* Header with opencode status */}
          <header className="border-b border-neutral-800 px-4 py-2 flex items-center justify-between">
            <span className="font-mono text-sm text-neutral-300">specwright</span>
            <OpencodeStatus />
          </header>

          <main>{children}</main>
        </OpencodeProvider>
      </body>
    </html>
  );
}
```

## Unit Tests

### Test Files to Create

```
packages/dashboard/src/lib/__tests__/
├── services/
│   ├── opencode-manager.test.ts
│   └── chunk-executor-abort.test.ts
```

### opencode-manager.test.ts

```typescript
describe('OpencodeManager', () => {
  describe('start', () => {
    it('spawns opencode process');
    it('waits for health check to pass');
    it('returns success when healthy');
    it('returns error on timeout');
    it('does not start if already running');
  });

  describe('stop', () => {
    it('sends SIGTERM to process');
    it('waits for exit');
    it('falls back to SIGKILL after timeout');
  });

  describe('checkHealth', () => {
    it('returns true when server responds 200');
    it('returns false on connection refused');
    it('returns false on timeout');
  });

  describe('auto-restart', () => {
    it('restarts on unexpected exit');
    it('respects maxRestartAttempts');
    it('applies restartDelay between attempts');
    it('emits restart_failed event when exhausted');
  });
});
```

### chunk-executor-abort.test.ts

```typescript
describe('ChunkExecutor abort', () => {
  describe('abort', () => {
    it('aborts running execution');
    it('returns error if chunk not running');
    it('execution returns cancelled status');
    it('removes from running map');
  });

  describe('abortAll', () => {
    it('aborts all running chunks');
    it('returns count of aborted');
  });

  describe('isRunning', () => {
    it('returns true for running chunk');
    it('returns false for completed chunk');
    it('returns false for unknown chunk');
  });
});
```

## Chunked Implementation (Separate Sessions)

### Chunk 1: Opencode Manager Service
**Files:** `packages/dashboard/src/lib/services/opencode-manager.ts`
**Tests:** `packages/dashboard/src/lib/__tests__/services/opencode-manager.test.ts`
**Prompt:**
```
Create opencode-manager.ts service:
- OpencodeManager class (singleton)
- start() - spawn opencode process, wait for health
- stop() - graceful shutdown with SIGTERM/SIGKILL fallback
- checkHealth() - GET localhost:4096/sessions
- Auto-restart on crash (up to 3 attempts)
- Health monitor with configurable interval

Write unit tests with mocked child_process and fetch.
```

### Chunk 2: Opencode Health API
**Files:** `packages/dashboard/src/app/api/health/opencode/route.ts`
**Tests:** API integration test
**Prompt:**
```
Create /api/health/opencode route:
- GET: return opencode status and health
- POST: start or restart server (action in body)

Use opencodeManager singleton.
```

### Chunk 3: Opencode Context & Hook
**Files:** `packages/dashboard/src/contexts/OpencodeContext.tsx`, `packages/dashboard/src/hooks/useOpencodeHealth.ts`
**Tests:** React hook tests
**Prompt:**
```
Create OpencodeProvider context:
- Poll health every 5 seconds
- Auto-start if stopped on mount
- Expose status, error, start(), restart()

Create useOpencode() hook for consuming context.
```

### Chunk 4: Opencode Status UI
**Files:** `packages/dashboard/src/components/OpencodeStatus.tsx`
**Prompt:**
```
Create OpencodeStatus component:
- Show status indicator (running/stopped/error)
- Start button when stopped
- Retry button on error
- Compact design for header placement
```

### Chunk 5: Layout Integration
**Files:** `packages/dashboard/src/app/layout.tsx`
**Prompt:**
```
Update root layout:
- Wrap with OpencodeProvider
- Add header with OpencodeStatus
- Ensure status visible on all pages
```

### Chunk 6: Chunk Executor Abort
**Files:** `packages/dashboard/src/lib/services/chunk-executor.ts`
**Tests:** `packages/dashboard/src/lib/__tests__/services/chunk-executor-abort.test.ts`
**Prompt:**
```
Enhance ChunkExecutor with abort capability:
- Track running executions with Map<chunkId, AbortController>
- Pass AbortSignal to fetch calls
- abort(chunkId) - abort single execution
- abortAll() - abort all running
- isRunning(chunkId), getRunningChunks()
- Return 'cancelled' status on abort

Write unit tests for abort functionality.
```

### Chunk 7: Chunk Abort API
**Files:** `packages/dashboard/src/app/api/chunks/[id]/abort/route.ts`
**Prompt:**
```
Create /api/chunks/[id]/abort route:
- POST: abort running chunk
- Validate chunk exists
- Check if actually running
- Update chunk status to 'cancelled'
- Return success/error
```

### Chunk 8: ChunkItem Stop Button
**Files:** `packages/dashboard/src/components/ChunkItem.tsx`
**Prompt:**
```
Add stop button functionality to ChunkItem:
- Add onStop prop to interface
- Wire onClick handler on stop button (currently missing)
- stopPropagation to prevent card click
- Only show when chunk.status === 'running' && onStop provided
```

### Chunk 9: Spec Page Stop Handler
**Files:** `packages/dashboard/src/app/project/[id]/spec/[specId]/page.tsx`
**Prompt:**
```
Wire stop button in spec page:
- Add handleStopChunk(chunkId) function
- POST to /api/chunks/[id]/abort
- Refresh chunks on success
- Pass onStop to ChunkItem components
```

### Chunk 10: Output Persistence
**Files:** `packages/dashboard/src/app/project/[id]/spec/[specId]/page.tsx`
**Prompt:**
```
Load chunk output from database:
- When selecting chunk, check for live output first
- Fall back to chunk.output from DB
- Fetch from API if not in local state
- Ensure output survives page navigation
```

### Chunk 11: Verify Output Saving
**Files:** `packages/dashboard/src/lib/services/chunk-executor.ts`, `packages/dashboard/src/lib/services/chunk-pipeline.ts`
**Prompt:**
```
Verify chunk output is saved to DB:
- In chunk-executor: save output after completion
- In chunk-pipeline: ensure updateChunk called with output
- Add outputSummary for context passing
```

### Chunk 12: Integration Testing
**Files:** Various
**Prompt:**
```
Integration test all three features:
1. Start dashboard, verify opencode auto-starts
2. Run chunk, click stop, verify cancellation
3. Run chunk, navigate away, return, verify output persists
4. Kill opencode manually, verify auto-restart
```

## Acceptance Criteria

### ORC-43: Opencode Server Management
- [ ] Opencode server auto-starts when dashboard launches
- [ ] Status indicator shows running/stopped/error in header
- [ ] Auto-restart on crash (up to 3 attempts)
- [ ] Manual start button when stopped
- [ ] Retry button on error
- [ ] Clear error messages when opencode fails to start

### ORC-17: Stop Button
- [ ] Stop button has working onClick handler
- [ ] Clicking stop aborts running chunk execution
- [ ] Chunk status updates to 'cancelled'
- [ ] UI reflects cancelled state
- [ ] Can stop individual chunks without aborting entire run

### ORC-12: Output Persistence
- [ ] Chunk output saved to DB after execution
- [ ] Output loads from DB when selecting completed chunk
- [ ] Output survives page navigation
- [ ] Live output takes precedence during active run
- [ ] Output panel shows historical output for completed chunks

### Architecture
- [ ] OpencodeManager is singleton service
- [ ] ChunkExecutor tracks running executions with AbortController
- [ ] Services are independently testable
- [ ] API routes are thin HTTP handlers
- [ ] No business logic in components

## Dependencies

- Uses existing `chunk-executor.ts` (enhanced, not replaced)
- Uses existing `chunk-pipeline.ts` (calls executor)
- Uses existing database patterns
- No new npm dependencies required

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Opencode not installed | Show clear error message with install instructions |
| Port 4096 in use | Make port configurable, show "port in use" error |
| Process spawn fails on Windows | Test on Windows, use cross-spawn if needed |
| Abort doesn't stop opencode session | Call opencode cancel API if available |
| SSE doesn't support abort | Use ReadableStream cancel() method |
