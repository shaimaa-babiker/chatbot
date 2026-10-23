# Invitation email — fix link + post-login redirect

**Date:** 2026-07-29
**Status:** Approved (user said "ok" to the in-chat design summary)
**Scope:** Small — touches one email template and one login page render.

## Problem

When an owner invites a teammate via `/admin-users`, the invitation email button links to `${appBaseUrl}/sign-in`. Clerk routes both `/sign-in` and `/login` through `app/(guest)/login/[[...rest]]/page.tsx`, but the Assistly `<SignIn />` component is rendered with `fallbackRedirectUrl="/"`. That page is the admin home, which prompts the user to "create your first chatbot" — wrong destination for an invited viewer/editor.

Two things need to change:

1. The email link should land on the Assistly `/login` page (not Clerk's bare `/sign-in`).
2. After sign-in, invited users should land on `/review-sessions` instead of `/`.

## Goal

A viewer or editor who clicks the link in the invitation email and completes sign-in ends up on `/review-sessions`, where they can see the chatbots they're allowed to review (the existing `canReviewSessionsForChatbot` filter already covers this).

## Non-goals

- No changes to the admin layout, the invite form, or the `/admin-users` page.
- No DB schema change, no middleware change, no new routes.
- No deeplink to a specific chatbot's review page. The post-login destination is the generic `/review-sessions` list.
- No cookie clearing on `/review-sessions`. A short TTL (1 hour) makes the cookie self-cleaning.

## Design

### 1. Email link (`lib/email.ts`)

`buildInviteHtml` currently produces:

```ts
const signInUrl = `${payload.appBaseUrl.replace(/\/$/, "")}/sign-in`;
```

Change the URL to:

```ts
const signInUrl = `${payload.appBaseUrl.replace(/\/$/, "")}/login?invited=1`;
```

This:

- Lands on the styled Assistly login page (`app/(guest)/login/[[...rest]]/page.tsx`) instead of Clerk's bare `/sign-in`.
- Adds the `invited=1` query flag, which the login page reads.

The visible button text and surrounding copy are unchanged.

### 2. `/login` page (`app/(guest)/login/[[...rest]]/page.tsx`)

The page is currently a server component with no `searchParams` or `cookies` access. Make these changes:

- Accept `searchParams: { invited?: string }` as a prop.
- Call `cookies()` from `next/headers`.
- If the visitor is already signed in (`auth().userId` is set) and `invited === "1"`: redirect to `/review-sessions` and return early. This handles stale invite links where the user is already authenticated.
- If `invited === "1"` and not signed in:
  - Set a short-lived httpOnly cookie `assistly_invited=1` with `maxAge: 60 * 60` (1 hour), `path: "/"`, `sameSite: "lax"`.
  - Render `<SignIn fallbackRedirectUrl="/review-sessions" signUpUrl="/sign-up?invited=1" />`.
- Otherwise (default): render the page exactly as today with `fallbackRedirectUrl="/"`.

The page already lives in `(guest)` route group and uses the `(guest)/login/layout.tsx` — neither needs changing.

### 3. Sign-up path

The `<SignIn />` component's `signUpUrl="/sign-up?invited=1"` is included so users without a Clerk account yet preserve the `invited=1` flag across the sign-up step. Clerk handles `/sign-up` via the same `[[...rest]]` catch-all if needed; the flag is informational and won't cause issues if dropped.

## Why a cookie, not a query param

Two options were considered:

- **Query param on the invite link** (`/login?invited=1&review=...`): The URL is bookmarkable and survives in email screenshots / forwards. If the recipient signs up at a different time, the flag still applies and could send them to `/review-sessions` inappropriately.
- **DB query on `/login` render**: Always correct, but adds a NeonDB query to every login render, even for owners who will never use the flag.

A short-lived cookie set at the moment the invitee visits `/login?invited=1` is the smallest change: the DB row already exists (the invite was created before the email was sent), so we trust that visiting the link is intent. 1-hour TTL means stale forwards self-heal.

## Files changed

| File | Change |
|---|---|
| `lib/email.ts` | `buildInviteHtml`: change `/sign-in` to `/login?invited=1` |
| `app/(guest)/login/[[...rest]]/page.tsx` | Read `searchParams.invited`, set/clear cookie, pick `fallbackRedirectUrl`, handle already-signed-in case |

No other files are touched.

## Edge cases

- **Owner clicks their own invite link by accident.** `auth().userId` is set, so the page redirects to `/review-sessions`. Owners can review sessions, so this is fine.
- **Invitee has multiple invites from different owners.** The cookie just marks "invited user", not "for owner X". `/review-sessions` already enumerates all chatbots where `canReviewSessionsForChatbot` is true, so multiple owners' sessions all appear. No change needed.
- **Owner removes the invitee between email and click.** The invitee signs in, goes to `/review-sessions`, sees an empty list (the existing filter excludes them). Acceptable — out of scope to fix.
- **Recipient forwards the email.** The new recipient can sign in and reach `/review-sessions` even without a real invite. This matches today's behavior (they could already click the link); we're not weakening access control. The DB-backed `canReviewSessionsForChatbot` is still the gate.
- **`invited=1` flag dropped on sign-up.** If the user goes to sign-up and the flag is lost in that flow, they fall back to `/` post-signup. Acceptable for v1 — we can tighten later.

## Verification

There is no test suite in this repo (`pnpm` has no `test` script). Manual verification:

1. `pnpm dev`
2. Sign in as an owner, navigate to `/admin-users`, invite a new email with role `viewer` (or use an existing invited email).
3. In Mailtrap / SendGrid dashboard, confirm the email button now reads `…/login?invited=1`.
4. Open the email link in an incognito window. The Assistly login page should render (blue background, `<SignIn />` widget).
5. Sign in with the invited email. Expect to land on `/review-sessions`, not `/`.
6. Verify with `document.cookie` (or DevTools → Application → Cookies) that `assistly_invited=1` was set, and that after 1 hour it expires (or that reloading `/login` without `?invited=1` no longer sets it).
7. Regression: sign in as a non-invited owner and confirm `/login` (no flag) still sends them to `/` after sign-in.
8. Regression: as the owner, navigate to `/login?invited=1` while signed in — should redirect to `/review-sessions`.