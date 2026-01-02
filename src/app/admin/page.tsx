"use client";

import React, { useMemo, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";
type ToastState = { kind: ToastKind; message: string } | null;

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
  const bg = toast.kind === "success" ? "#eafff0" : toast.kind === "error" ? "#ffe9e9" : "#f7fbff";
  const bd = toast.kind === "success" ? "#b7f0c6" : toast.kind === "error" ? "#ffb3b3" : "#cfe3f6";
  const fg = "#0a2533";

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
        borderRadius: 16,
        boxShadow: "0 14px 30px rgba(0,0,0,0.12)",
        padding: 12,
        color: fg,
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, whiteSpace: "pre-wrap", fontWeight: 900, fontSize: 14 }}>{toast.message}</div>
        <button
          onClick={onClose}
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            background: "#fff",
            borderRadius: 12,
            padding: "6px 10px",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function clampPx(min: number, midVw: number, max: number) {
  return `clamp(${min}px, ${midVw}vw, ${max}px)`;
}

function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #e9f6ff 0%, #f6fbff 70%, #ffffff 100%)",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Be Vietnam Pro", sans-serif',
        color: "#0a2533",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 14px 40px" }}>
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: clampPx(18, 2.2, 26), fontWeight: 1000, letterSpacing: -0.2 }}>
              {title}
            </h1>
            {subtitle ? (
              <div style={{ marginTop: 6, opacity: 0.78, lineHeight: 1.35, fontSize: clampPx(12, 1.2, 14) }}>
                {subtitle}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <a href="/admin/ai-generate" style={pillLink()}>
              AI tạo Q/A
            </a>
            <a href="/admin/users" style={pillLink()}>
              Users
            </a>
            <a href="/admin/logs" style={pillLink()}>
              Logs
            </a>
            <button
              onClick={async () => {
                try {
                  await fetch("/api/admin/auth/logout", { method: "POST" });
                } finally {
                  window.location.href = "/admin/login";
                }
              }}
              style={pillButton("#fff", "#1b2a3a")}
            >
              Đăng xuất
            </button>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

function pillLink(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#fff",
    fontWeight: 900,
    textDecoration: "none",
    color: "#0a2533",
    fontSize: 14,
  };
}

function pillButton(bg: string, color: string): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: bg,
    fontWeight: 900,
    cursor: "pointer",
    color,
    fontSize: 14,
  };
}

function card(): React.CSSProperties {
  return {
    marginTop: 14,
    padding: 14,
    border: "1px solid #d8e9f7",
    borderRadius: 18,
    background: "#fff",
    boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
  };
}

function label(): React.CSSProperties {
  return { fontWeight: 900, fontSize: 14 };
}

function input(): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #cfe3f6",
    marginTop: 6,
    outline: "none",
    fontSize: 14,
  };
}

function btn(disabled: boolean, primary = false): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 14,
    border: primary ? "1px solid #66cde8" : "1px solid rgba(0,0,0,0.12)",
    background: primary ? (disabled ? "#dbeafe" : "#9fe7ff") : "#fff",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
    color: "#0a2533",
    fontSize: 14,
  };
}

type PreviewRow = {
  __row: number;
  nhom: string;
  cau_hoi: string;
  tra_loi: string;
  status: string;
  __error?: string;
};

type PreviewResp = {
  total: number;
  valid: number;
  invalid: number;
  errors: { row: number; message: string }[];
  sample: any[];
  rows?: PreviewRow[];
  note?: string;
};

type RunResp = {
  ok: boolean;
  total: number;
  processed: number;
  inserted: number;
  errors: any[];
  sample: any[];
  source?: "xlsx" | "json";
};

