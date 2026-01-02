// src/app/api/admin/login/route.ts
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, getCookieOptions, signAdminSession, type AdminRole } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username || "");
    const password = String(body?.password || "");

    const officeUser = process.env.ADMIN_OFFICE_USER || "office";
    const officePass = process.env.ADMIN_OFFICE_PASS || "Office@2025";
    const adminUser = process.env.ADMIN_ADMIN_USER || "admin";
    const adminPass = process.env.ADMIN_ADMIN_PASS || "Admin@2025";

    let role: AdminRole | null = null;

    if (username === adminUser && password === adminPass) role = "admin";
    else if (username === officeUser && password === officePass) role = "office";

    if (!role) {
      return NextResponse.json({ error: "Sai tài khoản hoặc mật khẩu." }, { status: 401 });
    }

    const token = signAdminSession({ role, user: username });

    const res = NextResponse.json({ ok: true, role, user: username });
    res.cookies.set(ADMIN_COOKIE_NAME, token, getCookieOptions());
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Login error" }, { status: 500 });
  }
}
