'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Project, Spec } from '@glm/shared';

interface ProjectData {
  project: Project;
  spec: Spec | null;
}

export default function ProjectWorkspace() {
  const params = useParams();
  const projectId = params.id as string;

  const [data, setData] = useState<ProjectData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProject() {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/projects/${projectId}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Project not found');
          }
          throw new Error('Failed to load project');
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }

    fetchProject();
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading project...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-200 mb-2">
            {error || 'Project not found'}
          </h2>
          <Link
            href="/"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const { project, spec } = data;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
            title="Back to projects"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-100 truncate">
              {project.name}
            </h1>
            <p className="text-xs text-gray-500 truncate font-mono">
              {project.directory}
            </p>
          </div>
        </div>
      </header>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 flex">
        {/* Left Column - Spec & Chunks */}
        <div className="w-1/2 border-r border-gray-800 flex flex-col">
          {/* Spec Section */}
          <div className="flex-1 p-6 border-b border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                Spec
              </h2>
              <button
                disabled
                className="text-xs text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg cursor-not-allowed"
                title="Coming in Day 2"
              >
                Ask Opus to Refine
              </button>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 min-h-[200px]">
              {spec?.content ? (
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                  {spec.content}
                </pre>
              ) : (
                <p className="text-gray-500 text-sm italic">
                  No spec content yet. Start writing your spec here... (Editor coming in Day 2)
                </p>
              )}
            </div>
          </div>

          {/* Chunks Section */}
          <div className="flex-1 p-6 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                Chunks
              </h2>
              <button
                disabled
                className="text-xs text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg cursor-not-allowed"
                title="Coming in Day 2"
              >
                + Add Chunk
              </button>
            </div>
            <div className="bg-gray-900/50 border border-dashed border-gray-700 rounded-lg p-8 text-center">
              <p className="text-gray-500 text-sm">
                No chunks yet. Create chunks to break your spec into executable tasks.
              </p>
              <p className="text-gray-600 text-xs mt-2">
                (Chunk management coming in Day 2)
              </p>
            </div>
          </div>
        </div>

        {/* Right Column - Execution */}
        <div className="w-1/2 flex flex-col">
          <div className="flex-1 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                Execution
              </h2>
            </div>
            <div className="bg-gray-900/50 border border-dashed border-gray-700 rounded-lg p-8 text-center h-full flex items-center justify-center">
              <div>
                <p className="text-gray-500 text-sm">
                  Select a chunk and click run to see execution progress here.
                </p>
                <p className="text-gray-600 text-xs mt-2">
                  (Execution view coming in Day 3)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
