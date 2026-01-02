// src/app/api/admin/auth/login/route.ts
// Login bằng Supabase Auth (email/password) thay cho tài khoản trong .env

import { NextResponse } from "next/server";
import { setAdminSessionCookie, type AdminRole } from "@/lib/adminAuth";
import { supabasePublic } from "@/lib/supabasePublic";

export const runtime = "nodejs";

function normalizeRole(raw: unknown): AdminRole | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "admin") return "admin";
  // "user" là cán bộ văn phòng (office)
  if (s === "user" || s === "office" || s === "staff") return "office";
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    // Backward-compatible: UI cũ gửi username/password
    const email = String(body?.email || body?.username || "").trim();
    const password = String(body?.password || "").trim();

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Thiếu email (hoặc username) hoặc mật khẩu." },
        { status: 400 }
      );
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.user) {
      const msg = String(error?.message || "");
      if (msg.toLowerCase().includes("email not confirmed")) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Email chưa được xác thực (Email not confirmed). Vào Supabase Dashboard để Confirm email, hoặc chạy script set-role (có auto confirm).",
          },
          { status: 401 }
        );
      }
      // Trả message chung để không lộ user tồn tại hay không
      return NextResponse.json(
        { ok: false, error: "Sai email hoặc mật khẩu." },
        { status: 401 }
      );
    }

    const user = data.user as any;

    const roleFromApp = normalizeRole(user?.app_metadata?.role);
    const roleFromUser = normalizeRole(user?.user_metadata?.role);
    const role: AdminRole | null = roleFromApp || roleFromUser;

    if (!role) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tài khoản chưa được cấp quyền. Nhờ admin gán role = admin hoặc user trong app_metadata (khuyến nghị) hoặc user_metadata.",
        },
        { status: 403 }
      );
    }

    const displayUser = String(user?.email || user?.id || email);

    const res = NextResponse.json({ ok: true, user: displayUser, role });
    setAdminSessionCookie(res, displayUser, role);
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Login failed" },
      { status: 500 }
    );
  }
}
