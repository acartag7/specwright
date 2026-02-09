// Domain: execution
export { getProvider, getAvailableProviderTypes, registerProvider } from './provider-registry';
export { ModelRegistry, getModelRegistry } from './model-registry';
export {
  estimateTokens,
  getStatus,
  calculateContextMetrics,
} from './context-tracker';
export type { PromptComponents } from './context-tracker';
export type {
  ExecutionProvider,
  ExecutionRequest,
  ExecutionResult,
  ModelConfig,
  ModelInfo,
  HealthStatus,
  ValidationResult,
  ToolCallEvent,
  ToolCallRecord,
  ExecutionStatus,
} from './types';

// Execution events and validation (ORC-115)
export {
  type ExecutionEvent,
  type ActiveExecution,
  hasRunningExecution,
  getRunningChunkId,
  getExecution,
  subscribeToExecution,
  emitEvent,
  handleToolCall,
} from './events';

export {
  type ChangeValidation,
  validateFileChanges,
} from './validation';

// Execution manager (ORC-114)
export {
  POLL_INTERVAL_MS,
  hasStatusChanged,
  INITIAL_EXECUTION_STATE,
  shouldPollStatus,
  fetchSpecStatus,
  startChunkRun,
  abortChunkRun,
  reviewChunkRun,
  type ExecutionState,
  type UseExecutionReturn,
  type UseExecutionProps,
} from './manager';

// Tool call repository (ORC-118)
export {
  getToolCallsByChunk,
  createToolCall,
  updateToolCall,
} from './tool-calls-repository';

// Opencode manager (ORC-120)
export {
  OpencodeManager,
  opencodeManager,
  type OpencodeStatus,
  type OpencodeManagerConfig,
} from './opencode-manager';

// Iteration loop (v2-01, ORC-85)
export {
  executeWithRetry,
  type IterationConfig,
  type IterationAttempt,
  type IterationResult,
} from './iteration-loop';

// Wave scheduler (v2-08)
export {
  buildWaveSchedule,
  detectFileOverlap,
  splitByFileOverlap,
  type WaveSchedule,
  type Wave,
  type SerializedReason,
} from './wave-scheduler';

// Parallel executor (v2-08)
export {
  executeWave,
  type ChunkResult,
  type ChunkFailure,
  type WaveResult,
  type ParallelExecutionConfig,
} from './parallel-executor';
