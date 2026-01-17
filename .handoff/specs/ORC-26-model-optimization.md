# ORC-26: Model Optimization

## Overview

Use appropriate Claude models (Haiku/Sonnet/Opus) based on task complexity to optimize cost and speed.

## Context

Currently using Opus for all Claude calls, but simpler tasks could use faster/cheaper models.

## Model Allocation

| Task | Current | Suggested | Reasoning |
|------|---------|-----------|-----------|
| Spec refinement | Opus | Opus | Complex reasoning needed |
| Chunk execution | GLM | GLM | Main work, keep as is |
| Review (pass/fail) | Opus | Sonnet | Pattern matching, simpler |
| Fix generation | Opus | Sonnet | Structured output |
| Status parsing | Opus | Haiku | Simple extraction |

## Implementation

### 1. Update ClaudeClient

Modify `packages/mcp/src/client/claude.ts`:

```typescript
export interface ClaudeClientOptions {
  timeout?: number;
  model?: 'opus' | 'sonnet' | 'haiku';
}

export class ClaudeClient {
  private model: string;

  constructor(options?: ClaudeClientOptions) {
    this.model = options?.model || 'opus';
    // ... rest of constructor
  }

  async execute(prompt: string, options?: { timeout?: number }): Promise<ExecuteResult> {
    const args = ['--print', '--dangerously-skip-permissions'];

    // Add model flag if not opus (opus is default)
    if (this.model !== 'opus') {
      args.push('--model', this.model);
    }

    // ... rest of execution
  }
}
```

### 2. Create Model Selection Utility

Create `packages/dashboard/src/lib/models.ts`:

```typescript
export type ModelTask = 'review' | 'refine' | 'parse' | 'fix';

export function selectModel(task: ModelTask): 'opus' | 'sonnet' | 'haiku' {
  switch (task) {
    case 'review':
      return 'sonnet'; // Pattern matching
    case 'refine':
      return 'opus'; // Complex reasoning
    case 'parse':
      return 'haiku'; // Simple extraction
    case 'fix':
      return 'sonnet'; // Structured output
    default:
      return 'sonnet';
  }
}
```

### 3. Update Review Calls

In `packages/dashboard/src/app/api/specs/[id]/run-all/route.ts`:

```typescript
// Use Sonnet for reviews
const claudeClient = new ClaudeClient({ model: 'sonnet' });
```

## Files to Modify

- MODIFY: `packages/mcp/src/client/claude.ts`
- CREATE: `packages/dashboard/src/lib/models.ts`
- MODIFY: `packages/dashboard/src/app/api/specs/[id]/run-all/route.ts`
- MODIFY: `packages/dashboard/src/app/api/specs/[id]/refine/route.ts` (keep Opus)

## Acceptance Criteria

- [ ] ClaudeClient accepts model parameter
- [ ] Reviews use Sonnet instead of Opus
- [ ] Spec refinement still uses Opus
- [ ] Model selection is centralized and configurable
