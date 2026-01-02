import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    if (q.length < 2) return NextResponse.json({ items: [] });

    const { data, error } = await supabaseAdmin
      .from("faq")
      .select("id,cau_hoi,nhom,status")
      .ilike("cau_hoi", `%${q}%`)
      .limit(8);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ưu tiên published (nếu có)
    const items = (data || [])
      .filter((x: any) => !x.status || String(x.status).toLowerCase() === "published")
      .map((x: any) => ({ id: x.id, cau_hoi: x.cau_hoi, nhom: x.nhom || null }));

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Suggest failed" }, { status: 500 });
  }
}
