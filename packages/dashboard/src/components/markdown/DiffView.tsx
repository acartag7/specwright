'use client';

import { useMemo } from 'react';
import { diffLines } from 'diff';

interface DiffViewProps {
  oldText: string;
  newText: string;
  filename?: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNum: number | null;
}

export default function DiffView({ oldText, newText, filename }: DiffViewProps) {
  const lines = useMemo(() => {
    const changes = diffLines(oldText, newText);
    const result: DiffLine[] = [];
    let lineNum = 1;

    for (const change of changes) {
      const changeLines = change.value.replace(/\n$/, '').split('\n');
      for (const line of changeLines) {
        if (change.added) {
          result.push({ type: 'added', content: `+ ${line}`, lineNum });
          lineNum++;
        } else if (change.removed) {
          result.push({ type: 'removed', content: `- ${line}`, lineNum: null });
        } else {
          result.push({ type: 'unchanged', content: `  ${line}`, lineNum });
          lineNum++;
        }
      }
    }

    return result;
  }, [oldText, newText]);

  return (
    <div className="sw-diff">
      {filename && (
        <div className="sw-diff-header">{filename}</div>
      )}
      <div className="sw-diff-body">
        {lines.map((line, i) => (
          <div key={i} className={`sw-diff-line ${line.type}`}>
            <span className="sw-diff-line-num">
              {line.lineNum ?? ''}
            </span>
            <span className="sw-diff-line-content">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
