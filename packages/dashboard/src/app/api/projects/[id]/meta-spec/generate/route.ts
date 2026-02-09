import { NextResponse } from 'next/server';
import { spawnSync } from 'child_process';
import { getProject, getSpecsByProject } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';

function parseJsonResponse(text: string): unknown {
  const stripped = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  return JSON.parse(stripped.trim());
}

// POST /api/projects/[id]/meta-spec/generate
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const specs = getSpecsByProject(projectId);
    if (specs.length === 0) {
      return NextResponse.json({ error: 'No specs found for this project' }, { status: 400 });
    }

    const specSummaries = specs.map(s => `### ${s.title}\n${s.content}`).join('\n\n');

    const prompt = `You are a software architect. Analyze the following specs for the project "${project.name}" and generate a comprehensive meta-spec.
The meta-spec should synthesize the specs into a cohesive project overview.

Return ONLY valid JSON in this format:
{
  "metaSpec": {
    "vision": "A clear, concise project vision",
    "architecture": "High-level architecture description",
    "constraints": "Technical constraints and limitations",
    "nonGoals": "Things explicitly out of scope",
    "phases": [
      {
        "name": "Phase name",
        "description": "Phase description",
        "successCriteria": ["Criterion 1", "Criterion 2"]
      }
    ]
  }
}

Project specs:
${specSummaries}`;

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
      return NextResponse.json({ error: 'Failed to run AI generation' }, { status: 500 });
    }

    if (result.status !== 0) {
      console.error('Claude stderr:', result.stderr);
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }

    const parsed = parseJsonResponse(result.stdout) as {
      metaSpec: {
        vision: string;
        architecture: string;
        constraints: string;
        nonGoals: string;
        phases: Array<{ name: string; description: string; successCriteria: string[] }>;
      };
    };
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error generating meta-spec:', error);
    return NextResponse.json({ error: 'Failed to generate meta-spec' }, { status: 500 });
  }
}
