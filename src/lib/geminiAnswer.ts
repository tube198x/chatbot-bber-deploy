export async function geminiAnswer(question: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_CHAT_MODEL || "gemini-1.5-flash";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const system = [
    "Bạn là trợ lý học tập cho sinh viên Trường Cao đẳng Công nghệ cao Đồng Nai.",
    "Trả lời ngắn gọn, rõ ràng, đúng trình độ cao đẳng.",
    "Không bịa số liệu; nếu không chắc quy định, hướng dẫn liên hệ phòng chức năng."
  ].join(" ");

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${system}\n\nCâu hỏi: ${question}` }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 512 }
    }),
  });

  if (!resp.ok) throw new Error(await resp.text());

  const data: any = await resp.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
  return text.trim() || "Hiện tôi chưa trả lời được. Bạn hãy hỏi lại ngắn gọn hơn.";
}
