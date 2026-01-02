// src/app/api/admin/import/preview/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { verifyAdminSession } from "@/lib/adminAuth";

export const runtime = "nodejs";

function norm(s: any) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = (obj as any)[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

type RowOut = {
  __row: number; // excel row number (starts at 2)
  nhom: string;
  cau_hoi: string;
  tra_loi: string;
  status: string;
  __error?: string; // validation error (if any)
};

export async function POST(req: NextRequest) {
  const s = verifyAdminSession(req);
  if (!s || (s.role !== "admin" && s.role !== "office")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });

    // lấy sheet đầu tiên
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

    // chuẩn hóa header
    const rows = json.map((r) => {
      const o: any = {};
      for (const [k, v] of Object.entries(r)) o[norm(k)] = v;
      return o;
    });

    const errors: { row: number; message: string }[] = [];
    const sample: any[] = [];
    const outRows: RowOut[] = [];
    let valid = 0;

    rows.forEach((r, i) => {
      const excelRow = i + 2;
      const nhom = String(pick(r, ["nhom", "group", "category"])).trim();
      const cau_hoi = String(pick(r, ["cau_hoi", "question", "q"])).trim();
      const tra_loi = String(pick(r, ["tra_loi", "answer", "a"])).trim();
      const status = String(pick(r, ["status"])).trim() || "";

      const missing: string[] = [];
      if (!cau_hoi) missing.push("cau_hoi");
      if (!tra_loi) missing.push("tra_loi");

      const rowOut: RowOut = {
        __row: excelRow,
        nhom,
        cau_hoi,
        tra_loi,
        status,
      };

      if (missing.length) {
        const msg = `Thiếu cột bắt buộc: ${missing.join(", ")}`;
        errors.push({ row: excelRow, message: msg });
        rowOut.__error = msg;
      } else {
        valid++;
        if (sample.length < 20) {
          sample.push({
            nhom: nhom || null,
            cau_hoi,
            tra_loi,
            status: status || "",
          });
        }
      }

      outRows.push(rowOut);
    });

    const total = rows.length;
    const invalid = total - valid;

    return NextResponse.json({
      total,
      valid,
      invalid,
      errors,
      sample,
      rows: outRows,
      note: "Template mới KHÔNG dùng file_urls. File đính kèm được upload và gắn qua attachments + faq_attachments.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Preview failed" }, { status: 500 });
  }
}
