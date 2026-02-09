/**
 * OpenCode Execution Provider
 *
 * Implements ExecutionProvider using the OpenCode HTTP API.
 * Delegates to OpencodeClient for session management and SSE streaming.
 */

import type {
  ExecutionProvider,
  ExecutionRequest,
  ExecutionResult,
  HealthStatus,
  ModelInfo,
  ValidationResult,
  ToolCallRecord,
} from '../types';
import { OpencodeClient, type OpencodeClientOptions } from '../../clients/opencode-client';
import { getModelRegistry } from '../model-registry';

export class OpencodeProvider implements ExecutionProvider {
  readonly id = 'opencode-default';
  readonly type = 'opencode' as const;

  private client: OpencodeClient;
  private activeSessionId: string | null = null;
  private activeDirectory: string | null = null;

  constructor(options?: OpencodeClientOptions) {
    this.client = new OpencodeClient(options);
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const toolCalls: ToolCallRecord[] = [];
    let output = '';

    try {
      const session = await this.client.createSession(
        request.workingDir,
        'Specwright Execution'
      );
      this.activeSessionId = session.id;
      this.activeDirectory = request.workingDir;

      request.onStatus?.('initializing');

      // Set up SSE handler for streaming events
      const handler = this.client.createSessionHandler(session.id, {
        onToolCall: (_id, toolEvent) => {
          const existing = toolCalls.find(tc => tc.id === toolEvent.callId);
          if (existing) {
            existing.state = toolEvent.state;
            existing.output = toolEvent.output;
          } else {
            toolCalls.push({
              id: toolEvent.callId,
              name: toolEvent.tool,
              input: toolEvent.input ?? {},
              output: toolEvent.output,
              state: toolEvent.state,
            });
          }
          request.onToolCall?.({
            callId: toolEvent.callId,
            tool: toolEvent.tool,
            state: toolEvent.state,
            input: toolEvent.input,
            output: toolEvent.output,
          });
        },
        onTextChunk: (_id, text) => {
          output += text;
          request.onText?.(text);
        },
        onComplete: () => {
          request.onStatus?.('completed');
        },
        onError: (_id, error) => {
          request.onStatus?.('failed');
          output += `\nError: ${error.message}`;
        },
      });

      const unsubscribe = this.client.subscribeToEvents(handler);

      try {
        request.onStatus?.('running');

        await this.client.sendPrompt(session.id, request.workingDir, {
          parts: [{ type: 'text', text: request.prompt }],
          model: {
            providerID: request.model.provider,
            modelID: request.model.model,
          },
        });

        // Poll for completion
        const timeout = request.timeout ?? 300000;
        const deadline = Date.now() + timeout;

        while (Date.now() < deadline) {
          const status = await this.client.getSessionStatus(
            session.id,
            request.workingDir
          );
          if (status === 'idle') break;
          await new Promise(r => setTimeout(r, 1000));
        }

        if (Date.now() >= deadline) {
          request.onStatus?.('timeout');
          return { success: false, error: 'Execution timed out', output, toolCalls };
        }

        return { success: true, output, toolCalls };
      } finally {
        unsubscribe();
        this.activeSessionId = null;
        this.activeDirectory = null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, output, toolCalls };
    }
  }

  async abort(_executionId: string): Promise<void> {
    if (this.activeSessionId && this.activeDirectory) {
      await this.client.abortSession(this.activeSessionId, this.activeDirectory);
    }
  }

  async checkHealth(): Promise<HealthStatus> {
    const result = await this.client.checkHealth();
    return {
      healthy: result.healthy,
      provider: this.type,
      version: result.version,
      error: result.healthy ? undefined : 'OpenCode server is not reachable',
    };
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    return getModelRegistry().getAllModels();
  }

  async validateModel(provider: string, model: string): Promise<ValidationResult> {
    return getModelRegistry().validateModel(provider, model);
  }
}
