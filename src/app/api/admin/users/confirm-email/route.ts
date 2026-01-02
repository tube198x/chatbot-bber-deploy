// src/app/api/admin/users/confirm-email/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminAuth";
import { supabaseAuthAdmin } from "@/lib/supabaseAuthAdmin";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest) {
  const s = verifyAdminSession(req);
  if (!s) return null;
  if (s.role !== "admin") return null;
  return s;
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const user_id = String(body?.user_id || "").trim();
  if (!user_id) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  const { error } = await supabaseAuthAdmin.auth.admin.updateUserById(user_id, {
    email_confirm: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
