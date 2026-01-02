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

function safeText(s: any) {
  return String(s || "").trim();
}

function uniqByQuestion(items: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of items) {
    const q = safeText(it?.cau_hoi || it?.question || "");
    const key = q.toLowerCase();
    if (!q) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

const MAX_CHARS = 120_000;

export async function POST(req: NextRequest) {
  const auth = requireOfficeOrAdmin(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { s, role } = auth;

  try {
    const body = await req.json().catch(() => ({}));
    const text = safeText(body?.text);
    const nhom = safeText(body?.nhom);
    const count = clamp(Number(body?.count || 20), 1, 200);
    const tone = (body?.tone === "ngan" ? "ngan" : "van_phong") as "ngan" | "van_phong";

    if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

    const input = text.length > MAX_CHARS ? safeText(text.slice(0, MAX_CHARS) + "\n\n[...TRUNCATED...]") : text;
    const truncated = text.length > MAX_CHARS;

    const system = [
      "Bạn là cán bộ văn phòng của Trường, chuyên biên soạn bộ Câu hỏi/Trả lời (FAQ) cho HSSV.",
      "Mục tiêu: câu hỏi rõ ràng, dễ hỏi; câu trả lời chuẩn văn phong hành chính, hướng dẫn theo bước.",
      "Nguyên tắc bắt buộc:",
      "- Không bịa link, không bịa số liệu/đơn vị/địa điểm/chi phí nếu tài liệu không nêu.",
      "- Nếu thiếu thông tin: trả lời ngắn gọn 'Theo quy định hiện hành của Trường, bạn liên hệ bộ phận phụ trách để được hướng dẫn.'",
      "- Không kèm markdown. Chỉ xuất JSON hợp lệ.",
    ].join("\n");

    const styleHint =
      tone === "ngan"
        ? [
            "Phong cách: ngắn gọn 2–4 câu.",
            "Nếu là thủ tục: dùng bullet ngắn.",
          ].join("\n")
        : [
            "Phong cách: văn phòng, rõ ràng.",
            "Nếu là thủ tục/hồ sơ: trình bày b1/b2/b3; có thể thêm mục 'Hồ sơ', 'Nơi nộp', 'Thời gian' nếu tài liệu nêu rõ.",
            "Tránh dài dòng.",
          ].join("\n");

    const outputSchema = '{ "items": [ { "nhom": "…", "cau_hoi": "…?", "tra_loi": "…", "status": "draft|published" } ], "note": "…" }';

    const user = [
      `Hãy đọc nội dung dưới đây và tạo đúng ${count} câu hỏi/trả lời (FAQ).`,
      nhom
        ? `Mặc định nhom="${nhom}" cho tất cả mục (nếu hợp lý).`
        : "Nếu không có nhom cố định: tự đặt nhom theo nội dung (vd: Học vụ, CT HSSV, Tài chính...).",
      styleHint,
      "Đầu ra JSON có dạng:",
      outputSchema,
      "Yêu cầu chất lượng:",
      "- Câu hỏi không trùng nhau.",
      "- Ưu tiên câu hỏi thực tế: thủ tục, hồ sơ, thời gian, nơi nộp, liên hệ, biểu mẫu.",
      "- Nếu nhắc đến biểu mẫu/tài liệu: nêu tên biểu mẫu (không tự bịa đường link).",
      "",
      "NỘI DUNG:",
      input,
    ].join("\n");

    const payload = await groqChatJson(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.15, maxCompletionTokens: 4096, jsonMode: true }
    );

    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    let items = uniqByQuestion(rawItems).slice(0, count);

    // normalize fields
    items = items
      .map((it: any) => ({
        nhom: safeText(it?.nhom || nhom || "") || null,
        cau_hoi: safeText(it?.cau_hoi),
        tra_loi: safeText(it?.tra_loi),
        status: safeText(it?.status) || "draft",
      }))
      .filter((x: any) => x.cau_hoi && x.tra_loi)
      .map((x: any) => ({ ...x, status: x.status === "published" ? "published" : "draft" }));

    const note = safeText(payload?.note);

    await auditAdminAction(req, {
      action: "ai_generate",
      ok: true,
      actor: s.user,
      role: role as any,
      meta: { countRequested: count, countReturned: items.length, truncated, tone, nhom: nhom || null },
    });

    return NextResponse.json({ ok: true, items, note, truncated });
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
