import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callGroqChat: vi.fn(),
}));

vi.mock("@/lib/groqPool", () => ({ callGroqChat: mocks.callGroqChat }));

import { classifyEnquiry } from "../../../lib/enquiryClassification";

beforeEach(() => mocks.callGroqChat.mockReset());

describe("enquiry classification", () => {
  it("allows enough completion tokens for the model to return a category", async () => {
    mocks.callGroqChat.mockResolvedValue("Order Status");

    await expect(classifyEnquiry({
      knowledge: "Customers can track orders online.",
      message: "Where is my package?",
      knownCategories: [],
    })).resolves.toBe("Order Status");

    expect(mocks.callGroqChat).toHaveBeenCalledWith(
      expect.any(Array),
      { maxTokens: 512, temperature: 0 },
    );
  });
});
