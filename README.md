<div align="center">

# Streaming Chat

**Production-grade AI chat — SSE streaming, real server-side cancellation, progressive persistence, and full LLM observability.**

[![Deploy](https://github.com/OmarCorr/streamingChatAI/actions/workflows/deploy.yml/badge.svg)](https://github.com/OmarCorr/streamingChatAI/actions/workflows/deploy.yml)
[![CI](https://github.com/OmarCorr/streamingChatAI/actions/workflows/ci.yml/badge.svg)](https://github.com/OmarCorr/streamingChatAI/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Status](https://img.shields.io/badge/status-actively%20maintained-2ea44f)
![License](https://img.shields.io/badge/license-all%20rights%20reserved-lightgrey)

<!--
Hero GIF placeholder.

When ready, drop a 4-6s screen recording at docs/hero.gif showing:
  prompt typed → streaming starts → markdown renders → user clicks Stop mid-stream → "cancelled" badge appears.
Then replace the line below with:
  ![Streaming Chat in action](docs/hero.gif)
-->

<sub>_Hero recording is being captured alongside the Loom walkthrough — meanwhile, the live demo is the fastest way to feel it._</sub>

### [**Open the Live Demo →**](https://streamingchat.omarcorredor.us)

🎬 **Loom walkthrough — coming soon** _(3-minute technical tour, narrated)_

</div>

---

## What this is

This is **Demo 1 of 3** in a portfolio series showcasing AI feature integration in real product surfaces.

It is not an open-source library and not a ChatGPT clone. It is a **sales artifact** — a working demo for technical decision-makers (CTOs, Heads of Engineering, technical founders) evaluating whether I can ship the AI features that **most implementations skip**: real cancellation, progressive persistence, recovery from disconnects, per-call observability.

If you're scanning this in 60 seconds, jump to:

- **[Why this exists](#why-this-exists)** — the problem behind the demo
- **[What makes it different](#what-makes-it-different)** — four engineering decisions worth defending
- **[How streaming actually works](#how-streaming-actually-works)** — the deep-dive that closes technical evaluations
- **[Technical decisions](#technical-decisions)** — short answers to "why X and not Y"

---

## Why this exists

Most AI chat tutorials stop at "stream tokens to the screen." Most real-world AI features don't.

The hard parts of integrating an LLM into a production product are not the prompt and not the model choice. They are the things you only learn by shipping:

- A user clicks **Stop**. Did you actually cancel the LLM request, or did you just hide the div while you keep paying for tokens on the server?
- The browser disconnects mid-stream. Does the partial response survive? Can the user resume the conversation?
- A token costs money. Where do you see how much you spent today, by user, by conversation, by prompt version?
- The server crashes during generation. Is the partial assistant message in the database, or did it vanish into a buffer?
- A markdown code block streams in token by token. Does it re-render the whole block on every keystroke, or only the diff?

This demo answers each of those with code, not slides.

> _"It's a chat that handles the details most AI implementations omit: streaming done right, real cancellation, progressive persistence, observability, and a UX that doesn't flicker."_

---

## What makes it different

These are the four engineering decisions every reviewer evaluating this repo will look at first.

### 1 · Real server-side cancellation (not cosmetic)

Most demos "cancel" by closing the `EventSource` on the client. The LLM request keeps running on the server. The user keeps being billed for tokens they will never see.

Here, when the user clicks **Stop**, a single `AbortSignal` is propagated through three layers:

1. The client calls `abortController.abort()` and the `fetch()` promise rejects with `AbortError` — [`stores/stream.ts:91-95`](apps/frontend/src/stores/stream.ts)
2. NestJS detects the HTTP `close` event and aborts a server-side controller — [`chat.service.ts:93`](apps/backend/src/modules/chat/chat.service.ts)
3. The signal is passed straight to the Google Gemini SDK — [`gemini.provider.ts:48`](apps/backend/src/modules/llm/gemini.provider.ts)
4. The async streaming loop checks `signal.aborted` and breaks out — [`chat.service.ts:122-123`](apps/backend/src/modules/chat/chat.service.ts)
5. The partial message is persisted with status `cancelled` and a final `completedAt` timestamp

End-to-end latency from click to LLM stop: **< 200 ms p95**. Verifiable in Langfuse — no extra tokens are billed after the user clicks Stop.

### 2 · Progressive persistence (write-ahead pattern)

If the server crashes mid-stream, the partial assistant message must survive. Otherwise the user reloads the page and sees nothing — a worse experience than not streaming at all.

The `ThrottledWriter` ([`throttled-writer.ts:34-99`](apps/backend/src/modules/chat/throttled-writer.ts)) batches partial writes to Postgres on whichever happens first:

- Every **100 tokens** accumulated, **or**
- Every **500 ms** since the last write

The trade-off is write amplification vs. recovery granularity. The current values keep DB load light while bounding lost work to roughly half a sentence on a worst-case crash.

DB write failures inside the streaming loop are **logged but never crash the stream** — the terminal flush reconciles the final state. The user's experience is preserved even when Postgres has a hiccup mid-message.

### 3 · Per-message LLM observability

Every assistant message lands in Langfuse with:

- Input and output token counts
- End-to-end latency in milliseconds
- Cost in USD, computed inline (`$0.30 / 1M input + $2.50 / 1M output` for Gemini 2.5 Flash)
- Full trace with the rendered prompt, the message history, and the model response

Self-hosted **Langfuse v3** runs in the same Docker Compose stack as the app — zero additional infrastructure cost, no vendor lock-in, no telemetry leaking to a third party. Implemented in [`langfuse.service.ts`](apps/backend/src/modules/observability/langfuse.service.ts).

The Langfuse calls are wrapped in `try/catch` and the service is fully optional: **observability failures never affect user-facing requests**. If Langfuse is down, the chat still works.

### 4 · Explicit state machine for streaming UX

The frontend stream state is a discriminated union, not a `boolean isLoading`:

```ts
type StreamStatus = 'idle' | 'streaming' | 'cancelling' | 'cancelled' | 'error';
```

Defined in [`stores/stream.ts:27`](apps/frontend/src/stores/stream.ts).

Each state maps to a distinct, deliberate UI:

| State | UI |
|---|---|
| `idle` | Input enabled, send button visible |
| `streaming` | Three-dot thinking animation until first token, then blinking cursor |
| `cancelling` | Stop button switches to a disabled spinner — prevents double-abort |
| `cancelled` | Partial message rendered with a subtle `cancelled` badge and Regenerate button |
| `error` | Toast with retry-after countdown for rate limits, generic banner otherwise |

No flicker between states. No "is it loading or did it fail" ambiguity. No layout jumps.

---

## Stack & architecture

### Component diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Next.js client)                                       │
│      ▲                                                          │
│      │ HTTPS · SSE                                              │
└──────┼──────────────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────────┐
│  Caddy (shared ingress · Let's Encrypt · TLS · rate limit/IP)   │
└──────┬─────────────────────────────────┬────────────────────────┘
       │                                 │
       ▼                                 ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│  Next.js 15 · App Router│    │  NestJS 10 API          │
│   ─ SSR + RSC + client  │    │   ─ REST controllers    │
│   ─ Tailwind + shadcn   │    │   ─ @Sse() streaming    │
│   ─ Zustand store       │ ⇄  │   ─ Prisma 5 ORM        │
│   ─ Custom SSE parser   │    │   ─ @google/genai SDK   │
│     (async generator)   │    │   ─ AbortController     │
└─────────────────────────┘    └────────┬────────────────┘
                                        │
                ┌───────────────────────┼────────────────────────┐
                ▼                       ▼                        ▼
        ┌─────────────┐         ┌─────────────┐          ┌──────────────┐
        │ PostgreSQL  │         │  Gemini 2.5 │          │ Langfuse v3  │
        │ 16 (Prisma) │         │  Flash API  │          │ self-hosted  │
        └─────────────┘         └─────────────┘          └──────────────┘
```

Single Contabo VPS. Docker Compose orchestrates Postgres + backend + frontend + the full Langfuse v3 stack (Postgres, ClickHouse, Redis, MinIO, worker, web). A shared Caddy reverse-proxy fronts multiple projects on the same host with automatic TLS.

### Tech list, with the why

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| **Web framework** | Next.js 15 (App Router) | SSR + RSC + file-based routing; matches how most clients ship today |
| **API framework** | NestJS 10 | DI, guards, interceptors, `@Sse()` decorator, OpenAPI auto-gen. Yes, it is overkill for a 3-endpoint API — that is the point: this is a sales artifact for **non-trivial** projects |
| **LLM** | Google Gemini 2.5 Flash | Lowest cost on the market with a real free tier; 1M-token context window. Provider abstracted in `LlmService` — swappable for OpenAI/Anthropic in <100 lines |
| **Streaming protocol** | Server-Sent Events (SSE) | Unidirectional matches the use case. Simpler than WebSockets, native browser reconnect, works over HTTP/2 with no extra config |
| **SSE client** | Custom async generator over `fetch` + `ReadableStream` ([`lib/sse.ts`](apps/frontend/src/lib/sse.ts)) | The browser `EventSource` API does not support `POST` request bodies — required to send the user's message. Custom parser, ~90 lines, frame-splits on `\n\n` |
| **Database** | PostgreSQL 16 + Prisma 5 | Boring, correct, type-safe. Indexed by `(sessionId, updatedAt)` and `(conversationId, createdAt)` |
| **Frontend state** | Zustand | Tiny. No provider hell. Externally readable from non-React code (the SSE parser writes into the store from outside the React tree) |
| **Markdown render** | react-markdown + remark-gfm + shiki | Streaming-safe (re-renders only changed nodes); shiki gives high-quality syntax highlighting without runtime cost |
| **Observability** | Langfuse v3 (self-hosted) | LLM-native: token counts, cost, evals, prompt versioning. Sentry doesn't understand tokens. Datadog scales the bill, not the value |
| **Reverse proxy** | Caddy | Automatic Let's Encrypt, sane HTTP/2 + SSE buffering defaults, JSON config, one binary. No nginx config archaeology |
| **CI/CD** | GitHub Actions → GHCR → Docker Compose on VPS | Push to `main`, ~4–5 min pipeline, healthcheck-gated deploy |
| **TypeScript** | 5.x strict, zero `any` | Enforced by ESLint rule. Trades typing speed for refactor safety |

---

## How streaming actually works

This is the section worth reading carefully if you're evaluating engineering quality.

### SSE event format (from the code, not the docs)

The server emits five distinct event types over `text/event-stream`:

```
event: start
data: {"messageId":"<uuid>"}

event: token
data: {"delta":"Hello"}

event: token
data: {"delta":" world"}

event: metadata
data: {"tokensInput":123,"tokensOutput":45,"costUsd":0.000012}

event: done
data: {"status":"complete"}
```

Errors emit a sixth type:

```
event: error
data: {"message":"Rate limit exceeded","retryAfter":30}
```

The client parses with a custom async generator over the `fetch()` `ReadableStream` ([`lib/sse.ts:13-104`](apps/frontend/src/lib/sse.ts)) — splits frames on `\n\n`, extracts `event:` and `data:` lines per frame. The native `EventSource` API is not used because it does not support sending a `POST` body, which is required to ship the user's prompt and conversation context.

### End-to-end cancellation flow

```
User clicks Stop
       │
       ▼
client AbortController.abort()         ◀── stores/stream.ts:91-95
       │
       ▼
fetch() promise rejects with AbortError
       │
       ▼
HTTP connection closes
       │
       ▼
Express req.on('close') fires          ◀── chat.service.ts:93
       │
       ▼
server AbortController.abort()
       │
       ▼
@google/genai sees signal.aborted      ◀── gemini.provider.ts:48
       │
       ▼
streaming for-await loop breaks        ◀── chat.service.ts:122-123
       │
       ▼
ThrottledWriter.flush({                ◀── throttled-writer.ts:72-99
  final: true,
  status: 'cancelled',
  completedAt: new Date()
})
       │
       ▼
Langfuse trace ended with status       ◀── langfuse.service.ts
```

The critical detail: the **same `AbortSignal` is passed through three layers** — HTTP connection, NestJS service, Gemini SDK. That is what stops the actual billing, not just the rendering.

### Progressive persistence (write-ahead)

Inside the streaming loop ([`throttled-writer.ts:34-45`](apps/backend/src/modules/chat/throttled-writer.ts)):

```ts
accumulate(delta: string) {
  this.buffer += delta;
  this.tokensSinceWrite += 1;

  if (this.tokensSinceWrite >= 100) {
    void this.writeNow();
  } else if (!this.timer) {
    this.timer = setTimeout(() => void this.writeNow(), 500);
  }
}
```

`writeNow()` issues a single Prisma `update` carrying the accumulated content and clears the timer. Errors are logged, not thrown. The terminal `flush({ final: true })` waits for any in-flight write before issuing the final state transition — no race, no double-write, idempotent on retry.

This is the pattern that lets the demo claim:

- Server crash mid-stream → user reloads → partial message is there with the right status
- DB hiccup mid-stream → stream completes → final reconciliation write succeeds
- Cancellation → terminal write carries `cancelled` and the exact `completedAt`

### What is tested

| Component | What's covered |
|---|---|
| `ThrottledWriter` ([218-line spec](apps/backend/src/modules/chat/throttled-writer.spec.ts)) | Progressive writes, terminal flush, idempotency, timer cancellation, race conditions |
| `chat.service` | Async-generator mocks, observable event collection, abort path |
| Rate limiter | Throttler module config end-to-end |

Frontend streaming and abort tests are on the roadmap — see [Roadmap](#roadmap).

---

## Run it locally

> Local setup is here, near the end, on purpose. **Most readers will hit the [live demo](https://streamingchat.omarcorredor.us) instead** — that is the fastest way to evaluate the experience.

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Docker ≥ 24 with the Compose plugin
- A Google Gemini API key — [free tier here](https://ai.google.dev/)

### Setup

```bash
git clone https://github.com/OmarCorr/streamingChatAI.git
cd streamingChatAI

cp .env.example .env
# Edit .env: set GEMINI_API_KEY, POSTGRES_PASSWORD,
# and generate Langfuse secrets:
openssl rand -hex 32   # → LANGFUSE_SALT
openssl rand -hex 32   # → LANGFUSE_ENCRYPTION_KEY

pnpm install
docker compose up postgres -d
pnpm prisma:migrate

# Two terminals:
pnpm dev:backend    # http://localhost:3001
pnpm dev:frontend   # http://localhost:3000
```

Open http://localhost:3000 and send a message. The first token should arrive in under 1.5 s.

### Run the full Langfuse stack (optional)

```bash
docker compose --profile observability up -d
# Langfuse UI: http://localhost:3100
```

Create a project in the Langfuse UI, copy the public + secret keys into `.env`, and restart the backend. Every assistant message will then appear as a trace in Langfuse with tokens, latency, and cost.

### Available scripts

| Command | What it does |
|---|---|
| `pnpm dev:backend` | NestJS dev server with watch mode (port 3001) |
| `pnpm dev:frontend` | Next.js dev server (port 3000) |
| `pnpm build` | Build all workspaces |
| `pnpm typecheck` | TypeScript strict check across the monorepo |
| `pnpm lint` | ESLint, with the zero-`any` rule active |
| `pnpm test` | Run all tests |
| `pnpm prisma:migrate` | Apply pending Prisma migrations |
| `pnpm prisma:generate` | Regenerate the Prisma client |

The full deploy and operator runbook — VPS bootstrap, GitHub Secrets, Langfuse setup, rollback, backup, troubleshooting — lives at [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Technical decisions

Short, opinionated answers to "why X and not Y." Useful as interview prep and as defense in technical evaluation calls.

### Why Gemini 2.5 Flash and not GPT-4o-mini or Claude Haiku?

Lowest input cost on the market with a real free tier and a 1M-token context window. For a public demo with moderate volume, this brings infrastructure cost effectively to zero. The provider lives behind `LlmService` — swapping to OpenAI or Anthropic is a single-file change, by design.

### Why NestJS and not Express or Fastify?

Three endpoints don't need DI. But this repo is a **sales artifact**, not a tutorial. The audience is enterprise teams that ship in NestJS shapes. Modules, guards, interceptors, OpenAPI auto-generation, and decorators for SSE: all the things they expect to see in a production codebase. The "overkill" is the message.

### Why progressive persistence instead of a single final write?

A server crash mid-generation must not lose the user's partial response. Thinking in **failure modes from day one** is what separates senior engineers from juniors. The pattern costs roughly ten lines of buffering and is invisible in the happy path. The cost of getting it wrong is a worse-than-no-streaming experience on every restart.

### Why Langfuse self-hosted and not Sentry/Datadog?

Sentry tracks exceptions; it has no concept of tokens or cost. Datadog tracks everything; the bill scales with everything. **Langfuse is LLM-native**: per-call traces, token counts, cost rollups, eval support, prompt versioning, dataset replays. Self-hosted on the same VPS = $0 marginal cost and zero vendor lock-in.

### Why SSE and not WebSockets?

LLM streaming is unidirectional (server → client). SSE is simpler, has native browser reconnect, works over HTTP/2 without extra configuration, and is the de-facto industry standard for this exact use case. WebSockets pay a complexity tax for bidirectionality that the chat does not need.

### Why a custom SSE parser and not the `EventSource` API?

`EventSource` is `GET`-only. Sending the user's message and the conversation context requires a `POST` body. The custom parser is ~90 lines, frame-splits on `\n\n`, surfaces `event:` and `data:` lines as a typed async generator, and lets the consuming hook stay readable.

### Why Caddy and not nginx?

Automatic Let's Encrypt, sane defaults for HTTP/2 + SSE buffering (`flush_interval -1`), JSON config, and a single binary. nginx is fine; Caddy is faster to be confidently right, especially on a multi-project shared ingress.

### Why Zustand and not Redux or Context?

The streaming SSE parser is plain async-generator code, not a React component — it needs to write into the store from outside the React tree. Zustand makes that one line. Redux's middleware story or Context's provider tree both pay more complexity for the same behavior.

---

## Roadmap

This demo is **part 1 of a 3-part series** showcasing AI feature integration patterns:

- [x] **Demo 1 · Streaming Chat** — *this repo.* Streaming, real cancellation, progressive persistence, observability.
- [ ] **Demo 2** — _coming soon._ Topic and scope to be announced.
- [ ] **Demo 3** — _coming soon._ Topic and scope to be announced.

Open improvements still tracked for this demo:

- Frontend test coverage for streaming and cancellation paths
- Resume-from-last-token on reconnect (today's behavior is "regenerate" only)
- Per-IP usage dashboard sourced directly from Langfuse data
- Public `/api/stats` endpoint with anonymized totals (messages processed, total cost)

---

## About the author

I'm a senior fullstack engineer focused on **shipping production-grade AI features** in TypeScript codebases. This demo is an artifact of how I think about LLM integration: real cancellation, recovery from failure, observability before scale, and a UX that doesn't flicker.

If you're hiring or scoping AI work — see the rest of my work and how to reach me at **[omarcorredor.us](https://omarcorredor.us)**.

---

<sub>© Omar Corredor. All rights reserved. This repository is published as a portfolio demonstration; reuse is not licensed by default. If you'd like to use any of it, reach out via [omarcorredor.us](https://omarcorredor.us).</sub>
