import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { geminiAnswer } from "../../../lib/geminiAnswer";
import { geminiEmbed } from "../../../lib/geminiEmbedding";

export const runtime = "nodejs";

function normalizeQ(q: string) {
  return q.trim().replace(/\s+/g, " ").slice(0, 500);
}

function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Rate limit (best-effort)
 * - Ưu tiên dùng src/lib/rateLimit.ts (bạn đã tạo sẵn)
 * - Nếu vì lý do nào đó không load được thì bỏ qua (không làm crash build)
 */
async function checkRateLimit(req: NextRequest) {
  try {
    // Giữ đúng style import tương đối như file hiện tại
    const mod: any = await import("../../../lib/rateLimit");
    const fn =
      mod?.rateLimit ||
      mod?.checkRateLimit ||
      mod?.default;

    if (typeof fn === "function") {
      // Hỗ trợ nhiều kiểu signature khác nhau.
      // 1) fn({ key, limit, windowMs })
      // 2) fn(req, { key, limit, windowMs })
      // 3) fn(req)
      const ip = getClientIp(req);
      const key = `ask:${ip}`;

      try {
        const r1 = await fn({ key, limit: 30, windowMs: 60_000 });
        return normalizeRateResult(r1);
      } catch {
        try {
          const r2 = await fn(req, { key, limit: 30, windowMs: 60_000 });
          return normalizeRateResult(r2);
        } catch {
          const r3 = await fn(req);
          return normalizeRateResult(r3);
        }
      }
    }
  } catch {
    // ignore
  }
  return { allowed: true as const, retryAfterSec: 0 };
}

function normalizeRateResult(r: any) {
  // Chuẩn hoá các kiểu output khác nhau về dạng: { allowed, retryAfterSec }
  if (!r) return { allowed: true as const, retryAfterSec: 0 };

  if (typeof r.allowed === "boolean") {
    return { allowed: r.allowed as boolean, retryAfterSec: Number(r.retryAfterSec || r.retryAfter || 0) || 0 };
  }

  if (typeof r.ok === "boolean") {
    return { allowed: r.ok as boolean, retryAfterSec: Number(r.retryAfterSec || r.retryAfter || 0) || 0 };
  }

  if (typeof r.success === "boolean") {
    return { allowed: r.success as boolean, retryAfterSec: Number(r.reset || r.retryAfter || 0) || 0 };
  }

  return { allowed: true as const, retryAfterSec: 0 };
}

async function logQuestion(params: {
  question: string;
  scope: "internal" | "study";
  mode: string;
  matched_faq_id?: string | null;
}) {
  // Tùy chọn: nếu bạn chưa tạo bảng log, insert sẽ fail và bị bỏ qua.
  try {
    await supabaseAdmin.from("faq_questions_log").insert({
      question: params.question,
      scope: params.scope,
      mode: params.mode,
      matched_faq_id: params.matched_faq_id || null,
    });
  } catch {
    // ignore
  }
}

async function findFaqKeyword(q: string) {
  // Ưu tiên match câu hỏi gần giống (keyword)
  const { data, error } = await supabaseAdmin
    .from("faq")
    .select("id, cau_hoi, tra_loi, nhom, file_urls")
    .ilike("cau_hoi", `%${q}%`)
    .limit(1);

  if (error) return null;
  return data?.[0] || null;
}

async function findFaqSemantic(q: string) {
  // Semantic match qua embedding + RPC (nếu bạn đã tạo RPC match_faq)
  // Nếu chưa có RPC, hàm này sẽ trả null (không làm crash).
  try {
    const emb = await geminiEmbed(q);
    const { data, error } = await supabaseAdmin.rpc("match_faq", {
      query_embedding: emb,
      match_threshold: 0.72,
      match_count: 1,
    });

    if (error) return null;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;

    return {
      id: row.id,
      cau_hoi: row.cau_hoi,
      tra_loi: row.tra_loi,
      nhom: row.nhom,
      file_urls: row.file_urls || [],
      score: row.score ?? null,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // Rate limit cho chế độ Public (giảm lãng phí tài nguyên)
  const rl = await checkRateLimit(req);
  if (!rl.allowed) {
    const retry = rl.retryAfterSec > 0 ? rl.retryAfterSec : 60;
    return NextResponse.json(
      {
        mode: "rate_limited",
        answer: "Bạn hỏi quá nhanh. Vui lòng thử lại sau ít phút.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retry),
        },
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const scope: "internal" | "study" = body?.scope === "study" ? "study" : "internal";
  const question = normalizeQ(String(body?.question || ""));

  if (!question) {
    return NextResponse.json({ mode: "error", answer: "Câu hỏi không hợp lệ." }, { status: 400 });
  }

  // =========================
  // 1) TRA CỨU NỘI BỘ
  // =========================
  if (scope === "internal") {
    // 1.1 Keyword trước
    const faq1 = await findFaqKeyword(question);
    if (faq1) {
      await logQuestion({ question, scope, mode: "faq_keyword", matched_faq_id: faq1.id });
      return NextResponse.json({
        mode: "faq",
        answer: faq1.tra_loi,
        faq: {
          id: faq1.id,
          cau_hoi: faq1.cau_hoi,
          nhom: faq1.nhom,
          file_urls: faq1.file_urls || [],
        },
        scope,
      });
    }

    // 1.2 Semantic sau
    const faq2 = await findFaqSemantic(question);
    if (faq2) {
      await logQuestion({ question, scope, mode: "faq_semantic", matched_faq_id: faq2.id });
      return NextResponse.json({
        mode: "faq",
        answer: faq2.tra_loi,
        faq: {
          id: faq2.id,
          cau_hoi: faq2.cau_hoi,
          nhom: faq2.nhom,
          file_urls: faq2.file_urls || [],
          score: faq2.score,
        },
        scope,
      });
    }

    // 1.3 Fallback = 2 (đã chốt): không có FAQ thì gọi AI,
    // nhưng “đóng vai trợ lý trường”, trả lời ngắn + hướng dẫn liên hệ khi cần văn bản/phòng ban.
    const prompt = `
Bạn là trợ lý ảo nội bộ của Trường. Nhiệm vụ:
- Trả lời NGẮN GỌN, rõ ràng, dễ hiểu cho HSSV.
- Nếu câu hỏi liên quan QUY ĐỊNH / THỦ TỤC cần văn bản chính thức: nói rõ “cần kiểm tra văn bản/Thông báo của trường” và gợi ý liên hệ phòng ban phù hợp (CTCTSV/Đào tạo/Tài vụ/Khảo thí…).
- Không bịa số liệu, không bịa đường link.
Câu hỏi HSSV: "${question}"
Trả lời:
`.trim();

    const ai = await geminiAnswer(prompt);
    await logQuestion({ question, scope, mode: "ai_internal_fallback", matched_faq_id: null });

    return NextResponse.json({
      mode: "ai_internal_fallback",
      answer: ai,
      faq: { file_urls: [] },
      scope,
    });
  }

  // =========================
  // 2) TRA CỨU HỌC TẬP (AI)
  // =========================
  const studyPrompt = `
Bạn là trợ lý học tập cho HSSV.
- Trả lời dễ hiểu, có ví dụ ngắn.
- Nếu câu hỏi mơ hồ: hỏi lại 1 câu để làm rõ.
Câu hỏi: "${question}"
Trả lời:
`.trim();

  const ai = await geminiAnswer(studyPrompt);
  await logQuestion({ question, scope, mode: "ai_study", matched_faq_id: null });

  return NextResponse.json({
    mode: "ai_study",
    answer: ai,
    faq: { file_urls: [] },
    scope,
  });
}
