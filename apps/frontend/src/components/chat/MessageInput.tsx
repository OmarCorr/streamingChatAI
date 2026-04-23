'use client';

import {
  useState,
  useRef,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { useStreamStore } from '@/stores/stream';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

/**
 * M3.M2 — Message composer.
 *
 * Behaviour:
 * - Enter submits, Shift+Enter inserts newline.
 * - Empty or whitespace-only content is rejected (button disabled + no-op on Enter).
 * - maxLength=4000 enforced on the textarea.
 * - Character counter appears when content.length > 3800.
 * - "Stop" replaces "Send" when streamStatus === 'streaming'.
 * - Textarea is disabled while a stream is active.
 * - After send: content is cleared, textarea is re-focused (spec §8 focus management).
 */

interface MessageInputProps {
  conversationId: string;
  onSend: (conversationId: string, content: string) => Promise<void>;
  onCancel: () => void;
}

const MAX_LENGTH = 4000;
const COUNTER_THRESHOLD = 3800;

export function MessageInput({ conversationId, onSend, onCancel }: MessageInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamStatus = useStreamStore((s) => s.status);

  const isStreaming = streamStatus === 'streaming' || streamStatus === 'cancelling';
  const canSend = content.trim().length > 0 && !isStreaming;
  const showCounter = content.length > COUNTER_THRESHOLD;
  const isNearLimit = content.length >= MAX_LENGTH;

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const trimmed = content.trim();
    setContent('');
    // Re-focus after clearing to let the user type the next message immediately.
    requestAnimationFrame(() => textareaRef.current?.focus());
    await onSend(conversationId, trimmed);
  }, [canSend, content, conversationId, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  }, []);

  return (
    <div className="border-t bg-background p-4">
      <div className="relative flex flex-col gap-2 rounded-xl border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          maxLength={MAX_LENGTH}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="min-h-[2.5rem] max-h-48 resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent text-sm p-3 pr-20"
          aria-label="Message input"
          aria-multiline="true"
        />

        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {showCounter && (
            <span
              className={`text-xs ${isNearLimit ? 'text-destructive' : 'text-muted-foreground'}`}
              aria-live="polite"
              aria-label={`${content.length} of ${MAX_LENGTH} characters`}
            >
              {content.length}/{MAX_LENGTH}
            </span>
          )}

          {isStreaming ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              aria-label="Stop generating"
              className="h-8 px-3"
            >
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => void handleSend()}
              disabled={!canSend}
              aria-label="Send message"
              className="h-8 px-3"
            >
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
