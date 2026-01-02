// src/app/api/admin/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readAdminSessionFromReq } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = readAdminSessionFromReq(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(s);
}
