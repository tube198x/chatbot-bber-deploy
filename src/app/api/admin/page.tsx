"use client";

import React, { useMemo, useState } from "react";

type PreviewItem = {
  nhom?: string | null;
  cau_hoi?: string;
  tra_loi?: string;
  status?: string;
};

type PreviewResp = {
  total: number;
  valid: number;
  invalid: number;
  errors: { row: number; message: string }[];
  sample: PreviewItem[];
};

type RunResp = {
  ok: boolean;
  inserted: number;
  failed: number;
  errors: { row: number; message: string; cau_hoi?: string }[];
};

type FaqItem = {
  id: string;
  cau_hoi: string;
  nhom?: string | null;
  status?: string | null;
};

export default function AdminPage() {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
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
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [pickedFaq, setPickedFaq] = useState<FaqItem | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState("");

  const canPreview = !!excelFile && !busyPreview && !busyRun;
  const canRun = !!excelFile && !busyRun && !busyPreview;

  const summaryText = useMemo(() => {
    if (!preview) return "";
    return `Tổng dòng: ${preview.total} · Hợp lệ: ${preview.valid} · Lỗi: ${preview.invalid}`;
  }, [preview]);

  async function onPreview() {
    if (!excelFile) return;
    setErr("");
    setRunResult(null);
    setBusyPreview(true);
    try {
      const fd = new FormData();
      fd.append("file", excelFile);

      const res = await fetch("/api/admin/import/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Preview thất bại");
      setPreview(data as PreviewResp);
    } catch (e: any) {
      setErr(`Lỗi: ${e.message || String(e)}`);
    } finally {
      setBusyPreview(false);
    }
  }

  async function onRun() {
    if (!excelFile) return;
    setErr("");
    setBusyRun(true);
    try {
      const fd = new FormData();
      fd.append("file", excelFile);

      const res = await fetch("/api/admin/import/run", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Import thất bại");
      setRunResult(data as RunResp);
    } catch (e: any) {
      setErr(`Lỗi: ${e.message || String(e)}`);
    } finally {
      setBusyRun(false);
    }
  }

  async function onUploadAttachment() {
    if (!attachFile) return;
    setAttachErr("");
    setAttachBusy(true);
    setPath("");
    setAttachmentId("");
    setLinkMsg("");

    try {
      const fd = new FormData();
      fd.append("file", attachFile);

      const res = await fetch("/api/admin/files/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload thất bại");

      setPath(String(data.path || ""));
      setAttachmentId(String(data?.attachment?.id || ""));
    } catch (e: any) {
      setAttachErr(`Lỗi: ${e.message || String(e)}`);
    } finally {
      setAttachBusy(false);
    }
  }

  async function copyPath() {
    if (!path) return;
    await navigator.clipboard.writeText(path);
    alert("Đã sao chép PATH.");
  }

  async function searchFaq(q: string) {
    setPickedFaq(null);
    setFaqItems([]);
    setLinkMsg("");
    const t = q.trim();
    if (!t) return;

    const res = await fetch(`/api/admin/faq/search?q=${encodeURIComponent(t)}`);
    const data = await res.json();
    if (!res.ok) return;

    setFaqItems(Array.isArray(data?.items) ? (data.items as FaqItem[]) : []);
  }

  async function linkAttachment() {
    setLinkMsg("");
    if (!attachmentId || !pickedFaq?.id) {
      setLinkMsg("Lỗi: Chưa chọn câu hỏi hoặc chưa có attachment_id.");
      return;
    }

    setLinkBusy(true);
    try {
      const res = await fetch("/api/admin/faq/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faq_id: pickedFaq.id, attachment_id: attachmentId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gắn file thất bại");

      setLinkMsg("OK: Đã gắn file vào câu hỏi.");
    } catch (e: any) {
      setLinkMsg(`Lỗi: ${e.message || String(e)}`);
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", padding: 24, background: "linear-gradient(180deg, #bfe9ff 0%, #eef9ff 60%, #ffffff 100%)" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 44, margin: "10px 0 14px 0", fontWeight: 800 }}>Giai đoạn 1 — Import Q&amp;A</h1>
        <div style={{ marginBottom: 14, color: "#234", fontSize: 18 }}>Upload Excel/CSV → Preview → Import vào Supabase → tự tạo embedding.</div>

        <div style={box()}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                setExcelFile(e.target.files?.[0] || null);
                setPreview(null);
                setRunResult(null);
                setErr("");
              }}
            />
            <button onClick={onPreview} disabled={!canPreview} style={btnStyle("#fff", "#1b2a3a", "1px solid #cbdff1")}>
              {busyPreview ? "Đang Preview..." : "Preview"}
            </button>
            <button onClick={onRun} disabled={!canRun} style={btnStyle("#9fe7ff", "#0a2533", "1px solid #66cde8")}>
              {busyRun ? "Đang Import..." : "Import + Embedding"}
            </button>
          </div>

          {err ? <div style={errBox()}>{err}</div> : null}

          {preview ? <div style={okBox()}>{summaryText}</div> : null}

          {preview?.sample?.length ? (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer" }}>Sample (tối đa 20 dòng)</summary>
              <pre style={preBox()}>{JSON.stringify(preview.sample, null, 2)}</pre>
            </details>
          ) : null}

          {runResult ? (
            <div style={okBox()}>
              Inserted: {runResult.inserted} · Failed: {runResult.failed}
              {runResult.errors?.length ? <pre style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{JSON.stringify(runResult.errors.slice(0, 30), null, 2)}</pre> : null}
            </div>
          ) : null}
        </div>

        <div style={box()}>
          <h2 style={{ margin: "0 0 12px 0" }}>Upload file đính kèm → Gắn vào câu hỏi (KHÔNG dùng file_urls)</h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input type="file" onChange={(e) => setAttachFile(e.target.files?.[0] || null)} />
            <button onClick={onUploadAttachment} disabled={!attachFile || attachBusy} style={btnStyle("#9fe7ff", "#0a2533", "1px solid #66cde8")}>
              {attachBusy ? "Đang Upload..." : "Upload"}
            </button>
          </div>

          {attachErr ? <div style={errBox()}>{attachErr}</div> : null}

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700 }}>PATH:</div>
              <input value={path} readOnly style={readOnly()} />
              <button onClick={copyPath} disabled={!path} style={btnStyle("#fff", "#1b2a3a", "1px solid #cbdff1")}>Sao chép PATH</button>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700 }}>attachment_id:</div>
              <input value={attachmentId} readOnly style={readOnly()} />
            </div>
          </div>

          <div style={{ marginTop: 12, background: "#f7fbff", border: "1px solid #e2effa", padding: 12, borderRadius: 10 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Gắn file vào câu hỏi:</div>

            <input
              value={faqQuery}
              onChange={(e) => {
                const v = e.target.value;
                setFaqQuery(v);
                searchFaq(v);
              }}
              placeholder="Gõ vài chữ trong câu hỏi để tìm..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #cfe3f6", background: "#fff" }}
            />

            {faqItems.length ? (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {faqItems.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => setPickedFaq(x)}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid #dbeafe",
                      background: pickedFaq?.id === x.id ? "#eafff0" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{x.cau_hoi}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>id: {x.id} · nhóm: {x.nhom || "-"} · {x.status || "-"}</div>
                  </button>
                ))}
              </div>
            ) : null}

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={linkAttachment} disabled={!attachmentId || !pickedFaq?.id || linkBusy} style={btnStyle("#9fe7ff", "#0a2533", "1px solid #66cde8")}>
                {linkBusy ? "Đang gắn..." : "Gắn file vào câu hỏi"}
              </button>
              {linkMsg ? <div style={{ fontWeight: 800 }}>{linkMsg}</div> : null}
            </div>

            <div style={{ marginTop: 10, color: "#234" }}>
              Lưu ý: Cột <b>file_urls</b> trong Excel/CSV nếu còn tồn tại thì xem là <b>deprecated</b>, hệ thống chốt mới dùng <b>attachments + faq_attachments</b>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function btnStyle(bg: string, fg: string, border: string): React.CSSProperties {
  return { background: bg, color: fg, border, padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 700 };
}
function box(): React.CSSProperties {
  return { background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #d8e9f7", boxShadow: "0 10px 24px rgba(0,0,0,0.06)", marginBottom: 16 };
}
function errBox(): React.CSSProperties {
  return { marginTop: 12, background: "#ffe9e9", border: "1px solid #ffb3b3", padding: 12, borderRadius: 10 };
}
function okBox(): React.CSSProperties {
  return { marginTop: 12, background: "#eafff0", border: "1px solid #b7f0c6", padding: 12, borderRadius: 10 };
}
function preBox(): React.CSSProperties {
  return { whiteSpace: "pre-wrap", background: "#f7fbff", padding: 12, borderRadius: 10, border: "1px solid #e2effa" };
}
function readOnly(): React.CSSProperties {
  return { flex: 1, minWidth: 280, padding: "10px 12px", borderRadius: 10, border: "1px solid #cfe3f6", background: "#f7fbff" };
}
