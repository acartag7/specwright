# ORC-45: First-Time Setup Wizard

## Overview

Create an interactive setup wizard that guides new users through installing and configuring all required dependencies. Makes the onboarding experience smooth and reduces support burden.

## Goals

1. Detect first-time users
2. Guide through dependency installation
3. Auto-configure where possible
4. Validate setup before allowing dashboard access
5. Optional: remember me for future sessions

## User Flow

```
User opens Specwright → First time? → Show wizard
                     → Not first time → Check health → Dashboard

Wizard Steps:
1. Welcome screen
2. Check dependencies
3. Install missing (with guidance)
4. Authenticate GitHub
5. Test connections
6. Done!
```

## Architecture

### Setup State Tracking

```typescript
// packages/dashboard/src/lib/setup-state.ts

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SETUP_STATE_PATH = join(homedir(), '.specwright', 'setup-state.json');

export interface SetupState {
  completed: boolean;
  completedAt?: string;
  skipped?: boolean;
  version: string; // Track setup version for future migrations
}

export function getSetupState(): SetupState {
  if (!existsSync(SETUP_STATE_PATH)) {
    return { completed: false, version: '1.0' };
  }

  try {
    return JSON.parse(readFileSync(SETUP_STATE_PATH, 'utf-8'));
  } catch {
    return { completed: false, version: '1.0' };
  }
}

export function saveSetupState(state: SetupState): void {
  const dir = join(homedir(), '.specwright');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SETUP_STATE_PATH, JSON.stringify(state, null, 2));
}

export function markSetupComplete(): void {
  saveSetupState({
    completed: true,
    completedAt: new Date().toISOString(),
    version: '1.0',
  });
}
```

### Wizard Component

