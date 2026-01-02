// scripts/supabase-fix-user.mjs
// Usage:
//   node scripts/supabase-fix-user.mjs <email> <role:admin|user> <new_password>
//
// Script local (server-only): dùng SUPABASE_SERVICE_ROLE_KEY để:
// - tìm user theo email trong Supabase Auth
// - set app_metadata.role = admin|user
// - confirm email
// - đặt lại password (để chắc chắn đúng)

import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  if (fs.existsSync(".env.local")) {
    dotenv.config({ path: ".env.local" });
    return ".env.local";
  }
  if (fs.existsSync(".env")) {
    dotenv.config({ path: ".env" });
    return ".env";
  }
  return "(none)";
}

function env(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : "";
}

async function findUserByEmail(sb, email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    const hit = users.find(
      (u) => String(u.email || "").toLowerCase() === email.toLowerCase()
    );
    if (hit) return hit;

    if (users.length < perPage) break;
    page++;
  }
  return null;
}

async function main() {
  const loaded = loadEnv();

  const email = String(process.argv[2] || "").trim();
  const role = String(process.argv[3] || "").trim().toLowerCase();
  const newPassword = String(process.argv[4] || "").trim();

  if (!email || !role || !newPassword) {
    console.log("Usage:");
    console.log("  node scripts/supabase-fix-user.mjs <email> <admin|user> <new_password>");
    process.exit(1);
  }
  if (role !== "admin" && role !== "user") throw new Error("Role must be admin|user");
  if (newPassword.length < 6) throw new Error("Password too short (>= 6 chars).");

  const url = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const user = await findUserByEmail(sb, email);
  if (!user) throw new Error(`User not found in THIS project: ${email}`);

  const nextAppMeta = { ...(user.app_metadata || {}), role };

  const { data, error } = await sb.auth.admin.updateUserById(user.id, {
    password: newPassword,
    email_confirm: true,
    app_metadata: nextAppMeta,
  });

  if (error) throw error;

  console.log("✅ OK");
  console.log("Loaded env from:", loaded);
  console.log("Supabase URL:", url);
  console.log("User ID:", data.user.id);
  console.log("Email:", data.user.email);
  console.log("app_metadata:", data.user.app_metadata);
  console.log("email_confirmed_at:", data.user.email_confirmed_at);
}

main().catch((e) => {
  console.error("❌ ERROR:", e?.message || e);
  process.exit(1);
});
