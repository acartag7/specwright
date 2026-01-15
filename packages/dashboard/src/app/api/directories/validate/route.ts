import { NextResponse } from 'next/server';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

// POST /api/directories/validate - Validate and optionally create directory
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { directory, create = false } = body as { directory: string; create?: boolean };

    if (!directory?.trim()) {
      return NextResponse.json(
        { error: 'Directory path is required' },
        { status: 400 }
      );
    }

    const normalizedPath = path.normalize(directory.trim());

    // Check if path is absolute
    if (!path.isAbsolute(normalizedPath)) {
      return NextResponse.json({
        exists: false,
        valid: false,
        error: 'Path must be absolute (start with /)',
      });
    }

    // Check if directory exists
    const exists = existsSync(normalizedPath);

    // If requested to create and doesn't exist
    if (create && !exists) {
      try {
        mkdirSync(normalizedPath, { recursive: true });
        return NextResponse.json({
          exists: true,
          valid: true,
          created: true,
          path: normalizedPath,
        });
      } catch (createError) {
        return NextResponse.json({
          exists: false,
          valid: false,
          error: `Failed to create directory: ${createError instanceof Error ? createError.message : 'Unknown error'}`,
        });
      }
    }

    return NextResponse.json({
      exists,
      valid: true,
      path: normalizedPath,
    });
  } catch (error) {
    console.error('Error validating directory:', error);
    return NextResponse.json(
      { error: 'Failed to validate directory' },
      { status: 500 }
    );
  }
}
