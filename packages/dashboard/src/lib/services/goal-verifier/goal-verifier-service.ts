/**
 * Goal Verifier Service (v2-07, ORC-103)
 *
 * Spec-level goal verification using Claude Opus.
 * Runs after all chunks pass to verify the implementation
 * achieves the stated spec goal.
 */

import { spawnSync } from 'child_process';
import type { Chunk, Spec } from '@specwright/shared';
import { getSpec } from '@/lib/db/specs';
import { getChunksBySpec } from '@/lib/db/chunks';
import { getContext } from '@/lib/db/spec-execution-context';
import type {
  GoalVerificationResult,
  AccumulatedContext,
  IntegrationIssue,
  FixChunkSuggestion,
} from './types';

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';
const VERIFICATION_MODEL = 'claude-opus-4-6';
const VERIFICATION_TIMEOUT_MS = 600_000; // 10 minutes

export class GoalVerifierService {
  /**
   * Verify that a spec's implementation achieves its stated goal.
   * Reads spec goal, chunk outputs, and accumulated context,
   * then asks Opus for structured verification.
   */
  async verifyGoal(specId: string): Promise<GoalVerificationResult> {
    const spec = getSpec(specId);
    if (!spec) {
      return this.failResult('Spec not found', `Spec ${specId} does not exist`);
    }

    const chunks = getChunksBySpec(specId);
    if (chunks.length === 0) {
      return this.failResult(spec.goal || spec.title, 'No chunks found for spec');
    }

    const context = getContext(specId);
    const prompt = this.buildPrompt(spec, chunks, context);

    console.log(`[GoalVerifier] Verifying goal for spec: ${spec.title}`);

    const result = this.callClaude(prompt);
    if (!result.success) {
      return this.failResult(
        spec.goal || spec.title,
        `Claude verification failed: ${result.error}`
      );
    }

    return this.parseResponse(result.output, spec.goal || spec.title);
  }

  private buildPrompt(
    spec: Spec,
    chunks: Chunk[],
    context: AccumulatedContext | null
  ): string {
    const sections: string[] = [];

    // 1. Spec Goal
    sections.push('# Spec Goal Verification\n');
    if (spec.goal) {
      sections.push(`## Stated Goal\n${spec.goal}\n`);
    } else {
      sections.push(`## Inferred Goal (from spec title)\n${spec.title}\n`);
    }

    // 2. Chunk purposes and outputs
    sections.push('## Chunk Purposes\n');
    for (const chunk of chunks) {
      sections.push(`### Chunk ${chunk.order}: ${chunk.title}`);
      sections.push(`- **Purpose**: ${chunk.description.slice(0, 300)}`);
      sections.push(`- **Creates**: ${chunk.creates?.join(', ') || 'Not specified'}`);
      sections.push(`- **Status**: ${chunk.status} (review: ${chunk.reviewStatus ?? 'none'})`);
      if (chunk.outputSummary) {
        sections.push(`- **Output Summary**: ${chunk.outputSummary}`);
      }
      sections.push('');
    }

    // 3. Actual output from accumulated context
    sections.push('## Actual Output\n');
    if (context) {
      sections.push('### Exports Created');
      for (const exp of context.exports) {
        sections.push(`- \`${exp.name}\` (${exp.type}) in ${exp.file}`);
      }
      sections.push('');
      sections.push('### Files Created/Modified');
      sections.push(`- Created: ${context.filesCreated.join(', ') || 'None'}`);
      sections.push(`- Modified: ${context.filesModified.join(', ') || 'None'}`);
    } else {
      sections.push('No accumulated context available.\n');
    }

    // 4. Verification questions
    sections.push('\n## Your Task\n');
    sections.push('Answer these questions:\n');
    sections.push('1. **Goal Alignment**: Does the actual output achieve the stated goal?');
    sections.push('2. **Completeness**: Are there missing pieces that the goal implies?');
    sections.push('3. **Integration**: Do the chunks work together as a cohesive whole?');
    sections.push('4. **Quality**: Are there obvious issues (dead code, missing error handling)?');

    // 5. Response format
    sections.push('\n## Response Format\n');
    sections.push('Return ONLY valid JSON (no markdown fences, no extra text):\n');
    sections.push(`{
  "status": "pass" | "needs_fix" | "fail",
  "goalAlignment": {
    "achieved": boolean,
    "explanation": "Why the goal is/isn't achieved"
  },
  "integrationCheck": {
    "passed": boolean,
    "issues": [
      {
        "type": "missing_export | type_mismatch | unused_code | incomplete_feature",
        "description": "What's wrong",
        "affectedFiles": ["file1.ts"],
        "suggestedFix": "How to fix it"
      }
    ]
  },
  "fixChunks": [
    {
      "title": "Fix chunk title",
      "description": "What this fix chunk should do",
      "targetChunkId": "optional - which chunk to fix"
    }
  ]
}`);

    return sections.join('\n');
  }

