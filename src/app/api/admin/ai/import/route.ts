// src/app/api/admin/ai/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geminiEmbed } from "@/lib/geminiEmbedding";
import { verifyAdminSession } from "@/lib/adminAuth";
import { auditAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";

function requireOfficeOrAdmin(req: NextRequest) {
  const s = verifyAdminSession(req);
  const role = s ? String((s as any).role) : "";
  if (!s) return null;
  if (role !== "admin" && role !== "office" && role !== "user") return null;
  return { s, role };
}

function cleanStr(x: any) {
  return String(x ?? "").trim();
}

export async function POST(req: NextRequest) {
  const auth = requireOfficeOrAdmin(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { s, role } = auth;

  try {
    const body: any = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return NextResponse.json({ error: "No items" }, { status: 400 });
    if (items.length > 400) return NextResponse.json({ error: "Too many items (max 400)" }, { status: 400 });

    let inserted = 0;
    const errors: any[] = [];
    const insertedItems: { row: number; id?: string; cau_hoi?: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const nhom = cleanStr(items[i]?.nhom) || null;
      const q = cleanStr(items[i]?.cau_hoi);
      const a = cleanStr(items[i]?.tra_loi);

      if (!q || !a) {
        errors.push({ row: i + 2, message: "Thiếu cau_hoi hoặc tra_loi", cau_hoi: q });
        continue;
      }

      try {
        const embedding = await geminiEmbed(q);

        const ins = await supabaseAdmin
          .from("faq")
          .insert({ cau_hoi: q, tra_loi: a, nhom, embedding })
          .select("id")
          .single();

        if (ins.error) throw ins.error;

        inserted++;
        insertedItems.push({ row: i + 2, id: ins.data?.id, cau_hoi: q });
      } catch (e: any) {
        errors.push({ row: i + 2, message: e?.message || "Insert failed", cau_hoi: q });
      }
    }

    const result = {
      ok: errors.length === 0,
      inserted,
      failed: errors.length,
      inserted_items: insertedItems,
      errors,
      note: "Import AI dùng cùng pipeline embedding như hệ thống hiện tại. File đính kèm gắn qua /api/admin/faq/attach.",
    };

    await auditAdminAction(req, {
      action: "ai_import",
      ok: result.ok,
      actor: s.user,
      role: role as any,
      meta: { inserted, failed: result.failed },
    });

    return NextResponse.json(result);
  } catch (e: any) {
    await auditAdminAction(req, {
      action: "ai_import",
      ok: false,
      actor: s.user,
      role: role as any,
      error: e?.message || "AI import failed",
    });
    return NextResponse.json({ error: e?.message || "AI import failed" }, { status: 500 });
  }
}
