import fetch from "node-fetch";

const API_KEY = process.env.GEMINI_API_KEY!;
const MODEL = process.env.GEMINI_EMBED_MODEL || "text-embedding-004";

export async function geminiEmbed(text: string): Promise<number[]> {
  if (!text || text.trim().length < 5) {
    throw new Error("Text too short for embedding");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] }
      })
    }
  );

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini embed error: ${t}`);
  }

  const json: any = await res.json();
  return json.embedding.values;
}
