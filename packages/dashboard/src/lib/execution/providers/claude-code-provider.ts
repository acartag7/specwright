/**
 * Claude Code Execution Provider
 *
 * Implements ExecutionProvider using the Claude CLI.
 * Delegates to ClaudeClient for process management and stream parsing.
 */

import type {
  ExecutionProvider,
  ExecutionRequest,
  ExecutionResult,
  HealthStatus,
  ModelInfo,
  ValidationResult,
} from '../types';
import { ClaudeClient } from '../../clients/claude-client';
import { spawnSync } from 'child_process';

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';

const CLAUDE_MODELS: ModelInfo[] = [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    capabilities: { toolCall: true, attachment: true, reasoning: true },
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    capabilities: { toolCall: true, attachment: true, reasoning: true },
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    capabilities: { toolCall: true, attachment: false, reasoning: false },
  },
];

export class ClaudeCodeProvider implements ExecutionProvider {
  readonly id = 'claude-code-default';
  readonly type = 'claude-code' as const;

  private client: ClaudeClient;

  constructor(options?: { model?: string }) {
    this.client = new ClaudeClient(options);
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    request.onStatus?.('initializing');

    try {
      request.onStatus?.('running');

      const result = await this.client.execute(
        request.prompt,
        {
          model: request.model.model,
          workingDirectory: request.workingDir,
          timeout: request.timeout,
          systemPrompt: request.systemPrompt,
        },
        {
          onToolUse: (tool, input) => {
            request.onToolCall?.({
              callId: `${tool}-${Date.now()}`,
              tool,
              state: 'running',
              input,
            });
          },
          onToolResult: (toolId, output) => {
            request.onToolCall?.({
              callId: toolId,
              tool: 'unknown',
              state: 'completed',
              output,
            });
          },
          onText: (text) => request.onText?.(text),
        }
      );

      request.onStatus?.(result.success ? 'completed' : 'failed');

      return {
        success: result.success,
        output: result.output,
        toolCalls: result.toolCalls.map(tc => ({
          ...tc,
          input: tc.input ?? {},
        })),
        usage: result.tokens
          ? { inputTokens: result.tokens.input, outputTokens: result.tokens.output }
          : undefined,
      };
    } catch (error) {
      request.onStatus?.('failed');
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, toolCalls: [] };
    }
  }

  async abort(_executionId: string): Promise<void> {
    this.client.abort();
  }

  async checkHealth(): Promise<HealthStatus> {
    // Verify claude CLI exists using shell: false
    const result = spawnSync(CLAUDE_PATH, ['--version'], {
      shell: false,
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.error || result.status !== 0) {
      return {
        healthy: false,
        provider: this.type,
        error: result.error?.message ?? `claude exited with code ${result.status}`,
      };
    }

    const version = result.stdout?.toString().trim();
    return { healthy: true, provider: this.type, version };
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    return CLAUDE_MODELS;
  }

  async validateModel(_provider: string, model: string): Promise<ValidationResult> {
    const found = CLAUDE_MODELS.find(m => m.id === model);
    if (found) return { valid: true, model: found };

    return {
      valid: false,
      error: `Model "${model}" not found for claude-code provider`,
      suggestions: CLAUDE_MODELS.map(m => m.id),
    };
  }
}
