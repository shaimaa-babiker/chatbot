import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runClassificationWorker } from "@/lib/classification/worker";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.CLASSIFICATION_WORKER_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!expected || !authorization.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}
export async function POST(request: Request) {
  if (!process.env.CLASSIFICATION_WORKER_SECRET) {
    return NextResponse.json({ error: "Worker invocation is not configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let maxRuns = 10;
  try {
    const rawBody = await request.text();
    const body: unknown = rawBody.trim() ? JSON.parse(rawBody) : {};
    if (typeof body === "object" && body !== null && "maxRuns" in body) {
      const value = body.maxRuns;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
        return NextResponse.json({ error: "maxRuns must be an integer from 1 to 100" }, { status: 400 });
      }
      maxRuns = value;
    }
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  try {
    const result = await runClassificationWorker({ maxRuns });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[classification-worker] tick failed", error);
    return NextResponse.json({ error: "Classification worker tick failed" }, { status: 500 });
  }
}
