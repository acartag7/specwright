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
