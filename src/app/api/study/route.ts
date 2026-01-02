import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    const q = String(question || "").trim();
    if (!q) return NextResponse.json({ answer: "Bạn chưa nhập câu hỏi." });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { answer: "Chưa cấu hình OPENAI_API_KEY nên chưa dùng được Tra cứu học tập (AI)." },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    // Cấu hình an toàn: trả lời ngắn gọn, đúng trọng tâm
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Bạn là trợ lý học tập cho sinh viên. Trả lời ngắn gọn, rõ ràng, có bước làm nếu là câu hỏi thao tác. Nếu thiếu dữ kiện, hỏi lại đúng 1-2 câu.",
        },
        { role: "user", content: q },
      ],
    });

    const answer = resp.choices?.[0]?.message?.content?.trim() || "Chưa có câu trả lời.";
    return NextResponse.json({ mode: "study", answer });
  } catch (e: any) {
    return NextResponse.json({ answer: `Lỗi AI: ${e?.message || "unknown"}` }, { status: 500 });
  }
}
