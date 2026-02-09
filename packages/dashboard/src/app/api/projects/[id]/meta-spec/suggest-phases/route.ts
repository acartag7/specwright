import { NextResponse } from 'next/server';
import { spawnSync } from 'child_process';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';

function parseJsonResponse(text: string): unknown {
  // Strip markdown fences if present
  const stripped = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  return JSON.parse(stripped.trim());
}

// POST /api/projects/[id]/meta-spec/suggest-phases
export async function POST(request: Request, _context: RouteContext) {
  try {
    const body = await request.json();
    if (!body.vision || typeof body.vision !== 'string') {
      return NextResponse.json({ error: 'vision is required' }, { status: 400 });
    }

    const prompt = `You are a software architect. Given the following project vision, suggest 3-6 implementation phases.
Each phase should have a name, description, and 2-4 success criteria.
Return ONLY valid JSON in this format:
{
  "phases": [
    {
      "name": "Phase name",
      "description": "What this phase accomplishes",
      "successCriteria": ["Criterion 1", "Criterion 2"]
    }
  ]
}

Project vision:
${body.vision}`;

    const result = spawnSync(CLAUDE_PATH, [
      '--print',
      '--model', 'claude-sonnet-4-5-20250929',
      prompt,
    ], {
      shell: false,
      encoding: 'utf-8',
      timeout: 120000,
    });

    if (result.error) {
      console.error('Claude spawn error:', result.error);
      return NextResponse.json({ error: 'Failed to run AI suggestion' }, { status: 500 });
    }

    if (result.status !== 0) {
      console.error('Claude stderr:', result.stderr);
      return NextResponse.json({ error: 'AI suggestion failed' }, { status: 500 });
    }

    const parsed = parseJsonResponse(result.stdout) as { phases: Array<{ name: string; description: string; successCriteria: string[] }> };
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error suggesting phases:', error);
    return NextResponse.json({ error: 'Failed to suggest phases' }, { status: 500 });
  }
}
