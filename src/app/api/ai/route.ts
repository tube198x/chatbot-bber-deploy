import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Rate limit cho AI */
type Hit = { ts: number[] };
const rl = new Map<string, Hit>();
const RL_WINDOW_MS = 60 * 1000;
const RL_LIMIT = 20; // 20 req/phút/IP+client

/** Quota AI theo "phiên truy cập" (x-bber-client-id do UI gửi) */
type Quota = { count: number; exp: number };
const quota = new Map<string, Quota>();
const AI_LIMIT = 5;
const AI_SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6h (gần đúng "phiên tab")

/** Cắt độ dài trả lời AI */
const MAX_AI_CHARS = 1400;

function getKey(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  const cid = req.headers.get("x-bber-client-id") || "no-client";
  return `${ip}|${cid}`;
}

function rateLimit(req: NextRequest) {
  const key = getKey(req);
  const now = Date.now();
  const hit = rl.get(key) || { ts: [] };
  hit.ts = hit.ts.filter((t) => now - t < RL_WINDOW_MS);
  if (hit.ts.length >= RL_LIMIT) return false;
  hit.ts.push(now);
  rl.set(key, hit);
  return true;
}

function quotaCheckAndInc(req: NextRequest) {
  const key = getKey(req);
  const now = Date.now();
  const q = quota.get(key);

  if (!q || q.exp <= now) {
    quota.set(key, { count: 1, exp: now + AI_SESSION_TTL_MS });
    return { ok: true, remaining: AI_LIMIT - 1 };
  }

  if (q.count >= AI_LIMIT) return { ok: false, remaining: 0 };

  q.count += 1;
  quota.set(key, q);
  return { ok: true, remaining: Math.max(0, AI_LIMIT - q.count) };
}

function limitText(s: string) {
  const t = String(s || "").trim();
  if (t.length <= MAX_AI_CHARS) return t;
  return t.slice(0, MAX_AI_CHARS).trimEnd() + "…\n\n(Đã rút gọn. Nếu cần, hãy hỏi tiếp phần cụ thể.)";
}

function buildOfficePrompt(question: string) {
  return (
    "Bạn là trợ lý ảo cho HSSV. Trả lời NGẮN GỌN, rõ ràng, dễ đọc.\n" +
    "- Ưu tiên gạch đầu dòng hoặc các bước 1) 2) 3)\n" +
    "- Nếu là thủ tục: nêu nơi tiếp nhận, hồ sơ cần, thời gian dự kiến, lưu ý.\n" +
    "- Tuyệt đối không lan man. Tối đa ~8-10 dòng.\n\n" +
    `Câu hỏi: ${question}`
  );
}

/** ====== GROQ (OpenAI-compatible) ====== */
async function callGroq(question: string) {
  const key =
    process.env.GROQ_API_KEY ||
    process.env.GROQ_KEY ||
    process.env.NEXT_PUBLIC_GROQ_API_KEY;

  if (!key) throw new Error("Thiếu GROQ_API_KEY");

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const base = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1/chat/completions";

  const prompt = buildOfficePrompt(question);

  const r = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 512,
      messages: [
        { role: "system", content: "Bạn trả lời tiếng Việt, giọng văn phòng/nhà trường." },
        { role: "user", content: prompt },
      ],
    }),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = j?.error?.message || j?.message || "Groq failed";
    throw new Error(msg);
  }

  const text = j?.choices?.[0]?.message?.content || "";
  return String(text || "").trim();
}

/** ====== GEMINI (REST) ====== */
async function callGemini(question: string) {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!key) throw new Error("Thiếu GEMINI_API_KEY");

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const prompt = buildOfficePrompt(question);

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
    }),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = j?.error?.message || "Gemini failed";
    throw new Error(msg);
  }

  const parts = j?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p: any) => p?.text || "").join("").trim();
  return String(text || "").trim();
}

export async function POST(req: NextRequest) {
  // Rate limit
  if (!rateLimit(req)) {
    return NextResponse.json({ error: "Bạn thao tác quá nhanh. Vui lòng thử lại sau." }, { status: 429 });
  }

  // Quota 5 lượt / phiên
  const q = quotaCheckAndInc(req);
  if (!q.ok) {
    return NextResponse.json(
      { error: "Bạn đã dùng hết 5 lượt hỏi AI cho phiên này. Hãy tải lại trang hoặc dùng Tra cứu nội bộ." },
      {
        status: 429,
        headers: {
          "x-ai-limit": String(AI_LIMIT),
          "x-ai-remaining": "0",
        },
      }
    );
  }

  try {
    const body = await req.json();
    const question = String(body?.question || "").trim();
    const provider = String(body?.provider || "gemini"); // "gemini" | "groq"

    if (!question) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    // Fallback free: Groq <-> Gemini
    let answer = "";
    let used = provider;

    if (provider === "groq") {
      try {
        answer = await callGroq(question);
        used = "groq";
      } catch {
        answer = await callGemini(question);
        used = "gemini";
      }
    } else {
      try {
        answer = await callGemini(question);
        used = "gemini";
      } catch {
        answer = await callGroq(question);
        used = "groq";
      }
    }

    answer = limitText(answer);

    return NextResponse.json(
      {
        answer,
        provider_used: used,
      },
      {
        headers: {
          "x-ai-limit": String(AI_LIMIT),
          "x-ai-remaining": String(q.remaining),
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "AI failed" },
      {
        status: 500,
        headers: {
          "x-ai-limit": String(AI_LIMIT),
          "x-ai-remaining": String(q.remaining),
        },
      }
    );
  }
}
