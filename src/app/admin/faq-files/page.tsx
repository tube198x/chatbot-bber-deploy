"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";
type ToastState = { kind: ToastKind; message: string } | null;

type FaqItem = {
  id: string;
  cau_hoi: string;
  nhom?: string | null;
  status?: string | null;
};

type AttachmentItem = {
  id: string;
  name: string;
  path: string;
  url: string;
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
        maxWidth: 420,
        background: bg,
        border: `1px solid ${bd}`,
        borderRadius: 14,
        boxShadow: "0 14px 30px rgba(0,0,0,0.12)",
        padding: 12,
        color: fg,
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, whiteSpace: "pre-wrap", fontWeight: 800 }}>{toast.message}</div>
        <button
          onClick={onClose}
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            background: "#fff",
            borderRadius: 10,
            padding: "6px 10px",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function TopNav() {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: 14,
      }}
    >
      <a href="/admin" style={navLink()}>
        Import & Upload
      </a>
      <a href="/admin/faq-files" style={navLink(true)}>
        File theo FAQ
      </a>
      <a href="/admin/logs" style={navLink()}>
        Logs
      </a>
      <div style={{ flex: 1 }} />
      <button
        onClick={async () => {
          try {
            await fetch("/api/admin/auth/logout", { method: "POST" });
          } finally {
            window.location.href = "/admin/login";
          }
        }}
        style={btnStyle("#fff", "#1b2a3a", "1px solid #cbdff1")}
      >
        Đăng xuất
      </button>
    </div>
  );
}

