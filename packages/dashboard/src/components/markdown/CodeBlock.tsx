'use client';

import { useState, useCallback } from 'react';

interface CodeBlockProps {
  language?: string;
  children: string;
  inline?: boolean;
}

export default function CodeBlock({ language, children, inline }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [children]);

  if (inline) {
    return <code>{children}</code>;
  }

  return (
    <div className="sw-code-block">
      {(language || true) && (
        <div className="sw-code-header">
          <span className="sw-code-lang">{language || ''}</span>
          <button
            className={`sw-code-copy${copied ? ' copied' : ''}`}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      <pre>
        <code className={language ? `hljs language-${language}` : 'hljs'}>
          {children}
        </code>
      </pre>
    </div>
  );
}
