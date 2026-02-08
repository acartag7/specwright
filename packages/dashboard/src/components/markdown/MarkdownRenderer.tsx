'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import CodeBlock from './CodeBlock';
import './highlightLanguages';
import './markdown.css';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  compact?: boolean;
}

const components: Components = {
  code({ className, children }: { className?: string; children?: React.ReactNode }) {
    const match = /language-(\w+)/.exec(className || '');
    const isBlock = className?.includes('hljs') || match;

    if (isBlock) {
      return (
        <CodeBlock language={match?.[1]}>
          {String(children).replace(/\n$/, '')}
        </CodeBlock>
      );
    }

    // Inline code
    return <code>{children}</code>;
  },
  // Override pre to avoid double-wrapping -- our code component already provides its own container
  pre({ children }: { children?: React.ReactNode }) {
    return <>{children}</>;
  },
};

export default function MarkdownRenderer({ content, className, compact }: MarkdownRendererProps) {
  const classes = [
    'sw-markdown',
    compact && 'sw-markdown-compact',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
