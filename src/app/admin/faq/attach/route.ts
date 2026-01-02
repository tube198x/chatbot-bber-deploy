import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyToken, getCookieName } from "@/lib/adminAuth";

export const runtime = "nodejs";

function getToken(req: NextRequest) {
  return req.cookies.get(getCookieName())?.value || "";
}

async function requireAdmin(req: NextRequest) {
  const secret = process.env.ADMIN_AUTH_SECRET || "";
  const token = getToken(req);
  if (!secret || !token) return null;
  return await verifyToken(token, secret);
}

export async function POST(req: NextRequest) {
  const payload = await requireAdmin(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const faq_id = String(body?.faq_id || "").trim();
    const attachment_id = String(body?.attachment_id || "").trim();
    const sort = Number(body?.sort || 1);

    if (!faq_id || !attachment_id) {
      return NextResponse.json({ error: "Missing faq_id or attachment_id" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("faq_attachments")
      .upsert({ faq_id, attachment_id, sort });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Attach failed" }, { status: 500 });
  }
}
