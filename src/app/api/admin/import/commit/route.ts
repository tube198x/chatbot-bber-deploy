import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { verifyToken, getCookieName } from "../../../../../lib/adminAuth";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { geminiEmbed } from "../../../../../lib/geminiEmbedding";

export const runtime = "nodejs";

function getToken(req: NextRequest) {
  return req.cookies.get(getCookieName())?.value || "";
}

async function requireAdmin(req: NextRequest) {
  const secret = process.env.ADMIN_AUTH_SECRET || "";
  const token = getToken(req);
  if (!secret || !token) return null;
  return await verifyToken(token, secret);
}

function norm(s: any) {
  return String(s ?? "").trim();
}

async function parseFile(file: File) {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = (file.name || "").toLowerCase();

  let rows: any[] = [];
  if (name.endsWith(".csv")) {
    const text = buf.toString("utf8");
    const wb = XLSX.read(text, { type: "string" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  } else {
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  }

  return rows
    .map((r) => ({
      nhom: norm(r.nhom || r.NHOM || r["Nhóm"]),
      cau_hoi: norm(r.cau_hoi || r.CAU_HOI || r["Câu hỏi"] || r["Cau hoi"]),
      tra_loi: norm(r.tra_loi || r.TRA_LOI || r["Trả lời"] || r["Tra loi"]),
      file_urls: norm(r.file_urls || r.FILE_URLS || r["File URLs"] || ""),
    }))
    .filter((x) => x.cau_hoi && x.tra_loi)
    .map((x) => ({
      ...x,
      file_urls: x.file_urls
        ? x.file_urls.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean)
        : [],
    }));
}

export async function POST(req: NextRequest) {
  const payload = await requireAdmin(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const items = await parseFile(file);

  // Insert + embedding (batch đơn giản)
  let ok = 0;
  const errors: any[] = [];

  for (const it of items) {
    try {
      const vec = await geminiEmbed(it.cau_hoi);
      const { error } = await supabaseAdmin.from("faq").insert({
        nhom: it.nhom || "",
        cau_hoi: it.cau_hoi,
        tra_loi: it.tra_loi,
        file_urls: it.file_urls,
        embedding: vec,
      });
      if (error) throw error;
      ok++;
    } catch (e: any) {
      errors.push({ cau_hoi: it.cau_hoi, error: String(e?.message || e) });
    }
  }

  return NextResponse.json({ total: items.length, inserted: ok, failed: errors.length, errors });
}
