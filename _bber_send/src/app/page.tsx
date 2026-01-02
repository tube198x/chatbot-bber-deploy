"use client";

import React from "react";

type Msg = {
  role: "user" | "assistant";
  text: string;
  files?: string[];
};

export default function Page() {
  const [messages, setMessages] = React.useState<Msg[]>([
    {
      role: "assistant",
      text: "Xin chào, tôi là trợ lý ảo Bber. Tôi có thể giúp gì cho bạn?",
    },
  ]);

  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  // ✅ GIAI ĐOẠN 2 – BƯỚC 1: thêm scope (GIỮ UI CŨ)
  const [scope, setScope] = React.useState<"internal" | "study">("internal");

  async function send() {
    if (!input.trim()) return;
    const q = input.trim();

    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);

    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          scope, // 👈 gửi scope
        }),
      });

      const data = await r.json();
      const files: string[] = data?.faq?.file_urls || [];

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.answer || "Xin lỗi, tôi chưa có thông tin phù hợp.",
          files,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Có lỗi xảy ra khi xử lý yêu cầu.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <header style={header}>
          <b>Bber – Trợ lý sinh viên</b>
        </header>

        <div style={body}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                ...bubble,
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "#dbeafe" : "#f3f4f6",
              }}
            >
              <div>{m.text}</div>

              {m.files?.length ? (
                <div style={{ marginTop: 10 }}>
                  <b>Tệp đính kèm</b>
                  <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                    {m.files.map((p) => (
                      <SignedFileLink key={p} path={p} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          {loading && (
            <div style={{ ...bubble, alignSelf: "flex-start" }}>
              Đang xử lý…
            </div>
          )}
        </div>

        <footer style={footer}>
          {/* ✅ RADIO – thêm nhưng không phá UI */}
          <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
            <label>
              <input
                type="radio"
                checked={scope === "internal"}
                onChange={() => setScope("internal")}
              />{" "}
              Tra cứu nội bộ
            </label>

            <label>
              <input
                type="radio"
                checked={scope === "study"}
                onChange={() => setScope("study")}
              />{" "}
              Tra cứu học tập (AI)
            </label>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={inputBox}
              placeholder="Nhập câu hỏi…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button onClick={send} disabled={loading} style={btn}>
              Gửi
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ===== Signed file link ===== */
function SignedFileLink({ path }: { path: string }) {
  const [url, setUrl] = React.useState("");
  const name = path.split("/").pop();

  React.useEffect(() => {
    fetch(`/api/files/signed?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => setUrl(d.url))
      .catch(() => {});
  }, [path]);

  if (!url) return <span style={{ fontSize: 13 }}>Đang tạo link…</span>;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        padding: "6px 10px",
        border: "1px solid #ddd",
        borderRadius: 10,
        fontSize: 13,
        textDecoration: "none",
      }}
    >
      {name}
    </a>
  );
}

/* ===== Styles (GIỮ NGUYÊN) ===== */
const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "#f9fafb",
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  height: "90vh",
  display: "flex",
  flexDirection: "column",
  borderRadius: 16,
  background: "#fff",
  boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
};

const header: React.CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #eee",
  textAlign: "center",
};

const body: React.CSSProperties = {
  flex: 1,
  padding: 12,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const bubble: React.CSSProperties = {
  padding: 10,
  borderRadius: 12,
  maxWidth: "85%",
  fontSize: 14,
};

const footer: React.CSSProperties = {
  padding: 12,
  borderTop: "1px solid #eee",
};

const inputBox: React.CSSProperties = {
  flex: 1,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#2563eb",
  color: "#fff",
};
