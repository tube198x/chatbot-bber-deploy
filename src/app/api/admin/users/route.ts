// src/app/api/admin/users/route.ts
// GET: list users (admin only)
// POST: create user (admin only)

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

function pickRole(u: any): string {
  const r = String(u?.app_metadata?.role || u?.user_metadata?.role || "").trim().toLowerCase();
  if (r === "admin") return "admin";
  if (r === "user") return "user";
  if (r === "office") return "user";
  return "";
}

function safeEmail(x: any): string {
  return String(x || "").trim();
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const perPage = Math.min(200, Math.max(1, Number(searchParams.get("perPage") || "50")));
  const q = String(searchParams.get("q") || "").trim().toLowerCase();

  // Supabase admin listUsers is paginated by page/perPage.
  const { data, error } = await supabaseAuthAdmin.auth.admin.listUsers({ page, perPage });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = (data?.users || []).map((u: any) => ({
    id: u.id,
    email: u.email,
    role: pickRole(u),
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    email_confirmed_at: u.email_confirmed_at,
    banned_until: u.banned_until,
    providers: u.app_metadata?.providers || [],
    app_metadata: u.app_metadata || {},
    user_metadata: u.user_metadata || {},
  }));

  const filtered = q
    ? users.filter((u: any) => safeEmail(u.email).toLowerCase().includes(q))
    : users;

  return NextResponse.json({
    page,
    perPage,
    q,
    items: filtered,
    note: q ? "Filter is applied within the current page only." : "",
  });
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const email = String(body?.email || "").trim();
  const password = String(body?.password || "").trim();
  const role = String(body?.role || "").trim().toLowerCase();

  if (!email || !password) {
    return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
  }
  if (role && role !== "admin" && role !== "user") {
    return NextResponse.json({ error: "role must be admin|user" }, { status: 400 });
  }

  // 1) Create user
  const { data: created, error: cErr } = await supabaseAuthAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const user = created?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Create user failed" }, { status: 500 });
  }

  // 2) Set role to app_metadata if requested
  if (role) {
    const nextAppMeta = { ...(user.app_metadata || {}), role };
    const { error: uErr } = await supabaseAuthAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: nextAppMeta,
      email_confirm: true,
    });
    if (uErr) {
      // user created OK, but role set failed -> still return OK with warning
      return NextResponse.json({
        ok: true,
        user_id: user.id,
        warning: "User created but role set failed: " + uErr.message,
      });
    }
  }

  return NextResponse.json({ ok: true, user_id: user.id });
}
