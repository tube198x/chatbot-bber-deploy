// src/app/api/admin/faq/detach/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";
import { auditAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = verifyAdminSession(req);
  if (!s || (s.role !== "admin" && s.role !== "office")) {
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

    const { error } = await supabaseAdmin
      .from("faq_attachments")
      .delete()
      .eq("faq_id", faq_id)
      .eq("attachment_id", attachment_id);

    if (error) {
      await auditAdminAction(req, { action: "faq_detach", ok: false, actor: s.user, role: s.role, error: error.message, meta: { faq_id, attachment_id } });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await auditAdminAction(req, { action: "faq_detach", ok: true, actor: s.user, role: s.role, meta: { faq_id, attachment_id } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await auditAdminAction(req, { action: "faq_detach", ok: false, actor: s.user, role: s.role, error: e?.message || "Detach failed", meta: { faq_id: faq_id || null, attachment_id: attachment_id || null } });
    return NextResponse.json({ error: e?.message || "Detach failed" }, { status: 500 });
  }
}
