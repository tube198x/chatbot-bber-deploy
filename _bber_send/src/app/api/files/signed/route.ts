import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = (searchParams.get("path") || "").trim();
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  // Hết hạn 24 giờ. Muốn 7 ngày: 604800
  const expiresIn = 86400;

  const { data, error } = await supabaseAdmin.storage
    .from("faq-files")
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || "Cannot sign" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, expiresIn });
}
