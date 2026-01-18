import { NextResponse } from 'next/server';
import { getReviewLogsBySpec, getReviewWarningsForSpec, getSpec } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/specs/[id]/review-logs - Get review logs and warnings for a spec
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: specId } = await context.params;

    const spec = getSpec(specId);
    if (!spec) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    const logs = getReviewLogsBySpec(specId);
    const warnings = getReviewWarningsForSpec(specId);

    return NextResponse.json({ logs, warnings });
  } catch (error) {
    console.error('[API] Error fetching review logs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch review logs' },
      { status: 500 }
    );
  }
}
