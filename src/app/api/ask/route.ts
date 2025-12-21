import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { geminiEmbed } from "../../../lib/geminiEmbedding";
import { geminiAnswer } from "../../../lib/geminiAnswer";

function normalizeQ(q: string) {
  return q.trim().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  let question = "";
  try {
    const body = await req.json();
    question = normalizeQ(String(body?.question || ""));
  } catch {}

  if (question.length < 2) {
    return NextResponse.json({ error: "Question too short" }, { status: 400 });
  }

  const THRESHOLD = 0.78; // bạn có thể tinh chỉnh sau

  // 1) Ưu tiên FAQ theo semantic
  try {
    const emb = await geminiEmbed(question);
    const { data, error } = await supabaseAdmin.rpc("match_faq", {
      query_embedding: emb,
      match_count: 3,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      const best: any = data[0];
      if (typeof best.score === "number" && best.score >= THRESHOLD) {
        await supabaseAdmin.from("log_chat").insert({ question, source: "faq" });
        return NextResponse.json({
          mode: "faq",
          matched: {
            id: best.id,
            cau_hoi: best.cau_hoi,
            nhom: best.nhom,
            score: best.score
          },
          answer: best.tra_loi,
        });
      }
    }
  } catch {
    // rớt xuống AI
  }

  // 2) Gọi AI nếu không đủ giống
  let aiText = "";
  try {
    aiText = await geminiAnswer(question);
  } catch {
    aiText = "Hệ thống AI đang bận hoặc lỗi kết nối. Bạn vui lòng thử lại sau.";
  }

  await supabaseAdmin.from("log_chat").insert({ question, source: "ai" });
  return NextResponse.json({ mode: "ai", answer: aiText });
}
