// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";

// IMPORTANT:
// Middleware chạy trên Edge Runtime => KHÔNG được import file nào có dùng Node modules (vd: 'crypto').
// Cookie name được "chốt" theo PROJECT_HANDOVER: admin_session.
const ADMIN_TOKEN_COOKIE = "admin_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");

  // Cho phép trang login + API login chạy tự do
  if (pathname === "/admin/login") return NextResponse.next();
  if (pathname === "/api/admin/auth/login") return NextResponse.next();

  // Chỉ bảo vệ /admin và /api/admin
  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  // Chỉ cần cookie tồn tại để vào UI/Admin routes.
  // Verify "thật" sẽ được làm ở các API route (node runtime) để ổn định và tránh edge limitation.
  const token = req.cookies.get(ADMIN_TOKEN_COOKIE)?.value;
  if (token) return NextResponse.next();

  // Nếu gọi API mà chưa login -> 401
  if (isAdminApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Nếu vào /admin mà chưa login -> redirect /admin/login
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
