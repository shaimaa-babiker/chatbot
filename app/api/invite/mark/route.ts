import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "assistly_invited";
const MAX_AGE_SECONDS = 60 * 60; // 1 hour

/**
 * GET /api/invite/mark?return=<url>
 *
 * Sets a short-lived httpOnly cookie marking the visitor as an invitee,
 * then 302s back to `return` (default /login).
 *
 * The cookie write cannot live in the /login Server Component because
 * Next.js 16 forbids mutating cookies during render — only Server Actions
 * and Route Handlers may modify them. The Server Component instead
 * redirects through this handler.
 */
export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("return") ?? "/login";
  // Only allow same-origin relative paths to prevent open-redirect.
  const safeReturn = returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/login";

  const res = NextResponse.redirect(new URL(safeReturn, req.url));
  res.cookies.set({
    name: COOKIE_NAME,
    value: "1",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
  return res;
}