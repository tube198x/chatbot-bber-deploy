// src/app/api/admin/ai/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminAuth";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

function requireOfficeOrAdmin(req: NextRequest) {
  const s = verifyAdminSession(req);
  const role = s ? String((s as any).role) : "";
  if (!s) return null;
  if (role !== "admin" && role !== "office" && role !== "user") return null;
  return true;
}

export async function POST(req: NextRequest) {
  if (!requireOfficeOrAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: any = await req.json().catch(() => ({}));
  const items = Array.isArray(body?.items) ? body.items : [];

  const rows: any[][] = [["nhom", "cau_hoi", "tra_loi", "status"]];
  for (const it of items) {
    rows.push([
      (it?.nhom ?? "") || "",
      String(it?.cau_hoi ?? ""),
      String(it?.tra_loi ?? ""),
      String(it?.status ?? "draft"),
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "faq");

  // XLSX.write(type:"buffer") returns a Node.js Buffer.
  // NextResponse expects a web-compatible BodyInit; in TypeScript, Buffer may not be assignable.
  // Convert to Uint8Array to satisfy BodyInit and keep runtime behavior identical.
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as unknown as Buffer;
  const fileName = `FAQ_import_ai_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
