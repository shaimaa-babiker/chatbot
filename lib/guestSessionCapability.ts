import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import sql from "@/lib/db";

const CAPABILITY_LIFETIME_DAYS = 90;

export type GuestSessionCapability = {
  token: string;
  hash: string;
  expiresAt: string;
};

export function createGuestSessionCapability(): GuestSessionCapability {
  const token = randomBytes(32).toString("base64url");
  const hash = hashGuestSessionCapability(token);
  const expiresAt = new Date(
    Date.now() + CAPABILITY_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  return { token, hash, expiresAt };
}

export function hashGuestSessionCapability(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function getGuestSessionCapability(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  return match?.[1] ?? null;
}

export async function hasGuestSessionCapability(
  sessionId: number,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;

  const rows = await sql`
    SELECT guest_capability_hash
    FROM chat_sessions
    WHERE id = ${sessionId}
      AND guest_capability_expires_at > NOW()
      AND guest_capability_revoked_at IS NULL
    LIMIT 1
  `;
  const storedHash = rows[0]?.guest_capability_hash;
  if (typeof storedHash !== "string" || !/^[a-f0-9]{64}$/i.test(storedHash)) {
    return false;
  }

  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashGuestSessionCapability(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function rotateGuestSessionCapability(
  sessionId: number,
  currentToken: string | null,
): Promise<GuestSessionCapability | null> {
  if (!currentToken) return null;

  const capability = createGuestSessionCapability();
  const rows = await sql`
    UPDATE chat_sessions
    SET guest_capability_hash = ${capability.hash},
        guest_capability_expires_at = ${capability.expiresAt},
        guest_capability_revoked_at = NULL
    WHERE id = ${sessionId}
      AND guest_capability_hash = ${hashGuestSessionCapability(currentToken)}
      AND guest_capability_expires_at > NOW()
      AND guest_capability_revoked_at IS NULL
    RETURNING id
  `;

  return rows.length ? capability : null;
}
