'use client';

import { useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useStreamStore } from '@/stores/stream';
import type { Message } from '@/types/api';

interface MessageActionsProps {
  message: Message;
  conversationId: string;
  messageIndex: number;
  onRegenerate: (conversationId: string, messageId: string, targetIndex: number) => void;
}

export function MessageActions({
  message,
  conversationId,
  messageIndex,
  onRegenerate,
}: MessageActionsProps) {
  const streamStatus = useStreamStore((s) => s.status);
  const canRegenerate = streamStatus === 'idle';
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success('Copiado al portapapeles');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  }

  function handleRegenerate() {
    if (!canRegenerate) return;
    onRegenerate(conversationId, message.id, messageIndex);
  }

  return (
    <div
      className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity focus-within:opacity-100"
      role="toolbar"
      aria-label="Message actions"
    >
      <button
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
        onClick={handleCopy}
        aria-label={copied ? 'Copiado' : 'Copiar mensaje al portapapeles'}
        type="button"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Copiado</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Copiar</span>
          </>
        )}
      </button>
      <button
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        onClick={handleRegenerate}
        disabled={!canRegenerate}
        aria-label={
          canRegenerate
            ? 'Regenerar esta respuesta'
            : 'No se puede regenerar mientras se genera otra respuesta'
        }
        type="button"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Regenerar</span>
      </button>
    </div>
  );
}
