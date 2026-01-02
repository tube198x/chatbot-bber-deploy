// src/app/api/admin/ai/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminAuth";
import { auditAdminAction } from "@/lib/adminAuditLog";
import { groqChatJson } from "@/lib/groqGenerate";

export const runtime = "nodejs";

function requireOfficeOrAdmin(req: NextRequest) {
  const s = verifyAdminSession(req);
  const role = s ? String((s as any).role) : "";
  if (!s) return null;
  if (role !== "admin" && role !== "office" && role !== "user") return null;
  return { s, role };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function cleanItem(x: any) {
  const nhom = (x?.nhom ?? "").toString().trim();
  const cau_hoi = (x?.cau_hoi ?? "").toString().trim();
  const tra_loi = (x?.tra_loi ?? "").toString().trim();
  const status = (x?.status ?? "draft").toString().trim() || "draft";
  return { nhom: nhom || null, cau_hoi, tra_loi, status };
}

export async function POST(req: NextRequest) {
  const auth = requireOfficeOrAdmin(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { s, role } = auth;

  try {
    const body: any = await req.json();
    const nhom = String(body?.nhom || "").trim();
    const count = clamp(Number(body?.count || 20), 1, 200);
    const tone = String(body?.tone || "van_phong").trim();
    const text = String(body?.text || "").trim();

    if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

    // safety cap: extremely long text -> trim (model context is large, but keep stable)
    const MAX_CHARS = 220_000;
    const usedText = text.length > MAX_CHARS ? (text.slice(0, MAX_CHARS) + "\n\n[...TRUNCATED...]") : text;
    const truncated = text.length > MAX_CHARS;

    const system = [
      "Bạn là cán bộ văn phòng của trường, chuyên biên soạn bộ Câu hỏi/Trả lời (FAQ) cho HSSV.",
      "Mục tiêu: tạo câu hỏi rõ ràng, dễ hỏi; câu trả lời chuẩn văn phong hành chính, hướng dẫn theo bước b1/b2/b3.",
      "Không bịa link, không bịa số liệu. Nếu tài liệu không nêu rõ, ghi: 'Theo quy định hiện hành của Trường, bạn liên hệ ...' (ngắn gọn).",
      "Bắt buộc xuất ra JSON hợp lệ, không kèm markdown.",
    ].join(" ");

    const styleHint =
      tone === "ngan"
        ? "Trả lời ngắn gọn 2-4 câu; ưu tiên bullet."
        : "Trả lời rõ ràng, có thể 4-8 câu; nếu là thủ tục thì bắt đầu bằng b1/b2/b3.";

    const user = [
      `Hãy đọc nội dung dưới đây và tạo đúng ${count} câu hỏi/trả lời.`,
      nhom ? `Mặc định nhom='${nhom}' cho tất cả mục (nếu phù hợp).` : "Nếu có thể, tự đặt nhom theo nội dung (vd: Học vụ, CT HSSV, Tài chính...).",
      "Đầu ra JSON có dạng:",
      '{ "items": [ { "nhom": "…", "cau_hoi": "…?", "tra_loi": "…", "status": "draft|published" } ], "note": "…" }',
      "Yêu cầu chất lượng:",
      "- Câu hỏi không trùng nhau.",
      "- Ưu tiên các câu hỏi thực tế: thủ tục, hồ sơ, thời gian, nơi nộp, liên hệ.",
      "- Nếu nhắc đến biểu mẫu/tài liệu: nêu tên biểu mẫu (không tự bịa đường link).",
      "",
      "NỘI DUNG:",
      usedText,
    ].join("\n");

    const data = await groqChatJson(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: process.env.GROQ_GEN_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.2,
        maxCompletionTokens: 8192,
        jsonMode: true,
      }
    );

    const itemsRaw = Array.isArray(data?.items) ? data.items : [];
    let items = itemsRaw.map(cleanItem).filter((x) => x.cau_hoi && x.tra_loi);

    // fallback nhom
    if (nhom) items = items.map((x) => ({ ...x, nhom: nhom }));

    // de-dup by question
    const seen = new Set<string>();
    items = items.filter((x) => {
      const k = x.cau_hoi.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // cap to requested count
    items = items.slice(0, count);

    await auditAdminAction(req, {
      action: "ai_generate",
      ok: true,
      actor: s.user,
      role: role as any,
      meta: { requested: count, returned: items.length, nhom: nhom || null, truncated },
    });

    return NextResponse.json({ ok: true, items, note: data?.note || "", truncated });
  } catch (e: any) {
    await auditAdminAction(req, {
      action: "ai_generate",
      ok: false,
      actor: s.user,
      role: role as any,
      error: e?.message || "Generate failed",
    });
    return NextResponse.json({ error: e?.message || "Generate failed" }, { status: 500 });
  }
}
