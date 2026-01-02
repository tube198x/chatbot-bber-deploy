// src/app/api/admin/logs/chat/route.ts
// TODO #3: Log chat (thống kê) - đọc từ bảng Supabase: log_chat

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function clampInt(v: any, min: number, max: number, fallback: number) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function toDayKey(t: any) {
  try {
    const ms = Date.parse(String(t || ""));
    if (!Number.isFinite(ms)) return "(unknown)";
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return "(unknown)";
  }
}

function normStr(v: any) {
  const s = String(v ?? "").trim();
  return s;
}

export async function GET(req: NextRequest) {
  const s = verifyAdminSession(req);
  if (!s || (s.role !== "admin" && s.role !== "office")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = clampInt(searchParams.get("limit"), 1, 2000, 400);
  const days = clampInt(searchParams.get("days"), 1, 3650, 7);
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // 1) Query log_chat
  // - ưu tiên lọc theo created_at nếu có
  // - nếu lỗi (vd thiếu cột created_at), fallback: lấy limit gần nhất
  let rows: any[] = [];

  // try A: created_at + filter
  {
    const res = await supabaseAdmin
      .from("log_chat")
      .select("*")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!res.error && Array.isArray(res.data)) {
      rows = res.data as any[];
    }
  }

  // try B: created_at order only
  if (!rows.length) {
    const res = await supabaseAdmin
      .from("log_chat")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!res.error && Array.isArray(res.data)) {
      rows = res.data as any[];
    }
  }

  // try C: id order
  if (!rows.length) {
    const res = await supabaseAdmin
      .from("log_chat")
      .select("*")
      .order("id", { ascending: false })
      .limit(limit);

    if (!res.error && Array.isArray(res.data)) {
      rows = res.data as any[];
    }
  }

  // try D: no order
  if (!rows.length) {
    const res = await supabaseAdmin.from("log_chat").select("*").limit(limit);
    if (res.error) {
      return NextResponse.json({
        error: `Không đọc được log_chat: ${res.error.message}`,
      }, { status: 500 });
    }
    rows = Array.isArray(res.data) ? (res.data as any[]) : [];
  }

  // 2) Normalize + filter by q in JS (ổn định, không phụ thuộc cột)
  const items = rows
    .map((r) => {
      const created_at = r?.created_at || r?.t || r?.time || r?.timestamp || null;
      const source = normStr(r?.source || r?.mode || "");
      const question = normStr(r?.question || "");
      const faq_id = r?.faq_id ?? null;
      const scope = normStr(r?.scope || "");
      const ip = normStr(r?.ip || "");
      const user_agent = normStr(r?.user_agent || r?.ua || "");
      const attachment_count = typeof r?.attachment_count === "number" ? r.attachment_count : null;

      return {
        created_at,
        day: toDayKey(created_at),
        source: source || "(unknown)",
        scope: scope || "(unknown)",
        question,
        faq_id,
        ip: ip || null,
        user_agent: user_agent || null,
        attachment_count,
        raw: r,
      };
    })
    .filter((x) => {
      if (!q) return true;
      const hay = JSON.stringify({
        source: x.source,
        scope: x.scope,
        question: x.question,
        faq_id: x.faq_id,
        ip: x.ip,
      }).toLowerCase();
      return hay.includes(q);
    });

  // 3) Stats
  const by_source: Record<string, number> = {};
  const by_day: Record<string, number> = {};
  const by_day_source: Record<string, Record<string, number>> = {};
  const by_faq: Record<string, number> = {};
  const by_question: Record<string, number> = {};
  const ips = new Set<string>();

  for (const it of items) {
    const src = it.source || "(unknown)";
    by_source[src] = (by_source[src] || 0) + 1;

    const day = it.day || "(unknown)";
    by_day[day] = (by_day[day] || 0) + 1;

    by_day_source[day] = by_day_source[day] || {};
    by_day_source[day][src] = (by_day_source[day][src] || 0) + 1;

    const fid = it.faq_id ? String(it.faq_id) : "(none)";
    by_faq[fid] = (by_faq[fid] || 0) + 1;

    const qText = (it.question || "").trim();
    if (qText) by_question[qText] = (by_question[qText] || 0) + 1;

    if (it.ip) ips.add(it.ip);
  }

  const topFaq = Object.entries(by_faq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([faq_id, count]) => ({ faq_id, count }));

  const topQuestions = Object.entries(by_question)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([question, count]) => ({ question, count }));

  const daysSorted = Object.keys(by_day).sort();
  const byDay = daysSorted.map((day) => ({
    day,
    count: by_day[day],
    by_source: by_day_source[day] || {},
  }));

  return NextResponse.json({
    items: items.slice(0, limit),
    stats: {
      total: items.length,
      unique_ip: ips.size,
      by_source,
      by_day: byDay,
      top_faq: topFaq,
      top_questions: topQuestions,
    },
  });
}
