export async function geminiEmbed(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_EMBED_MODEL || "text-embedding-004";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
  });

  if (!resp.ok) throw new Error(await resp.text());

  const data: any = await resp.json();
  const values = data?.embedding?.values;

  if (!Array.isArray(values) || values.length !== 768) {
    throw new Error(`Embedding dimension mismatch. Got ${values?.length}`);
  }
  return values as number[];
}