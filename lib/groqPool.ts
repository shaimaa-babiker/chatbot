// lib/groqPool.ts
// A round-robin pool of free-tier Groq API keys with optional streaming.
// - Reads GROQ_API_KEY_1 ... GROQ_API_KEY_N from the environment.
// - Tracks a "cooldown" timestamp per key: when a key returns 429,
//   it is taken out of rotation for 60 seconds, then reused.
// - Exposes two helpers: a buffered `callGroqChat` and a streaming
//   `callGroqChatStream` that yields token strings as they arrive.
//   The same round-robin + cooldown logic is shared.

type KeyState = {
  key: string;
  cooldownUntil: number; // epoch ms; 0 means available
};

const COOLDOWN_MS = 60_000;

function loadKeys(): KeyState[] {
  const keys: KeyState[] = [];
  // Always support a single canonical env var as a fallback.
  const single = process.env.GROQ_API_KEY;
  if (single) keys.push({ key: single, cooldownUntil: 0 });

  // Then scan for numbered keys: GROQ_API_KEY_1, GROQ_API_KEY_2, ...
  for (let i = 1; i <= 20; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k && !keys.some((s) => s.key === k)) {
      keys.push({ key: k, cooldownUntil: 0 });
    }
  }
  return keys;
}

let pool: KeyState[] | null = null;
let pointer = 0;

function getPool(): KeyState[] {
  if (!pool) pool = loadKeys();
  return pool;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Groq's recommended replacement for the retired llama-3.3-70b-versatile.
const MODEL = "openai/gpt-oss-120b";

type CallOpts = {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  signal?: AbortSignal;
};

// Low-level POST that supports `stream: true|false`. Returns the chosen
// key index so the caller can mark it as cooled down on a 429.
async function postOnce(
  key: string,
  messages: ChatMessage[],
  stream: boolean,
  opts: CallOpts,
): Promise<Response> {
  return fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 512,
      temperature: opts.temperature ?? 0.7,
      stream,
    }),
    signal: opts.signal,
  });
}

async function pickKey(): Promise<{ idx: number; state: KeyState } | null> {
  const keys = getPool();
  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const candidate = (pointer + i) % keys.length;
    if (keys[candidate].cooldownUntil > now) continue;
    pointer = (candidate + 1) % keys.length;
    return { idx: candidate, state: keys[candidate] };
  }
  return null;
}

function markCooldown(state: KeyState) {
  state.cooldownUntil = Date.now() + COOLDOWN_MS;
}

// Buffered (non-streaming) call.
export async function callGroqChat(
  messages: ChatMessage[],
  opts: CallOpts = {},
): Promise<string> {
  const keys = getPool();
  if (keys.length === 0) {
    throw new Error(
      "No Groq API keys configured. Set GROQ_API_KEY or GROQ_API_KEY_1..N.",
    );
  }

  const tried = new Set<number>();
  let lastError: unknown = null;
  while (tried.size < keys.length) {
    const picked = await pickKey();
    if (!picked) break; // all keys in cooldown
    if (tried.has(picked.idx)) break;
    tried.add(picked.idx);

    const res = await postOnce(picked.state.key, messages, false, opts);
    if (res.status === 429) {
      markCooldown(picked.state);
      lastError = new Error("429 from Groq");
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Groq error ${res.status}: ${text}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq returned an empty completion");
    return content;
  }
  throw (
    lastError ??
    new Error(
      "All Groq API keys are currently rate-limited. Please try again shortly.",
    )
  );
}

// Streaming call. Yields raw token deltas (already stripped of the
// `"assistant:"` prefix that Llama 3 sometimes emits). Throws if every
// key returns 429.
export async function* callGroqChatStream(
  messages: ChatMessage[],
  opts: CallOpts = {},
): AsyncGenerator<string, void, void> {
  const keys = getPool();
  if (keys.length === 0) {
    throw new Error(
      "No Groq API keys configured. Set GROQ_API_KEY or GROQ_API_KEY_1..N.",
    );
  }

  const tried = new Set<number>();
  let lastError: unknown = null;

  while (tried.size < keys.length) {
    const picked = await pickKey();
    if (!picked) break; // all keys in cooldown
    if (tried.has(picked.idx)) break;
    tried.add(picked.idx);

    const res = await postOnce(picked.state.key, messages, true, opts);
    if (res.status === 429) {
      markCooldown(picked.state);
      lastError = new Error("429 from Groq");
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Groq error ${res.status}: ${text}`);
    }
    if (!res.body) {
      throw new Error("Groq returned an empty body for a streaming request");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let firstChunk = true;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE-style chunks separated by blank lines. Each event is a
        // JSON payload on a `data: ` line. The stream ends with `data: [DONE]`.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line || !line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") return;
          if (!payload) continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = json.choices?.[0]?.delta?.content;
            if (!delta) continue;
            // Strip a single leading "assistant:" prefix that the model
            // sometimes emits in the very first chunk.
            if (firstChunk && delta.startsWith("assistant:")) {
              yield delta.substring("assistant:".length);
            } else {
              yield delta;
            }
            firstChunk = false;
          } catch {
            // Skip malformed chunks instead of aborting the stream.
            continue;
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* already released */
      }
    }
    return;
  }

  throw (
    lastError ??
    new Error(
      "All Groq API keys are currently rate-limited. Please try again shortly.",
    )
  );
}