export default function AdminFaqFilesPage() {
  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(kind: ToastKind, message: string, ms = 3600) {
    setToast({ kind, message });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), ms);
  }

  // Search FAQ
  const [faqQuery, setFaqQuery] = useState("");
  const [faqBusy, setFaqBusy] = useState(false);
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [pickedFaq, setPickedFaq] = useState<FaqItem | null>(null);

  // Attachments list
  const [listBusy, setListBusy] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  // Upload + attach
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [autoAttach, setAutoAttach] = useState(true);
  const [lastUpload, setLastUpload] = useState<{ path: string; attachment_id: string; name: string } | null>(null);

  const canUpload = !!uploadFile && !uploadBusy;
  const canAttachNow = !!lastUpload?.attachment_id && !!pickedFaq?.id;

  const pickedLabel = useMemo(() => {
    if (!pickedFaq) return "Chưa chọn FAQ";
    return `${pickedFaq.cau_hoi} (id: ${pickedFaq.id})`;
  }, [pickedFaq]);

  // Debounce search
  useEffect(() => {
    const q = faqQuery.trim();
    if (!q) {
      setFaqItems([]);
      setFaqBusy(false);
      return;
    }

    setFaqBusy(true);
    const t = setTimeout(async () => {
      try {
        const data = await fetchJson(`/api/admin/faq/search?q=${encodeURIComponent(q)}`);
        setFaqItems(Array.isArray(data?.items) ? (data.items as FaqItem[]) : []);
      } catch (e: any) {
        setFaqItems([]);
        showToast("error", `Lỗi tìm FAQ: ${e?.message || String(e)}`);
      } finally {
        setFaqBusy(false);
      }
    }, 260);

    return () => clearTimeout(t);
  }, [faqQuery]);

  async function loadAttachments(faq_id: string) {
    setListBusy(true);
    setAttachments([]);
    try {
      const data = await fetchJson(`/api/admin/faq/attachments?faq_id=${encodeURIComponent(faq_id)}`);
      setAttachments(Array.isArray(data?.items) ? (data.items as AttachmentItem[]) : []);
    } catch (e: any) {
      setAttachments([]);
      showToast("error", `Lỗi tải danh sách file: ${e?.message || String(e)}`);
    } finally {
      setListBusy(false);
    }
  }

  async function onPickFaq(faq: FaqItem) {
    setPickedFaq(faq);
    await loadAttachments(faq.id);
  }

  async function onUpload() {
    if (!uploadFile) return;
    setUploadBusy(true);
    setLastUpload(null);

    try {
      const fd = new FormData();
      fd.append("file", uploadFile);

      const data = await fetchJson("/api/admin/files/upload", { method: "POST", body: fd });
      const path = String(data?.path || "");
      const attachment_id = String(data?.attachment_id || data?.attachment?.id || "");
      const name = String(data?.attachment?.file_name || uploadFile.name || "file");

      if (!path || !attachment_id) {
        throw new Error("Upload OK nhưng thiếu path/attachment_id.");
      }

      setLastUpload({ path, attachment_id, name });
      showToast("success", `Upload OK: ${name}`);

      // Auto attach
      if (autoAttach && pickedFaq?.id) {
        await fetchJson("/api/admin/faq/attach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ faq_id: pickedFaq.id, attachment_id }),
        });
        showToast("success", "Đã gắn file vào FAQ.");
        await loadAttachments(pickedFaq.id);
      }
    } catch (e: any) {
      showToast("error", `Lỗi upload: ${e?.message || String(e)}`);
    } finally {
      setUploadBusy(false);
    }
  }

  async function onAttachNow() {
    if (!pickedFaq?.id || !lastUpload?.attachment_id) return;
    try {
      await fetchJson("/api/admin/faq/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faq_id: pickedFaq.id, attachment_id: lastUpload.attachment_id }),
      });
      showToast("success", "OK: Đã gắn file vào FAQ.");
      await loadAttachments(pickedFaq.id);
    } catch (e: any) {
      showToast("error", `Lỗi gắn file: ${e?.message || String(e)}`);
    }
  }

  async function onDetach(attachment_id: string) {
    if (!pickedFaq?.id) return;
    const ok = window.confirm("Gỡ file khỏi FAQ này? (Không xoá file khỏi Storage)");
    if (!ok) return;
    try {
      await fetchJson("/api/admin/faq/detach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faq_id: pickedFaq.id, attachment_id }),
      });
      showToast("success", "Đã gỡ file khỏi FAQ.");
      await loadAttachments(pickedFaq.id);
    } catch (e: any) {
      showToast("error", `Lỗi gỡ file: ${e?.message || String(e)}`);
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", `Đã sao chép ${label}.`);
    } catch {
      // fallback
      window.prompt(`Copy ${label}:`, text);
    }
  }

  return (
    <div style={{ minHeight: "100vh", padding: 24, background: "linear-gradient(180deg, #bfe9ff 0%, #eef9ff 60%, #ffffff 100%)" }}>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <TopNav />

        <h1 style={{ fontSize: 36, margin: "10px 0 10px 0", fontWeight: 900 }}>Quản lý file theo FAQ</h1>
        <div style={{ marginBottom: 14, color: "#234", fontSize: 16 }}>
          Chọn FAQ → xem danh sách file đã gắn → upload/gắn thêm → gỡ file.
        </div>

        <div style={box()}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>1) Tìm & chọn FAQ</div>
          <input
            value={faqQuery}
            onChange={(e) => {
              setFaqQuery(e.target.value);
            }}
            placeholder="Gõ vài chữ trong câu hỏi để tìm..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #cfe3f6", background: "#fff" }}
          />

          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>
            {faqBusy ? "Đang tìm..." : faqQuery.trim() ? `Kết quả: ${faqItems.length}` : ""}
          </div>

          {faqItems.length ? (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {faqItems.map((x) => (
                <button
                  key={x.id}
                  onClick={() => onPickFaq(x)}
                  style={{
                    textAlign: "left",
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #dbeafe",
                    background: pickedFaq?.id === x.id ? "#eafff0" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{x.cau_hoi}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>id: {x.id} · nhóm: {x.nhom || "-"} · {x.status || "-"}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div style={box()}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>2) File đang gắn với FAQ</div>
          <div style={{ marginBottom: 8, fontSize: 14 }}>
            <b>FAQ:</b> {pickedLabel}
          </div>

          {pickedFaq?.id ? (
            <button
              onClick={() => loadAttachments(pickedFaq.id)}
              disabled={listBusy}
              style={btnStyle("#fff", "#1b2a3a", "1px solid #cbdff1")}
            >
              {listBusy ? "Đang tải..." : "Tải lại danh sách"}
            </button>
          ) : null}

          <div style={{ marginTop: 10 }}>
            {listBusy ? (
              <div style={{ opacity: 0.8 }}>Đang tải file...</div>
            ) : !pickedFaq?.id ? (
              <div style={{ opacity: 0.8 }}>Chọn 1 FAQ để xem file.</div>
            ) : attachments.length === 0 ? (
              <div style={{ opacity: 0.8 }}>FAQ này chưa có file đính kèm.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {attachments.map((a) => (
                  <div key={a.id} style={{ background: "#f7fbff", border: "1px solid #e2effa", borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>{a.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>attachment_id: {a.id}</div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button onClick={() => copyText("PATH", a.path)} style={btnStyle("#fff", "#1b2a3a", "1px solid #cbdff1")}>Sao chép PATH</button>
                      {a.url ? (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ ...btnStyle("#9fe7ff", "#0a2533", "1px solid #66cde8"), textDecoration: "none", display: "inline-block" }}
                        >
                          Mở file
                        </a>
                      ) : (
                        <span style={{ fontSize: 13, opacity: 0.75 }}>Không tạo được signed URL</span>
                      )}
                      <button onClick={() => onDetach(a.id)} style={btnStyle("#ffe9e9", "#7a0011", "1px solid #ffb3b3")}>Gỡ khỏi FAQ</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={box()}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>3) Upload file mới</div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
            <button onClick={onUpload} disabled={!canUpload} style={btnStyle("#9fe7ff", "#0a2533", "1px solid #66cde8")}>
              {uploadBusy ? "Đang upload..." : "Upload"}
            </button>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={autoAttach} onChange={(e) => setAutoAttach(e.target.checked)} />
              <span style={{ fontSize: 14 }}>Tự gắn vào FAQ đang chọn</span>
            </label>
          </div>

          {lastUpload ? (
            <div style={{ marginTop: 12, background: "#eafff0", border: "1px solid #b7f0c6", padding: 12, borderRadius: 12 }}>
              <div style={{ fontWeight: 900 }}>Upload OK</div>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                <div><b>File:</b> {lastUpload.name}</div>
                <div><b>PATH:</b> {lastUpload.path}</div>
                <div><b>attachment_id:</b> {lastUpload.attachment_id}</div>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => copyText("PATH", lastUpload.path)} style={btnStyle("#fff", "#1b2a3a", "1px solid #cbdff1")}>Sao chép PATH</button>
                <button onClick={onAttachNow} disabled={!canAttachNow} style={btnStyle("#9fe7ff", "#0a2533", "1px solid #66cde8")}>Gắn vào FAQ đang chọn</button>
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 10, color: "#234", fontSize: 13, opacity: 0.9 }}>
            Lưu ý: Không dùng <b>file_urls</b>. File đính kèm quản lý qua <b>attachments + faq_attachments</b>.
          </div>
        </div>
      </div>
    </div>
  );
}

function navLink(active?: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #d8e9f7",
    background: active ? "#eafff0" : "#fff",
    fontWeight: 900,
    textDecoration: "none",
    color: "#0a2533",
  };
}

function btnStyle(bg: string, fg: string, border: string): React.CSSProperties {
  return { background: bg, color: fg, border, padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 800 };
}

function box(): React.CSSProperties {
  return { background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #d8e9f7", boxShadow: "0 10px 24px rgba(0,0,0,0.06)", marginBottom: 16 };
}
