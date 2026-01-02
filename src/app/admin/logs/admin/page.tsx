"use client";

import React, { useEffect, useMemo, useState } from "react";

type AdminAuditEvent = {
  t: string;
  action: string;
  ok: boolean;
  actor: string | null;
  role: string | null;
  ip: string | null;
  user_agent: string | null;
  meta: any | null;
  error: string | null;
};

type AdminAuditStats = {
  total: number;
  ok: number;
  error: number;
  by_action: Record<string, number>;
  by_actor: Record<string, number>;
};

type ApiResp = {
  items: AdminAuditEvent[];
  stats: AdminAuditStats;
  note?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }
  return data as T;
}

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

export default function AdminAuditLogsPage() {
  const [days, setDays] = useState<number>(30);
  const [limit, setLimit] = useState<number>(400);
  const [q, setQ] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [items, setItems] = useState<AdminAuditEvent[]>([]);
  const [stats, setStats] = useState<AdminAuditStats | null>(null);

  async function load() {
    setLoading(true);
    setErr("");
    setNote("");
    try {
      const url = `/api/admin/logs/admin?days=${encodeURIComponent(String(days))}&limit=${encodeURIComponent(String(limit))}&q=${encodeURIComponent(q)}`;
      const data = await fetchJson<ApiResp>(url);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setStats(data?.stats || null);
      setNote(String(data?.note || ""));
    } catch (e: any) {
      setErr(e?.message || String(e));
      setItems([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byActionRows = useMemo(() => {
    const obj = stats?.by_action || {};
    return Object.entries(obj).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  const byActorRows = useMemo(() => {
    const obj = stats?.by_actor || {};
    return Object.entries(obj).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  function exportJson() {
    const payload = {
      exported_at: new Date().toISOString(),
      filters: { days, limit, q },
      stats,
      items,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin_audit_${days}d_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "linear-gradient(180deg, #bfe9ff 0%, #eef9ff 60%, #ffffff 100%)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <TopNav />

        <h1 style={{ fontSize: 34, margin: "8px 0 12px 0", fontWeight: 900 }}>🧾 Log thao tác admin</h1>
        <div style={{ color: "#234", marginBottom: 14 }}>
          Log được ghi dạng file local: <b>.local_logs/admin_audit.ndjson</b> (không cần đổi schema DB).
        </div>

        <div style={box()}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label style={label()}>
              <div style={labelTitle()}>Khoảng ngày (days)</div>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={inp()}>
                <option value={7}>7</option>
                <option value={30}>30</option>
                <option value={90}>90</option>
                <option value={365}>365</option>
              </select>
            </label>

            <label style={label()}>
              <div style={labelTitle()}>Giới hạn (limit)</div>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={inp()}>
                <option value={200}>200</option>
                <option value={400}>400</option>
                <option value={800}>800</option>
                <option value={1500}>1500</option>
                <option value={2000}>2000</option>
              </select>
            </label>

            <label style={{ ...label(), flex: 1, minWidth: 260 }}>
              <div style={labelTitle()}>Tìm (q)</div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="vd: upload, attach, import, admin..." style={inp()} />
            </label>

            <button onClick={load} disabled={loading} style={btnStyle("#9fe7ff", "#0a2533", "1px solid #66cde8")}>
              {loading ? "Đang tải..." : "Refresh"}
            </button>

            <button onClick={exportJson} disabled={!items.length} style={btnStyle("#fff", "#1b2a3a", "1px solid #cbdff1")}>
              Export JSON
            </button>
          </div>

          {note ? <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>{note}</div> : null}
          {err ? <div style={errBox()}>Lỗi: {err}</div> : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div style={box()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Tổng quan</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={kv()}><b>Tổng</b> <span>{stats?.total ?? 0}</span></div>
              <div style={kv()}><b>OK</b> <span>{stats?.ok ?? 0}</span></div>
              <div style={kv()}><b>Lỗi</b> <span>{stats?.error ?? 0}</span></div>
            </div>
          </div>

          <div style={box()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Theo action</div>
            {byActionRows.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {byActionRows.slice(0, 10).map(([k, v]) => (
                  <div key={k} style={kv()}>
                    <b>{k}</b>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ opacity: 0.75 }}>Chưa có dữ liệu.</div>
            )}
          </div>

          <div style={box()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Theo user</div>
            {byActorRows.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {byActorRows.slice(0, 10).map(([k, v]) => (
                  <div key={k} style={kv()}>
                    <b>{k}</b>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ opacity: 0.75 }}>Chưa có dữ liệu.</div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12, ...box() }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Danh sách log</div>

          {!items.length ? (
            <div style={{ opacity: 0.75 }}>Không có log phù hợp bộ lọc.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={table()}>
                <thead>
                  <tr>
                    <th style={th()}>Thời gian</th>
                    <th style={th()}>User</th>
                    <th style={th()}>Role</th>
                    <th style={th()}>Action</th>
                    <th style={th()}>OK?</th>
                    <th style={th()}>Error</th>
                    <th style={th()}>Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td style={td()}>{it.t}</td>
                      <td style={td()}>{it.actor || "-"}</td>
                      <td style={td()}>{it.role || "-"}</td>
                      <td style={td()}>{it.action}</td>
                      <td style={td()}>{it.ok ? "OK" : "ERR"}</td>
                      <td style={td()}>{it.error || "-"}</td>
                      <td style={td()}>
                        <pre style={pre()}>{safeMeta(it.meta)}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function safeMeta(meta: any) {
  try {
    if (meta === null || meta === undefined) return "-";
    const s = JSON.stringify(meta, null, 2);
    if (s.length > 1500) return s.slice(0, 1500) + "\n...";
    return s;
  } catch {
    return String(meta);
  }
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
  return { background: bg, color: fg, border, padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 900 };
}

function box(): React.CSSProperties {
  return {
    background: "#fff",
    borderRadius: 16,
    padding: 16,
    border: "1px solid #d8e9f7",
    boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
  };
}

function errBox(): React.CSSProperties {
  return { marginTop: 12, background: "#ffe9e9", border: "1px solid #ffb3b3", padding: 12, borderRadius: 10, fontWeight: 800 };
}

function label(): React.CSSProperties {
  return { display: "grid", gap: 6 };
}

function labelTitle(): React.CSSProperties {
  return { fontWeight: 900, fontSize: 13, opacity: 0.85 };
}

function inp(): React.CSSProperties {
  return { padding: "10px 12px", borderRadius: 12, border: "1px solid #cfe3f6", background: "#fff" };
}

function kv(): React.CSSProperties {
  return { display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 10px", border: "1px solid #e2effa", borderRadius: 12, background: "#f7fbff" };
}

function table(): React.CSSProperties {
  return { width: "100%", borderCollapse: "collapse", minWidth: 980 };
}

function th(): React.CSSProperties {
  return { textAlign: "left", padding: "10px 10px", borderBottom: "1px solid #e2effa", fontWeight: 900, background: "#f7fbff" };
}

function td(): React.CSSProperties {
  return { padding: "10px 10px", borderBottom: "1px solid #eef5ff", verticalAlign: "top" };
}

function pre(): React.CSSProperties {
  return {
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: 12,
    background: "#fff",
    border: "1px solid #eef5ff",
    borderRadius: 10,
    padding: 10,
    minWidth: 260,
  };
}
