import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

// ✅ đúng đường dẫn từ src/app/api/admin/import/run -> src/lib
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { geminiEmbed } from "../../../../../lib/geminiEmbedding";
import { verifyToken, getCookieName } from "../../../../../lib/adminAuth";

export const runtime = "nodejs";

type Row = {
  nhom?: string;
  cau_hoi?: string;
  tra_loi?: string;
  keywords?: string;
  status?: string;
  file_urls?: string | string[];
};

function parseFileUrls(v: any): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);

  const s = String(v).trim();
  if (!s) return [];
  // chấp nhận: "path1, path2" hoặc "path1; path2" hoặc xuống dòng
  return s
    .split(/[,;\n]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function norm(s: any) {
  return String(s ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    // --- Auth (cookie admin) ---
    const token = req.cookies.get(getCookieName())?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // --- Read file from multipart/form-data ---
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });

    if (!rows.length) return NextResponse.json({ inserted: 0, failed: 0, errors: [] });

    const errors: any[] = [];
    let inserted = 0;

    for (const r of rows) {
      const nhom = norm(r.nhom);
      const cau_hoi = norm(r.cau_hoi);
      const tra_loi = norm(r.tra_loi);
      const keywords = norm(r.keywords || "");
      const status = norm(r.status || "published") || "published";
      const file_urls = parseFileUrls((r as any).file_urls ?? (r as any).file_urls_text ?? "");

      if (!cau_hoi || !tra_loi) {
        errors.push({ cau_hoi, error: "Thiếu cau_hoi hoặc tra_loi" });
        continue;
      }

      // embedding từ câu hỏi (có thể đổi sang cau_hoi + tra_loi nếu muốn)
      const embedding = await geminiEmbed(cau_hoi);

      const { error } = await supabaseAdmin.from("faq").insert({
        nhom: nhom || null,
        cau_hoi,
        tra_loi,
        keywords: keywords || null,
        status,
        embedding,
        file_urls,
      });

      if (error) {
        errors.push({ cau_hoi, error: error.message });
      } else {
        inserted++;
      }
    }

    return NextResponse.json({
      inserted,
      failed: errors.length,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
