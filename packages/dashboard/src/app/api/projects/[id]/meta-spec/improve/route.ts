import { NextResponse } from 'next/server';
import { spawnSync } from 'child_process';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';
const VALID_SECTIONS = ['vision', 'architecture', 'constraints', 'nonGoals'] as const;
type Section = typeof VALID_SECTIONS[number];

function parseJsonResponse(text: string): unknown {
  const stripped = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  return JSON.parse(stripped.trim());
}

// POST /api/projects/[id]/meta-spec/improve
export async function POST(request: Request, _context: RouteContext) {
  try {
    const body = await request.json();

    if (!body.section || !VALID_SECTIONS.includes(body.section as Section)) {
      return NextResponse.json(
        { error: `section must be one of: ${VALID_SECTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const sectionLabels: Record<Section, string> = {
      vision: 'project vision statement',
      architecture: 'architecture description',
      constraints: 'technical constraints',
      nonGoals: 'non-goals / out of scope items',
    };

    const label = sectionLabels[body.section as Section];

    const prompt = `You are a technical writer improving a ${label} for a software project meta-spec.
Rewrite the following to be clearer, more professional, and more actionable. Keep the same meaning but improve clarity and structure.
Return ONLY valid JSON in this format:
{ "improved": "The improved text here" }

Original ${label}:
${body.content}`;

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
      return NextResponse.json({ error: 'Failed to run AI improvement' }, { status: 500 });
    }

    if (result.status !== 0) {
      console.error('Claude stderr:', result.stderr);
      return NextResponse.json({ error: 'AI improvement failed' }, { status: 500 });
    }

    const parsed = parseJsonResponse(result.stdout) as { improved: string };
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error improving content:', error);
    return NextResponse.json({ error: 'Failed to improve content' }, { status: 500 });
  }
}
