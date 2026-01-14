'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjects } from '@/hooks/useProjects';
import ProjectList from '@/components/ProjectList';
import CreateProjectModal from '@/components/CreateProjectModal';

export default function Home() {
  const router = useRouter();
  const { projects, isLoading, error, createProject, deleteProject } = useProjects();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleCreate = async (data: { name: string; directory: string; description?: string }) => {
    try {
      setIsCreating(true);
      const project = await createProject(data);
      setIsModalOpen(false);
      router.push(`/project/${project.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
      alert(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      return;
    }

    try {
      await deleteProject(id);
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">
              Spec-Driven Dev
            </h1>
            <p className="text-sm text-gray-500">
              Write specs, break into chunks, execute with AI
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-400">
            {error.message}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-gray-400">
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading projects...
            </div>
          </div>
        ) : (
          <ProjectList
            projects={projects}
            onDelete={handleDelete}
            onCreateClick={() => setIsModalOpen(true)}
          />
        )}

        {/* Delete confirmation tooltip */}
        {deleteConfirm && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 shadow-xl flex items-center gap-4 z-50">
            <span className="text-sm text-gray-300">Click delete again to confirm</span>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreate}
        isLoading={isCreating}
      />
    </main>
  );
}
