# Architecture — stremingChatAI

This document describes the non-obvious design decisions, invariants, and cross-cutting patterns that make the streaming chat work. It is not a line-by-line code tour — for that, read the source. Read this first so the code makes sense.

## Table of contents

1. [High-level topology](#1-high-level-topology)
2. [Session model](#2-session-model)
3. [End-to-end SSE streaming flow](#3-end-to-end-sse-streaming-flow)
4. [Progressive persistence — ThrottledWriter](#4-progressive-persistence--throttledwriter)
5. [Cancellation — AbortController wiring](#5-cancellation--abortcontroller-wiring)
6. [Regeneration](#6-regeneration)
7. [Rate limiting — named throttlers gotcha](#7-rate-limiting--named-throttlers-gotcha)
8. [Observability — Langfuse](#8-observability--langfuse)
9. [Frontend re-render isolation (R3)](#9-frontend-re-render-isolation-r3)
10. [Optimistic updates and cache reconciliation](#10-optimistic-updates-and-cache-reconciliation)
11. [Auto-scroll](#11-auto-scroll)
12. [Error handling surfaces](#12-error-handling-surfaces)

---

## 1. High-level topology

```
┌─────────────┐    HTTPS/443     ┌──────────┐
│   Browser   │ ────────────────▶│  Caddy   │  TLS termination + SSE-safe proxy
└─────────────┘                  └────┬─────┘
                                      │
                     ┌────────────────┼────────────────┐
                     ▼                ▼                ▼
               backend:3001     frontend:3000    langfuse-web:3000
                     │                                 │
                     ▼                                 ▼
                postgres:5432               clickhouse + redis + minio
                  (app DB)                    (Langfuse v3 stack)
```

Caddy is the single ingress. `/api/*` goes to the NestJS backend, `/langfuse/*` to Langfuse, everything else to Next.js. SSE requires two non-default Caddy settings: `flush_interval -1` (no response buffering, tokens reach the browser immediately) and `transport http { response_header_timeout 0; read_timeout 0 }` (no timeouts on long-lived generation streams). See `Caddyfile` for the exact block.

Port layout deserves attention: backend listens on `3001`, frontend on `3000`. Both services **share the same `.env.prod`** to avoid duplicating secrets, and `PORT` is defined there. The compose file overrides `PORT` per service (`3001` for backend, `3000` for frontend) so they don't collide. See `docker-compose.yml:168-170` and `:191-192`.

---

## 2. Session model

No accounts. No login. Every request carries a signed cookie that resolves to a `Session` row.

### The SessionGuard contract

`apps/backend/src/common/guards/session.guard.ts` runs on almost every route. It:

1. Reads the signed `sid` cookie. If valid and unexpired, resolves `req.sessionId` and touches `lastSeenAt` (fire-and-forget — never blocks the response).
2. If absent or invalid, creates a new `Session` with `ipHash = SHA256(ip + COOKIE_SECRET)` (the IP itself is never stored) and sets a 30-day `httpOnly`, `sameSite=lax` cookie. `secure` is set only when `HOST_HAS_TLS=true` (behind Caddy in prod).
3. Attaches `req.sessionId` for downstream guards/controllers.

Why `COOKIE_SECRET` must be ≥32 chars: Express `cookie-parser` uses it for HMAC signing. A weak secret means cookie forgery.

### The ConversationOwnerGuard contract

`apps/backend/src/common/guards/conversation-owner.guard.ts` validates that the conversation in `:id` belongs to `req.sessionId`. **On mismatch it returns 404, not 403**. This is intentional: 403 would leak the existence of conversations belonging to other sessions, enabling enumeration. 404 makes both "no such conversation" and "foreign conversation" indistinguishable to the client.

---

## 3. End-to-end SSE streaming flow

This is the core flow. `POST /api/conversations/:id/messages` with `{ content }` returns an `Observable<MessageEvent>` that NestJS streams as Server-Sent Events. Each event has an `event:` type and a JSON `data:` payload.

### Event types

| Event      | Payload                                                  | When                                             |
|------------|----------------------------------------------------------|--------------------------------------------------|
| `start`    | `{ messageId }`                                          | Once, right after the assistant row is created   |
| `token`    | `{ delta }`                                              | Many — one per Gemini chunk                      |
| `metadata` | `{ tokensInput, tokensOutput, costUsd }`                 | Typically once at the end                        |
| `done`     | `{ status: 'complete' }`                                 | Only on clean completion                         |
| `error`    | `{ message, retryAfter? }`                               | Only on error (terminal)                         |

Note: **no `done` on cancellation**. The subscriber simply completes without a terminal `done` event, and the client reconciles by refetching the conversation (which now has the partial message with `status: 'cancelled'`).

### Backend sequence (`ChatService.streamMessage`)

1. Validate ownership via `ConversationService.findOwned` — throws 404 if foreign.
2. Persist the user message (`status: complete`, final on creation).
3. Fire-and-forget auto-title if this is the conversation's first message (`title === 'New conversation'`). Failures log a warning and do not fail the stream.
4. Create the assistant row with `status: streaming, content: ''` — this row's id is what gets emitted in the `start` event and is what the client uses to reconcile later.
5. Build history via `ConversationService.buildHistory` — loads the last ~100 messages (oldest truncated). No pagination at the DB level.
6. Wire an `AbortController` to `req.on('close')` — if the client disconnects, the signal aborts. See §5.
7. Start a Langfuse trace (defensive try/catch — never blocks).
8. Create a per-stream `ThrottledWriter` bound to the assistant row id. See §4.
9. Return a NestJS `Observable<MessageEvent>` whose `(async () => { ... })()` body:
   - emits `start`
   - iterates `this.llm.generateContentStream({ signal })`, emitting `token` + accumulating into the writer, and `metadata` when usage arrives
   - on exit (clean or abort), calls `writer.flush({ final: true, status, completedAt })` **once** — this is the only terminal write
   - ends the Langfuse trace
   - emits `done` only if not aborted
10. Teardown on subscriber unsubscribe aborts the controller.

### Frontend sequence (`useStream.sendMessage`)

1. Set a zustand `stream` store to `streaming`, optimistically append a user message with a temporary `optimistic-*` id.
2. Call `sseStream(url, body, signal)` — a fetch-based async iterator (see `apps/frontend/src/lib/sse.ts`) that splits on `\n\n` frame boundaries only (never single `\n`, to avoid frame-fragmentation bugs).
3. For each event:
   - `start` → store `activeStreamId = messageId` (the real server id)
   - `token` → `appendToken(delta)` — updates the store `buffer`
   - `metadata` → `setMetadata(...)` — for the cost display
   - `done` → `finalize('complete')` + invalidate `['conversation', id]` + `['conversations']` → TanStack Query refetch replaces the optimistic row with the real persisted row
   - `error` → `setError`, `finalize('error')`, invalidate
4. On AbortError (user cancel): `finalize('cancelled')` + invalidate — backend already persisted the partial message with `status: cancelled`.
5. On 429 / generic error: remove the optimistic user message, toast.

The stream is **not** an EventSource. EventSource is GET-only and can't send cookies with credentials reliably — we use `fetch` + `ReadableStream` so POST and credentials just work.

---

## 4. Progressive persistence — ThrottledWriter

Why we need it: Gemini streams tokens faster than we can sanely hit Postgres. Writing on every `delta` would DoS the DB. Buffering in memory and writing only at the end would lose everything on crash.

`apps/backend/src/modules/chat/throttled-writer.ts` solves this with per-stream buffered writes.

### Invariants

1. **Exactly one writer per stream.** Never injected as a service. `new ThrottledWriter(prisma, messageId)` inside `streamMessage`. Lifetime = one request.
2. **`flush({ final: true })` is the ONLY terminal write path.** No other code path may set `status` to `complete`, `cancelled`, or `error`. This is what guarantees the row ends in a terminal state exactly once.
3. **`finalized` flag prevents double-finalization.** After the final flush, further `accumulate()` or `flush()` calls are no-ops. This matters because the SSE generator and the teardown path can race on abort.
4. **Progressive writes tolerate failure.** If the intermediate UPDATE fails (DB blip, connection lost), the generator continues collecting tokens. The terminal flush reconciles the final content.

### Token counting caveat

`writer.accumulate(delta)` increments an approximate token counter (split on whitespace). This is **not** a real tokenizer — it exists for UI display only. Real token usage comes from Gemini's `chunk.usage` and is persisted on the terminal flush via `costCalculator.calc(tokensInput, tokensOutput)`.

---

## 5. Cancellation — AbortController wiring

When the user clicks "Stop":

1. Frontend: `streamStore.cancel()` calls `abortController.abort()` on the controller created in `start()`.
2. `fetch` aborts → SSE reader emits an `AbortError`.
3. Hook catches, sets `finalize('cancelled')`, and invalidates the query.
4. Backend: the same abort propagates via `req.on('close')` → the `AbortController` in `ChatService` fires → passed to `LlmService.generateContentStream({ signal })` → Gemini SDK stops sending. The for-loop breaks, `writer.flush({ final: true, status: cancelled })` runs.

### The billing caveat (keep in README for honesty)

Aborting the signal closes the HTTP connection between us and Google, which stops the client from receiving further chunks. **Google may still bill for in-flight generation tokens** that were already computed server-side when the abort arrived. This is a Gemini-side behavior, not a bug. User-facing copy should avoid promising "cancellation saves cost."

---

## 6. Regeneration

Endpoint: `POST /api/conversations/:id/messages/:mid/regenerate`.

Why messageId is in the URL (not the body): REST conventions + the backend uses the id to locate the target. Earlier iterations used `{ targetIndex }` in the body and caused a stale-index race. If the frontend needs to regenerate message N and N+1 was added concurrently, an index-based request would regenerate the wrong message.

### Backend (`ChatService.regenerateMessage`)

1. Ownership check.
2. Load all conversation messages, find the target by id.
3. Reject if the target is a `user` message (nothing to regenerate).
4. **Delete the target and every subsequent message.** This is destructive. The server is the source of truth; the frontend must not assume anything still exists after this point.
5. Re-stream from the last preceding user message via `streamMessageFromExistingConversation` (same pipeline as `streamMessage` but skips the auto-title step — a stub `fakeConv` with a non-default title bypasses the auto-title branch).

### Frontend (`useRegenerate`)

1. **Guard**: if `streamStore.status !== 'idle'`, no-op — we don't overlap streams. This matches spec scenario 4.3.
2. Snapshot the TanStack cache for the conversation.
3. Optimistically slice the cache at `targetIndex` — removes the target and all subsequent messages to mirror what the server is about to do.
4. Call `sseStream` with the same event pipeline as `useStream`.
5. On 404 (target gone — rare race): revert the snapshot, toast "Please refresh."
6. On generic error: revert the snapshot, toast the error.

`targetIndex` is redundant with `messageId` on the wire but still used locally for the array slice.

---

## 7. Rate limiting — named throttlers gotcha

`app.module.ts:21-24` defines two named throttlers:

```typescript
ThrottlerModule.forRoot([
  { name: 'short', ttl: 60_000,     limit: 10 },   // 10/min burst
  { name: 'long',  ttl: 86_400_000, limit: 100 },  // 100/day sustained
]);
```

Applied globally via `APP_GUARD`. Every endpoint is throttled by default.

### The `@SkipThrottle()` footgun

With **named** throttlers, `@nestjs/throttler` v5+ evaluates `skip[throttler.name]` per throttler. `@SkipThrottle()` with no arguments records `{ default: true }`, which never matches `short` or `long`, so the decorator is silently a no-op.

**Correct usage** for this codebase:

```typescript
@SkipThrottle({ short: true, long: true })
```

All four skip-throttle sites in the app (`health`, `conversation`, `session`, `stats`) pass both names explicitly. If you add a new throttler name, also update every `@SkipThrottle` call site.

This bit us once: the Docker healthcheck on `/api/health` polled every 10s, saturated the `short` window, got 429s, failed `r.ok`, and left the container permanently unhealthy. Diagnosis trail is in `docs/DEPLOY.md § Common Failures`.

---

## 8. Observability — Langfuse

`apps/backend/src/modules/observability/langfuse.service.ts` wraps the SDK with a single rule: **Langfuse calls must never crash the request**. Every call is wrapped in try/catch; on failure, the error is logged and the method returns `null`. Startup failures leave the service in "no-op" mode — chat still works, just without traces.

Flush on shutdown is asynchronous: `onModuleDestroy()` awaits `this.langfuse?.flushAsync()`. Nest shutdown hooks must be enabled (`app.enableShutdownHooks()` in `main.ts`) for this to fire.

Two traces per conversation turn:
- `chat-stream` — a new user message.
- `chat-regenerate` — a regeneration.

Input is the full history passed to Gemini. Output is the final assistant content (for complete) or `errorReason` (for error). Status comes from `writer.status`.

Cost is computed in `CostCalculator` using Gemini Flash pricing (currently $0.30/1M input, $2.50/1M output). If the model changes, update both the calculator and the Langfuse trace's model tag.

---

## 9. Frontend re-render isolation (R3)

The chat could easily turn into a re-render disaster: an SSE stream pushes ~50 tokens/sec, and naive zustand subscriptions would re-render the entire `MessageList` on every token.

The invariant we enforce: **exactly one React component re-renders on `appendToken()`**, and that's `ActiveAssistantBubble` inside `MessageBubble.tsx`.

### How it's enforced

- `MessageBubble` subscribes to `s.activeStreamId === message.id` — a simple scalar comparison. Changes only on start/finalize, not per token.
- If it matches, renders `ActiveAssistantBubble`, which is the ONE component subscribed to `s.buffer` (via `useShallow((s) => [s.activeStreamId, s.buffer, s.status])`).
- If it doesn't match, renders `StaticAssistantBubble` — a `memo`'d component that reads only from the `message` prop (server cache). Zero subscription to the store.
- `MessageList` subscribes only to `[activeStreamId, activeConversationId, status]` (via `useShallow`), not to `buffer`. It re-renders ~2x per stream (start + finalize), never per token.
- The user message bubble (`UserBubble`) is also `memo`'d and never subscribes.

### The `activeStreamId` lifecycle

- Set to the server messageId on `start`.
- **Cleared to `null` on `complete`** — this is what makes the finished message fall back to `StaticAssistantBubble` and show the Copy/Regenerate action row.
- **Kept on `cancelled`/`error`** — the `ActiveAssistantBubble` stays so the user sees the `(stopped)` indicator until they navigate away or the cache refetch replaces the row.

One subtle bug we hit: forgetting to clear `activeStreamId` on complete meant the last message of every conversation kept the streaming styling and didn't show actions. See commit `ba8bbe7`.

---

## 10. Optimistic updates and cache reconciliation

User messages are appended optimistically with a temporary `optimistic-${Date.now()}` id so the UI feels instant. On the `done` event, `queryClient.invalidateQueries(['conversation', id])` triggers a refetch, and the refetched row replaces the optimistic one.

### Why this reconciliation is necessary

The optimistic id must be **replaced**, not just updated in place, because the real server id is what the ConversationOwnerGuard uses for future operations (regenerate, etc.). Leaving `optimistic-*` ids in the cache would make those operations 404.

### What happens on error

- **4xx/5xx on the POST itself**: the SSE stream never started. Remove the optimistic user message from the cache, toast the user.
- **AbortError (cancel)**: leave the optimistic message as-is temporarily, invalidate the query. The refetch pulls the real persisted user message + the partially-generated assistant message with `status: cancelled`.
- **429**: same as 4xx but with a specific toast ("Too many requests").

---

## 11. Auto-scroll

`useAutoScroll(scrollRef, triggerKey)` keeps the viewport pinned to the bottom during streaming while respecting manual scroll-up.

Two non-obvious details:

1. **The scrollable ancestor isn't always the ref target.** `ScrollArea` (shadcn/Radix) renders a viewport div two levels up from the content. The hook walks up the DOM to find the first ancestor with `overflow: auto/scroll` — that's the element whose `scrollTop` actually moves.
2. **Pause/resume is ref-based, not state-based.** `userScrolledUp` lives in a `useRef` so changing it doesn't re-render the list. If the user scrolls up more than 80px from the bottom, auto-scroll pauses. When they scroll back within the 80px threshold, it resumes. The 80px tolerance absorbs subpixel rendering variance across browsers.

The `triggerKey` parameter is the reason auto-scroll fires on both new messages and token arrivals. `MessageList` passes `${messages.length}-${buffer.length}` — any change to either triggers a scroll-to-bottom check.

---

## 12. Error handling surfaces

A request can fail at several layers. Each has a defined UX:

| Layer                         | Failure mode                         | UX                                                        |
|-------------------------------|--------------------------------------|-----------------------------------------------------------|
| Fetch (network)               | Connection refused / TLS             | `toast.error('Network error')`, cache untouched           |
| 4xx/5xx on POST               | Validation, ownership, server crash  | Remove optimistic message, `toast.error(body.message)`    |
| 429 on POST                   | Rate limit                           | Specific toast with `retryAfter` if provided              |
| SSE stream error event        | Gemini error mid-stream              | `finalize('error')`, invalidate; DB row marked `error`    |
| AbortError (user cancel)      | User clicked Stop                    | `finalize('cancelled')`, invalidate; DB row `cancelled`   |
| Exception inside React tree   | Component render crash               | `ChatErrorBoundary` — renders fallback UI, preserves sidebar |

`ChatErrorBoundary` wraps only the chat pane, not the route. If a message render explodes, the sidebar stays usable and the user can pick another conversation. Route-level `error.tsx` would nuke the whole layout.

Server-side, `AllExceptionsFilter` is the single exit point for errors. It maps:
- `ThrottlerException` → 429 with `retryAfter`
- any `HttpException` → passthrough status + message
- everything else → logged with stack, generic `Internal server error` to the client

Client never sees internal error messages. If you're debugging "Internal server error" in production, check the backend logs — the real cause is there.

---

## Reading order for new contributors

If you're new to the codebase, read these in this order:

1. `docker-compose.yml` + `Caddyfile` — 5 minutes, understand the topology.
2. This file (§1–§8) — 15 minutes, understand the backend invariants.
3. `apps/backend/src/modules/chat/chat.service.ts` + `throttled-writer.ts` — the hot path.
4. This file (§9–§12) — 10 minutes, understand the frontend isolation.
5. `apps/frontend/src/hooks/useStream.ts` + `apps/frontend/src/stores/stream.ts` + `apps/frontend/src/components/chat/MessageBubble.tsx` — the R3 triangle.

Everything else is either plumbing (DTOs, modules, providers) or surface (components, layouts) that follows predictably from the above.
