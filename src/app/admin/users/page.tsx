"use client";

import React, { useMemo, useRef, useState } from "react";
import { AdminShell } from "@/app/admin/_ui/AdminShell";

type ToastKind = "success" | "error" | "info";
type ToastState = { kind: ToastKind; message: string } | null;

type UserItem = {
  id: string;
  email: string;
  role: string; // admin | user | ""
  created_at?: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
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

function fmt(dt?: string | null) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return dt;
    return d.toLocaleString();
  } catch {
    return dt;
  }
}

export default function AdminUsersPage() {
  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<UserItem[]>([]);
  const [note, setNote] = useState<string>("");

  // create user form
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");

  function showToast(kind: ToastKind, message: string, ms = 4000) {
    setToast({ kind, message });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), ms);
  }

  async function load() {
    setBusy(true);
    try {
      const data = await fetchJson(`/api/admin/users?page=${page}&perPage=${perPage}&q=${encodeURIComponent(q)}`);
      setItems(data?.items || []);
      setNote(String(data?.note || ""));
    } catch (e: any) {
      showToast("error", `Load lỗi: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage]);

  const canPrev = page > 1;

  async function setRole(user_id: string, role: "admin" | "user") {
    setBusy(true);
    try {
      await fetchJson("/api/admin/users/set-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, role }),
      });
      showToast("success", `OK: set role=${role}`);
      await load();
    } catch (e: any) {
      showToast("error", `Set role lỗi: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEmail(user_id: string) {
    setBusy(true);
    try {
      await fetchJson("/api/admin/users/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id }),
      });
      showToast("success", "OK: confirm email");
      await load();
    } catch (e: any) {
      showToast("error", `Confirm email lỗi: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(user_id: string, email: string) {
    const newPass = prompt(`Nhập mật khẩu mới cho ${email} (>= 6 ký tự):`);
    if (!newPass) return;

    setBusy(true);
    try {
      await fetchJson("/api/admin/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, new_password: newPass }),
      });
      showToast("success", "OK: reset password");
    } catch (e: any) {
      showToast("error", `Reset password lỗi: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim() || !newPassword.trim()) {
      showToast("error", "Nhập email và password");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchJson("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), password: newPassword, role: newRole }),
      });
      if (res?.warning) showToast("info", `Tạo user OK nhưng có cảnh báo: ${res.warning}`);
      else showToast("success", "OK: tạo user");
      setNewEmail("");
      setNewPassword("");
      setNewRole("user");
      await load();
    } catch (e: any) {
      showToast("error", `Tạo user lỗi: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => items, [items]);

  return (
    <AdminShell
      title="Quản lý Users (role)"
      active="users"
      subtitle={
        <>
          Chỉ <b>admin</b> mới truy cập trang này. Role lưu trong <b>app_metadata.role</b>: <b>admin</b> hoặc <b>user</b>.
        </>
      }
    >
      <Toast toast={toast} onClose={() => setToast(null)} />

      <section className="card">
        <div className="grid2" style={{ alignItems: "end" }}>
          <div>
            <div className="label">Tìm theo email (lọc trong trang hiện tại)</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="vd: @gmail.com" />
          </div>

          <div>
            <div className="label">Per page</div>
            <select className="select" value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}>
              {[20, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btnPrimary" disabled={busy} onClick={() => load()}>
            {busy ? "Đang tải..." : "Tải / Lọc"}
          </button>

          <button className="btn" disabled={busy || !canPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ← Prev
          </button>
          <button className="btn" disabled={busy} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>

          <div style={{ fontWeight: 900 }}>Page: {page}</div>
        </div>

        {note ? <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)" }}>{note}</div> : null}

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th style={{ width: 140 }}>Role</th>
                <th style={{ width: 110 }}>Confirmed</th>
                <th style={{ width: 180 }}>Created</th>
                <th style={{ width: 180 }}>Last sign-in</th>
                <th style={{ width: 320 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "var(--muted)" }}>
                    Không có dữ liệu (hoặc trang này rỗng).
                  </td>
                </tr>
              ) : null}

              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 900 }}>{u.email || "(no email)"}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>id: {u.id}</div>
                  </td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                  <td>{u.email_confirmed_at ? <span style={{ fontWeight: 900 }}>✅</span> : <span style={{ fontWeight: 900 }}>❌</span>}</td>
                  <td>{fmt(u.created_at)}</td>
                  <td>{fmt(u.last_sign_in_at)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn" disabled={busy} onClick={() => setRole(u.id, "user")}>
                        Set user
                      </button>
                      <button className="btn" disabled={busy} onClick={() => setRole(u.id, "admin")}>
                        Set admin
                      </button>
                      <button className="btn" disabled={busy} onClick={() => resetPassword(u.id, u.email)}>
                        Reset pass
                      </button>
                      {!u.email_confirmed_at ? (
                        <button className="btn" disabled={busy} onClick={() => confirmEmail(u.id)}>
                          Confirm email
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 style={{ margin: 0, fontSize: "clamp(16px, 1.8vw, 20px)", fontWeight: 900 }}>Tạo user mới</h2>
        <div style={{ color: "var(--muted)", marginTop: 6 }}>
          Tạo user trong Supabase Auth + auto confirm email + gán role.
        </div>

        <form onSubmit={createUser} style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div className="grid3">
            <div>
              <div className="label">Email</div>
              <input className="input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="office@domain.com" />
            </div>

            <div>
              <div className="label">Password</div>
              <input className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder=">= 6 ký tự" />
            </div>

            <div>
              <div className="label">Role</div>
              <select className="select" value={newRole} onChange={(e) => setNewRole(e.target.value as any)}>
                <option value="user">user (cán bộ văn phòng)</option>
                <option value="admin">admin (toàn quyền)</option>
              </select>
            </div>
          </div>

          <button className="btn btnPrimary" disabled={busy} type="submit">
            {busy ? "Đang tạo..." : "Tạo user"}
          </button>
        </form>
      </section>

      <div style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
        Nếu bạn cần tìm user toàn dự án (không giới hạn page), mình có thể thêm API search kiểu “scan nhiều page” (có giới hạn max pages để an toàn).
      </div>
    </AdminShell>
  );
}

function RoleBadge({ role }: { role: string }) {
  const r = String(role || "").trim().toLowerCase();
  const bg = r === "admin" ? "#fff5d6" : r === "user" ? "var(--okBg)" : "#f4f7fb";
  const bd = r === "admin" ? "#ffd89b" : r === "user" ? "var(--okBorder)" : "#dbe7f2";
  const text = r || "(none)";
  return (
    <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 999, border: `1px solid ${bd}`, background: bg, fontWeight: 900 }}>
      {text}
    </span>
  );
}
