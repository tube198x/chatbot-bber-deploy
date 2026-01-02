// src/app/api/admin/logs/admin/route.ts
// TODO #4: Đọc log thao tác admin (đọc từ file local)

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminAuth";
import { getAdminAuditFilePath, type AdminAuditEvent } from "@/lib/adminAuditLog";
import fs from "fs/promises";

export const runtime = "nodejs";

function clampInt(v: any, min: number, max: number, fallback: number) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function matchQuery(ev: AdminAuditEvent, q: string) {
  if (!q) return true;
  const hay = JSON.stringify({
    action: ev.action,
    actor: ev.actor,
    role: ev.role,
    ok: ev.ok,
    error: ev.error,
    meta: ev.meta,
    ip: ev.ip,
    user_agent: ev.user_agent,
  }).toLowerCase();
  return hay.includes(q);
}

export async function GET(req: NextRequest) {
  const s = verifyAdminSession(req);
  if (!s || (s.role !== "admin" && s.role !== "office")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = clampInt(searchParams.get("limit"), 1, 2000, 200);
  const days = clampInt(searchParams.get("days"), 1, 3650, 30);
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const { file } = getAdminAuditFilePath();
  let content = "";

  try {
    content = await fs.readFile(file, "utf8");
  } catch {
    return NextResponse.json({
      items: [],
      stats: { total: 0, ok: 0, error: 0, by_action: {}, by_actor: {} },
      note: "Chưa có log admin. Hãy thử thực hiện vài thao tác (upload/attach/import) rồi refresh.",
    });
  }

  const lines = content.split("\n").filter(Boolean);

  const items: AdminAuditEvent[] = [];
  const by_action: Record<string, number> = {};
  const by_actor: Record<string, number> = {};
  let okCount = 0;
  let errCount = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    if (items.length >= limit) break;
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const ev = JSON.parse(line) as AdminAuditEvent;
      if (!ev?.t || !ev?.action) continue;

      const tMs = Date.parse(ev.t);
      if (Number.isFinite(tMs) && tMs < sinceMs) continue;

      if (!matchQuery(ev, q)) continue;

      items.push(ev);

      const a = String(ev.action || "unknown");
      by_action[a] = (by_action[a] || 0) + 1;

      const u = String(ev.actor || "(unknown)");
      by_actor[u] = (by_actor[u] || 0) + 1;

      if (ev.ok) okCount++;
      else errCount++;
    } catch {
      // ignore bad line
    }
  }

  return NextResponse.json({
    items,
    stats: {
      total: items.length,
      ok: okCount,
      error: errCount,
      by_action,
      by_actor,
    },
  });
}
