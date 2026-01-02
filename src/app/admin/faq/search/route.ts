import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyToken, getCookieName } from "@/lib/adminAuth";

export const runtime = "nodejs";

function getToken(req: NextRequest) {
  return req.cookies.get(getCookieName())?.value || "";
}

async function requireAdmin(req: NextRequest) {
  const secret = process.env.ADMIN_AUTH_SECRET || "";
  const token = getToken(req);
  if (!secret || !token) return null;
  return await verifyToken(token, secret);
}

export async function GET(req: NextRequest) {
  const payload = await requireAdmin(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ items: [] });

  const { data, error } = await supabaseAdmin
    .from("faq")
    .select("id,cau_hoi,nhom,status")
    .ilike("cau_hoi", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}
