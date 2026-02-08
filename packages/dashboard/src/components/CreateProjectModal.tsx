'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated?: () => void;
}

interface DirectorySuggestions {
  recentDirectories: string[];
  basePaths: string[];
  suggestedPath: string;
  defaultBasePath: string;
}

interface DirectoryValidation {
  exists: boolean;
  valid: boolean;
  error?: string;
  created?: boolean;
}

export default function CreateProjectModal({
  isOpen,
  onClose,
  onProjectCreated,
}: CreateProjectModalProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [directory, setDirectory] = useState('');
  const [description, setDescription] = useState('');
  const [suggestions, setSuggestions] = useState<DirectorySuggestions | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [validation, setValidation] = useState<DirectoryValidation | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCreatingDir, setIsCreatingDir] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions when modal opens
  useEffect(() => {
    if (isOpen) {
      fetch('/api/directories/suggestions')
        .then(res => res.json())
        .then(data => setSuggestions(data))
        .catch(console.error);

      setTimeout(() => nameInputRef.current?.focus(), 100);
    } else {
      setName('');
      setDirectory('');
      setDescription('');
      setValidation(null);
      setShowSuggestions(false);
      setCreatedProjectId(null);
      setCreateError(null);
    }
  }, [isOpen]);

  // Update suggested path when name changes
  useEffect(() => {
    if (!name.trim() || directory) return;

    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (safeName && suggestions?.defaultBasePath) {
      const suggested = `${suggestions.defaultBasePath}/${safeName}`;
      setDirectory(suggested);
      setValidation(null);
    }
  }, [name, suggestions?.defaultBasePath]);

  // Validate directory on blur
  const validateDirectory = useCallback(async (dir: string) => {
    if (!dir.trim()) {
      setValidation(null);
      return;
    }

    setIsValidating(true);
    try {
      const res = await fetch('/api/directories/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: dir }),
      });
      const result = await res.json();
      setValidation(result);
    } catch {
      setValidation({ exists: false, valid: false, error: 'Failed to validate' });
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Create directory
  const handleCreateDirectory = async () => {
    if (!directory.trim()) return;

    setIsCreatingDir(true);
    try {
      const res = await fetch('/api/directories/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, create: true }),
      });
      const result = await res.json();
      setValidation(result);
    } catch {
      setValidation({ exists: false, valid: false, error: 'Failed to create directory' });
    } finally {
      setIsCreatingDir(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        !directoryInputRef.current?.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !directory.trim()) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          directory: directory.trim(),
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create project');
      }
      const project = await res.json();
      setCreatedProjectId(project.id);
      onProjectCreated?.();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectSuggestion = (path: string) => {
    setDirectory(path);
    setShowSuggestions(false);
    setValidation(null);
    validateDirectory(path);
  };

  const handleSetupMetaSpec = () => {
    if (createdProjectId) {
      onClose();
      router.push(`/project/${createdProjectId}?setup=meta-spec`);
    }
  };

  const handleSkip = () => {
    if (createdProjectId) {
      onClose();
      router.push(`/project/${createdProjectId}`);
    }
  };

  if (!isOpen) return null;

  // Build suggestions list
  const suggestionItems: { label: string; path: string; type: 'recent' | 'base' | 'suggested' }[] = [];

  if (suggestions) {
    if (suggestions.suggestedPath && suggestions.suggestedPath !== directory) {
      suggestionItems.push({
        label: 'Suggested',
        path: suggestions.suggestedPath,
        type: 'suggested',
      });
    }

    suggestions.recentDirectories.slice(0, 3).forEach(dir => {
      if (!suggestionItems.find(s => s.path === dir)) {
        suggestionItems.push({ label: 'Recent', path: dir, type: 'recent' });
      }
    });

    if (name.trim()) {
      const safeName = name
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      suggestions.basePaths.slice(0, 3).forEach(base => {
        const fullPath = `${base}/${safeName}`;
        if (!suggestionItems.find(s => s.path === fullPath)) {
          suggestionItems.push({ label: base.split('/').pop() || 'projects', path: fullPath, type: 'base' });
        }
      });
    }
  }

  // Success view with next steps
  if (createdProjectId) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/80">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                </div>
                <h2 className="text-sm font-medium text-neutral-100 font-mono">project created</h2>
              </div>
            </div>

            <div className="px-4 py-6 space-y-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-mono font-medium">{name} is ready</span>
              </div>

              <p className="text-xs text-neutral-400 font-mono leading-relaxed">
                a meta-spec defines your project&apos;s vision, architecture, and phases.
                setting one up helps guide spec generation and chunk planning.
              </p>

              <div className="space-y-2 pt-2">
                <button
                  onClick={handleSetupMetaSpec}
                  className="w-full px-4 py-2.5 text-xs font-mono bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md transition-colors text-left flex items-center justify-between"
                >
                  <span>set up meta-spec</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  onClick={handleSkip}
                  className="w-full px-4 py-2.5 text-xs font-mono text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 border border-neutral-800 rounded-md transition-colors text-left"
                >
                  skip for now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with macOS controls */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/80">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
              </div>
              <h2 className="text-sm font-medium text-neutral-100 font-mono">new project</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="px-4 py-4 space-y-4">
              {/* Error */}
              {createError && (
                <div className="bg-red-900/20 border border-red-800/50 rounded-md p-3 text-xs text-red-400 font-mono">
                  {createError}
                </div>
              )}

              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-xs font-medium text-neutral-400 mb-1.5 font-mono">
                  project name
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-awesome-project"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-neutral-100 text-sm placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-shadow font-mono"
                  required
                  disabled={isCreating}
                />
              </div>

              {/* Directory */}
              <div className="relative">
                <label htmlFor="directory" className="block text-xs font-medium text-neutral-400 mb-1.5 font-mono">
                  working directory
                </label>
                <div className="relative">
                  <input
                    ref={directoryInputRef}
                    type="text"
                    id="directory"
                    value={directory}
                    onChange={(e) => {
                      setDirectory(e.target.value);
                      setValidation(null);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => {
                      // Delay to allow click on suggestion
                      setTimeout(() => validateDirectory(directory), 200);
                    }}
                    placeholder="/Users/acartagena/project/my-project"
                    className={`w-full px-3 py-2 bg-neutral-950 border rounded-md text-neutral-100 text-sm placeholder-neutral-600 focus:outline-none focus:ring-1 transition-shadow font-mono pr-8 ${
                      validation?.exists
                        ? 'border-emerald-500/50 focus:ring-emerald-500/50 focus:border-emerald-500/50'
                        : validation && !validation.exists && validation.valid
                        ? 'border-amber-500/50 focus:ring-amber-500/50 focus:border-amber-500/50'
                        : validation && !validation.valid
                        ? 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50'
                        : 'border-neutral-800 focus:ring-emerald-500/50 focus:border-emerald-500/50'
                    }`}
                    required
                    disabled={isCreating}
                  />
                  {/* Validation indicator */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    {isValidating ? (
                      <svg className="animate-spin w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : validation?.exists ? (
                      <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : validation && !validation.valid ? (
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : null}
                  </div>
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && suggestionItems.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute z-10 mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md shadow-lg max-h-48 overflow-auto"
                  >
                    {suggestionItems.map((item, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleSelectSuggestion(item.path)}
                        className="w-full px-3 py-2 text-left hover:bg-neutral-800 transition-colors flex items-center gap-2"
                      >
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          item.type === 'suggested'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : item.type === 'recent'
                            ? 'bg-violet-500/10 text-violet-400'
                            : 'bg-neutral-800 text-neutral-500'
                        }`}>
                          {item.label}
                        </span>
                        <span className="text-sm text-neutral-300 font-mono truncate">{item.path}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Validation message */}
                {validation && !validation.exists && validation.valid && (
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-[10px] text-amber-400 font-mono">
                      directory doesn&apos;t exist
                    </p>
                    <button
                      type="button"
                      onClick={handleCreateDirectory}
                      disabled={isCreatingDir}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1"
                    >
                      {isCreatingDir ? (
                        <>
                          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          creating...
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          create it
                        </>
                      )}
                    </button>
                  </div>
                )}
                {validation?.error && (
                  <p className="mt-1.5 text-[10px] text-red-400 font-mono">{validation.error}</p>
                )}
                {validation?.created && (
                  <p className="mt-1.5 text-[10px] text-emerald-400 font-mono">directory created</p>
                )}
                {!validation && (
                  <p className="mt-1.5 text-[10px] text-neutral-600 font-mono">
                    the directory where code changes will be made
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="block text-xs font-medium text-neutral-400 mb-1.5 font-mono">
                  description <span className="text-neutral-600 font-normal">(optional)</span>
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="a brief description of this project..."
                  rows={2}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-neutral-100 text-sm placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-shadow resize-none font-mono"
                  disabled={isCreating}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-800 bg-neutral-900/50">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-mono text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-md transition-colors"
                disabled={isCreating}
              >
                cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || !directory.trim() || isCreating}
                className="px-3 py-1.5 text-xs font-mono bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:border-neutral-700 rounded-md transition-colors flex items-center gap-2"
              >
                {isCreating ? (
                  <>
                    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    creating...
                  </>
                ) : (
                  'create project'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
