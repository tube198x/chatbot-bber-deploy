// src/lib/textExtract.ts
// Utilities to extract text from PDF/DOCX/XLSX in Node runtime.
//
// IMPORTANT (deploy/Vercel):
// - OCR (scan-PDF) đã TẮT để tránh phụ thuộc native binaries (ví dụ @napi-rs/canvas, tesseract.js, pdfjs-dist)
//   vốn hay gây lỗi bundling/build trên Vercel/Turbopack.
// - Với PDF scan/không có text layer: trả về ok=false và hướng dẫn người dùng đổi sang PDF có text layer hoặc DOCX.

import * as XLSX from "xlsx";

export type ExtractProgress =
  | { phase: "start_file"; fileName: string; fileType: string }
  // Giữ lại phase này để tương thích code cũ (dù OCR đã tắt).
  | { phase: "pdf_ocr_page"; fileName: string; page: number; total: number }
  | { phase: "done_file"; fileName: string; ok: boolean; chars: number }
  | { phase: "message"; message: string };

export type ExtractOptions = {
  // Các option OCR giữ lại để tương thích request cũ. Nhưng OCR sẽ bị bỏ qua.
  ocr?: boolean;
  ocrMaxPages?: number;
  ocrPages?: string;
  ocrLangs?: string;
  ocrLangPath?: string;

  maxBytes?: number;
  onProgress?: (p: ExtractProgress) => void;
};

export type ExtractResult = {
  ok: boolean;
  fileName: string;
  fileType: string;
  text: string;
  notes: string[];
  meta?: any;
};

function safeTrim(s: string) {
  return String(s || "").replace(/\u0000/g, "").trim();
}

function getExt(fileName: string) {
  const m = /\.([a-z0-9]+)$/i.exec(fileName || "");
  return m ? m[1].toLowerCase() : "";
}

function guessKind(mime?: string) {
  return String(mime || "").toLowerCase();
}

function scanPdfNote(opts?: ExtractOptions) {
  // Nếu client vẫn gửi ocr=1 thì giải thích rõ.
  if (opts?.ocr) {
    return "PDF có vẻ là scan/không có text layer. OCR đã bị tắt khi deploy production (để tránh lỗi build do native dependencies). Vui lòng chuyển sang PDF có text layer hoặc DOCX.";
  }
  return "PDF có vẻ là scan/không có text layer. Hệ thống hiện không hỗ trợ OCR khi deploy production. Vui lòng chuyển sang PDF có text layer hoặc DOCX.";
}

export async function extractTextFromFile(
  fileName: string,
  fileType: string,
  buffer: Buffer,
  opts?: ExtractOptions
): Promise<ExtractResult> {
  const notes: string[] = [];
  const ext = getExt(fileName);
  const kind = guessKind(fileType);

  const maxBytes = opts?.maxBytes ?? 20 * 1024 * 1024;
  if (buffer.byteLength > maxBytes) {
    return {
      ok: false,
      fileName,
      fileType,
      text: "",
      notes: [`File quá lớn: ${buffer.byteLength} bytes`],
      meta: { maxBytes },
    };
  }

  opts?.onProgress?.({ phase: "start_file", fileName, fileType });

  try {
    // DOCX
    if (kind.includes("word") || ext === "docx") {
      const mammoth: any = await import("mammoth");
      const r = await mammoth.extractRawText({ buffer });
      const text = safeTrim(r?.value || "");
      opts?.onProgress?.({ phase: "done_file", fileName, ok: true, chars: text.length });
      return { ok: true, fileName, fileType: "docx", text, notes, meta: { chars: text.length } };
    }

    // XLSX
    if (kind.includes("sheet") || ext === "xlsx" || ext === "xls") {
      const wb = XLSX.read(buffer, { type: "buffer" });
      const out: string[] = [];
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(ws, { FS: "\t" });
        const block = safeTrim(csv);
        if (block) out.push(`=== SHEET: ${name} ===\n${block}`);
      }
      const text = out.join("\n\n");
      opts?.onProgress?.({ phase: "done_file", fileName, ok: true, chars: text.length });
      return { ok: true, fileName, fileType: "xlsx", text, notes, meta: { sheets: wb.SheetNames.length, chars: text.length } };
    }

    // PDF (TEXT LAYER ONLY)
    if (kind.includes("pdf") || ext === "pdf") {
      const pdfParseMod: any = await import("pdf-parse");
      const pdfParse = pdfParseMod?.default || pdfParseMod;

      const r: any = await pdfParse(buffer);
      const textLayer = safeTrim(r?.text || "");
      const pages = Number(r?.numpages || 0);

      if (textLayer && textLayer.length >= 40) {
        notes.push(`PDF text layer OK (pages=${pages || "?"}).`);
        opts?.onProgress?.({ phase: "done_file", fileName, ok: true, chars: textLayer.length });
        return {
          ok: true,
          fileName,
          fileType: "pdf",
          text: textLayer,
          notes,
          meta: { pages, scan: false, chars: textLayer.length },
        };
      }

      // Không OCR
      notes.push(scanPdfNote(opts));
      opts?.onProgress?.({ phase: "done_file", fileName, ok: false, chars: 0 });
      return { ok: false, fileName, fileType: "pdf", text: "", notes, meta: { pages, scan: true } };
    }

    opts?.onProgress?.({ phase: "done_file", fileName, ok: false, chars: 0 });
    return {
      ok: false,
      fileName,
      fileType,
      text: "",
      notes: ["Định dạng chưa hỗ trợ. Chỉ hỗ trợ PDF/DOCX/XLSX."],
      meta: { ext, kind },
    };
  } catch (e: any) {
    opts?.onProgress?.({ phase: "done_file", fileName, ok: false, chars: 0 });
    return {
      ok: false,
      fileName,
      fileType,
      text: "",
      notes: [`Lỗi extract: ${e?.message || String(e)}`],
      meta: { ext, kind },
    };
  }
}
