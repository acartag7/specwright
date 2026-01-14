# GLM Orchestrator

[![CI](https://github.com/acartag7/glm-orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/acartag7/glm-orchestrator/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40anthropic%2Fglm-orchestrator.svg)](https://www.npmjs.com/package/glm-orchestrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**MCP server that lets Claude Opus delegate coding tasks to GLM-4.7 via OpenCode.**

Use Claude Opus for architecture and review, delegate implementation to GLM for cost-effective, high-volume coding.

## Why?

| Model | Best For | Cost |
|-------|----------|------|
| Claude Opus 4.5 | Architecture, complex reasoning, code review | Higher |
| GLM-4.7 | Implementation, file creation, repetitive tasks | Lower (via z.ai) |

This orchestrator lets you use **both** - Opus designs, GLM implements.

## Quick Demo

```
You: "Create a user authentication module with JWT tokens"

Claude Opus:
  1. Designs the architecture (types, utils, handlers)
  2. Creates implementation spec
  3. Calls delegate_chunks_to_glm with tasks:
     - "Create auth types and interfaces"
     - "Implement JWT token utilities"
     - "Create auth middleware"
     - "Add authentication tests"
  4. GLM creates all files (~2 min total)
  5. Opus reviews the implementation
  6. Done!
```

## Installation

### Prerequisites

1. **OpenCode CLI** - Install via Homebrew:
   ```bash
   brew install opencode
   ```

2. **z.ai Subscription** - Get access to `zai-coding-plan/glm-4.7` model at [z.ai](https://z.ai)

3. **Node.js 18+**

### Install via pnpm (Recommended)

```bash
pnpm add -g glm-orchestrator
```

Or with npm:
```bash
npm install -g glm-orchestrator
```

### Configure Claude Desktop

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "glm-orchestrator": {
      "type": "stdio",
      "command": "glm-orchestrator"
    }
  }
}
```

Or for a specific project:
```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "glm-orchestrator": {
          "type": "stdio",
          "command": "glm-orchestrator"
        }
      }
    }
  }
}
```

### Alternative: Run from source

```bash
git clone https://github.com/acartag7/glm-orchestrator.git
cd glm-orchestrator
pnpm install
pnpm build

# Add to ~/.claude.json
{
  "mcpServers": {
    "glm-orchestrator": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/glm-orchestrator/dist/index.js"]
    }
  }
}
```

## Available Tools

### Core Delegation Tools

#### `delegate_to_glm`
Send a single focused task to GLM. Best for small tasks (10-60 seconds).

```
Example: "Fix the date parsing bug in utils/parser.ts"
```

#### `delegate_chunks_to_glm`
Execute multiple tasks sequentially with context passing between chunks.

```
Example chunks:
1. "Create TypeScript interfaces for User and Session"
2. "Implement user repository with CRUD operations"
3. "Add authentication middleware"
4. "Create tests for all modules"
```

Each chunk knows what files previous chunks created.

### Workflow Tools

#### `start_feature_workflow`
Create a full feature workflow with stages: Design → Implement → Review → Fix

#### `run_implementation_stage`
Run implementation with dependency-aware task execution. Tasks run in parallel when possible.

#### `visualize_workflow`
Display workflow status and progress.

### Spec Management Tools

#### `write_spec`
Write a feature specification to `.handoff/` directory.

#### `write_review`
Write code review findings to `.handoff/` directory.

#### `split_spec_into_chunks`
Analyze a spec file and suggest implementation chunks.

## Workflows

### 1. Simple Delegation

Best for: Bug fixes, small features, single file tasks.

```
User: "Fix the memory leak in the WebSocket handler"

Claude → delegate_to_glm → GLM fixes it → Done
```

### 2. Chunked Implementation

Best for: Multi-file features, component creation.

```
User: "Create a Timeline component with filters and tests"

Claude:
  1. Plans the implementation
  2. Calls delegate_chunks_to_glm with:
     - TimelineContainer.tsx
     - TimelineEvent.tsx
     - TimelineFilters.tsx
     - Timeline.test.tsx
  3. GLM creates each file sequentially
  4. Returns summary
