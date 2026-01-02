"use client";

import React, { useRef, useState } from "react";

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
        maxWidth: 460,
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

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(kind: ToastKind, message: string, ms = 3600) {
    setToast({ kind, message });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), ms);
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      showToast("error", "Nhập email và password.");
      return;
    }

    setBusy(true);
    try {
      // API hỗ trợ cả { email, password } và { username, password } (backward-compatible)
      await fetchJson("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      showToast("success", "Đăng nhập OK");
      window.location.href = "/admin";
    } catch (e: any) {
      showToast("error", `Đăng nhập lỗi: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "linear-gradient(180deg, #bfe9ff 0%, #eef9ff 60%, #ffffff 100%)",
      }}
    >
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div
        style={{
          width: "100%",
          maxWidth: 460,
          padding: 18,
          border: "1px solid #d8e9f7",
          borderRadius: 16,
          background: "#fff",
          boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Admin login</h1>
        <div style={{ marginTop: 6, opacity: 0.75 }}>
          Đăng nhập bằng tài khoản tạo trong <b>Supabase → Authentication → Users</b>.
        </div>

        <form onSubmit={onLogin} style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <label>
            <div style={{ fontWeight: 800 }}>Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inp()}
              autoComplete="username"
              placeholder="office@truong.edu.vn"
            />
          </label>

          <label>
            <div style={{ fontWeight: 800 }}>Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inp()}
              autoComplete="current-password"
            />
          </label>

          <button disabled={busy} style={btn(busy)} type="submit">
            {busy ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <div style={{ marginTop: 12, fontSize: 13, opacity: 0.75, lineHeight: 1.4 }}>
          Quy ước quyền (Supabase app_metadata.role):<br />
          - <b>user</b>: cán bộ văn phòng (upload Q/A, tài liệu, gắn file)<br />
          - <b>admin</b>: toàn quyền trong admin panel
        </div>
      </div>
    </div>
  );
}

function inp(): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #cfe3f6",
    marginTop: 6,
  };
}

function btn(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 4,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #66cde8",
    background: disabled ? "#dbeafe" : "#9fe7ff",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    color: "#0a2533",
  };
}
