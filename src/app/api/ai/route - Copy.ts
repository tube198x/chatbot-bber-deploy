import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * /api/ai
 * - Chỉ hỗ trợ: gemini | groq
 * - OpenAI đã bị loại khỏi hệ thống (free-first)
 */
type Provider = "gemini" | "groq";

function isRateLimitOrQuota(errMsg: string, status?: number) {
  const m = (errMsg || "").toLowerCase();
  return (
    status === 429 ||
    m.includes("resource_exhausted") ||
    m.includes("quota") ||
    m.includes("rate limit") ||
    m.includes("too many requests")
  );
}

const STYLE_SUFFIX =
  "\n\nYÊU CẦU TRẢ LỜI: Ngắn gọn, đủ ý cho HSSV (tối đa 8–10 dòng). " +
  "Nếu là hướng dẫn thủ tục: trình bày b1/b2/b3. " +
  "Không bịa thông tin; nếu thiếu dữ liệu thì nói rõ cần liên hệ phòng ban nào.";

async function listGeminiModels(apiKey: string) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(apiKey);
  const r = await fetch(url, { method: "GET" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `Gemini listModels lỗi HTTP ${r.status}`;
    const e: any = new Error(msg);
    e.status = r.status;
    throw e;
  }
  return (data?.models || []) as any[];
}

function pickGeminiModel(models: any[]) {
  // Ưu tiên theo thứ tự (nếu có trong listModels thì dùng)
  const prefer = [
    "models/gemini-2.0-flash",
    "models/gemini-2.0-flash-001",
    "models/gemini-1.5-flash",
    "models/gemini-1.5-flash-latest",
    "models/gemini-1.5-pro",
    "models/gemini-1.5-pro-latest",
  ];

  const names = new Set(models.map((m: any) => m?.name).filter(Boolean));
  for (const p of prefer) if (names.has(p)) return p;

  // fallback: model bất kỳ có generateContent
  const first = models.find((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"));
  return first?.name || null;
}

async function callGemini(question: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Chưa cấu hình GEMINI_API_KEY.");

  const models = await listGeminiModels(apiKey);
  const modelName = pickGeminiModel(models);
  if (!modelName) throw new Error("Không tìm thấy model Gemini hỗ trợ generateContent. Kiểm tra listModels trên key này.");

  const url =
    "https://generativelanguage.googleapis.com/v1beta/" +
    `${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: question + STYLE_SUFFIX }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
    }),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `Gemini lỗi HTTP ${r.status}`;
    const e: any = new Error(msg);
    e.status = r.status;
    throw e;
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("") ||
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "";

  return String(text || "").trim() || "Chưa có câu trả lời.";
}

async function callOpenAICompatible(question: string, baseUrl: string, apiKey: string, model: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 512,
      messages: [{ role: "user", content: question + STYLE_SUFFIX }],
    }),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `AI lỗi HTTP ${r.status}`;
    const e: any = new Error(msg);
    e.status = r.status;
    throw e;
  }

  return data?.choices?.[0]?.message?.content?.trim() || "Chưa có câu trả lời.";
}

async function callGroq(question: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Chưa cấu hình GROQ_API_KEY.");

  // Groq OpenAI-compatible base path: https://api.groq.com/openai/v1
  return callOpenAICompatible(question, "https://api.groq.com/openai/v1", apiKey, "llama-3.1-8b-instant");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const q = String(body?.question || "").trim();
    const providerRaw = String(body?.provider || "gemini").toLowerCase();

    if (!q) return NextResponse.json({ answer: "Bạn chưa nhập câu hỏi." }, { status: 400 });

    // chặn OpenAI ở backend (dù ai cố gửi lên)
    if (providerRaw === "openai") {
      return NextResponse.json(
        { answer: "OpenAI đã bị tắt khỏi hệ thống. Vui lòng chọn Gemini hoặc Groq." },
        { status: 400 }
      );
    }

    const p: Provider = providerRaw === "groq" ? "groq" : "gemini";

    // Gemini + fallback Groq (nếu Gemini quota/rate-limit)
    if (p === "gemini") {
      try {
        const answer = await callGemini(q);
        return NextResponse.json({ mode: "ai", provider: "gemini", provider_used: "gemini", answer });
      } catch (e: any) {
        const msg = e?.message || "Gemini lỗi";
        const st = e?.status;

        if (isRateLimitOrQuota(msg, st) && process.env.GROQ_API_KEY) {
          const answer = await callGroq(q);
          return NextResponse.json({ mode: "ai", provider: "gemini", provider_used: "groq", answer });
        }

        return NextResponse.json(
          { mode: "ai", provider: "gemini", provider_used: "gemini", answer: `Lỗi AI: ${msg}` },
          { status: 500 }
        );
      }
    }

    // Groq
    const answer = await callGroq(q);
    return NextResponse.json({ mode: "ai", provider: "groq", provider_used: "groq", answer });
  } catch (e: any) {
    return NextResponse.json({ answer: `Lỗi AI: ${e?.message || "unknown"}` }, { status: 500 });
  }
}
