import { NextResponse } from 'next/server';
import { existsSync, mkdirSync } from 'fs';
import { getProject } from '@/lib/db';
import { ClaudeClient } from '@glm/mcp/client';
import type { GenerateChunksRequest, ChunkSuggestion } from '@glm/shared';

// Ensure directory exists, create if needed
function ensureDirectory(dir: string): string {
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      return process.env.HOME || '/tmp';
    }
  }
  return dir;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Extract JSON from response (handles markdown code blocks)
function extractJSON(text: string): string {
  let str = text.trim();

  // Try to find JSON array in the text
  const jsonMatch = str.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // Remove markdown code blocks
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  return str.trim();
}

const CHUNKS_SYSTEM_PROMPT = `You are a technical project planner. Your job is to break down software specifications into discrete implementation chunks that can be executed by an AI coding assistant.

Return ONLY a valid JSON array of chunks. Do not include any markdown, code blocks, or explanation. Just the raw JSON.`;

type ChunkDetailLevel = 'minimal' | 'standard' | 'detailed';

const CHUNK_COUNT_MAP: Record<ChunkDetailLevel, string> = {
  minimal: '2-3',
  standard: '4-6',
  detailed: '7-10',
};

const CHUNKS_PROMPT_TEMPLATE = `Break down this specification into implementation chunks. Each chunk should be a discrete task that can be executed independently by an AI coding assistant.

Specification:
{spec}

Generate approximately {chunkCount} chunks.

Return a JSON array of chunks ordered by dependency (foundational tasks first):

[
  {
    "id": "chunk_1",
    "title": "Setup dependencies",
    "description": "Install required packages: bcrypt, jsonwebtoken. Add TypeScript type definitions. Update package.json.",
    "selected": true,
    "order": 1
  },
  {
    "id": "chunk_2",
    "title": "Create user database schema",
    "description": "Create users table with columns: id (UUID), email (unique), password_hash, created_at, updated_at. Add appropriate indexes.",
    "selected": true,
    "order": 2
  }
]

Rules:
- Each chunk should take 5-15 minutes to implement
- Descriptions should be detailed enough for autonomous execution
- Order by dependencies (setup -> core -> features -> tests)
- Generate {chunkCount} chunks as requested
- All chunks should have "selected": true by default
- Generate unique IDs like chunk_1, chunk_2, etc.
- Return ONLY valid JSON, no markdown code blocks`;

// POST /api/projects/[id]/studio/chunks - Generate chunk suggestions
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const body = await request.json() as GenerateChunksRequest;

    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (!body.spec?.trim()) {
      return NextResponse.json(
        { error: 'Spec is required' },
        { status: 400 }
      );
    }

    // Get chunk count preference (default to standard)
    const chunkPreference = (body as { chunkPreference?: ChunkDetailLevel }).chunkPreference || 'standard';
    const chunkCount = CHUNK_COUNT_MAP[chunkPreference];

    const prompt = CHUNKS_PROMPT_TEMPLATE
      .replace('{spec}', body.spec)
      .replace(/{chunkCount}/g, chunkCount);

    // Use Sonnet for studio operations (faster, cheaper)
    const workingDir = ensureDirectory(project.directory);
    const client = new ClaudeClient({ model: 'claude-sonnet-4-5-20250929' });
    const result = await client.execute(prompt, {
      workingDirectory: workingDir,
      systemPrompt: CHUNKS_SYSTEM_PROMPT,
      timeout: 60000,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: `Failed to generate chunks: ${result.output}` },
        { status: 500 }
      );
    }

    // Parse JSON from response
    let chunks: ChunkSuggestion[];
    try {
      // Extract JSON array from response (handles markdown code blocks)
      const jsonStr = extractJSON(result.output);
      console.log('[studio/chunks] Extracted JSON:', jsonStr.slice(0, 200));
      chunks = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[studio/chunks] Failed to parse JSON:', result.output);
      return NextResponse.json(
        { error: 'Failed to parse AI response as JSON. Raw: ' + result.output.slice(0, 200) },
        { status: 500 }
      );
    }

    return NextResponse.json({ chunks });
  } catch (error) {
    console.error('Error generating chunks:', error);
    return NextResponse.json(
      { error: `Failed to generate chunks: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
