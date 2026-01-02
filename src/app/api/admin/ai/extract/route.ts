// src/app/api/admin/ai/extract/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminAuth";
import { auditAdminAction } from "@/lib/adminAuditLog";
import { extractTextFromFile } from "@/lib/textExtract";

export const runtime = "nodejs";

function requireOfficeOrAdmin(req: NextRequest) {
  const s = verifyAdminSession(req);
  const role = s ? String((s as any).role) : "";
  if (!s) return null;
  if (role !== "admin" && role !== "office" && role !== "user") return null;
  return { s, role };
}

type JobStateInput =
  | { ok: true; status: "running"; progress: number; message: string; detail?: any }
  | { ok: true; status: "done"; progress: number; message: string; result: any; detail?: any }
  | { ok: false; status: "error"; progress: number; message: string; detail?: any };

type JobState = JobStateInput & { createdAt: number };

function jobs() {
  const g = globalThis as any;
  if (!g.__aiExtractJobs) g.__aiExtractJobs = new Map<string, JobState>();
  return g.__aiExtractJobs as Map<string, JobState>;
}

function makeId() {
  return "job_" + Date.now().toString(36) + "_" + Math.random().toString(16).slice(2);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function cleanup() {
  const m = jobs();
  const now = Date.now();
  for (const [id, st] of m.entries()) {
    // 30 phút
    if (now - st.createdAt > 30 * 60 * 1000) m.delete(id);
  }
}

export async function GET(req: NextRequest) {
  const auth = requireOfficeOrAdmin(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  cleanup();

  const jobId = req.nextUrl.searchParams.get("jobId") || "";
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

  const st = jobs().get(jobId);
  if (!st) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  return NextResponse.json(st);
}

export async function POST(req: NextRequest) {
  const auth = requireOfficeOrAdmin(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { s, role } = auth;

  try {
    const form = await req.formData();
    const files = form.getAll("file").filter((x) => x instanceof File) as File[];
    if (!files.length) return NextResponse.json({ error: "Missing file" }, { status: 400 });

    const useJob = String(form.get("job") || "") === "1";

    // OCR đã tắt mặc định khi deploy production (tránh lỗi build do native dependencies).
    // Nếu client vẫn gửi ocr=1 thì lib/textExtract sẽ trả về hướng dẫn (không OCR).
    const ocr = String(form.get("ocr") || "0") === "1";
    const ocrMaxPages = clamp(Number(form.get("ocrMaxPages") || 6), 1, 200);
    const ocrPages = String(form.get("ocrPages") || "").trim(); // validated in lib
    const ocrLangs = String(process.env.OCR_LANGS || "vie+eng");
    const ocrLangPath = String(process.env.OCR_LANG_PATH || "https://tessdata.projectnaptha.com/4.0.0");

    // ===== Sync mode (legacy) =====
    if (!useJob) {
      const results: any[] = [];
      const texts: string[] = [];

      for (const f of files) {
        const buffer = Buffer.from(await f.arrayBuffer());
        const r = await extractTextFromFile(f.name, f.type || "", buffer, {
          ocr,
          ocrMaxPages,
          ocrPages,
          ocrLangs,
          ocrLangPath,
        });
        results.push(r);
        if (r.ok && r.text) texts.push(`===== FILE: ${f.name} =====\n${r.text}`);
      }

      const combinedText = texts.join("\n\n");
      const resp = { ok: true, results, combinedText, combinedChars: combinedText.length };

      await auditAdminAction(req, {
        action: "ai_extract",
        ok: true,
        actor: s.user,
        role: role as any,
        meta: { files: results.map((x) => ({ name: x.fileName, ok: x.ok, chars: (x.text || "").length })) },
      });

      return NextResponse.json(resp);
    }

    // ===== Job mode (with progress) =====
    // NOTE: đọc buffer ngay tại request để đảm bảo background job vẫn có dữ liệu ổn định.
    const filePayloads = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        type: f.type || "",
        buffer: Buffer.from(await f.arrayBuffer()),
      }))
    );

    const jobId = makeId();
    const m = jobs();
    const createdAt = Date.now();

    const setState = (st: JobStateInput) => {
      m.set(jobId, { ...st, createdAt } as JobState);
    };

    setState({ ok: true, status: "running", progress: 0, message: "Đang khởi tạo..." });

    setTimeout(async () => {
      try {
        const results: any[] = [];
        const texts: string[] = [];

        let doneFiles = 0;
        const totalFiles = filePayloads.length;

        for (const f of filePayloads) {
          setState({
            ok: true,
            status: "running",
            progress: totalFiles ? doneFiles / totalFiles : 0,
            message: `Đang đọc file: ${f.name}`,
            detail: { fileName: f.name, phase: "start_file", doneFiles, totalFiles },
          });

          const r = await extractTextFromFile(f.name, f.type, f.buffer, {
            ocr,
            ocrMaxPages,
            ocrPages,
            ocrLangs,
            ocrLangPath,
            onProgress: (p) => {
              if (p.phase === "pdf_ocr_page") {
                setState({
                  ok: true,
                  status: "running",
                  progress: totalFiles ? (doneFiles + p.page / Math.max(1, p.total)) / totalFiles : 0,
                  message: `OCR: ${p.fileName} · trang ${p.page}/${p.total}`,
                  detail: { ...p, doneFiles, totalFiles },
                });
              }
            },
          });

          results.push(r);
          if (r.ok && r.text) texts.push(`===== FILE: ${f.name} =====\n${r.text}`);

          doneFiles++;
          setState({
            ok: true,
            status: "running",
            progress: totalFiles ? doneFiles / totalFiles : 1,
            message: `Xong file: ${f.name}`,
            detail: {
              fileName: f.name,
              phase: "done_file",
              doneFiles,
              totalFiles,
              ok: r.ok,
              chars: (r.text || "").length,
            },
          });
        }

        const combinedText = texts.join("\n\n");
        const resp = { ok: true, results, combinedText, combinedChars: combinedText.length };

        setState({ ok: true, status: "done", progress: 1, message: "Hoàn tất", result: resp });

        await auditAdminAction(req, {
          action: "ai_extract",
          ok: true,
          actor: s.user,
          role: role as any,
          meta: { jobId, files: results.map((x) => ({ name: x.fileName, ok: x.ok, chars: (x.text || "").length })) },
        });
      } catch (e: any) {
        setState({ ok: false, status: "error", progress: 1, message: e?.message || "Extract failed" });

        await auditAdminAction(req, {
          action: "ai_extract",
          ok: false,
          actor: s.user,
          role: role as any,
          error: e?.message || "Extract failed",
          meta: { jobId },
        });
      }
    }, 0);

    return NextResponse.json({ ok: true, jobId });
  } catch (e: any) {
    await auditAdminAction(req, {
      action: "ai_extract",
      ok: false,
      actor: auth.s.user,
      role: auth.role as any,
      error: e?.message || "Extract failed",
    });
    return NextResponse.json({ error: e?.message || "Extract failed" }, { status: 500 });
  }
}
