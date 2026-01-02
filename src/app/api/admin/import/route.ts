import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geminiEmbed } from "@/lib/geminiEmbedding";
import { verifyToken, getCookieName } from "@/lib/adminAuth";

export const runtime = "nodejs";

function parseFileUrls(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  // Cho phép: "path1, path2" hoặc "path1; path2" hoặc xuống dòng
  return s
    .split(/[,;\n]/g)
    .map(t => t.trim())
    .filter(Boolean);
}

function norm(s: any) {
  return String(s ?? "").trim();
}

function toRows(sheetRows: any[]) {
  // Accept both Vietnamese and some aliases
  const out: Array<{
    nhom: string;
    cau_hoi: string;
    tra_loi: string;
    keywords: string;
    file_urls: string[];
    scope: string; // noi_bo | hoc_tap
  }> = [];

  for (const r of sheetRows) {
    const nhom = norm(r.nhom ?? r.NHOM ?? r.Nhom ?? r.group ?? r.Group);
    const cau_hoi = norm(r.cau_hoi ?? r["câu_hỏi"] ?? r["cau hoi"] ?? r.question ?? r.Question);
    const tra_loi = norm(r.tra_loi ?? r["trả_lời"] ?? r["tra loi"] ?? r.answer ?? r.Answer);
    const keywords = norm(r.keywords ?? r.tu_khoa ?? r["từ_khóa"] ?? "");
    const file_urls = parseFileUrls(r.file_urls ?? r.file_url ?? r.files ?? "");
    const scope = norm(r.scope ?? r.pham_vi ?? r["phạm_vi"] ?? "noi_bo") || "noi_bo";

    if (!nhom || !cau_hoi || !tra_loi) {
      continue;
    }
    out.push({ nhom, cau_hoi, tra_loi, keywords, file_urls, scope });
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    // Auth (Admin/Office)
    const cookie = req.cookies.get(getCookieName())?.value || "";
    const token = cookie || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    const claims = verifyToken(token);
    if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
    const rows = toRows(rawRows);

    if (!rows.length) {
      return NextResponse.json({ error: "Không tìm thấy dòng hợp lệ. Cần cột: nhom, cau_hoi, tra_loi" }, { status: 400 });
    }

    let inserted = 0;
    let failed = 0;
    const details: any[] = [];

    for (const r of rows) {
      try {
        // 1) insert faq
        const { data: faq, error: insErr } = await supabaseAdmin
          .from("faq")
          .insert({
            nhom: r.nhom,
            cau_hoi: r.cau_hoi,
            tra_loi: r.tra_loi,
            keywords: r.keywords || null,
            status: "published",
            file_urls: r.file_urls,
          })
          .select("id")
          .single();

        if (insErr) throw insErr;

        // 2) embedding cho semantic suggest
        const textForEmbed = `Nhóm: ${r.nhom}\nHỏi: ${r.cau_hoi}\nĐáp: ${r.tra_loi}\nTừ khóa: ${r.keywords || ""}`.trim();
        const emb = await geminiEmbed(textForEmbed);

        const { error: upErr } = await supabaseAdmin
          .from("faq")
          .update({ embedding: emb })
          .eq("id", faq.id);

        if (upErr) throw upErr;

        inserted++;
        details.push({ cau_hoi: r.cau_hoi, ok: true, id: faq.id });
      } catch (e: any) {
        failed++;
        details.push({ cau_hoi: r.cau_hoi, ok: false, error: e?.message || String(e) });
      }
    }

    return NextResponse.json({ inserted, failed, details });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
