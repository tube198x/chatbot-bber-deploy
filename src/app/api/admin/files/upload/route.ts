// src/app/api/admin/files/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";
import { auditAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";

const BUCKET = "faq-files";

function requireOfficeOrAdmin(req: NextRequest) {
  const s = verifyAdminSession(req);
  if (!s) return null;
  const role = String((s as any).role);
  if (role !== "office" && role !== "admin" && role !== "user") return null;
  return s;
}

function safeName(name: string) {
  // giữ chữ + số + khoảng trắng + . _ - ; thay còn lại bằng _
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length ? cleaned : "file";
}

export async function POST(req: NextRequest) {
  const s = requireOfficeOrAdmin(req);
  if (!s) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let file_path = "";
  let originalName = "";

  try {
    // 1) Nhận file từ FormData
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    originalName = safeName(file.name || "upload.bin");
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const ts = Date.now();

    // path lưu trong bucket: faq/YYYY-MM/<ts>_<originalName>
    file_path = `faq/${yyyy}-${mm}/${ts}_${originalName}`;

    // 2) Upload lên Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(file_path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (upErr) {
      await auditAdminAction(req, {
        action: "file_upload",
        ok: false,
        actor: s.user,
        role: (String((s as any).role) as any),
        error: upErr.message,
        meta: { file_name: originalName, file_path },
      });
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    // 3) Ghi DB attachments để lấy attachment_id
    // CHỐT: chỉ insert cột tối thiểu để không dính lỗi schema cache (size_bytes/content_type...)
    const { data: a, error: aErr } = await supabaseAdmin
      .from("attachments")
      .insert({ file_path, file_name: originalName })
      .select("id, file_path, file_name")
      .single();

    if (aErr) {
      await auditAdminAction(req, {
        action: "file_upload",
        ok: false,
        actor: s.user,
        role: (String((s as any).role) as any),
        error: aErr.message,
        meta: { file_name: originalName, file_path },
      });
      return NextResponse.json({ error: aErr.message }, { status: 500 });
    }

    await auditAdminAction(req, {
      action: "file_upload",
      ok: true,
      actor: s.user,
      role: (String((s as any).role) as any),
      meta: { file_name: originalName, file_path, attachment_id: a?.id },
    });

    // 4) Trả về cho UI
    return NextResponse.json({
      ok: true,
      path: file_path,
      attachment_id: a.id,
      attachment: a,
    });
  } catch (e: any) {
    await auditAdminAction(req, {
      action: "file_upload",
      ok: false,
      actor: s.user,
      role: (String((s as any).role) as any),
      error: e?.message || "Upload failed",
      meta: { file_name: originalName || null, file_path: file_path || null },
    });

    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
