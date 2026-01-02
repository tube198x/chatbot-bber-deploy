// src/lib/adminAuth.ts
// NOTE: File này CHỈ dùng trong Node runtime (API routes).
// Middleware chạy Edge Runtime KHÔNG được import file này vì có dùng 'crypto'.

import crypto from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type AdminRole = "admin" | "office";

export type AdminSession = {
  user: string; // thường là email
  role: AdminRole;
  iat: number;
};

export const ADMIN_TOKEN_COOKIE = "admin_session";

// Backward-compatible aliases (code cũ có thể đang dùng)
export const ADMIN_COOKIE_NAME = ADMIN_TOKEN_COOKIE;

export function getCookieName() {
  return ADMIN_TOKEN_COOKIE;
}

export function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 ngày
  };
}

function getSecret() {
  // Nếu chưa set env, vẫn có default để dev chạy không bị gãy.
  return process.env.ADMIN_AUTH_SECRET || "bb3r-admin-secret-2025-change-this";
}

function b64urlEncode(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecodeToString(input: string) {
  const pad = 4 - (input.length % 4 || 4);
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad === 4 ? 0 : pad);
  return Buffer.from(b64, "base64").toString("utf8");
}

function signWithSecret(payloadB64u: string, secret: string) {
  return b64urlEncode(crypto.createHmac("sha256", secret).update(payloadB64u).digest());
}

export function createAdminToken(session: AdminSession) {
  return createAdminTokenWithSecret(session, getSecret());
}

export function createAdminTokenWithSecret(session: AdminSession, secret: string) {
  const payload = b64urlEncode(JSON.stringify(session));
  const sig = signWithSecret(payload, secret);
  return `${payload}.${sig}`;
}

// ===== HỖ TRỢ 2 KIỂU TOKEN (để không làm bể hệ thống) =====
// 1) Signed token: "<base64url(payload)>.<base64url(hmac)>"
// 2) JSON raw: {"user":"admin","role":"admin"} (phiên bản cũ)
function tryParseJsonSession(raw: string): AdminSession | null {
  const s = String(raw || "").trim();
  if (!s) return null;

  if (!(s.startsWith("{") && s.endsWith("}"))) return null;

  try {
    const data = JSON.parse(s) as any;
    const user = String(data?.user || "").trim();
    const role = String(data?.role || "").trim() as AdminRole;

    if (!user) return null;
    if (role !== "admin" && role !== "office") return null;

    const iat = typeof data?.iat === "number" ? data.iat : 0;
    return { user, role, iat };
  } catch {
    return null;
  }
}

function verifySignedToken(rawToken: string, secret: string): AdminSession | null {
  const token = String(rawToken || "").trim();
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, sig] = parts;
  const expected = signWithSecret(payload, secret);

  // timingSafeEqual yêu cầu 2 buffer cùng length, nếu khác sẽ throw
  if (sig.length !== expected.length) return null;

  try {
    const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return null;

    const json = b64urlDecodeToString(payload);
    const data = JSON.parse(json) as any;

    const user = String(data?.user || "").trim();
    const role = String(data?.role || "").trim() as AdminRole;
    if (!user) return null;
    if (role !== "admin" && role !== "office") return null;

    const iat = typeof data?.iat === "number" ? data.iat : 0;
    return { user, role, iat };
  } catch {
    return null;
  }
}

/**
 * verifyToken(token, secret?)
 * - Hỗ trợ code cũ đang gọi: verifyToken(token) / verifyToken(token, secret) / await verifyToken(...)
 */
export function verifyToken(token: string, secret?: string): AdminSession | null {
  const raw = String(token || "").trim();
  if (!raw) return null;

  // ưu tiên JSON raw (cũ) để tránh bể
  const jsonSession = tryParseJsonSession(raw);
  if (jsonSession) return jsonSession;

  // signed token
  const sec = secret && String(secret).trim() ? String(secret).trim() : getSecret();
  return verifySignedToken(raw, sec);
}

/**
 * signAdminSession({ user, role })
 * - Alias cho createAdminToken (code cũ)
 */
export function signAdminSession(input: { user: string; role: AdminRole; iat?: number }) {
  const user = String((input as any)?.user || "").trim();
  const role = String((input as any)?.role || "").trim() as AdminRole;
  const iat = typeof (input as any)?.iat === "number" ? (input as any).iat : Date.now();

  if (!user) throw new Error("Missing user");
  if (role !== "admin" && role !== "office") throw new Error("Invalid role");

  return createAdminToken({ user, role, iat });
}

export function getAdminToken(req: NextRequest) {
  return req.cookies.get(ADMIN_TOKEN_COOKIE)?.value || null;
}

/**
 * verifyAdminSession(req)
 * - đọc cookie admin_session, verify signed hoặc JSON raw
 */
export function verifyAdminSession(req: NextRequest): AdminSession | null {
  const raw = getAdminToken(req);
  if (!raw) return null;

  // Nếu ADMIN_AUTH_SECRET có set thì ưu tiên dùng để verify.
  const envSecret = process.env.ADMIN_AUTH_SECRET || "";
  return verifyToken(raw, envSecret || undefined);
}

// alias để khỏi bể import cũ
export function getAdminFromCookies(req: NextRequest) {
  return verifyAdminSession(req);
}

// code cũ hay dùng tên này
export function readAdminSessionFromReq(req: NextRequest) {
  return verifyAdminSession(req);
}

export function setAdminSessionCookie(res: NextResponse, user: string, role: AdminRole) {
  const token = createAdminToken({ user, role, iat: Date.now() });
  res.cookies.set(ADMIN_TOKEN_COOKIE, token, getCookieOptions());
}

export function clearAdminSessionCookie(res: NextResponse) {
  res.cookies.set(ADMIN_TOKEN_COOKIE, "", { ...getCookieOptions(), maxAge: 0 });
}
