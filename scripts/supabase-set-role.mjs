// scripts/supabase-set-role.mjs
// Usage:
//   node scripts/supabase-set-role.mjs admin@domain.com admin
//   node scripts/supabase-set-role.mjs office@domain.com user
//
// Script chạy LOCAL, dùng service_role key (server-only).
// Nó sẽ:
// - tìm user theo email trong Supabase Auth
// - set app_metadata.role = 'admin' | 'user'
// - confirm email (email_confirm=true) để login không bị chặn

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envLocal = path.resolve(process.cwd(), ".env.local");
  const env = path.resolve(process.cwd(), ".env");

  if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal });
    return ".env.local";
  }
  if (fs.existsSync(env)) {
    dotenv.config({ path: env });
    return ".env";
  }
  return "(none)";
}

function getEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : "";
}

async function findUserByEmail(admin, email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    const hit = users.find((u) => String(u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

async function main() {
  const loaded = loadEnv();

  const email = String(process.argv[2] || "").trim();
  const role = String(process.argv[3] || "").trim().toLowerCase();

  if (!email || !role) {
    console.log("Usage:");
    console.log("  node scripts/supabase-set-role.mjs admin@domain.com admin");
    console.log("  node scripts/supabase-set-role.mjs office@domain.com user");
    process.exit(1);
  }
  if (role !== "admin" && role !== "user") {
    throw new Error("Role must be 'admin' or 'user'");
  }

  const url =
    getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  const supabaseAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const user = await findUserByEmail(supabaseAdmin, email);
  if (!user) throw new Error(`User not found: ${email}`);

  const current = user.app_metadata || {};
  const nextMeta = { ...current, role };

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    app_metadata: nextMeta,
    email_confirm: true,
  });

  if (error) throw error;

  console.log("✅ OK");
  console.log("Loaded env from:", loaded);
  console.log("User:", data?.user?.id);
  console.log("Email:", data?.user?.email);
  console.log("app_metadata:", data?.user?.app_metadata);
  console.log("email_confirmed_at:", data?.user?.email_confirmed_at);
}

main().catch((e) => {
  console.error("❌ ERROR:", e?.message || e);
  process.exit(1);
});
