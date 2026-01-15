import { NextResponse } from 'next/server';
import { getAllProjects } from '@/lib/db';
import { existsSync } from 'fs';
import os from 'os';

const DEFAULT_BASE_PATH = '/Users/acartagena/project';

// GET /api/directories/suggestions - Get directory suggestions
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectName = searchParams.get('name') || '';

    // Get recent project directories
    const projects = getAllProjects();
    const recentDirectories = projects
      .map(p => p.directory)
      .filter((dir, index, self) => self.indexOf(dir) === index) // unique
      .slice(0, 5);

    // Extract base paths from recent directories
    const basePaths = new Set<string>();
    recentDirectories.forEach(dir => {
      const parts = dir.split('/');
      if (parts.length > 2) {
        // Get parent directory
        basePaths.add(parts.slice(0, -1).join('/'));
      }
    });

    // Add common paths
    const homedir = os.homedir();
    const commonPaths = [
      DEFAULT_BASE_PATH,
      `${homedir}/projects`,
      `${homedir}/code`,
      `${homedir}/dev`,
    ].filter(p => existsSync(p) || p === DEFAULT_BASE_PATH);

    // Merge and dedupe
    const allBasePaths = [...new Set([...basePaths, ...commonPaths])];

    // Generate suggested path if project name provided
    let suggestedPath = '';
    if (projectName) {
      const safeName = projectName
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (safeName) {
        // Use the most recently used base path, or default
        const preferredBase = recentDirectories.length > 0
          ? recentDirectories[0].split('/').slice(0, -1).join('/')
          : DEFAULT_BASE_PATH;
        suggestedPath = `${preferredBase}/${safeName}`;
      }
    }

    return NextResponse.json({
      recentDirectories,
      basePaths: allBasePaths,
      suggestedPath,
      defaultBasePath: DEFAULT_BASE_PATH,
    });
  } catch (error) {
    console.error('Error getting directory suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to get suggestions' },
      { status: 500 }
    );
  }
}
