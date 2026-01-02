// src/app/api/admin/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { clearAdminSessionCookie, verifyAdminSession } from "@/lib/adminAuth";
import { auditAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = verifyAdminSession(req);

  const res = NextResponse.json({ ok: true });
  clearAdminSessionCookie(res);

  await auditAdminAction(req, {
    action: "logout",
    ok: true,
    actor: s?.user || null,
    role: s?.role || null,
  });

  return res;
}