```tsx
// packages/dashboard/src/components/SetupWizard.tsx
'use client';

import { useState, useEffect } from 'react';
import type { HealthCheckResult } from '@/lib/health-check';

type Step = 'welcome' | 'dependencies' | 'github-auth' | 'test' | 'complete';

interface SetupWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function SetupWizard({ onComplete, onSkip }: SetupWizardProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  const checkHealth = async () => {
    setChecking(true);
    const res = await fetch('/api/health');
    const data = await res.json();
    setHealth(data);
    setChecking(false);
  };

  useEffect(() => {
    if (step === 'dependencies' || step === 'test') {
      checkHealth();
    }
  }, [step]);

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return <WelcomeStep onNext={() => setStep('dependencies')} onSkip={onSkip} />;

      case 'dependencies':
        return (
          <DependenciesStep
            health={health}
            checking={checking}
            onRecheck={checkHealth}
            onNext={() => setStep('github-auth')}
            onBack={() => setStep('welcome')}
          />
        );

      case 'github-auth':
        return (
          <GitHubAuthStep
            onNext={() => setStep('test')}
            onBack={() => setStep('dependencies')}
          />
        );

      case 'test':
        return (
          <TestStep
            health={health}
            onNext={() => setStep('complete')}
            onBack={() => setStep('github-auth')}
          />
        );

      case 'complete':
        return <CompleteStep onFinish={onComplete} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-8">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {['Welcome', 'Dependencies', 'GitHub', 'Test', 'Done'].map((label, idx) => {
              const steps: Step[] = ['welcome', 'dependencies', 'github-auth', 'test', 'complete'];
              const currentIdx = steps.indexOf(step);
              const isActive = idx === currentIdx;
              const isComplete = idx < currentIdx;

              return (
                <div key={label} className="flex-1 text-center">
                  <div
                    className={`inline-block w-8 h-8 rounded-full ${
                      isComplete
                        ? 'bg-green-500 text-white'
                        : isActive
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    } flex items-center justify-center font-semibold mb-2`}
                  >
                    {isComplete ? '✓' : idx + 1}
                  </div>
                  <div className="text-xs text-gray-600">{label}</div>
                </div>
              );
            })}
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(steps.indexOf(step) / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        {renderStep()}
      </div>
    </div>
  );
}

function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold mb-4">Welcome to Specwright! 🎉</h1>
      <p className="text-lg text-gray-600 mb-6">
        Let's set up your development environment. This will only take a few minutes.
      </p>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
        <h3 className="font-semibold mb-2">What we'll set up:</h3>
        <ul className="space-y-1 text-sm text-gray-700">
          <li>✓ Claude CLI - for spec refinement and reviews</li>
          <li>✓ git - version control</li>
          <li>✓ GitHub CLI - for creating pull requests</li>
          <li>✓ opencode - AI executor (auto-managed)</li>
        </ul>
      </div>
      <div className="flex gap-4">
        <button
          onClick={onSkip}
          className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Skip Setup
        </button>
        <button
          onClick={onNext}
          className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Get Started
        </button>
      </div>
    </div>
  );
}

function DependenciesStep({
  health,
  checking,
  onRecheck,
  onNext,
  onBack,
}: {
  health: HealthCheckResult | null;
  checking: boolean;
  onRecheck: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const canProceed = health?.healthy || false;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Check Dependencies</h2>
      <p className="text-gray-600 mb-6">
        We'll verify that all required tools are installed on your system.
      </p>

      {checking ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Checking dependencies...</p>
        </div>
      ) : health ? (
        <div className="space-y-3 mb-6">
          {health.dependencies.map((dep) => (
            <div
              key={dep.name}
              className={`p-4 rounded-lg border ${
                dep.installed && !dep.error
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">
                    {dep.installed && !dep.error ? '✓' : '✗'} {dep.name}
                  </div>
                  {dep.version && <div className="text-sm text-gray-600">{dep.version}</div>}
                  {dep.error && <div className="text-sm text-red-600">{dep.error}</div>}
                </div>
                {!dep.installed && dep.installUrl && (
                  <a
                    href={dep.installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                  >
                    Install
                  </a>
                )}
                {dep.error && dep.fixCommand && (
                  <code className="px-3 py-1 bg-gray-800 text-white text-sm rounded">
                    {dep.fixCommand}
                  </code>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={onRecheck}
          disabled={checking}
          className="flex-1 px-6 py-3 border border-blue-500 text-blue-500 rounded-lg hover:bg-blue-50"
        >
          Re-check
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className={`flex-1 px-6 py-3 rounded-lg ${
            canProceed
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function GitHubAuthStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [checking, setChecking] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const checkAuth = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/github/auth-status');
      const data = await res.json();
      setAuthenticated(data.authenticated);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Authenticate GitHub</h2>
      <p className="text-gray-600 mb-6">
        Specwright uses GitHub CLI to create pull requests. Please authenticate if you haven't already.
      </p>

      <div className={`p-6 rounded-lg border mb-6 ${authenticated ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
        {authenticated ? (
          <div className="text-center">
            <div className="text-4xl mb-2">✓</div>
            <div className="font-semibold">GitHub Authenticated</div>
            <div className="text-sm text-gray-600">You're all set!</div>
          </div>
        ) : (
          <div>
            <div className="font-semibold mb-3">Run this command in your terminal:</div>
            <code className="block bg-gray-800 text-white p-4 rounded mb-4">
              gh auth login
            </code>
            <p className="text-sm text-gray-600 mb-4">
              Follow the prompts to authenticate with GitHub. Then click "Check Again" below.
            </p>
            <button
              onClick={checkAuth}
              disabled={checking}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {checking ? 'Checking...' : 'Check Again'}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!authenticated}
          className={`flex-1 px-6 py-3 rounded-lg ${
            authenticated
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function TestStep({
  health,
  onNext,
  onBack,
}: {
  health: HealthCheckResult | null;
  onNext: () => void;
  onBack: () => void;
}) {
  const allGood = health?.healthy || false;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Final Check</h2>
      <p className="text-gray-600 mb-6">
        Let's verify everything is working correctly.
      </p>

      {allGood ? (
        <div className="text-center py-8 bg-green-50 border border-green-200 rounded-lg mb-6">
          <div className="text-6xl mb-4">🎉</div>
          <div className="text-2xl font-bold text-green-700 mb-2">All Systems Ready!</div>
          <div className="text-gray-600">Specwright is ready to use.</div>
        </div>
      ) : (
        <div className="text-center py-8 bg-yellow-50 border border-yellow-200 rounded-lg mb-6">
          <div className="text-4xl mb-4">⚠️</div>
          <div className="text-xl font-semibold mb-2">Some issues detected</div>
          <div className="text-gray-600">Please go back and fix the issues.</div>
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!allGood}
          className={`flex-1 px-6 py-3 rounded-lg ${
            allGood
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Complete Setup
        </button>
      </div>
    </div>
  );
}

function CompleteStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="text-center">
      <div className="text-6xl mb-6">🚀</div>
      <h2 className="text-3xl font-bold mb-4">You're All Set!</h2>
      <p className="text-lg text-gray-600 mb-8">
        Specwright is ready to help you build features faster.
      </p>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 text-left">
        <h3 className="font-semibold mb-3">Quick Tips:</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li>• Start by creating a project in a git repository</li>
          <li>• Use Spec Studio to describe features with AI assistance</li>
          <li>• Execute chunks and watch the progress in real-time</li>
          <li>• Review and fix until all chunks pass</li>
          <li>• Create PR with one click when done</li>
        </ul>
      </div>
      <button
        onClick={onFinish}
        className="w-full px-8 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-lg font-semibold rounded-lg hover:from-blue-600 hover:to-indigo-700"
      >
        Open Dashboard
      </button>
    </div>
  );
}
```

### Integration

```tsx
// packages/dashboard/src/app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { SetupWizard } from '@/components/SetupWizard';
import { getSetupState, markSetupComplete, saveSetupState } from '@/lib/setup-state';

export default function Home() {
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = getSetupState();
    if (!state.completed && !state.skipped) {
      setShowWizard(true);
    }
    setLoading(false);
  }, []);

  const handleComplete = () => {
    markSetupComplete();
    setShowWizard(false);
  };

  const handleSkip = () => {
    saveSetupState({ completed: false, skipped: true, version: '1.0' });
    setShowWizard(false);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (showWizard) {
    return <SetupWizard onComplete={handleComplete} onSkip={handleSkip} />;
  }

  return (
    <div>
      {/* Normal dashboard */}
    </div>
  );
}
```

### API Routes

```typescript
// packages/dashboard/src/app/api/github/auth-status/route.ts
import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET() {
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
```

## Files to Create/Modify

**CREATE:**
- `packages/dashboard/src/lib/setup-state.ts`
- `packages/dashboard/src/components/SetupWizard.tsx`
- `packages/dashboard/src/app/api/github/auth-status/route.ts`

**MODIFY:**
- `packages/dashboard/src/app/page.tsx` - Show wizard on first use

## Acceptance Criteria

- [ ] Wizard shows on first launch
- [ ] Can skip wizard (remembers choice)
- [ ] Progress indicator shows current step
- [ ] Dependency check integrated
- [ ] GitHub auth verification works
- [ ] Final test validates everything
- [ ] Setup state persisted to `~/.specwright/setup-state.json`
- [ ] Can't proceed to next step if requirements not met
- [ ] Beautiful, polished UI

## Dependencies

- Requires: ORC-42 (health check system)
- Requires: ORC-44 (git/gh requirements)

## Future Enhancements

- Auto-install missing dependencies (where possible)
- Video tutorials embedded in wizard
- Option to re-run wizard from settings
- Setup analytics (anonymous)
