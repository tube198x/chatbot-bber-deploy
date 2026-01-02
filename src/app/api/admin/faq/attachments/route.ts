// src/app/api/admin/faq/attachments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";

export const runtime = "nodejs";

const BUCKET = "faq-files";
const TTL = 900; // 15 phút

function fileNameFromAnyPath(p: string) {
  const base = (p || "").split("/").pop() || p;
  const idx = base.indexOf("_");
  // bỏ prefix timestamp "<ts>_" nếu có
  if (idx > 0 && /^\d{8,}$/.test(base.slice(0, idx))) return base.slice(idx + 1);
  return base;
}

export async function GET(req: NextRequest) {
  try {
    // Auth: middleware đã chặn, nhưng vẫn check để trả 401 rõ ràng
    const s = verifyAdminSession(req);
    if (!s || (s.role !== "admin" && s.role !== "office")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const faq_id = String(searchParams.get("faq_id") || "").trim();
    if (!faq_id) {
      return NextResponse.json({ error: "Missing faq_id" }, { status: 400 });
    }

    // 1) Lấy danh sách attachment_id gắn với FAQ
    const { data: links, error: linkErr } = await supabaseAdmin
      .from("faq_attachments")
      .select("attachment_id")
      .eq("faq_id", faq_id);

    if (linkErr) {
      return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }

    const ids = (links || [])
      .map((x: any) => x?.attachment_id)
      .filter(Boolean) as string[];

    if (!ids.length) {
      return NextResponse.json({ items: [] });
    }

    // 2) Lấy thông tin file từ bảng attachments
    // NOTE: select các cột đang được dùng trong /api/ask để tránh đoán schema.
    const { data: attRows, error: attErr } = await supabaseAdmin
      .from("attachments")
      .select("id,file_path,file_name,original_name,path")
      .in("id", ids);

    if (attErr) {
      return NextResponse.json({ error: attErr.message }, { status: 500 });
    }

    const rows = Array.isArray(attRows) ? attRows : [];

    // 3) Chuẩn bị path để ký URL
    const paths = rows
      .map((r: any) => String(r?.file_path || r?.path || "").trim())
      .filter(Boolean);

    let urlMap = new Map<string, string>();
    if (paths.length) {
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrls(paths, TTL);

      if (signErr) {
        return NextResponse.json({ error: signErr.message }, { status: 500 });
      }

      (signed || []).forEach((x: any) => {
        if (x?.path && x?.signedUrl) urlMap.set(String(x.path), String(x.signedUrl));
      });
    }

    // 4) Trả về theo đúng thứ tự ids để UI ổn định
    const byId = new Map<string, any>();
    for (const r of rows) {
      if (r?.id) byId.set(String(r.id), r);
    }

    const items = ids
      .map((id) => {
        const r = byId.get(String(id));
        if (!r) return null;
        const p = String(r?.file_path || r?.path || "").trim();
        if (!p) return null;
        const url = urlMap.get(p) || "";
        const name =
          String(r?.file_name || "").trim() ||
          String(r?.original_name || "").trim() ||
          fileNameFromAnyPath(p);
        return { id: String(id), name, path: p, url };
      })
      .filter(Boolean);

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
