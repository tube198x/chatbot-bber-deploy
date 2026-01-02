// src/app/api/admin/faq/attach/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";
import { auditAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = verifyAdminSession(req);
  if (!s || (s.role !== "office" && s.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let faq_id = "";
  let attachment_id = "";

  try {
    const body = await req.json().catch(() => ({}));
    faq_id = String((body as any)?.faq_id || "").trim();
    attachment_id = String((body as any)?.attachment_id || "").trim();

    if (!faq_id || !attachment_id) {
      return NextResponse.json({ error: "Missing faq_id or attachment_id" }, { status: 400 });
    }

    // (tuỳ chọn) kiểm tra tồn tại, để trả lỗi rõ
    const { data: faq, error: e1 } = await supabaseAdmin
      .from("faq")
      .select("id")
      .eq("id", faq_id)
      .maybeSingle();

    if (e1) {
      await auditAdminAction(req, { action: "faq_attach", ok: false, actor: s.user, role: s.role, error: e1.message, meta: { faq_id, attachment_id } });
      return NextResponse.json({ error: e1.message }, { status: 500 });
    }
    if (!faq) {
      await auditAdminAction(req, { action: "faq_attach", ok: false, actor: s.user, role: s.role, error: "FAQ not found", meta: { faq_id, attachment_id } });
      return NextResponse.json({ error: "FAQ not found" }, { status: 404 });
    }

    const { data: att, error: e2 } = await supabaseAdmin
      .from("attachments")
      .select("id")
      .eq("id", attachment_id)
      .maybeSingle();

    if (e2) {
      await auditAdminAction(req, { action: "faq_attach", ok: false, actor: s.user, role: s.role, error: e2.message, meta: { faq_id, attachment_id } });
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
    if (!att) {
      await auditAdminAction(req, { action: "faq_attach", ok: false, actor: s.user, role: s.role, error: "Attachment not found", meta: { faq_id, attachment_id } });
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // tránh trùng: check trước rồi insert (KHÔNG cần unique constraint)
    const { data: existed, error: e3 } = await supabaseAdmin
      .from("faq_attachments")
      .select("faq_id,attachment_id")
      .eq("faq_id", faq_id)
      .eq("attachment_id", attachment_id)
      .maybeSingle();

    // PGRST116 = no rows found (tuỳ phiên bản). Nếu lỗi thật thì trả 500.
    if (e3 && (e3 as any).code !== "PGRST116") {
      await auditAdminAction(req, { action: "faq_attach", ok: false, actor: s.user, role: s.role, error: e3.message, meta: { faq_id, attachment_id } });
      return NextResponse.json({ error: e3.message }, { status: 500 });
    }

    if (existed) {
      await auditAdminAction(req, { action: "faq_attach", ok: true, actor: s.user, role: s.role, meta: { faq_id, attachment_id, result: "existed" } });
      return NextResponse.json({ ok: true, message: "Đã tồn tại liên kết (không cần gắn lại)." });
    }

    const { error: e4 } = await supabaseAdmin
      .from("faq_attachments")
      .insert({ faq_id, attachment_id });

    if (e4) {
      await auditAdminAction(req, { action: "faq_attach", ok: false, actor: s.user, role: s.role, error: e4.message, meta: { faq_id, attachment_id } });
      return NextResponse.json({ error: e4.message }, { status: 500 });
    }

    await auditAdminAction(req, { action: "faq_attach", ok: true, actor: s.user, role: s.role, meta: { faq_id, attachment_id, result: "inserted" } });

    return NextResponse.json({ ok: true, message: "OK: Đã gắn file vào câu hỏi." });
  } catch (e: any) {
    await auditAdminAction(req, {
      action: "faq_attach",
      ok: false,
      actor: s.user,
      role: s.role,
      error: e?.message || "Attach failed",
      meta: { faq_id: faq_id || null, attachment_id: attachment_id || null },
    });

    return NextResponse.json({ error: e?.message || "Attach failed" }, { status: 500 });
  }
}
