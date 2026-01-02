"use client";

import React, { useMemo, useRef, useState } from "react";
import { AdminShell } from "@/app/admin/_ui/AdminShell";

type ToastKind = "success" | "error" | "info";
type ToastState = { kind: ToastKind; message: string } | null;

type ExtractFileResult = {
  ok: boolean;
  fileName: string;
  fileType: string;
  text: string;
  notes: string[];
  meta?: any;
};

type ExtractResp = {
  ok: boolean;
  results: ExtractFileResult[];
  combinedText: string;
  combinedChars: number;
};

type ExtractJobState =
  | { ok: true; status: "running"; progress: number; message: string; detail?: any }
  | { ok: true; status: "done"; progress: number; message: string; result: ExtractResp }
  | { ok: false; status: "error"; progress: number; message: string };

type QAItem = {
  nhom?: string | null;
  cau_hoi: string;
  tra_loi: string;
  status?: string;
};

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast) return null;
  const bg = toast.kind === "success" ? "var(--okBg)" : toast.kind === "error" ? "var(--dangerBg)" : "#f7fbff";
  const bd = toast.kind === "success" ? "var(--okBorder)" : toast.kind === "error" ? "var(--dangerBorder)" : "#cfe3f6";

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        top: 16,
        zIndex: 50,
        minWidth: 280,
        maxWidth: 520,
        background: bg,
        border: `1px solid ${bd}`,
        borderRadius: 14,
        boxShadow: "0 14px 30px rgba(0,0,0,0.12)",
        padding: 12,
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, whiteSpace: "pre-wrap", fontWeight: 900 }}>{toast.message}</div>
        <button className="btn" onClick={onClose} style={{ padding: "6px 10px" }}>
          ✕
        </button>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function parseOcrPagesInput(s: string) {
  const v = (s || "").trim();
  if (!v) return "";
  // keep as-is; server will validate. Client only normalizes whitespace.
  return v.replace(/\s+/g, "");
}

