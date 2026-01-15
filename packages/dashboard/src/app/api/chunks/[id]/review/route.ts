import { NextResponse } from 'next/server';
import { getChunk, updateChunk, insertFixChunk, getSpec } from '@/lib/db';
import { ClaudeClient } from '@glm/mcp/client';
import type { ReviewResult, ReviewStatus } from '@glm/shared';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const REVIEW_PROMPT_TEMPLATE = `You are reviewing the output of an AI coding assistant that just completed a task.

## Task
Title: {title}
Description: {description}

## Output from AI Assistant
{output}

## Your Job
Determine if the task was completed correctly.

Return JSON:
{
  "status": "pass" | "needs_fix" | "fail",
  "feedback": "Brief explanation of your assessment",
  "fixChunk": {
    "title": "Short title for the fix",
    "description": "Detailed instructions to fix the issue"
  }
}

Rules:
- "pass" = Task completed correctly, no issues found
- "needs_fix" = Task partially done or has fixable issues
- "fail" = Task cannot be completed, fundamental problem
- Be specific in feedback
- Fix descriptions should be actionable
- Only include fixChunk if status is "needs_fix"
- Return ONLY valid JSON, no markdown code blocks`;

function buildReviewPrompt(chunk: { title: string; description: string; output?: string }): string {
  return REVIEW_PROMPT_TEMPLATE
    .replace('{title}', chunk.title)
    .replace('{description}', chunk.description)
    .replace('{output}', chunk.output || 'No output captured');
}

function parseReviewResult(text: string): ReviewResult | null {
  try {
    // Try to extract JSON from the response
    // It might be wrapped in markdown code blocks
    let jsonStr = text.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Validate the result
    if (!parsed.status || !['pass', 'needs_fix', 'fail'].includes(parsed.status)) {
      return null;
    }

    const result: ReviewResult = {
      status: parsed.status as ReviewStatus,
      feedback: parsed.feedback || '',
    };

    // Only include fixChunk if status is needs_fix
    if (parsed.status === 'needs_fix' && parsed.fixChunk) {
      result.fixChunk = {
        title: parsed.fixChunk.title || 'Fix required issue',
        description: parsed.fixChunk.description || 'Fix the issue identified in the previous task',
      };
    }

    return result;
  } catch (error) {
    console.error('Failed to parse review result:', error);
    return null;
  }
}

// POST /api/chunks/[id]/review - Review a completed chunk with Opus
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id: chunkId } = await context.params;

    // Get chunk
    const chunk = getChunk(chunkId);
    if (!chunk) {
      return NextResponse.json(
        { error: 'Chunk not found' },
        { status: 404 }
      );
    }

    // Only review completed chunks
    if (chunk.status !== 'completed') {
      return NextResponse.json(
        { error: 'Can only review completed chunks' },
        { status: 400 }
      );
    }

    // Get spec for context
    const spec = getSpec(chunk.specId);
    if (!spec) {
      return NextResponse.json(
        { error: 'Spec not found' },
        { status: 404 }
      );
    }

    // Build review prompt
    const prompt = buildReviewPrompt(chunk);

    // Call Opus for review
    const claudeClient = new ClaudeClient();
    const result = await claudeClient.execute(prompt, {
      timeout: 120000, // 2 minutes for review
    });

    if (!result.success) {
      return NextResponse.json(
        { error: `Review failed: ${result.output}` },
        { status: 500 }
      );
    }

    // Parse the review result
    const reviewResult = parseReviewResult(result.output);
    if (!reviewResult) {
      return NextResponse.json(
        { error: 'Failed to parse review result', rawOutput: result.output },
        { status: 500 }
      );
    }

    // Update chunk with review result
    updateChunk(chunkId, {
      reviewStatus: reviewResult.status,
      reviewFeedback: reviewResult.feedback,
    });

    // If needs_fix, create the fix chunk
    let fixChunk = null;
    if (reviewResult.status === 'needs_fix' && reviewResult.fixChunk) {
      fixChunk = insertFixChunk(chunkId, {
        title: reviewResult.fixChunk.title,
        description: reviewResult.fixChunk.description,
      });
    }

    return NextResponse.json({
      ...reviewResult,
      fixChunk: fixChunk || reviewResult.fixChunk,
      fixChunkId: fixChunk?.id,
    });
  } catch (error) {
    console.error('Error reviewing chunk:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to review chunk' },
      { status: 500 }
    );
  }
}
