import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/** Cache RAM 1–5 phút */
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 phút (có thể tăng 300k = 5 phút)
const cache = new Map<string, { exp: number; data: any }>();

/** Rate limit nhẹ */
type Hit = { ts: number[] };
const rl = new Map<string, Hit>();
const RL_WINDOW_MS = 60 * 1000;
const RL_LIMIT = 120;

function getKey(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  const cid = req.headers.get("x-bber-client-id") || "no-client";
  return `${ip}|${cid}`;
}

function rateLimit(req: NextRequest) {
  const key = getKey(req);
  const now = Date.now();
  const hit = rl.get(key) || { ts: [] };
  hit.ts = hit.ts.filter((t) => now - t < RL_WINDOW_MS);
  if (hit.ts.length >= RL_LIMIT) return false;
  hit.ts.push(now);
  rl.set(key, hit);
  return true;
}

export async function GET(req: NextRequest) {
  try {
    if (!rateLimit(req)) {
      return NextResponse.json({ items: [] }, { status: 429 });
    }

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ items: [] });

    const key = q.toLowerCase();
    const now = Date.now();

    const c = cache.get(key);
    if (c && c.exp > now) {
      return NextResponse.json(c.data, {
        headers: { "cache-control": "no-store" },
      });
    }

    // query
    const { data, error } = await supabaseAdmin
      .from("faq")
      .select("id,cau_hoi,nhom,status")
      .ilike("cau_hoi", `%${q}%`)
      .limit(30);

    if (error) throw error;

    const items = (data || [])
      .map((x: any) => ({
        id: x.id,
        cau_hoi: x.cau_hoi,
        nhom: x.nhom || null,
        status: x.status || null,
      }))
      .sort((a: any, b: any) => {
        const ap = String(a.status || "").toLowerCase() === "published" ? 0 : 1;
        const bp = String(b.status || "").toLowerCase() === "published" ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return String(a.cau_hoi || "").length - String(b.cau_hoi || "").length;
      })
      .slice(0, 10);

    const resp = { items };
    cache.set(key, { exp: now + CACHE_TTL_MS, data: resp });

    return NextResponse.json(resp, {
      headers: { "cache-control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message || "suggest failed" }, { status: 200 });
  }
}
