// src/app/api/admin/import/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geminiEmbed } from "@/lib/geminiEmbedding";
import { verifyAdminSession } from "@/lib/adminAuth";
import { auditAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";

function norm(s: any) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

export async function POST(req: NextRequest) {
  const s = verifyAdminSession(req);
  if (!s || (s.role !== "admin" && s.role !== "office")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let fileName = "";
  let rows: any[] = [];
  let source: "xlsx" | "json" = "xlsx";

  try {
    const ct = String(req.headers.get("content-type") || "").toLowerCase();

    // 1) JSON mode: nhận items đã được sửa trực tiếp trên UI (/admin)
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({} as any));
      const items = body?.items;
      if (!Array.isArray(items)) {
        return NextResponse.json({ error: "Missing items (array) in JSON body" }, { status: 400 });
      }
      fileName = String(body?.fileName || "inline_edit.json");
      rows = items;
      source = "json";
    } else {
      // 2) Legacy XLSX upload mode (giữ tương thích 100%)
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing file" }, { status: 400 });
      }

      fileName = file.name || "";

      const buf = Buffer.from(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

      rows = json.map((r) => {
        const o: any = {};
        for (const [k, v] of Object.entries(r)) o[norm(k)] = v;
        return o;
      });
    }

    const inserted: any[] = [];
    const errors: any[] = [];
    let processed = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      const nhom = String(pick(r, ["nhom", "group", "category"])).trim();
      const q = String(pick(r, ["cau_hoi", "question", "q"])).trim();
      const a = String(pick(r, ["tra_loi", "answer", "a"])).trim();

      if (!q || !a) {
        errors.push({
          row: source === "xlsx" ? i + 2 : i + 1,
          message: `Thiếu cột bắt buộc: ${!q ? "cau_hoi" : ""}${!q && !a ? ", " : ""}${!a ? "tra_loi" : ""}`,
          cau_hoi: q || "",
        });
        continue;
      }

      try {
        const embedding = await geminiEmbed(q + "\n" + a);

        // insert faq
        const { data: insertedFaq, error: insErr } = await supabaseAdmin
          .from("faq")
          .insert({
            nhom: nhom || null,
            cau_hoi: q,
            tra_loi: a,
            status: "draft",
            embedding,
          })
          .select("id, nhom, cau_hoi, status")
          .single();

        if (insErr) throw insErr;

        inserted.push(insertedFaq);
        processed++;
      } catch (e: any) {
        errors.push({
          row: source === "xlsx" ? i + 2 : i + 1,
          message: e?.message || String(e),
          cau_hoi: q || "",
        });
      }
    }

    const result = {
      ok: true,
      file: fileName,
      source,
      total: rows.length,
      processed,
      inserted: inserted.length,
      errors,
      sample: inserted.slice(0, 10),
    };

    await auditAdminAction(req, {
      action: "import_run",
      ok: true,
      actor: s.user,
      role: s.role,
      meta: { file: fileName || null, source, total: rows.length, inserted: inserted.length, errors: errors.length },
    });

    return NextResponse.json(result);
  } catch (e: any) {
    await auditAdminAction(req, {
      action: "import_run",
      ok: false,
      actor: s.user,
      role: s.role,
      error: e?.message || "Run failed",
      meta: { file: fileName || null },
    });

    return NextResponse.json({ error: e?.message || "Run failed" }, { status: 500 });
  }
}