  private callClaude(prompt: string): { success: boolean; output: string; error?: string } {
    const result = spawnSync(
      CLAUDE_PATH,
      ['--print', '--model', VERIFICATION_MODEL, prompt],
      {
        shell: false,
        encoding: 'utf-8',
        timeout: VERIFICATION_TIMEOUT_MS,
      }
    );

    if (result.error) {
      return { success: false, output: '', error: result.error.message };
    }

    if (result.status !== 0) {
      return {
        success: false,
        output: '',
        error: result.stderr || `Exit code ${result.status}`,
      };
    }

    return { success: true, output: result.stdout || '' };
  }

  private parseResponse(raw: string, specGoal: string): GoalVerificationResult {
    const trimmed = raw.trim();

    // Strip markdown code fences if present
    const jsonStr = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return this.validateParsedResult(parsed, specGoal);
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return this.validateParsedResult(parsed, specGoal);
        } catch {
          // Fall through to failure
        }
      }

      console.error('[GoalVerifier] Failed to parse Claude response:', trimmed.slice(0, 200));
      return this.failResult(specGoal, 'Failed to parse verification response');
    }
  }

  private validateParsedResult(
    parsed: Record<string, unknown>,
    specGoal: string
  ): GoalVerificationResult {
    const status = parsed.status as string;
    if (!['pass', 'needs_fix', 'fail'].includes(status)) {
      return this.failResult(specGoal, `Invalid status: ${status}`);
    }

    const goalAlignment = parsed.goalAlignment as Record<string, unknown> | undefined;
    const integrationCheck = parsed.integrationCheck as Record<string, unknown> | undefined;

    return {
      status: status as GoalVerificationResult['status'],
      goalAlignment: {
        specGoal,
        achieved: Boolean(goalAlignment?.achieved),
        explanation: String(goalAlignment?.explanation || 'No explanation provided'),
      },
      integrationCheck: {
        passed: Boolean(integrationCheck?.passed),
        issues: this.validateIssues(integrationCheck?.issues),
      },
      fixChunks: this.validateFixChunks(parsed.fixChunks),
    };
  }

  private validateIssues(raw: unknown): IntegrationIssue[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(item => ({
        type: this.validateIssueType(item.type),
        description: String(item.description || ''),
        affectedFiles: Array.isArray(item.affectedFiles)
          ? item.affectedFiles.map(String)
          : [],
        suggestedFix: item.suggestedFix ? String(item.suggestedFix) : undefined,
      }));
  }

  private validateIssueType(raw: unknown): IntegrationIssue['type'] {
    const valid = ['missing_export', 'type_mismatch', 'unused_code', 'incomplete_feature'];
    return valid.includes(String(raw))
      ? (String(raw) as IntegrationIssue['type'])
      : 'incomplete_feature';
  }

  private validateFixChunks(raw: unknown): FixChunkSuggestion[] | undefined {
    if (!Array.isArray(raw) || raw.length === 0) return undefined;
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(item => ({
        title: String(item.title || 'Fix'),
        description: String(item.description || ''),
        targetChunkId: item.targetChunkId ? String(item.targetChunkId) : undefined,
      }));
  }

  private failResult(specGoal: string, explanation: string): GoalVerificationResult {
    return {
      status: 'fail',
      goalAlignment: {
        specGoal,
        achieved: false,
        explanation,
      },
      integrationCheck: {
        passed: false,
        issues: [],
      },
    };
  }
}

export const goalVerifierService = new GoalVerifierService();