```

### 3. Full Feature Workflow

Best for: Large features, end-to-end implementation.

```
User: "Implement user authentication"

Claude:
  1. Calls start_feature_workflow
  2. Designs architecture (Opus)
  3. Calls run_implementation_stage (GLM)
  4. Reviews implementation (Opus)
  5. Fixes issues if any (GLM)
  6. Done!
```

## Performance

| Task Type | Typical Duration |
|-----------|------------------|
| Single file creation | 10-20s |
| Bug fix | 30-60s |
| Bug fix with tests | 60-90s |
| Multi-file feature (4 files) | 2-4 min |
| Full feature workflow | 5-10 min |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Opus 4.5                                            │
│  - Understands requirements                                 │
│  - Designs architecture                                     │
│  - Reviews code                                             │
│  - Makes high-level decisions                               │
│                    │                                        │
│                    ▼                                        │
├─────────────────────────────────────────────────────────────┤
│  GLM Orchestrator (MCP Server)                              │
│  - Receives tasks from Claude                               │
│  - Spawns OpenCode with GLM-4.7                             │
│  - Manages context between chunks                           │
│  - Returns results                                          │
│                    │                                        │
│                    ▼                                        │
├─────────────────────────────────────────────────────────────┤
│  GLM-4.7 via OpenCode                                       │
│  - Creates files                                            │
│  - Implements code                                          │
│  - Runs commands                                            │
│  - Executes tests                                           │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
src/
├── index.ts              # MCP server entry point
├── tools/
│   ├── definitions.ts    # Tool schemas
│   ├── delegate.ts       # Core delegation tools
│   ├── workflow.ts       # Workflow management
│   └── spec.ts           # Spec management
├── execution/
│   ├── stage.ts          # Stage execution
│   ├── task.ts           # Task execution
│   └── chunks.ts         # Chunk execution
├── utils/
│   ├── glm.ts            # OpenCode wrapper
│   ├── files.ts          # File utilities
│   └── context.ts        # Context building
└── workflow.ts           # Types and helpers
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GLM_MODEL` | Model to use | `zai-coding-plan/glm-4.7` |
| `GLM_TIMEOUT` | Default timeout (ms) | `180000` |

### Timeouts

Default timeouts can be overridden per-call:

```typescript
// In your Claude prompt
delegate_to_glm({
  task: "Complex implementation...",
  workingDirectory: "/path/to/project",
  timeoutMs: 300000  // 5 minutes
})
```

## Development

```bash
# Clone
git clone https://github.com/acartag7/glm-orchestrator.git
cd glm-orchestrator

# Install
pnpm install

# Build
pnpm build

# Run locally
pnpm start

# Development mode
pnpm dev
```

### Testing GLM Connection

```bash
node -e "
const { executeGLM } = require('./dist/utils/glm.js');
executeGLM('Create test.txt with Hello World', process.cwd())
  .then(r => console.log('Success:', r))
  .catch(e => console.error('Error:', e));
"
```

## Troubleshooting

### GLM hangs indefinitely

The orchestrator uses specific flags to prevent hangs:
- `--title glm-task`: Bypasses ensureTitle() bug in OpenCode
- `</dev/null`: Closes stdin for proper process exit

If still hanging, update OpenCode:
```bash
brew upgrade opencode
```

### No files created

1. Check `workingDirectory` is an absolute path
2. Verify GLM has write permissions
3. Check OpenCode is authenticated with z.ai

### Timeout errors

- Increase `timeoutMs` for complex tasks
- Split large tasks into smaller chunks
- Use `delegate_chunks_to_glm` instead of single delegation

### OpenCode not found

```bash
# Install OpenCode
brew install opencode

# Verify installation
which opencode
opencode --version
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm build` to verify
5. Submit a pull request

## License

MIT - see [LICENSE](LICENSE)

## Related

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [OpenCode](https://github.com/anomalyco/opencode)
- [z.ai](https://z.ai)