export default function AdminAiGeneratePage() {
  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(kind: ToastKind, message: string, ms = 3600) {
    setToast({ kind, message });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), ms);
  }

  const [files, setFiles] = useState<File[]>([]);

  // OCR options
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [ocrMaxPages, setOcrMaxPages] = useState(6);
  const [ocrPages, setOcrPages] = useState(""); // e.g. "1-3,5,7"
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractJob, setExtractJob] = useState<ExtractJobState | null>(null);
  const [extractResp, setExtractResp] = useState<ExtractResp | null>(null);
  const [extractErr, setExtractErr] = useState("");

  const [nhom, setNhom] = useState("");
  const [count, setCount] = useState(20);
  const [tone, setTone] = useState<"van_phong" | "ngan">("van_phong");
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState("");
  const [items, setItems] = useState<QAItem[]>([]);
  const [truncated, setTruncated] = useState(false);

  // attachment upload (reuse existing endpoint)
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachErr, setAttachErr] = useState("");
  const [attachmentId, setAttachmentId] = useState("");

  // import
  const [importBusy, setImportBusy] = useState(false);
  const [importErr, setImportErr] = useState("");
  const [importResult, setImportResult] = useState<any>(null);

  const combinedText = extractResp?.combinedText || "";

  const canExtract = files.length > 0 && !extractBusy && !genBusy && !importBusy;
  const canGenerate = !!combinedText && items.length === 0 && !genBusy && !extractBusy && !importBusy;

  const stats = useMemo(() => {
    const okFiles = (extractResp?.results || []).filter((x) => x.ok).length;
    return {
      totalFiles: extractResp?.results?.length || 0,
      okFiles,
      chars: extractResp?.combinedChars || 0,
    };
  }, [extractResp]);

  async function pollJob(jobId: string) {
    for (;;) {
      const st = (await fetchJson(`/api/admin/ai/extract?jobId=${encodeURIComponent(jobId)}`)) as ExtractJobState;
      setExtractJob(st);

      if (!st.ok) {
        throw new Error(st.message || "Extract job failed");
      }

      if (st.status === "done") {
        setExtractResp(st.result);
        return;
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  }

  async function onExtract() {
    if (!files.length) return;

    setExtractErr("");
    setGenErr("");
    setImportErr("");
    setItems([]);
    setImportResult(null);
    setExtractResp(null);
    setExtractJob(null);
    setExtractBusy(true);

    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("file", f));
      fd.append("job", "1"); // enable progress job mode

      fd.append("ocr", ocrEnabled ? "1" : "0");
      fd.append("ocrMaxPages", String(clamp(ocrMaxPages, 1, 200)));
      fd.append("ocrPages", parseOcrPagesInput(ocrPages)); // server validates

      const created = await fetchJson("/api/admin/ai/extract", { method: "POST", body: fd });
      const jobId = String(created?.jobId || "");
      if (!jobId) throw new Error("Không tạo được jobId");

      showToast("info", "Đang trích xuất... (có progress)", 4500);
      await pollJob(jobId);
      showToast("success", "Trích xuất OK");
    } catch (e: any) {
      setExtractErr(`Lỗi: ${e?.message || String(e)}`);
      showToast("error", `Trích xuất lỗi: ${e?.message || String(e)}`);
    } finally {
      setExtractBusy(false);
    }
  }

  async function onGenerate() {
    if (!combinedText) return;
    setGenErr("");
    setImportErr("");
    setImportResult(null);
    setGenBusy(true);

    try {
      const data = await fetchJson("/api/admin/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: combinedText, nhom: nhom.trim(), count: clamp(count, 1, 200), tone }),
      });

      setItems(Array.isArray(data?.items) ? (data.items as QAItem[]) : []);
      setTruncated(!!data?.truncated);
      showToast("success", `Sinh Q/A OK: ${data?.items?.length || 0} dòng`);
    } catch (e: any) {
      setGenErr(`Lỗi: ${e?.message || String(e)}`);
      showToast("error", `Sinh Q/A lỗi: ${e?.message || String(e)}`);
    } finally {
      setGenBusy(false);
    }
  }

  function updateItem(i: number, patch: Partial<QAItem>) {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function addRow() {
    setItems((prev) => [...prev, { nhom: nhom.trim() || null, cau_hoi: "", tra_loi: "", status: "draft" }]);
  }

  function removeRow(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function normalizeAll() {
    setItems((prev) =>
      prev.map((x) => ({
        nhom: (x.nhom ?? nhom.trim() ?? "").toString().trim() || null,
        cau_hoi: (x.cau_hoi ?? "").toString().trim(),
        tra_loi: (x.tra_loi ?? "").toString().trim(),
        status: (x.status ?? "draft").toString().trim() || "draft",
      }))
    );
    showToast("success", "Đã chuẩn hoá khoảng trắng");
  }

  async function onDownloadXlsx() {
    try {
      const res = await fetch("/api/admin/ai/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `FAQ_import_ai_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("success", "Đã tải file XLSX");
    } catch (e: any) {
      showToast("error", `Export lỗi: ${e?.message || String(e)}`);
    }
  }

  async function onUploadAttachment() {
    if (!attachFile) return;
    setAttachErr("");
    setAttachBusy(true);
    setAttachmentId("");

    try {
      const fd = new FormData();
      fd.append("file", attachFile);
      const data = await fetchJson("/api/admin/files/upload", { method: "POST", body: fd });
      const id = String(data?.attachment_id || data?.attachment?.id || "");
      setAttachmentId(id);
      showToast("success", `Upload file OK (attachment_id=${id || "?"})`);
    } catch (e: any) {
      setAttachErr(`Lỗi: ${e?.message || String(e)}`);
      showToast("error", `Upload file lỗi: ${e?.message || String(e)}`);
    } finally {
      setAttachBusy(false);
    }
  }

  async function onImport() {
    setImportErr("");
    setImportBusy(true);
    try {
      const cleaned = items
        .map((x) => ({
          nhom: (x.nhom ?? nhom.trim() ?? "").toString().trim() || null,
          cau_hoi: (x.cau_hoi ?? "").toString().trim(),
          tra_loi: (x.tra_loi ?? "").toString().trim(),
          status: (x.status ?? "draft").toString().trim() || "draft",
        }))
        .filter((x) => x.cau_hoi && x.tra_loi);

      if (!cleaned.length) throw new Error("Danh sách rỗng (cần ít nhất 1 dòng hợp lệ)");

      const data = await fetchJson("/api/admin/ai/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cleaned }),
      });

      setImportResult(data);
      showToast("success", `Import OK: inserted=${data?.inserted || 0}, failed=${data?.failed || 0}`);
    } catch (e: any) {
      setImportErr(`Lỗi: ${e?.message || String(e)}`);
      showToast("error", `Import lỗi: ${e?.message || String(e)}`);
    } finally {
      setImportBusy(false);
    }
  }

  async function attachToImported() {
    if (!attachmentId) {
      showToast("error", "Chưa có attachment_id");
      return;
    }
    const inserted = Array.isArray(importResult?.inserted_items) ? importResult.inserted_items : [];
    if (!inserted.length) {
      showToast("error", "Chưa có danh sách FAQ đã import");
      return;
    }

    let ok = 0;
    let fail = 0;

    showToast("info", `Đang gắn file vào ${inserted.length} câu hỏi...`, 6000);

    for (const it of inserted) {
      const faq_id = it?.id;
      if (!faq_id) continue;
      try {
        await fetchJson("/api/admin/faq/attach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ faq_id, attachment_id: attachmentId }),
        });
        ok++;
      } catch {
        fail++;
      }
    }

    showToast("success", `Gắn file xong: OK=${ok}, Fail=${fail}`, 6000);
  }

  const jobView = extractJob?.ok && extractJob.status === "running" ? extractJob : null;
  const progressPct = jobView ? Math.round((jobView.progress || 0) * 100) : 0;

  return (
    <AdminShell
      title="AI tạo câu hỏi/trả lời"
      active="ai"
      subtitle={
        <>
          Upload PDF/DOCX/XLSX → Trích xuất (có OCR PDF scan) → Sinh Q/A bằng Groq → Sửa trực tiếp → Import.
        </>
      }
    >
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Step 1 */}
      <section className="card">
        <h2 style={{ margin: 0, fontSize: "clamp(16px, 1.8vw, 20px)", fontWeight: 900 }}>B1) Trích xuất nội dung</h2>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div className="grid2">
            <div>
              <div className="label">Chọn file (PDF/DOCX/XLSX)</div>
              <input
                className="input"
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const list = Array.from(e.target.files || []);
                  setFiles(list);
                  setExtractResp(null);
                  setExtractJob(null);
                  setExtractErr("");
                  setItems([]);
                  setImportResult(null);
                }}
              />
            </div>

            <div>
              <div className="label">OCR cho PDF scan</div>
              <label style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input type="checkbox" checked={ocrEnabled} onChange={(e) => setOcrEnabled(e.target.checked)} />
                <span style={{ fontWeight: 900 }}>Bật OCR (miễn phí)</span>
              </label>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6, lineHeight: 1.35 }}>
                PDF có text layer sẽ trích nhanh. PDF scan sẽ OCR (chậm hơn).
              </div>
            </div>
          </div>

          <div className="grid2">
            <div>
              <div className="label">OCR tối đa trang/PDF (khi không chọn trang)</div>
              <input
                className="input"
                type="number"
                value={ocrMaxPages}
                min={1}
                max={200}
                onChange={(e) => setOcrMaxPages(clamp(Number(e.target.value || 6), 1, 200))}
              />
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
                Khuyến nghị 5–10 trang để nhanh. Tài liệu dài → dùng “Chọn trang OCR”.
              </div>
            </div>

            <div>
              <div className="label">Chọn trang OCR (tuỳ chọn)</div>
              <input
                className="input"
                value={ocrPages}
                onChange={(e) => setOcrPages(e.target.value)}
                placeholder="vd: 1-3,5,7-9 (để trống = dùng tối đa trang)"
              />
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
                Dùng khi PDF scan dài: chỉ OCR các trang quan trọng (trang mục lục, biểu mẫu, hướng dẫn).
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btnPrimary" onClick={onExtract} disabled={!canExtract}>
              {extractBusy ? "Đang trích xuất..." : "B1) Trích xuất (có progress)"}
            </button>
            {jobView ? (
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="progressOuter" aria-label="progress">
                  <div className="progressInner" style={{ width: `${progressPct}%` }} />
                </div>
                <div style={{ marginTop: 6, fontWeight: 900, fontSize: 13, color: "var(--muted)" }}>
                  {progressPct}% · {jobView.message}
                </div>
              </div>
            ) : null}
          </div>

          {extractErr ? <div className="msgError">{extractErr}</div> : null}

          {extractResp ? (
            <div className="msgOk">
              Files OK: {stats.okFiles}/{stats.totalFiles} · Tổng ký tự: {stats.chars}
              {truncated ? <div style={{ marginTop: 6 }}>Lưu ý: text bị cắt bớt do quá dài.</div> : null}
            </div>
          ) : null}

          {extractResp?.results?.length ? (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>Chi tiết trích xuất</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 10, background: "#f7fbff", padding: 12, borderRadius: 14, border: "1px solid #e2effa", overflowX: "auto" }}>
                {JSON.stringify(extractResp.results, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </section>

      {/* Step 2 */}
      <section className="card">
        <h2 style={{ margin: 0, fontSize: "clamp(16px, 1.8vw, 20px)", fontWeight: 900 }}>B2) Sinh Q/A bằng Groq</h2>

        <div style={{ marginTop: 12 }} className="grid3">
          <div>
            <div className="label">Nhóm (nhom)</div>
            <input className="input" value={nhom} onChange={(e) => setNhom(e.target.value)} placeholder="Ví dụ: Học vụ" />
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
              Để trống: AI tự phân nhóm (Học vụ, CT HSSV, Tài chính...).
            </div>
          </div>

          <div>
            <div className="label">Số câu hỏi cần sinh</div>
            <input className="input" type="number" value={count} min={1} max={200} onChange={(e) => setCount(clamp(Number(e.target.value || 20), 1, 200))} />
          </div>

          <div>
            <div className="label">Kiểu câu trả lời</div>
            <select className="select" value={tone} onChange={(e) => setTone(e.target.value as any)}>
              <option value="van_phong">Văn phòng (b1/b2/b3)</option>
              <option value="ngan">Ngắn gọn</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btnPrimary" onClick={onGenerate} disabled={!canGenerate}>
            {genBusy ? "Đang sinh..." : "B2) Sinh Q/A"}
          </button>

          <button className="btn" onClick={normalizeAll} disabled={!items.length}>
            Chuẩn hoá khoảng trắng
          </button>

          <button className="btn" onClick={addRow} disabled={genBusy || extractBusy || importBusy}>
            + Thêm dòng
          </button>

          <button className="btn" onClick={onDownloadXlsx} disabled={!items.length}>
            Tải XLSX (tuỳ chọn)
          </button>
        </div>

        {genErr ? <div className="msgError" style={{ marginTop: 12 }}>{genErr}</div> : null}

        {items.length ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>B3) Sửa trực tiếp (khuyến nghị)</div>

            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>#</th>
                    <th style={{ width: 180 }}>Nhóm</th>
                    <th style={{ width: 360 }}>Câu hỏi</th>
                    <th>Trả lời</th>
                    <th style={{ width: 120 }}>Status</th>
                    <th style={{ width: 90 }}>Xoá</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((x, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        <input className="input" value={String(x.nhom ?? "")} onChange={(e) => updateItem(i, { nhom: e.target.value })} placeholder="nhom" />
                      </td>
                      <td>
                        <textarea className="textarea" value={x.cau_hoi} onChange={(e) => updateItem(i, { cau_hoi: e.target.value })} rows={3} />
                      </td>
                      <td>
                        <textarea className="textarea" value={x.tra_loi} onChange={(e) => updateItem(i, { tra_loi: e.target.value })} rows={5} />
                      </td>
                      <td>
                        <select className="select" value={x.status || "draft"} onChange={(e) => updateItem(i, { status: e.target.value })}>
                          <option value="draft">draft</option>
                          <option value="published">published</option>
                        </select>
                      </td>
                      <td>
                        <button className="btn btnDanger" onClick={() => removeRow(i)}>
                          X
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btnPrimary" onClick={onImport} disabled={importBusy}>
                {importBusy ? "Đang import..." : "B4) Import vào hệ thống"}
              </button>
            </div>

            {importErr ? <div className="msgError" style={{ marginTop: 12 }}>{importErr}</div> : null}

            {importResult ? (
              <div className="msgOk" style={{ marginTop: 12 }}>
                Inserted: {importResult.inserted} · Failed: {importResult.failed}
                {importResult.errors?.length ? (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 900 }}>Xem lỗi (tối đa 50)</summary>
                    <pre style={{ whiteSpace: "pre-wrap", marginTop: 10, background: "#f7fbff", padding: 12, borderRadius: 14, border: "1px solid #e2effa", overflowX: "auto" }}>
                      {JSON.stringify(importResult.errors.slice(0, 50), null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Attachment */}
      <section className="card">
        <h2 style={{ margin: 0, fontSize: "clamp(16px, 1.8vw, 20px)", fontWeight: 900 }}>
          Tuỳ chọn: Upload file đính kèm → gắn vào các câu hỏi vừa import
        </h2>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div className="grid2">
            <div>
              <div className="label">Chọn file</div>
              <input className="input" type="file" onChange={(e) => setAttachFile(e.target.files?.[0] || null)} />
            </div>

            <div>
              <div className="label">attachment_id (tự điền sau khi upload)</div>
              <input className="input" value={attachmentId} readOnly placeholder="attachment_id" style={{ background: "#f7fbff" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn" onClick={onUploadAttachment} disabled={!attachFile || attachBusy}>
              {attachBusy ? "Đang upload..." : "Upload file"}
            </button>
            <button className="btn btnPrimary" onClick={attachToImported} disabled={!attachmentId || !importResult?.inserted_items?.length}>
              Gắn file vào tất cả câu hỏi đã import
            </button>
          </div>

          {attachErr ? <div className="msgError">{attachErr}</div> : null}

          <div style={{ color: "var(--muted)", lineHeight: 1.5 }}>
            Gắn file sử dụng API hiện có <b>/api/admin/faq/attach</b> → không đổi schema, không dùng <b>file_urls</b>.
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
