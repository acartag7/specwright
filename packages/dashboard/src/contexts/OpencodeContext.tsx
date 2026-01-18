'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react';

export type OpencodeStatusType = 'unknown' | 'starting' | 'running' | 'stopped' | 'error';

interface OpencodeContextType {
  status: OpencodeStatusType;
  error?: string;
  start: () => Promise<void>;
  restart: () => Promise<void>;
}

const OpencodeContext = createContext<OpencodeContextType | null>(null);

export function OpencodeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OpencodeStatusType>('unknown');
  const [error, setError] = useState<string>();
  const hasAutoStarted = useRef(false);

  // Check health on mount and periodically
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health/opencode');
        const data = await res.json();

        if (data.healthy) {
          setStatus('running');
          setError(undefined);
        } else if (data.error) {
          setStatus('error');
          setError(data.error);
        } else {
          setStatus('stopped');
        }
      } catch {
        setStatus('error');
        setError('Failed to check opencode status');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-start on mount if not running (only once)
  useEffect(() => {
    const autoStart = async () => {
      if (status === 'stopped' && !hasAutoStarted.current) {
        hasAutoStarted.current = true;
        console.log('[OpencodeProvider] Auto-starting opencode server...');
        await start();
      }
    };

    autoStart();
  }, [status]);

  const start = useCallback(async () => {
    setStatus('starting');
    setError(undefined);
    try {
      const res = await fetch('/api/health/opencode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus('running');
        setError(undefined);
      } else {
        setStatus('error');
        setError(data.error || 'Failed to start opencode');
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to start opencode');
    }
  }, []);

  const restart = useCallback(async () => {
    setStatus('starting');
    setError(undefined);
    try {
      const res = await fetch('/api/health/opencode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus('running');
        setError(undefined);
      } else {
        setStatus('error');
        setError(data.error || 'Failed to restart opencode');
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to restart opencode');
    }
  }, []);

  return (
    <OpencodeContext.Provider value={{ status, error, start, restart }}>
      {children}
    </OpencodeContext.Provider>
  );
}

export function useOpencode() {
  const context = useContext(OpencodeContext);
  if (!context) {
    throw new Error('useOpencode must be used within OpencodeProvider');
  }
  return context;
}
