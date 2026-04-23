'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * M3.L1 — Streaming-safe markdown renderer (ADR-8).
 *
 * Design notes:
 * - memo() prevents re-render when content hasn't changed (used by non-streaming bubbles).
 * - pluginArray is a module-level const — never recreated on render, no react-markdown warning.
 * - Partial markdown (unclosed fences, incomplete tables) renders gracefully as plain text.
 * - No Shiki for v1: avoids WASM init complexity during streaming. Revisit post-deploy.
 * - Tailwind prose classes applied for readable typography.
 */

const REMARK_PLUGINS = [remarkGfm];

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
    </div>
  );
});
