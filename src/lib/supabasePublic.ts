// src/lib/supabasePublic.ts
import { createClient } from "@supabase/supabase-js";

// Ưu tiên SUPABASE_URL, nếu không có thì dùng NEXT_PUBLIC_SUPABASE_URL (đúng file .env của bạn)
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

// Ưu tiên SUPABASE_ANON_KEY (nếu bạn đặt), nếu không có thì dùng NEXT_PUBLIC_SUPABASE_ANON_KEY
const anonKey =
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    "supabaseUrl is required. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env"
  );
}

if (!anonKey) {
  throw new Error(
    "SUPABASE_ANON_KEY is required. Set SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env"
  );
}

// Client public chỉ dùng để signInWithPassword (không dùng service role)
export const supabasePublic = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
