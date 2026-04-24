import type {
  ApiError as ApiErrorShape,
  Conversation,
  ConversationWithMessages,
  Stats,
} from '@/types/api';

/**
 * Typed error class for non-2xx responses and network failures.
 * Matches the backend error shape defined in types/api.ts.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isApiErrorShape(value: unknown): value is ApiErrorShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    'statusCode' in value &&
    typeof (value as Record<string, unknown>).statusCode === 'number'
  );
}

/**
 * Base typed fetch wrapper. Always sets credentials: 'include'.
 * Throws ApiError on non-2xx or network failure.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (cause) {
    throw new ApiError(0, cause instanceof Error ? cause.message : 'Network error');
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (isApiErrorShape(body)) {
      throw new ApiError(body.statusCode, body.message, body.retryAfter);
    }

    throw new ApiError(response.status, `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ── Convenience endpoint wrappers ─────────────────────────────────────────────

/** POST /api/sessions — idempotent bootstrap call */
export function postSession(): Promise<{ id: string; createdAt: string }> {
  return apiFetch('/api/sessions', { method: 'POST' });
}

/** GET /api/conversations */
export function getConversations(): Promise<Conversation[]> {
  return apiFetch('/api/conversations');
}

/** POST /api/conversations */
export function postConversation(): Promise<Conversation> {
  return apiFetch('/api/conversations', { method: 'POST' });
}

/** GET /api/conversations/:id */
export function getConversation(id: string): Promise<ConversationWithMessages> {
  return apiFetch(`/api/conversations/${id}`);
}

/** PATCH /api/conversations/:id */
export function patchConversation(
  id: string,
  body: { title: string },
): Promise<Conversation> {
  return apiFetch(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** DELETE /api/conversations/:id — returns void (204) */
export function deleteConversation(id: string): Promise<void> {
  return apiFetch(`/api/conversations/${id}`, { method: 'DELETE' });
}

/** POST /api/conversations/:id/messages — returns Response (SSE) directly */
export function postMessage(
  convId: string,
  body: { content: string },
): Promise<Response> {
  return fetch(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** POST /api/conversations/:id/messages/:mid/regenerate — returns Response (SSE) directly */
export function postRegenerate(convId: string, messageId: string): Promise<Response> {
  return fetch(`/api/conversations/${convId}/messages/${messageId}/regenerate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

/** GET /api/stats */
export function getStats(): Promise<Stats> {
  return apiFetch('/api/stats');
}
