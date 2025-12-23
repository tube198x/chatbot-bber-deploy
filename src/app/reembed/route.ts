import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geminiEmbed } from "@/lib/geminiEmbedding";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const secret = body?.secret;
    if (secret !== process.env.REEMBED_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const faqId = body?.id;
    const cauHoi = body?.cau_hoi;
    const traLoi = body?.tra_loi;

    if (!faqId || !cauHoi) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const embedding = await geminiEmbed(`${cauHoi}\n${traLoi ?? ""}`);

    await supabaseAdmin
      .from("faq")
      .update({ embedding })
      .eq("id", faqId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
