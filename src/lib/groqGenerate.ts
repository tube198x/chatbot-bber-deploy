// src/lib/groqGenerate.ts
// Groq OpenAI-compatible Chat Completions client (Node runtime only).
// Free-tier friendly: serial queue + retry/backoff on HTTP 429.

type GroqMessage = { role: "system" | "user" | "assistant"; content: string };

type GroqChatOptions = {
  model?: string;
  temperature?: number;
  maxCompletionTokens?: number;
  jsonMode?: boolean; // enforce valid JSON (json_object)
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfter(v: string | null) {
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return Math.floor(n * 1000);
  return null;
}

// Simple FIFO queue to serialize Groq calls
let _queue = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => fn();
  const next = _queue.then(run, run);
  _queue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function groqChatJson(messages: GroqMessage[], opts?: GroqChatOptions): Promise<any> {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) throw new Error("Missing GROQ_API_KEY in .env");

  const model = opts?.model || process.env.GROQ_GEN_MODEL || "llama-3.3-70b-versatile";
  const temperature = typeof opts?.temperature === "number" ? opts?.temperature : 0.2;
  const maxCompletionTokens = typeof opts?.maxCompletionTokens === "number" ? opts?.maxCompletionTokens : 4096;

  const body: any = {
    model,
    messages,
    temperature,
    max_completion_tokens: maxCompletionTokens,
  };

  if (opts?.jsonMode !== false) {
    body.response_format = { type: "json_object" };
  }

  return enqueue(async () => {
    let lastErr: any = null;

    for (let attempt = 1; attempt <= 6; attempt++) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data: any = await res.json();
        const content = data?.choices?.[0]?.message?.content || "";
        try {
          return JSON.parse(content);
        } catch {
          throw new Error("Groq returned non-JSON content (parse failed).");
        }
      }

      // 429 retry with backoff (honor Retry-After when present)
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      const text = await res.text().catch(() => "");
      lastErr = new Error(text || `HTTP ${res.status}`);

      if (res.status === 429) {
        const base = retryAfter ?? Math.min(20000, 800 * Math.pow(2, attempt - 1));
        const jitter = Math.floor(Math.random() * 250);
        await sleep(base + jitter);
        continue;
      }

      // other errors: do not loop forever
      throw lastErr;
    }

    throw lastErr || new Error("Groq call failed");
  });
}
