// src/app/api/admin/auth/login/route.ts
// Login bằng Supabase Auth (email/password)

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

function getProjectRef(url: string) {
  try {
    const u = new URL(url);
    // https://<ref>.supabase.co
    const host = u.hostname || "";
    return host.split(".")[0] || "";
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  const isDev = process.env.NODE_ENV !== "production";

  try {
    const body = await req.json().catch(() => ({} as any));
    const email = String(body?.email || body?.username || "").trim();
    const password = String(body?.password || "").trim();

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Thiếu email (hoặc username) hoặc mật khẩu." },
        { status: 400 }
      );
    }

    // ===== DEBUG: kiểm tra env (không log key) =====
    // supabasePublic thường dùng NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.
    const sbUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    if (isDev) {
      console.log("[admin-login] supabase project:", getProjectRef(String(sbUrl)));
      console.log("[admin-login] email:", email);
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.user) {
      const msg = String(error?.message || "");
      const status = (error as any)?.status;
      const code = (error as any)?.code;

      // Log ra terminal để chốt nguyên nhân
      console.error("[admin-login] Supabase error:", {
        message: msg,
        status,
        code,
      });

      if (msg.toLowerCase().includes("email not confirmed")) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Email chưa được xác thực (Email not confirmed). Vào Supabase Dashboard để Confirm email, hoặc chạy script set-role (có auto confirm).",
            ...(isDev ? { debug: { message: msg, status, code } } : {}),
          },
          { status: 401 }
        );
      }

      // DEV: trả debug để thấy nguyên nhân thật
      if (isDev) {
        return NextResponse.json(
          {
            ok: false,
            error: "Sai email hoặc mật khẩu. (Xem debug/terminal để biết lỗi thật)",
            debug: { message: msg, status, code },
          },
          { status: 401 }
        );
      }

      // PROD: message chung
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
      if (isDev) {
        console.warn("[admin-login] missing role:", {
          app_metadata: user?.app_metadata,
          user_metadata: user?.user_metadata,
        });
      }
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
    console.error("[admin-login] route exception:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Login failed" },
      { status: 500 }
    );
  }
}
