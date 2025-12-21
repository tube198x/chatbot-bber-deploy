import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

// ====== KIỂM TRA ENV (BẮT BUỘC) ======
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ Missing GEMINI_API_KEY");
  process.exit(1);
}

// ====== INIT SUPABASE ======
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ====== GEMINI EMBEDDING ======
async function embed(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
      }),
    }
  );

  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.embedding.values;
}

// ====== MAIN ======
async function main() {
  const { data, error } = await supabase
    .from("faq")
    .select("id, cau_hoi")
    .is("embedding", null);

  if (error) throw error;

  console.log(`🔄 Found ${data.length} FAQ need embedding`);

  for (const row of data) {
    const vector = await embed(row.cau_hoi);

    await supabase
      .from("faq")
      .update({ embedding: vector })
      .eq("id", row.id);

    console.log(`✅ Embedded: ${row.cau_hoi}`);
  }

  console.log("🎉 Done backfill embeddings");
}

main().catch(console.error);
