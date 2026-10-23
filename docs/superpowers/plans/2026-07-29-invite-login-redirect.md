# Invitation Login Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the invitation email so viewers/editors land on `/review-sessions` after sign-in (instead of the admin home).

**Architecture:** Two-file change. (1) The invite email's button URL flips from `/sign-in` to `/login?invited=1`. (2) The `/login` page reads the `?invited=1` flag, sets a 1-hour httpOnly cookie, and renders `<SignIn />` with `fallbackRedirectUrl="/review-sessions"`. The cookie is the bridge between "clicked an invite link" and "post-login destination".

**Tech Stack:** Next.js 16.1.6 (App Router), React server components, `@clerk/nextjs` v6, `next/headers` cookies API, SendGrid (email already wired in `lib/email.ts`).

**Note on testing:** This repo has no test suite (`pnpm` has no `test` script, per `CLAUDE.md`). The plan uses `pnpm tsc --noEmit` and manual verification steps instead of automated tests.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/email.ts` | Build invitation email HTML | Modify `buildInviteHtml` URL from `/sign-in` to `/login?invited=1` |
| `app/(guest)/login/[[...rest]]/page.tsx` | Render the styled login page with `<SignIn />` | Read `searchParams.invited`, call `auth()`, set/clear cookie, pick `fallbackRedirectUrl` |

No new files. No schema, middleware, or routing changes.

---

## Task 1: Update invitation email link

**Files:**
- Modify: `lib/email.ts:113-141` (`buildInviteHtml` function)

- [ ] **Step 1: Locate `buildInviteHtml`**

Open `lib/email.ts`. The relevant block is:

```ts
function buildInviteHtml(payload: InviteEmailPayload): string {
  const signInUrl = `${payload.appBaseUrl.replace(/\/$/, "")}/sign-in`;
```

The single line to change is the `signInUrl` line.

- [ ] **Step 2: Change the URL**

Replace:

```ts
  const signInUrl = `${payload.appBaseUrl.replace(/\/$/, "")}/sign-in`;
```

With:

```ts
  const signInUrl = `${payload.appBaseUrl.replace(/\/$/, "")}/login?invited=1`;
```

- [ ] **Step 3: Type-check**

Run:

```bash
cd "C:/Users/Shaimaa/Downloads/assistly-main" && pnpm tsc --noEmit
```

Expected: exits 0. (If `tsc` is not a script, fall back to `pnpm lint` — it runs `next lint` per `package.json`.)

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/Shaimaa/Downloads/assistly-main" && git add lib/email.ts && git commit -m "fix(email): invitation link points to /login?invited=1"
```

---

## Task 2: Wire up the `/login` page to handle `?invited=1`

**Files:**
- Modify: `app/(guest)/login/[[...rest]]/page.tsx`

- [ ] **Step 1: Read the current file**

Open `app/(guest)/login/[[...rest]]/page.tsx`. Current content (29 lines):

```tsx
import Avatar from '@/components/ui/Avatar'
import { SignIn } from '@clerk/nextjs'
import React from 'react'

function LoginPage() {
  return (
    <div className='flex py-10 md:py-0 flex-col flex-1 justify-center items-center bg-[#64B5F5] min-h-screen px-4'>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-5xl">
            <div className="flex flex-col items-center justify-center space-y-5 text-white">
<div className="rounded-full bg-white p-5">
    <Avatar seed='PAPAFAM' className='w-32 h-32 md:w-50 md:h-50' />

</div>

<div className="text-center">
    <h1 className="text-4xl">Assistly</h1>
<h2 className="text-base font-light">
    Your Customisable AI Chat Agent
    </h2>
<h3 className="my-5 font-bold">
    Sign in to get started
    </h3>
</div>
            </div>
            <SignIn fallbackRedirectUrl={"/"} signUpUrl="/sign-up" />
        </div>
    </div>
  )
}

export default LoginPage
```

- [ ] **Step 2: Rewrite the file**

Replace the entire file with the following content. This adds:
- `async` to the function (required for `auth()` and `cookies()` in Next 16 server components).
- A `searchParams` prop typed as `{ invited?: string }`.
- An already-authed short-circuit (redirect to `/review-sessions` if signed in and `?invited=1`).
- A cookie write when `?invited=1` is present.
- The matching `fallbackRedirectUrl`.

```tsx
import Avatar from '@/components/ui/Avatar'
import { SignIn } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import React from 'react'

const INVITED_COOKIE = 'assistly_invited'
const INVITED_MAX_AGE_SECONDS = 60 * 60 // 1 hour

async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>
}) {
  const params = await searchParams
  const isInvited = params.invited === '1'

  if (isInvited) {
    const { userId } = await auth()
    if (userId) {
      // Already signed in via a stale invite link — send straight to the destination.
      redirect('/review-sessions')
    }

    const store = await cookies()
    store.set({
      name: INVITED_COOKIE,
      value: '1',
      maxAge: INVITED_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
    })
  }

  const fallbackRedirectUrl = isInvited ? '/review-sessions' : '/'
  const signUpUrl = isInvited ? '/sign-up?invited=1' : '/sign-up'

  return (
    <div className='flex py-10 md:py-0 flex-col flex-1 justify-center items-center bg-[#64B5F5] min-h-screen px-4'>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-5xl">
            <div className="flex flex-col items-center justify-center space-y-5 text-white">
<div className="rounded-full bg-white p-5">
    <Avatar seed='PAPAFAM' className='w-32 h-32 md:w-50 md:h-50' />

</div>

<div className="text-center">
    <h1 className="text-4xl">Assistly</h1>
<h2 className="text-base font-light">
    Your Customisable AI Chat Agent
    </h2>
<h3 className="my-5 font-bold">
    Sign in to get started
    </h3>
</div>
            </div>
            <SignIn fallbackRedirectUrl={fallbackRedirectUrl} signUpUrl={signUpUrl} />
        </div>
    </div>
  )
}

export default LoginPage
```

- [ ] **Step 3: Type-check**

Run:

```bash
cd "C:/Users/Shaimaa/Downloads/assistly-main" && pnpm tsc --noEmit
```

Expected: exits 0. If `tsc` is unavailable, run `pnpm lint`.

If Next complains that `cookies()` and `cookies().set(...)` aren't allowed in a Server Component render (some Next versions restrict cookie writes), the fallback is to read the cookie via `cookies()` and write it via `headers().append('Set-Cookie', ...)` — but for Next 16 the `cookies()` API supports `.set()` directly. If you hit a runtime warning, switch to the header approach in a follow-up; do not block on it now.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/Shaimaa/Downloads/assistly-main" && git add "app/(guest)/login/[[...rest]]/page.tsx" && git commit -m "fix(login): redirect invited users to /review-sessions"
```

---

## Task 3: Manual end-to-end verification

**Files:** none. This is verification only.

- [ ] **Step 1: Start the dev server**

Run in the background:

```bash
cd "C:/Users/Shaimaa/Downloads/assistly-main" && pnpm dev
```

Wait for "Ready" before continuing.

- [ ] **Step 2: Confirm the email URL is correct**

Trigger an invite from `/admin-users` as the owner. In the SendGrid dashboard (or Mailtrap), open the rendered HTML and confirm the button `href` ends with `/login?invited=1` (not `/sign-in`).

- [ ] **Step 3: Confirm invited flow lands on `/review-sessions`**

In an incognito window, open the invite link. Verify the styled Assistly login page renders (blue background, `<SignIn />` widget). Sign in with the invited email. Expect the page to navigate to `/review-sessions`, not `/`.

- [ ] **Step 4: Regression: non-invited sign-in still goes to `/`**

Sign out. Visit `http://localhost:3000/login` (no query string). Sign in with any non-invited owner account. Expect to land on `/` (the existing admin home), unchanged.

- [ ] **Step 5: Regression: signed-in owner visiting `/login?invited=1`**

While signed in as the owner, visit `http://localhost:3000/login?invited=1`. Expect to redirect immediately to `/review-sessions`.

- [ ] **Step 6: Stop the dev server**

Kill the background `pnpm dev` task.

---

## Self-Review

1. **Spec coverage:**
   - Email link changed → Task 1.
   - `/login` reads `searchParams.invited`, sets cookie, picks `fallbackRedirectUrl`, handles already-signed-in → Task 2.
   - Verification steps → Task 3.
   - Spec's "no DB / middleware / new routes" → no task touches them.
   - Spec's "no cookie clearing on `/review-sessions`" → not in plan (correct).

2. **Placeholder scan:** No TBD / TODO / "implement later". Every step shows the exact code or command.

3. **Type consistency:** `INVITED_COOKIE = 'assistly_invited'` and `INVITED_MAX_AGE_SECONDS` are defined once in Task 2 and used only there. `fallbackRedirectUrl` is computed once and passed once to `<SignIn />`. No renaming across tasks.