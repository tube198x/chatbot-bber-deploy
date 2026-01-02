"use client";

import React, { useEffect, useMemo, useState } from "react";

type ChatLogItem = {
  created_at: any;
  day: string;
  source: string;
  scope: string;
  question: string;
  faq_id: any;
  ip: string | null;
  user_agent: string | null;
  attachment_count: number | null;
  raw?: any;
};

type ChatStats = {
  total: number;
  unique_ip: number;
  by_source: Record<string, number>;
  by_day: Array<{ day: string; count: number; by_source: Record<string, number> }>;
  top_faq: Array<{ faq_id: string; count: number }>;
  top_questions: Array<{ question: string; count: number }>;
};

type ApiResp = {
  items: ChatLogItem[];
  stats: ChatStats;
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

export default function AdminChatLogsPage() {
  const [days, setDays] = useState<number>(7);
  const [limit, setLimit] = useState<number>(400);
  const [q, setQ] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [items, setItems] = useState<ChatLogItem[]>([]);
  const [stats, setStats] = useState<ChatStats | null>(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const url = `/api/admin/logs/chat?days=${encodeURIComponent(String(days))}&limit=${encodeURIComponent(String(limit))}&q=${encodeURIComponent(q)}`;
      const data = await fetchJson<ApiResp>(url);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setStats(data?.stats || null);
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

  const bySourceRows = useMemo(() => {
    const obj = stats?.by_source || {};
    return Object.entries(obj).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  const byDayRows = useMemo(() => {
    return Array.isArray(stats?.by_day) ? stats!.by_day : [];
  }, [stats]);

  const topFaq = useMemo(() => {
    return Array.isArray(stats?.top_faq) ? stats!.top_faq : [];
  }, [stats]);

  const topQuestions = useMemo(() => {
    return Array.isArray(stats?.top_questions) ? stats!.top_questions : [];
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
    a.download = `chat_logs_${days}d_${Date.now()}.json`;
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

        <h1 style={{ fontSize: 34, margin: "8px 0 12px 0", fontWeight: 900 }}>📊 Log chat</h1>
        <div style={{ color: "#234", marginBottom: 14 }}>
          Dữ liệu đọc từ Supabase table <b>log_chat</b> (được ghi trong <b>/api/ask</b>).
        </div>

        <div style={box()}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label style={label()}>
              <div style={labelTitle()}>Khoảng ngày (days)</div>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={inp()}>
                <option value={1}>1</option>
                <option value={7}>7</option>
                <option value={30}>30</option>
                <option value={90}>90</option>
              </select>
            </label>

            <label style={label()}>
              <div style={labelTitle()}>Giới hạn (limit)</div>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={inp()}>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={400}>400</option>
                <option value={800}>800</option>
                <option value={1500}>1500</option>
              </select>
            </label>

            <label style={{ ...label(), flex: 1, minWidth: 260 }}>
              <div style={labelTitle()}>Tìm (q)</div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="vd: fallback, published, học phí..." style={inp()} />
            </label>

            <button
              onClick={load}
              disabled={loading}
              style={btnStyle("#9fe7ff", "#0a2533", "1px solid #66cde8")}
            >
              {loading ? "Đang tải..." : "Refresh"}
            </button>

            <button
              onClick={exportJson}
              disabled={!items.length}
              style={btnStyle("#fff", "#1b2a3a", "1px solid #cbdff1")}
            >
              Export JSON
            </button>
          </div>

          {err ? <div style={errBox()}>Lỗi: {err}</div> : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div style={box()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Tổng quan</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={kv()}><b>Tổng</b> <span>{stats?.total ?? 0}</span></div>
              <div style={kv()}><b>IP unique</b> <span>{stats?.unique_ip ?? 0}</span></div>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75, lineHeight: 1.4 }}>
              * Nếu bảng log_chat thiếu cột <b>created_at</b>, backend sẽ fallback theo <b>id</b>/limit.
            </div>
          </div>

          <div style={box()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Theo source</div>
            {bySourceRows.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {bySourceRows.map(([k, v]) => (
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
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Top FAQ</div>
            {topFaq.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {topFaq.slice(0, 8).map((x) => (
                  <div key={x.faq_id} style={kv()}>
                    <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.faq_id}</b>
                    <span>{x.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ opacity: 0.75 }}>Chưa có dữ liệu.</div>
            )}
          </div>

          <div style={box()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Top câu hỏi</div>
            {topQuestions.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {topQuestions.slice(0, 8).map((x, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={x.question}>
                      {x.question}
                    </div>
                    <div style={{ fontWeight: 900 }}>{x.count}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ opacity: 0.75 }}>Chưa có dữ liệu.</div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12, ...box() }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Theo ngày</div>
          {byDayRows.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={table()}>
                <thead>
                  <tr>
                    <th style={th()}>Ngày</th>
                    <th style={th()}>Tổng</th>
                    <th style={th()}>Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {byDayRows.slice(-14).map((r) => (
                    <tr key={r.day}>
                      <td style={td()}>{r.day}</td>
                      <td style={td()}>{r.count}</td>
                      <td style={td()}>
                        {Object.entries(r.by_source || {})
                          .sort((a, b) => b[1] - a[1])
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>
                Hiển thị 14 ngày gần nhất trong khoảng lọc.
              </div>
            </div>
          ) : (
            <div style={{ opacity: 0.75 }}>Chưa có dữ liệu.</div>
          )}
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
                    <th style={th()}>Source</th>
                    <th style={th()}>FAQ id</th>
                    <th style={th()}>Câu hỏi</th>
                    <th style={th()}>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td style={td()}>{String(it.created_at || "")}</td>
                      <td style={td()}>{it.source}</td>
                      <td style={td()}>{it.faq_id ? String(it.faq_id) : "-"}</td>
                      <td style={td()} title={it.question}>
                        {it.question}
                      </td>
                      <td style={td()}>{it.ip || "-"}</td>
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
  return { width: "100%", borderCollapse: "collapse", minWidth: 820 };
}

function th(): React.CSSProperties {
  return { textAlign: "left", padding: "10px 10px", borderBottom: "1px solid #e2effa", fontWeight: 900, background: "#f7fbff" };
}

function td(): React.CSSProperties {
  return { padding: "10px 10px", borderBottom: "1px solid #eef5ff", verticalAlign: "top" };
}