export default function AdminPage() {
  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(kind: ToastKind, message: string, ms = 3600) {
    setToast({ kind, message });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), ms);
  }

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [editRows, setEditRows] = useState<PreviewRow[]>([]);
  const [onlyInvalid, setOnlyInvalid] = useState(false);

  const [runResult, setRunResult] = useState<RunResp | null>(null);
  const [busyPreview, setBusyPreview] = useState(false);
  const [busyRun, setBusyRun] = useState(false);
  const [err, setErr] = useState<string>("");

  // upload attachment
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachErr, setAttachErr] = useState<string>("");
  const [path, setPath] = useState<string>("");
  const [attachmentId, setAttachmentId] = useState<string>("");

  // gắn vào FAQ
  const [faqQuery, setFaqQuery] = useState("");

  const canPreview = !!excelFile && !busyPreview && !busyRun;
  const canRun = (!!excelFile || editRows.length > 0) && !busyRun && !busyPreview;

  const summaryText = useMemo(() => {
    if (!preview) return "";
    const invalidNow = editRows.filter((r) => !r.cau_hoi.trim() || !r.tra_loi.trim()).length;
    const okNow = editRows.length - invalidNow;
    return `Tổng dòng: ${editRows.length} · Hợp lệ: ${okNow} · Lỗi: ${invalidNow}`;
  }, [preview, editRows]);

  async function onPreview() {
    if (!excelFile) return;
    setErr("");
    setRunResult(null);
    setBusyPreview(true);
    try {
      const fd = new FormData();
      fd.append("file", excelFile);

      const data = (await fetchJson("/api/admin/import/preview", { method: "POST", body: fd })) as PreviewResp;
      setPreview(data);
      setEditRows((data.rows || []).map((r) => ({ ...r })));
      showToast("success", "Preview OK — bạn có thể sửa trực tiếp trước khi import");
    } catch (e: any) {
      setErr(`Lỗi: ${e.message || String(e)}`);
      showToast("error", `Preview lỗi: ${e?.message || String(e)}`);
    } finally {
      setBusyPreview(false);
    }
  }

  function normalizeRows() {
    setEditRows((prev) =>
      prev.map((r) => ({
        ...r,
        nhom: String(r.nhom || "").trim(),
        cau_hoi: String(r.cau_hoi || "").trim(),
        tra_loi: String(r.tra_loi || "").trim(),
        status: String(r.status || "").trim() || "draft",
      }))
    );
    showToast("info", "Đã chuẩn hoá: trim + status=draft");
  }

  function addRow() {
    setEditRows((prev) => [
      ...prev,
      { __row: prev.length + 1, nhom: "", cau_hoi: "", tra_loi: "", status: "draft" },
    ]);
  }

  function deleteRow(idx: number) {
    setEditRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onRun() {
    setErr("");
    setRunResult(null);
    setBusyRun(true);
    try {
      // Prefer edited rows if available
      if (editRows.length > 0) {
        const data = await fetchJson("/api/admin/import/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: excelFile?.name || "inline_edit.xlsx",
            items: editRows.map((r) => ({
              nhom: r.nhom,
              cau_hoi: r.cau_hoi,
              tra_loi: r.tra_loi,
              status: r.status,
            })),
          }),
        });
        setRunResult(data as RunResp);
        showToast("success", "Import OK (từ dữ liệu đã sửa)");
        return;
      }

      // fallback legacy: upload file
      if (!excelFile) throw new Error("Chưa chọn file Excel");
      const fd = new FormData();
      fd.append("file", excelFile);

      const data = await fetchJson("/api/admin/import/run", { method: "POST", body: fd });
      setRunResult(data as RunResp);
      showToast("success", "Import OK");
    } catch (e: any) {
      setErr(`Lỗi: ${e.message || String(e)}`);
      showToast("error", `Import lỗi: ${e?.message || String(e)}`);
    } finally {
      setBusyRun(false);
    }
  }

  async function onUploadAttachment() {
    if (!attachFile) return;
    setAttachErr("");
    setAttachBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", attachFile);
      const data = await fetchJson("/api/admin/files/upload", { method: "POST", body: fd });
      setPath(data?.path || "");
      setAttachmentId(data?.id || "");
      showToast("success", "Upload file OK");
    } catch (e: any) {
      setAttachErr(`Lỗi: ${e.message || String(e)}`);
      showToast("error", `Upload file lỗi: ${e?.message || String(e)}`);
    } finally {
      setAttachBusy(false);
    }
  }

  async function onAttachToFaq() {
    if (!attachmentId) {
      showToast("error", "Chưa có attachmentId (hãy upload file trước)");
      return;
    }
    setAttachErr("");
    setAttachBusy(true);
    try {
      const data = await fetchJson("/api/admin/faq/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachment_id: attachmentId, q: faqQuery }),
      });
      showToast("success", `OK: gắn file vào ${data?.updated || 0} FAQ`);
    } catch (e: any) {
      setAttachErr(`Lỗi: ${e.message || String(e)}`);
      showToast("error", `Gắn file lỗi: ${e?.message || String(e)}`);
    } finally {
      setAttachBusy(false);
    }
  }

  const visibleRows = useMemo(() => {
    const rows = editRows || [];
    if (!onlyInvalid) return rows;
    return rows.filter((r) => !String(r.cau_hoi || "").trim() || !String(r.tra_loi || "").trim());
  }, [editRows, onlyInvalid]);

  return (
    <AppShell
      title="Admin"
      subtitle={
        <>
          Nhập FAQ từ Excel theo mẫu <b>nhom, cau_hoi, tra_loi, status</b>. Bạn có thể <b>Preview → sửa trực tiếp</b> rồi import.
        </>
      }
    >
      <Toast toast={toast} onClose={() => setToast(null)} />

      <section style={card()}>
        <h2 style={{ margin: 0, fontSize: clampPx(16, 1.8, 20), fontWeight: 1000 }}>Import FAQ từ Excel</h2>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <label>
            <div style={label()}>Chọn file Excel (.xlsx)</div>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
              style={{ marginTop: 6 }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button disabled={!canPreview} onClick={onPreview} style={btn(!canPreview, true)}>
              {busyPreview ? "Đang preview..." : "Preview"}
            </button>

            <button disabled={!canRun} onClick={onRun} style={btn(!canRun, true)}>
              {busyRun ? "Đang import..." : "Import"}
            </button>

            <button disabled={editRows.length === 0} onClick={normalizeRows} style={btn(editRows.length === 0)}>
              Chuẩn hoá dữ liệu
            </button>

            <button onClick={addRow} style={btn(false)}>
              + Thêm dòng
            </button>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900 }}>
              <input type="checkbox" checked={onlyInvalid} onChange={(e) => setOnlyInvalid(e.target.checked)} />
              Chỉ hiện dòng lỗi
            </label>

            <div style={{ fontWeight: 1000, opacity: 0.9 }}>{summaryText}</div>
          </div>

          {preview?.note ? <div style={{ fontSize: 13, opacity: 0.75 }}>{preview.note}</div> : null}
          {err ? <div style={{ color: "#b42318", fontWeight: 900 }}>{err}</div> : null}
        </div>

        {editRows.length > 0 ? (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th style={{ width: 80 }}>#</Th>
                  <Th style={{ width: 180 }}>Nhóm</Th>
                  <Th style={{ width: 340 }}>Câu hỏi</Th>
                  <Th>Trả lời</Th>
                  <Th style={{ width: 110 }}>Status</Th>
                  <Th style={{ width: 110 }}>Thao tác</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => {
                  const idx = editRows.indexOf(r); // original index
                  const invalid = !r.cau_hoi.trim() || !r.tra_loi.trim();
                  return (
                    <tr key={idx} style={{ borderTop: "1px solid #eef6fd", background: invalid ? "#fff6f6" : "transparent" }}>
                      <td style={td()}>{idx + 1}</td>
                      <td style={td()}>
                        <input
                          value={r.nhom}
                          onChange={(e) => updateRow(idx, { nhom: e.target.value })}
                          style={input()}
                          placeholder="vd: Học vụ"
                        />
                      </td>
                      <td style={td()}>
                        <textarea
                          value={r.cau_hoi}
                          onChange={(e) => updateRow(idx, { cau_hoi: e.target.value })}
                          style={{ ...input(), minHeight: 72, resize: "vertical" }}
                          placeholder="Nhập câu hỏi…"
                        />
                        {invalid && !r.cau_hoi.trim() ? <div style={errHint()}>Thiếu cau_hoi</div> : null}
                      </td>
                      <td style={td()}>
                        <textarea
                          value={r.tra_loi}
                          onChange={(e) => updateRow(idx, { tra_loi: e.target.value })}
                          style={{ ...input(), minHeight: 96, resize: "vertical" }}
                          placeholder="Nhập trả lời…"
                        />
                        {invalid && !r.tra_loi.trim() ? <div style={errHint()}>Thiếu tra_loi</div> : null}
                      </td>
                      <td style={td()}>
                        <select value={r.status || "draft"} onChange={(e) => updateRow(idx, { status: e.target.value })} style={input()}>
                          <option value="draft">draft</option>
                          <option value="published">published</option>
                        </select>
                      </td>
                      <td style={td()}>
                        <button onClick={() => deleteRow(idx)} style={btn(false)}>
                          Xoá
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {runResult ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, border: "1px solid #cfe3f6", background: "#f7fbff" }}>
            <div style={{ fontWeight: 1000 }}>Kết quả import</div>
            <div style={{ marginTop: 6, opacity: 0.9 }}>
              Source: <b>{runResult.source || "xlsx"}</b> · Total: <b>{runResult.total}</b> · Processed:{" "}
              <b>{runResult.processed}</b> · Inserted: <b>{runResult.inserted}</b> · Errors:{" "}
              <b>{runResult.errors?.length || 0}</b>
            </div>
          </div>
        ) : null}
      </section>

      <section style={card()}>
        <h2 style={{ margin: 0, fontSize: clampPx(16, 1.8, 20), fontWeight: 1000 }}>Upload file đính kèm</h2>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <label>
            <div style={label()}>Chọn file</div>
            <input type="file" onChange={(e) => setAttachFile(e.target.files?.[0] || null)} style={{ marginTop: 6 }} />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button disabled={!attachFile || attachBusy} onClick={onUploadAttachment} style={btn(!attachFile || attachBusy, true)}>
              {attachBusy ? "Đang upload..." : "Upload"}
            </button>

            {path ? (
              <div style={{ fontWeight: 900, opacity: 0.9 }}>
                path: <code>{path}</code>
              </div>
            ) : null}
          </div>

          {attachErr ? <div style={{ color: "#b42318", fontWeight: 900 }}>{attachErr}</div> : null}
        </div>

        <div style={{ marginTop: 12, borderTop: "1px solid #eef6fd", paddingTop: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 1000 }}>Gắn file vào FAQ</h3>
          <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
            <label>
              <div style={label()}>Tìm FAQ theo từ khoá (q)</div>
              <input value={faqQuery} onChange={(e) => setFaqQuery(e.target.value)} style={input()} placeholder="vd: học phí" />
            </label>

            <button disabled={!attachmentId || attachBusy} onClick={onAttachToFaq} style={btn(!attachmentId || attachBusy, true)}>
              {attachBusy ? "Đang gắn..." : "Gắn file"}
            </button>

            {attachmentId ? (
              <div style={{ fontWeight: 900, opacity: 0.9 }}>
                attachment_id: <code>{attachmentId}</code>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div style={{ marginTop: 14, fontSize: 13, opacity: 0.75 }}>
        Mẹo: Nếu bạn muốn tạo FAQ từ tài liệu bằng AI, vào <b>AI tạo Q/A</b>.
      </div>
    </AppShell>
  );

  function updateRow(idx: number, patch: Partial<PreviewRow>) {
    setEditRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{ textAlign: "left", fontSize: 13, padding: 10, borderBottom: "1px solid #d8e9f7", opacity: 0.85, ...style }}>
      {children}
    </th>
  );
}

function td(): React.CSSProperties {
  return { padding: 10, verticalAlign: "top" };
}

function errHint(): React.CSSProperties {
  return { marginTop: 6, color: "#b42318", fontWeight: 900, fontSize: 12 };
}
