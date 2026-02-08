/**
 * Execution Provider Interface and Types
 *
 * Defines the provider abstraction for swappable executors
 * (OpenCode, Claude Code, future API-based providers).
 */

export interface ExecutionProvider {
  readonly id: string;
  readonly type: 'opencode' | 'claude-code' | 'api';

  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  abort(executionId: string): Promise<void>;
  checkHealth(): Promise<HealthStatus>;
  getAvailableModels(): Promise<ModelInfo[]>;
  validateModel(provider: string, model: string): Promise<ValidationResult>;
}

export interface ExecutionRequest {
  prompt: string;
  workingDir: string;
  model: ModelConfig;
  timeout?: number;
  systemPrompt?: string;
  onToolCall?: (toolCall: ToolCallEvent) => void;
  onText?: (text: string) => void;
  onStatus?: (status: ExecutionStatus) => void;
}

export interface ModelConfig {
  provider: string;
  model: string;
  options?: Record<string, unknown>;
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  toolCalls: ToolCallRecord[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  capabilities: {
    toolCall: boolean;
    attachment: boolean;
    reasoning: boolean;
  };
  cost?: { input: number; output: number };
  limits?: { context: number; output: number };
}

export interface HealthStatus {
  healthy: boolean;
  provider: string;
  version?: string;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  model?: ModelInfo;
  error?: string;
  suggestions?: string[];
}

export interface ToolCallEvent {
  callId: string;
  tool: string;
  state: 'pending' | 'running' | 'completed' | 'error';
  input?: Record<string, unknown>;
  output?: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  state: 'pending' | 'running' | 'completed' | 'error';
}

export type ExecutionStatus =
  | 'initializing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

// Context tracking types (v2-05)
export interface ContextMetrics {
  estimated: {
    total: number;
    breakdown: {
      systemPrompt: number;
      specContent: number;
      chunkDescription: number;
      dependencyHistory: number;
    };
  };
  model: {
    id: string;
    contextLimit: number;
    outputLimit: number;
  };
  percentage: number;
  status: 'peak' | 'good' | 'degrading' | 'poor';
  warnings: ContextWarning[];
}

export interface ContextWarning {
  level: 'info' | 'warning' | 'critical';
  component: 'systemPrompt' | 'specContent' | 'chunkDescription' | 'dependencyHistory';
  currentTokens: number;
  percentageOfTotal: number;
  message: string;
  suggestion: ContextSuggestion;
}

export interface ContextSuggestion {
  action: 'split-chunk' | 'split-spec' | 'archive-chunks' | 'compress-summaries' | 'summary-only';
  label: string;
  description: string;
  estimatedSavings: number;
  affectedItems?: string[];
}
