import { beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.hoisted(() => vi.fn());
vi.mock("@/lib/classification/worker", () => ({ runClassificationWorker: run }));

import { POST } from "../../../app/api/internal/classification-worker/route";

beforeEach(() => {
  run.mockReset().mockResolvedValue({
    reconciled: 0, claimed: 0, succeeded: 0,
    retryableFailed: 0, deadLettered: 0, claimErrors: 0,
  });
  delete process.env.CLASSIFICATION_WORKER_SECRET;
});
describe("internal classification worker endpoint", () => {
  it("remains disabled until an invocation secret is configured", async () => {
    const response = await POST(new Request("https://example.test/api/internal/classification-worker", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects missing or incorrect bearer credentials", async () => {
    process.env.CLASSIFICATION_WORKER_SECRET = "a-long-test-secret-value";
    const response = await POST(new Request("https://example.test/api/internal/classification-worker", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("invokes a bounded worker tick only after bearer authentication", async () => {
    process.env.CLASSIFICATION_WORKER_SECRET = "a-long-test-secret-value";
    const response = await POST(new Request("https://example.test/api/internal/classification-worker", {
      method: "POST",
      headers: { authorization: "Bearer a-long-test-secret-value", "content-type": "application/json" },
      body: JSON.stringify({ maxRuns: 2 }),
    }));
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledWith({ maxRuns: 2 });
  });
});
