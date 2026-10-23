# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Assistly

An AI chatbot platform where admins (authenticated via Clerk) build and configure custom chatbots, and guests chat with those chatbots through an embeddable UI. The AI back-end uses Groq inference; data is stored in Neon Postgres and accessed with parameterized SQL.

## Build & Run

```bash
pnpm install          # install deps (pnpm-lock.yaml present; repo also has package-lock.json)
pnpm dev              # next dev --turbopack
pnpm build            # next build
pnpm start            # next start
pnpm lint             # next lint
```

There is no test suite — `package.json` has no `test` script and no test runner is installed.

## Required Environment Variables

- `DATABASE_URL` — Neon Postgres connection string. For local development, put it in `.env.local` or `.env.development.local`.
- `GROQ_API_KEY` or `GROQ_API_KEY_1` ... `GROQ_API_KEY_20` — used by `lib/groqPool.ts` for chatbot responses
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` — auth (consumed automatically by `@clerk/nextjs`)

## High-Level Architecture

### Two route groups
`app/(admin)` is the dashboard (requires a signed-in Clerk user — see `proxy.ts` and the layout-level `auth()` check in `app/(admin)/layout.tsx`). `app/(guest)` is unauthenticated and hosts the public `/login` and `/chatbot/[id]` pages. The `/chatbot/[id]` page is what gets embedded as an iframe on customer sites — `next.config.ts` sets `frame-ancestors *` and `X-Frame-Options: ALLOWALL` only for that path so the chatbot can be cross-origin embedded.

### Auth
- `proxy.ts` (Next.js 16 replaces `middleware.ts` — note the file is at the project root, not under `app/`) uses `clerkMiddleware`. Public routes: `/chatbot/*`, `/api/send-message`, `/api/graphql`, `/login`. The admin layout additionally redirects unauthenticated users to `/login`.
- The admin layout gets `userId` via `auth()` server-side; client pages read the user with `useUser()`.

### Database access (Neon Postgres)
- `lib/db.ts` creates the server-side Neon SQL client from `DATABASE_URL`.
- Server components and API routes use parameterized SQL directly. Browser-side writes use authenticated API routes such as `/api/chatbots` and `/api/characteristics/[id]`; public guest chat endpoints are limited to chatbot lookup, session creation, message retrieval, and sending.
- Admin queries filter chatbots by Clerk owner or a matching invited email in SQL rather than fetching all tenants into the browser.

### Data model
Types live in `types/types.ts`. The core entities: `Chatbot` → has many `ChatbotCharacteristic` and `ChatSession`; `ChatSession` → has one `Guest` and many `Message`; `Message.sender` is `"ai" | "user"`. Admins are linked to chatbots by `clerk_user_id`. There is no DB-level uniqueness or row-level filtering enforced from the API — admin pages do client-side `chatbot.clerk_user_id === userId` filtering (`app/(admin)/view-chatbots/page.tsx`).

### Chat flow
1. Guest opens `/chatbot/[id]`, a Radix dialog asks for name + email.
2. `lib/startNewChat.ts` posts to `/api/start-chat`, which creates the guest, chat session, and welcome message in Neon.
3. Messages are sent to `POST /api/send-message` (`app/api/send-message/route.ts`). That route:
   - Fetches the chatbot's `chatbot_characteristics` and prior messages from the session.
   - Uses the characteristics as the business-specific source of truth, answering when they contain the relevant facts and following their restrictions. Links are shared with visitors but are not fetched or read by the model.
   - Calls Groq through `lib/groqPool.ts` using model `openai/gpt-oss-120b`, with a 512-token response limit and temperature 0.7.
   - Persists the user message and AI response in Neon.
4. The client (`app/(guest)/chatbot/[id]/page.tsx`) renders messages optimistically with a "Thinking..." placeholder that gets swapped for the real response. Markdown is rendered with `react-markdown` + `remark-gfm` (`components/ui/Messages.tsx`).

### UI components
- `components/ui/*` holds shadcn-style primitives (Radix UI + Tailwind) plus app-specific components like `Header`, `Sidebar`, `Avatar` (Dicebear-based), `Messages`, and `ChatbotSessions`.
- `app/globals.css` declares the full shadcn `oklch` theme token set plus `daisyui` and `tailwindcss-animate` plugins. The actual styling uses Tailwind utility classes — `daisyui` is registered as a plugin but `chat-bubble` classes in `Messages.tsx` rely on it.

### Deploy
`vercel.json` adds CORS headers under `/api/(.*)` (largely redundant with `next.config.ts`). The `next.config.ts` headers block is the source of truth for the iframe-embeddable chatbot and API CORS.

## Important Pitfalls

- **Chatbot knowledge and website links**: the model only receives saved chatbot characteristics; it cannot read the linked website pages. Keep the characteristics current and avoid assuming links provide website context.
- **`DATABASE_URL` is required** for all database-backed pages and API routes. Keep it in an ignored local environment file and set it in deployment environment settings.
- **The `stepzen/` folder contains legacy configuration**; application runtime access uses Neon directly.
- **`middleware.ts`** uses Clerk middleware. Add intentionally public API routes there, and continue to enforce authentication/ownership in write handlers.
- **Tenant isolation**: scope admin SQL by `clerk_user_id` or the owner ids authorized for the signed-in user's invited email. Do not expose unfiltered tenant records through public endpoints.
- **Wide-open CORS** on `/api/*` and `/chatbot/*` is intentional for iframe embedding. Don't tighten it without a plan to handle cross-origin embeds.
- **No test suite**. Verify changes manually by running `pnpm dev` and exercising the admin and guest flows, or by hitting the API routes with curl.
- **Groq model** is configured in `lib/groqPool.ts`. Switching models or providers requires editing that file.
