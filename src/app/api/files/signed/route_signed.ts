import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from("faq-files")
    .createSignedUrl(path, 900); // 15 phút

  if (error || !data) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
