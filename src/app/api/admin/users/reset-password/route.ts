// src/app/api/admin/users/reset-password/route.ts
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
  const new_password = String(body?.new_password || "").trim();

  if (!user_id || !new_password) {
    return NextResponse.json({ error: "Missing user_id or new_password" }, { status: 400 });
  }
  if (new_password.length < 6) {
    return NextResponse.json({ error: "Password too short (>= 6 chars)" }, { status: 400 });
  }

  const { error } = await supabaseAuthAdmin.auth.admin.updateUserById(user_id, {
    password: new_password,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
