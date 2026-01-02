// src/app/api/admin/users/set-role/route.ts
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
  const role = String(body?.role || "").trim().toLowerCase();

  if (!user_id || !role) {
    return NextResponse.json({ error: "Missing user_id or role" }, { status: 400 });
  }
  if (role !== "admin" && role !== "user") {
    return NextResponse.json({ error: "role must be admin|user" }, { status: 400 });
  }

  // Load current user to merge app_metadata (keep providers/provider, etc.)
  const { data: got, error: gErr } = await supabaseAuthAdmin.auth.admin.getUserById(user_id);
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  const currentAppMeta = got?.user?.app_metadata || {};
  const nextAppMeta = { ...currentAppMeta, role };

  const { data, error } = await supabaseAuthAdmin.auth.admin.updateUserById(user_id, {
    app_metadata: nextAppMeta,
    email_confirm: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    user_id,
    role,
    app_metadata: data?.user?.app_metadata || nextAppMeta,
  });
}
