"use client";

import React from "react";

function TopNav() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <a href="/admin" style={navLink()}>Import & Upload</a>
      <a href="/admin/faq-files" style={navLink()}>File theo FAQ</a>
      <a href="/admin/logs" style={navLink(true)}>Logs</a>
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

export default function AdminLogsHome() {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "linear-gradient(180deg, #bfe9ff 0%, #eef9ff 60%, #ffffff 100%)",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <TopNav />

        <h1 style={{ fontSize: 36, margin: "8px 0 12px 0", fontWeight: 900 }}>Logs</h1>
        <div style={{ color: "#234", marginBottom: 14 }}>
          TODO #3: Log chat (thống kê) · TODO #4: Log thao tác admin
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <a href="/admin/logs/chat" style={card()}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>📊 Log chat</div>
            <div style={{ marginTop: 6, opacity: 0.8, lineHeight: 1.4 }}>
              Xem số lượt hỏi theo ngày, tỉ lệ FAQ/fallback, top câu hỏi, top FAQ.
            </div>
          </a>

          <a href="/admin/logs/admin" style={card()}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>🧾 Log thao tác admin</div>
            <div style={{ marginTop: 6, opacity: 0.8, lineHeight: 1.4 }}>
              Ghi theo file local <b>.local_logs/admin_audit.ndjson</b> (không cần đổi schema DB).
            </div>
          </a>
        </div>

        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>
          Ghi chú:
          <ul style={{ margin: "6px 0 0 18px" }}>
            <li>
              Log chat đọc từ bảng Supabase <b>log_chat</b> (đang được ghi trong <b>/api/ask</b>).
            </li>
            <li>
              Log admin được ghi ra file local để tránh phụ thuộc schema DB.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function navLink(active?: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #cbdff1",
    background: active ? "#eafff0" : "#fff",
    fontWeight: 900,
    textDecoration: "none",
    color: "#0a2533",
  };
}

function btnStyle(bg: string, fg: string, border: string): React.CSSProperties {
  return { background: bg, color: fg, border, padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 800 };
}

function card(): React.CSSProperties {
  return {
    background: "#fff",
    border: "1px solid #d8e9f7",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
    textDecoration: "none",
    color: "#0a2533",
    display: "block",
  };
}
