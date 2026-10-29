import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  callGroqChat: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mocks.sql }));
vi.mock("@/lib/groqPool", () => ({ callGroqChat: mocks.callGroqChat }));

import {
  classifyMessageTags,
  type ConfiguredChatbotTag,
} from "../../../lib/messageTagging";

const tags: ConfiguredChatbotTag[] = [
  {
    id: 1,
    name: "Premium plan",
    purpose: "Questions about Premium plan features and pricing.",
    category: "product",
  },
  {
    id: 2,
    name: "Consultation",
    purpose: "Requests to book a consultation.",
    category: "service",
  },
];

describe("configured message tags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("uses only distinct configured tag IDs returned by the model", async () => {
    mocks.callGroqChat.mockResolvedValueOnce("[1, 1, 999, 2]");

    await expect(
      classifyMessageTags({
        message: "Can I book a consultation?",
        tags,
      }),
    ).resolves.toEqual([1, 2]);
  });

  it("rejects non-JSON model output instead of inventing a tag", async () => {
    mocks.callGroqChat.mockResolvedValueOnce("service");

    await expect(
      classifyMessageTags({ message: "I need help", tags }),
    ).rejects.toThrow("Groq returned invalid message tag JSON");
  });

  it("does not call the model when no tags are configured", async () => {
    await expect(
      classifyMessageTags({ message: "Hello", tags: [] }),
    ).resolves.toEqual([]);
    expect(mocks.callGroqChat).not.toHaveBeenCalled();
  });
});
