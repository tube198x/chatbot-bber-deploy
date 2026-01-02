import { createClient } from "@supabase/supabase-js";

// Ưu tiên SUPABASE_URL, nếu không có thì dùng NEXT_PUBLIC_SUPABASE_URL (đúng file .env của bạn)
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "supabaseUrl is required. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env"
  );
}

if (!serviceRoleKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is required. Set it in .env"
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
