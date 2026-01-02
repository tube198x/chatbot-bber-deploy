// src/lib/supabaseAuthAdmin.ts
// Server-only Supabase client for Auth Admin APIs (requires service_role key).
// Do NOT import this file in client components.

import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

if (!url) {
  throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
}
if (!serviceKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

export const supabaseAuthAdmin = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
