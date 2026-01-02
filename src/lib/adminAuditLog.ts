// src/lib/adminAuditLog.ts
// TODO #4: Log thao tác admin
// Chủ đích: KHÔNG phụ thuộc schema DB (không cần tạo bảng), ưu tiên ổn định.
// - Ghi log ra file local dạng NDJSON (mỗi dòng là 1 JSON) trong: .local_logs/admin_audit.ndjson
// - Nếu ghi log lỗi: NUỐT lỗi (không làm crash API)

import fs from "fs/promises";
import path from "path";
import type { NextRequest } from "next/server";

export type AdminAuditEvent = {
  t: string; // ISO timestamp
  action: string;
  ok: boolean;
  actor: string | null;
  role: string | null;
  ip: string | null;
  user_agent: string | null;
  meta: any | null;
  error: string | null;
};

export function getReqIp(req: Request | NextRequest): string | null {
  try {
    const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const xr = req.headers.get("x-real-ip")?.trim();
    return xf || xr || null;
  } catch {
    return null;
  }
}

export function getReqUa(req: Request | NextRequest): string | null {
  try {
    return req.headers.get("user-agent") || null;
  } catch {
    return null;
  }
}

export function getAdminAuditFilePath() {
  const dir = path.join(process.cwd(), ".local_logs");
  const file = path.join(dir, "admin_audit.ndjson");
  return { dir, file };
}

async function appendLine(filePath: string, line: string) {
  try {
    const { dir } = getAdminAuditFilePath();
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(filePath, line, { encoding: "utf8" });
  } catch {
    // nuốt lỗi
  }
}

export async function writeAdminAudit(event: AdminAuditEvent) {
  const { file } = getAdminAuditFilePath();
  const line = JSON.stringify(event) + "\n";
  await appendLine(file, line);
}

/**
 * auditAdminAction(req, input)
 * Dùng ở các API admin: upload, attach, import, login/logout...
 */
export async function auditAdminAction(
  req: Request | NextRequest | null,
  input: {
    action: string;
    ok: boolean;
    actor?: string | null;
    role?: string | null;
    meta?: any;
    error?: string | null;
  }
) {
  try {
    const ev: AdminAuditEvent = {
      t: new Date().toISOString(),
      action: String(input.action || "").trim() || "unknown",
      ok: !!input.ok,
      actor: input.actor ? String(input.actor) : null,
      role: input.role ? String(input.role) : null,
      ip: req ? getReqIp(req) : null,
      user_agent: req ? getReqUa(req) : null,
      meta: input.meta ?? null,
      error: input.error ? String(input.error) : null,
    };

    await writeAdminAudit(ev);
  } catch {
    // nuốt lỗi
  }
}
