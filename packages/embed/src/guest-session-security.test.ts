import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createGuestSessionCapability,
  hashGuestSessionCapability,
  hasGuestSessionCapability,
} from "../../../lib/guestSessionCapability";
import startAppChat from "../../../lib/startNewChat";
import startEmbedChat from "./lib/startNewChat";
import { GET as getMessages } from "../../../app/api/chat-sessions/[id]/messages/route";
import {
  DELETE as revokeCapability,
  POST as rotateCapability,
} from "../../../app/api/chat-sessions/[id]/capability/route";
import { POST as startChat } from "../../../app/api/start-chat/route";
import { POST as sendMessage } from "../../../app/api/send-message/route";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  getChatbot: vi.fn(),
  getSessionDetails: vi.fn(),
  applyConfiguredTagsToMessage: vi.fn(),
  callGroqChat: vi.fn(),
  callGroqChatStream: vi.fn(),
  sendAdminNewMessageDigest: vi.fn(),
  auth: vi.fn(),
  canReviewSessionsForChatbot: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mocks.sql }));
vi.mock("@/lib/chatData", () => ({
  getChatbot: mocks.getChatbot,
  getSessionDetails: mocks.getSessionDetails,
}));
vi.mock("@/lib/messageTagging", () => ({
  applyConfiguredTagsToMessage: mocks.applyConfiguredTagsToMessage,
}));
vi.mock("@/lib/groqPool", () => ({
  callGroqChat: mocks.callGroqChat,
  callGroqChatStream: mocks.callGroqChatStream,
}));
vi.mock("@/lib/email", () => ({
  sendAdminNewMessageDigest: mocks.sendAdminNewMessageDigest,
}));
vi.mock("@/lib/adminAccess", () => ({
  canReviewSessionsForChatbot: mocks.canReviewSessionsForChatbot,
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));

function request(
  url: string,
  method: "GET" | "POST" | "DELETE",
  token?: string,
  body?: Record<string, unknown>,
): NextRequest {
  const headers = new Headers();
  if (token) headers.set("Authorization", "Bearer " + token);
  if (body) headers.set("Content-Type", "application/json");
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const chatBody = {
  name: "Guest",
  chat_session_id: 21,
  chabot_id: 6,
  content: "Please help",
  created_at: "2026-06-03T12:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guest session capabilities", () => {
  it("creates a high-entropy token and stores only its hash", () => {
    const first = createGuestSessionCapability();
    const second = createGuestSessionCapability();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(hashGuestSessionCapability(first.token));
    expect(first.hash).not.toBe(first.token);
    expect(new Date(first.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a missing capability without querying session data", async () => {
    await expect(hasGuestSessionCapability(21, null)).resolves.toBe(false);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("rejects a capability used for a different chatbot session", async () => {
    const ownerCapability = createGuestSessionCapability();
    mocks.sql.mockResolvedValueOnce([
      { guest_capability_hash: createGuestSessionCapability().hash },
    ]);

    await expect(
      hasGuestSessionCapability(22, ownerCapability.token),
    ).resolves.toBe(false);
  });

  it("rejects expired or revoked capabilities", async () => {
    mocks.sql.mockResolvedValueOnce([]);

    await expect(
      hasGuestSessionCapability(21, createGuestSessionCapability().token),
    ).resolves.toBe(false);
  });

  it("accepts the capability assigned to the requested session", async () => {
    const capability = createGuestSessionCapability();
    mocks.sql.mockResolvedValueOnce([
      { guest_capability_hash: capability.hash },
    ]);

    await expect(
      hasGuestSessionCapability(21, capability.token),
    ).resolves.toBe(true);
  });
});

describe("guest chat API authorization", () => {
  it("does not return a transcript without a capability", async () => {
    const response = await getMessages(
      request("https://assistly.test/api/chat-sessions/21/messages", "GET"),
      { params: Promise.resolve({ id: "21" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Session unavailable" });
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("does not return another session's transcript with a different session token", async () => {
    const capability = createGuestSessionCapability();
    mocks.sql.mockResolvedValueOnce([
      { guest_capability_hash: createGuestSessionCapability().hash },
    ]);

    const response = await getMessages(
      request(
        "https://assistly.test/api/chat-sessions/22/messages",
        "GET",
        capability.token,
      ),
      { params: Promise.resolve({ id: "22" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it("does not accept a token for a session belonging to another chatbot", async () => {
    const tokenForOtherChatbot = createGuestSessionCapability();
    mocks.sql.mockResolvedValueOnce([
      { guest_capability_hash: createGuestSessionCapability().hash },
    ]);

    const response = await sendMessage(
      request(
        "https://assistly.test/api/send-message",
        "POST",
        tokenForOtherChatbot.token,
        { ...chatBody, chat_session_id: 22, chabot_id: 9 },
      ),
    );

    expect(response.status).toBe(404);
    expect(mocks.getSessionDetails).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it("returns messages to the guest holding the matching capability", async () => {
    const capability = createGuestSessionCapability();
    mocks.sql
      .mockResolvedValueOnce([{ guest_capability_hash: capability.hash }])
      .mockResolvedValueOnce([
        {
          id: 1,
          chat_session_id: 21,
          content: "Welcome",
          created_at: "2026-06-03T12:00:00.000Z",
          sender: "ai",
        },
      ]);

    const response = await getMessages(
      request(
        "https://assistly.test/api/chat-sessions/21/messages",
        "GET",
        capability.token,
      ),
      { params: Promise.resolve({ id: "21" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toHaveLength(1);
  });

  it("issues the capability only in the successful start-chat response", async () => {
    mocks.sql.mockResolvedValueOnce([{ chat_session_id: 21 }]);
    const response = await startChat(
      request("https://assistly.test/api/start-chat", "POST", undefined, {
        name: "Guest",
        email: "guest@example.com",
        chatbot_id: 6,
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.chat_session_id).toBe(21);
    expect(result.capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(mocks.sql.mock.calls[0])).not.toContain(result.capability);
    expect(JSON.stringify(mocks.sql.mock.calls[0])).toContain(
      hashGuestSessionCapability(result.capability),
    );
  });

  it("requires the session capability before submitting a guest message", async () => {
    const response = await sendMessage(
      request(
        "https://assistly.test/api/send-message",
        "POST",
        undefined,
        chatBody,
      ),
    );

    expect(response.status).toBe(404);
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.getSessionDetails).not.toHaveBeenCalled();
  });

  it("keeps message delivery working when configured tagging fails", async () => {
    const capability = createGuestSessionCapability();
    mocks.sql
      .mockResolvedValueOnce([{ guest_capability_hash: capability.hash }])
      .mockResolvedValueOnce([{ id: 301 }])
      .mockResolvedValueOnce([{ id: 302 }]);
    mocks.getSessionDetails.mockResolvedValue({
      id: 21,
      chatbot_id: 6,
      messages: [],
      chatbot: { id: 6, name: "Test bot", clerk_user_id: "owner" },
      guest: null,
      created_at: "2026-06-03T12:00:00.000Z",
    });
    mocks.getChatbot.mockResolvedValue({
      id: 6,
      chatbot_characteristics: [],
    });
    mocks.applyConfiguredTagsToMessage.mockRejectedValue(new Error("tagger unavailable"));
    mocks.callGroqChat.mockResolvedValue("Assistant reply");

    const response = await sendMessage(
      request(
        "https://assistly.test/api/send-message",
        "POST",
        capability.token,
        chatBody,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 302,
      content: "Assistant reply",
    });
    expect(mocks.callGroqChat).toHaveBeenCalledOnce();
  });

  it("rotates a capability only when the current session holder presents it", async () => {
    const current = createGuestSessionCapability();
    mocks.sql.mockResolvedValueOnce([{ id: 21 }]);

    const response = await rotateCapability(
      request(
        "https://assistly.test/api/chat-sessions/21/capability",
        "POST",
        current.token,
      ),
      { params: Promise.resolve({ id: "21" }) },
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.capability).not.toBe(current.token);
    expect(JSON.stringify(mocks.sql.mock.calls[0])).not.toContain(result.capability);
  });

  it("preserves admin authorization for capability revocation", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    const unauthorized = await revokeCapability(
      request(
        "https://assistly.test/api/chat-sessions/21/capability",
        "DELETE",
      ),
      { params: Promise.resolve({ id: "21" }) },
    );
    expect(unauthorized.status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();

    mocks.auth.mockResolvedValueOnce({ userId: "owner" });
    mocks.sql
      .mockResolvedValueOnce([{ chatbot_id: 6 }])
      .mockResolvedValueOnce([]);
    mocks.canReviewSessionsForChatbot.mockResolvedValueOnce(true);
    const authorized = await revokeCapability(
      request(
        "https://assistly.test/api/chat-sessions/21/capability",
        "DELETE",
      ),
      { params: Promise.resolve({ id: "21" }) },
    );

    expect(authorized.status).toBe(204);
    expect(mocks.canReviewSessionsForChatbot).toHaveBeenCalledWith("owner", 6);
  });

  it("preserves first-party and embed chat-session creation clients", async () => {
    const capability = createGuestSessionCapability().token;
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
        JSON.stringify({ chat_session_id: 21, capability }),
        { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(startAppChat("Guest", "guest@example.com", 6)).resolves.toEqual({
      chatSessionId: 21,
      capability,
    });
    await expect(
      startEmbedChat("https://assistly.test", "Guest", "guest@example.com", 6),
    ).resolves.toEqual({ chatSessionId: 21, capability });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
