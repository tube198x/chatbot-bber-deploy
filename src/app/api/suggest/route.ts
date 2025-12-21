import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { geminiEmbed } from "../../../lib/geminiEmbedding";


function normalizeQ(q: string) {
  return q.trim().replace(/\s+/g, " ");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("q") || "";
  const q = normalizeQ(raw);

  if (q.length < 2) return NextResponse.json({ suggestions: [], mode: "none" });

  // 1) Semantic suggest
  try {
    const emb = await geminiEmbed(q);
    const { data, error } = await supabaseAdmin.rpc("match_faq", {
      query_embedding: emb,
      match_count: 5,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      return NextResponse.json({
        mode: "semantic",
        suggestions: data.map((x: any) => ({
          id: x.id,
          cau_hoi: x.cau_hoi,
          nhom: x.nhom,
          score: x.score,
        })),
      });
    }
  } catch {
    // ignore and fallback
  }

  // 2) Fallback keyword
  const { data: fallback } = await supabaseAdmin
    .from("faq")
    .select("id,cau_hoi,nhom")
    .eq("status", "published")
    .ilike("cau_hoi", `%${q}%`)
    .limit(5);

  return NextResponse.json({
    mode: "keyword",
    suggestions: (fallback || []).map((x) => ({
      id: x.id,
      cau_hoi: x.cau_hoi,
      nhom: x.nhom,
      score: null,
    })),
  });
}
