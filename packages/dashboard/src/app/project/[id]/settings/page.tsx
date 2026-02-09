'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Project, ProjectConfig } from '@specwright/shared';
import { DEFAULT_PROJECT_CONFIG } from '@specwright/shared';

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [config, setConfig] = useState<ProjectConfig>(DEFAULT_PROJECT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);
        const [projectRes, configRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/config`),
        ]);

        if (!projectRes.ok) throw new Error('Failed to load project');
        const projectData = await projectRes.json();
        setProject(projectData.project);

        if (configRes.ok) {
          const configData = await configRes.json();
          setConfig(configData.config || DEFAULT_PROJECT_CONFIG);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [projectId]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error('Failed to save config');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [projectId, config]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-400 font-mono">
          <svg className="animate-spin w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading settings...
        </div>
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-medium text-neutral-100 mb-2 font-mono">{error}</h2>
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 text-sm font-mono">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]">
      <header className="border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-3 flex items-center gap-4">
          <Link
            href={`/project/${projectId}`}
            className="p-1.5 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded-md transition-colors"
            title="Back to project"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="flex items-center gap-2 text-sm font-mono">
            <span className="text-neutral-500">/</span>
            <span className="text-neutral-400">project</span>
            <span className="text-neutral-500">/</span>
            <span className="text-neutral-100">{project?.name}</span>
            <span className="text-neutral-500">/</span>
            <span className="text-neutral-400">settings</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
        <h1 className="text-lg font-medium text-neutral-100 font-mono mb-6">Project Settings</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-md">
            <p className="text-sm text-red-400 font-mono">{error}</p>
          </div>
        )}

        {/* Studio Configuration */}
        <section className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-6 space-y-6">
          <div>
            <h2 className="text-sm font-medium text-neutral-200 font-mono mb-1">
              Studio Configuration
            </h2>
            <p className="text-xs text-neutral-500 font-mono">
              Configure models and execution settings for spec generation.
            </p>
          </div>

          {/* Planning Model */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 font-mono mb-2">
              Planning Model
            </label>
            <select
              value={config.planner.type}
              onChange={(e) =>
                setConfig({
                  ...config,
                  planner: { ...config.planner, type: e.target.value as 'opus' | 'sonnet' },
                })
              }
              className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            >
              <option value="opus">Claude Opus (Recommended)</option>
              <option value="sonnet">Claude Sonnet (Faster)</option>
            </select>
            <p className="mt-1.5 text-xs text-neutral-600 font-mono">
              Opus produces more detailed specs. Sonnet is faster and cheaper.
            </p>
          </div>

          {/* Executor */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 font-mono mb-2">
              Executor
            </label>
            <select
              value={config.executor.type}
              onChange={(e) =>
                setConfig({
                  ...config,
                  executor: {
                    ...config.executor,
                    type: e.target.value as 'opencode' | 'claude-code',
                  },
                })
              }
              className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            >
              <option value="opencode">OpenCode (GLM-4.7)</option>
              <option value="claude-code">Claude Code</option>
            </select>
            {config.executor.type === 'opencode' && (
              <input
                type="text"
                placeholder="Endpoint (default: http://localhost:4096)"
                value={config.executor.endpoint || ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    executor: { ...config.executor, endpoint: e.target.value },
                  })
                }
                className="w-full mt-2 p-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
            )}
          </div>

          {/* Reviewer */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 font-mono mb-2">
              Reviewer
            </label>
            <select
              value={config.reviewer.type}
              onChange={(e) =>
                setConfig({
                  ...config,
                  reviewer: {
                    ...config.reviewer,
                    type: e.target.value as 'sonnet-quick' | 'opus-thorough',
                  },
                })
              }
              className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            >
              <option value="sonnet-quick">Sonnet (Quick Reviews)</option>
              <option value="opus-thorough">Opus (Thorough Reviews)</option>
            </select>
          </div>

          {/* Max Iterations */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 font-mono mb-2">
              Max Iterations
              <span className="text-xs text-neutral-600 ml-2">(1-20, default: 5)</span>
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={config.maxIterations}
              onChange={(e) =>
                setConfig({ ...config, maxIterations: parseInt(e.target.value) || 5 })
              }
              className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            />
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-md font-mono text-sm hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
            {saveSuccess && (
              <span className="text-xs text-emerald-400 font-mono">Saved</span>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
