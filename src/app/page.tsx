"use client";

import React from "react";

type Attachment = { name: string; path: string; url?: string };
type Suggestion = { id: string; cau_hoi: string; nhom?: string | null };
type Scope = "internal" | "gemini" | "groq";

type Msg = {
  role: "user" | "assistant";
  text: string;
  scope: Scope;
  attachments?: Attachment[];
  suggestions?: Suggestion[];
};

const LOGO_SRC = "/logo.ico";
const INTERNAL_PLACEHOLDER = "Gõ 2 ký tự trở lên để hiện gợi ý (Tra cứu nội bộ Trường).";

function safeTrim(s: any) {
  return String(s ?? "").trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightParts(text: string, query: string) {
  const q = safeTrim(query).toLowerCase();
  if (!q) return [{ t: text, hit: false }];

  // token đơn giản (client)
  const tokens = q
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((x) => x.length >= 2)
    .slice(0, 6);

  if (!tokens.length) return [{ t: text, hit: false }];

  const re = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "ig");
  const parts = text.split(re);
  return parts
    .filter((p) => p.length > 0)
    .map((p) => ({
      t: p,
      hit: tokens.some((tk) => p.toLowerCase() === tk.toLowerCase()),
    }));
}

async function readJsonOrText(res: Response): Promise<{ json?: any; text?: string }> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const json = await res.json().catch(() => null);
    return { json };
  }
  const text = await res.text().catch(() => "");
  return { text };
}

function labelOf(scope: Scope) {
  if (scope === "internal") return "Tra cứu nội bộ Trường";
  if (scope === "gemini") return "Tra cứu AI (Tổng hợp)";
  return "Tra cứu AI (Nhanh)";
}

const HEADER_RE =
  /^\s*(Tiêu đề|Các bước|Nội dung|Công thức\/Ký hiệu|Ví dụ minh hoạ|Ví dụ minh họa)\s*:/im;

function hasStructured(text: string) {
  return HEADER_RE.test(String(text || ""));
}

function parseStructured(text: string) {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/);
  const sections: { title: string; lines: string[] }[] = [];
  let cur: { title: string; lines: string[] } | null = null;

  const isHeader = (l: string) =>
    /^\s*(Tiêu đề|Các bước|Nội dung|Công thức\/Ký hiệu|Ví dụ minh hoạ|Ví dụ minh họa)\s*:/i.test(l);

  for (const line0 of lines) {
    const line = line0.replace(/\s+$/g, "");
    if (!line.trim()) continue;

    if (isHeader(line)) {
      const t = line.split(":")[0].trim();
      cur = { title: t, lines: [] };
      sections.push(cur);
      const rest = line.slice(line.indexOf(":") + 1).trim();
      if (rest) cur.lines.push(rest);
      continue;
    }

    if (!cur) {
      cur = { title: "Nội dung", lines: [] };
      sections.push(cur);
    }
    cur.lines.push(line);
  }

  return sections;
}

function renderSection(sec: { title: string; lines: string[] }) {
  const title = sec.title.toLowerCase();

  if (title.includes("các bước")) {
    const items = sec.lines
      .map((x) => x.replace(/^\s*(?:b\d+\)|b\d+\.|\d+\)|\d+\.|-\s*|•\s*|\*\s*)/i, "").trim())
      .filter(Boolean);

    return (
      <ol className="bber-ol">
        {items.map((it, idx) => (
          <li key={idx}>{it}</li>
        ))}
      </ol>
    );
  }

  if (title.includes("công thức")) {
    return (
      <div className="bber-formula">
        {sec.lines.map((l, idx) => (
          <div key={idx} className="bber-formulaLine">
            {l}
          </div>
        ))}
      </div>
    );
  }

  if (title.includes("ví dụ")) {
    return (
      <div className="bber-example">
        {sec.lines.map((l, idx) => (
          <div key={idx} className="bber-exampleLine">
            {l.replace(/^\s*[-•]\s*/, "")}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bber-paras">
      {sec.lines.map((l, idx) => (
        <div key={idx} className="bber-para">
          {l}
        </div>
      ))}
    </div>
  );
}

function CollapsibleText({ text, maxChars = 900 }: { text: string; maxChars?: number }) {
  const [open, setOpen] = React.useState(false);
  const t = String(text || "");

  if (t.length <= maxChars) return <div style={{ whiteSpace: "pre-wrap" }}>{t}</div>;

  return (
    <div>
      <div style={{ whiteSpace: "pre-wrap" }}>{open ? t : t.slice(0, maxChars).trimEnd() + "…"}</div>
      <button className="bber-miniBtn" onClick={() => setOpen((v) => !v)}>
        {open ? "Thu gọn" : "Xem thêm"}
      </button>
    </div>
  );
}

export default function Page() {
  const [scope, setScope] = React.useState<Scope>("internal");
  const [theme, setTheme] = React.useState<"light" | "dark">("light");

  const [messages, setMessages] = React.useState<Msg[]>([
    { role: "assistant", text: "Xin chào, tôi là trợ lý ảo Bber. Tôi có thể giúp gì cho bạn?", scope: "internal" },
  ]);

  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState("Đang xử lý…");

  const [typingItems, setTypingItems] = React.useState<Suggestion[]>([]);
  const [typingOpen, setTypingOpen] = React.useState(false);

  const [speechSupported, setSpeechSupported] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const recogRef = React.useRef<any>(null);

  const [clientId, setClientId] = React.useState<string>("");
  const [aiRemaining, setAiRemaining] = React.useState<number>(5);

  const listRef = React.useRef<HTMLDivElement | null>(null);

  const placeholder = scope === "internal" ? INTERNAL_PLACEHOLDER : "Nhập câu hỏi…";

  React.useEffect(() => {
    // client id theo "phiên tab" (sessionStorage): đúng yêu cầu "mỗi lần truy cập"
    try {
      const key = "bber_client_id";
      let cid = sessionStorage.getItem(key) || "";
      if (!cid) {
        cid = (crypto?.randomUUID?.() || `cid_${Date.now()}_${Math.random().toString(16).slice(2)}`).slice(0, 64);
        sessionStorage.setItem(key, cid);
      }
      setClientId(cid);
    } catch {
      setClientId(`cid_${Date.now()}_${Math.random().toString(16).slice(2)}`);
    }
  }, []);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  React.useEffect(() => {
    const saved = (localStorage.getItem("bber_theme") || "").toLowerCase();
    if (saved === "dark" || saved === "light") {
      setTheme(saved as any);
      document.documentElement.dataset.theme = saved;
      return;
    }
    const isDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const t = isDark ? "dark" : "light";
    setTheme(t);
    document.documentElement.dataset.theme = t;
  }, []);

  function toggleTheme() {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    localStorage.setItem("bber_theme", t);
    document.documentElement.dataset.theme = t;
  }

  // Suggest (debounce + cache ở server)
  React.useEffect(() => {
    if (scope !== "internal") {
      setTypingItems([]);
      setTypingOpen(false);
      return;
    }

    const q = input.trim();
    if (q.length < 2) {
      setTypingItems([]);
      setTypingOpen(false);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, {
          headers: clientId ? { "x-bber-client-id": clientId } : {},
        });
        const { json } = await readJsonOrText(res);
        const items = Array.isArray(json?.items) ? (json.items as Suggestion[]) : [];
        setTypingItems(items);
        setTypingOpen(items.length > 0);
      } catch {
        setTypingItems([]);
        setTypingOpen(false);
      }
    }, 260);

    return () => clearTimeout(t);
  }, [input, scope, clientId]);

  // Voice input
  React.useEffect(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setSpeechSupported(false);
      return;
    }
    setSpeechSupported(true);

    const rec = new SR();
    rec.lang = "vi-VN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (ev: any) => {
      const t = ev?.results?.[0]?.[0]?.transcript || "";
      if (t) setInput((prev) => (prev ? `${prev} ${t}` : t));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    recogRef.current = rec;
  }, []);

  function toggleVoice() {
    const rec = recogRef.current;
    if (!rec) return;
    try {
      if (listening) {
        rec.stop();
        setListening(false);
      } else {
        rec.start();
        setListening(true);
      }
    } catch {
      setListening(false);
    }
  }

  function clearChat() {
    setMessages([{ role: "assistant", text: "Xin chào, tôi là trợ lý ảo Bber. Tôi có thể giúp gì cho bạn?", scope }]);
    setInput("");
    setTypingItems([]);
    setTypingOpen(false);
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  async function send(text?: string) {
    const q = safeTrim(text ?? input);
    if (!q || loading) return;

    setTypingOpen(false);
    setTypingItems([]);

    setMessages((m) => [...m, { role: "user", text: q, scope }]);
    setInput("");

    const isInternal = scope === "internal";
    setLoading(true);
    setLoadingText(isInternal ? "Đang tìm trong dữ liệu nội bộ…" : "Đang tạo câu trả lời AI…");

    try {
      const endpoint = isInternal ? "/api/ask" : "/api/ai";
      const payload = isInternal ? { question: q, scope: "internal" } : { question: q, provider: scope };

      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clientId ? { "x-bber-client-id": clientId } : {}),
        },
        body: JSON.stringify(payload),
      });

      // AI quota header
      const rem = r.headers.get("x-ai-remaining");
      if (rem != null && rem !== "") {
        const n = Number(rem);
        if (!Number.isNaN(n)) setAiRemaining(n);
      }

      const { json, text: rawText } = await readJsonOrText(r);

      if (!r.ok) {
        const errMsg =
          safeTrim(json?.error) || safeTrim(json?.message) || safeTrim(json?.answer) || safeTrim(rawText) || "Có lỗi.";
        throw new Error(errMsg);
      }

      const answer = safeTrim(json?.answer) || "Xin lỗi, tôi chưa có thông tin phù hợp.";
      const attachments = Array.isArray(json?.attachments) ? (json.attachments as Attachment[]) : undefined;
      const suggestions = Array.isArray(json?.suggestions) ? (json.suggestions as Suggestion[]) : undefined;

      setMessages((m) => [...m, { role: "assistant", text: answer, scope, attachments, suggestions }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `Có lỗi xảy ra: ${safeTrim(e?.message) || "Không xác định"}`, scope },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bber-root">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet" />

      <style jsx global>{`
        :root {
          --bber-bg1: #d8fefb;
          --bber-bg2: #8be8f5;
          --bber-brand: #0aabe8;

          --bber-card: rgba(255, 255, 255, 0.92);
          --bber-text: #0f172a;
          --bber-muted: rgba(15, 23, 42, 0.65);
          --bber-border: rgba(15, 23, 42, 0.12);

          --bber-bubble-user: rgba(10, 171, 232, 0.18);
          --bber-bubble-bot: rgba(15, 23, 42, 0.06);
          --bber-hit: rgba(255, 196, 0, 0.35);
        }

        html[data-theme="dark"] {
          --bber-card: rgba(2, 6, 23, 0.62);
          --bber-text: #e5e7eb;
          --bber-muted: rgba(229, 231, 235, 0.65);
          --bber-border: rgba(229, 231, 235, 0.18);
          --bber-bubble-user: rgba(10, 171, 232, 0.28);
          --bber-bubble-bot: rgba(229, 231, 235, 0.1);
          --bber-hit: rgba(255, 196, 0, 0.25);
        }

        html,
        body {
          height: 100%;
        }
        body {
          margin: 0;
          font-family: "Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
          color: var(--bber-text);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .bber-root {
          min-height: 100dvh;
          background: radial-gradient(1200px 650px at 20% 10%, var(--bber-bg2), transparent 55%),
            radial-gradient(1200px 650px at 80% 20%, var(--bber-bg1), transparent 60%);
          display: flex;
          justify-content: center;
          align-items: stretch;
          padding: 10px;
          box-sizing: border-box;
        }

        .bber-chatCard {
          width: 100%;
          max-width: 1200px;
          height: calc(100dvh - 20px);
          background: var(--bber-card);
          border: 1px solid var(--bber-border);
          border-radius: 18px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
          overflow: hidden;
          backdrop-filter: blur(8px);
          display: flex;
          flex-direction: column;
        }

        .bber-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          border-bottom: 1px solid var(--bber-border);
          gap: 10px;
        }

        .bber-headLeft {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .bber-logo {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          object-fit: contain;
          border: 1px solid var(--bber-border);
          background: rgba(255, 255, 255, 0.75);
          flex: 0 0 auto;
        }

        .bber-title {
          font-weight: 900;
          font-size: 18px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .bber-sub {
          font-size: 12px;
          color: var(--bber-muted);
          font-weight: 700;
          margin-top: 2px;
        }

        .bber-btn {
          border: 1px solid var(--bber-border);
          background: rgba(255, 255, 255, 0.6);
          color: var(--bber-text);
          border-radius: 12px;
          padding: 8px 10px;
          font-weight: 900;
          cursor: pointer;
        }

        html[data-theme="dark"] .bber-btn {
          background: rgba(2, 6, 23, 0.35);
        }

        .bber-body {
          flex: 1;
          padding: 12px;
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .bber-bubble {
          max-width: min(920px, 92%);
          border-radius: 16px;
          padding: 10px 12px;
          border: 1px solid var(--bber-border);
          word-break: break-word;
          line-height: 1.6;
          font-size: 14px;
          position: relative;
        }

        .bber-bot {
          align-self: flex-start;
          background: var(--bber-bubble-bot);
        }

        .bber-user {
          align-self: flex-end;
          background: var(--bber-bubble-user);
          border-color: rgba(10, 171, 232, 0.35);
        }

        .bber-bubbleTop {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-bottom: 6px;
        }

        .bber-miniBtn {
          border: 1px solid var(--bber-border);
          background: rgba(255, 255, 255, 0.55);
          color: var(--bber-text);
          border-radius: 10px;
          padding: 6px 8px;
          font-weight: 900;
          cursor: pointer;
          font-size: 12px;
        }
        html[data-theme="dark"] .bber-miniBtn {
          background: rgba(2, 6, 23, 0.25);
        }

        .bber-secTitle {
          font-weight: 900;
          margin: 8px 0 6px;
        }

        .bber-paras {
          display: grid;
          gap: 6px;
        }
        .bber-para {
          white-space: pre-wrap;
        }

        .bber-ol {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 6px;
        }

        .bber-formula {
          border: 1px dashed var(--bber-border);
          border-radius: 12px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.45);
        }
        html[data-theme="dark"] .bber-formula {
          background: rgba(2, 6, 23, 0.25);
        }
        .bber-formulaLine {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
            monospace;
          font-size: 13px;
          white-space: pre-wrap;
        }

        .bber-example {
          border-left: 4px solid rgba(10, 171, 232, 0.5);
          padding-left: 10px;
          display: grid;
          gap: 6px;
        }

        .bber-files {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .bber-fileTitle {
          font-weight: 900;
        }

        .bber-fileLink {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(10, 171, 232, 0.35);
          background: rgba(10, 171, 232, 0.1);
          text-decoration: none;
          color: var(--bber-text);
          font-weight: 900;
        }

        .bber-suggestWrap {
          margin-top: 10px;
        }
        .bber-suggestTitle {
          font-weight: 900;
          margin-bottom: 6px;
        }
        .bber-suggestList {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .bber-suggestBtn {
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(10, 171, 232, 0.35);
          background: rgba(10, 171, 232, 0.1);
          cursor: pointer;
          font-size: 13px;
          font-weight: 900;
          color: var(--bber-text);
        }

        .bber-footer {
          border-top: 1px solid var(--bber-border);
          padding: 10px;
          display: grid;
          gap: 10px;
        }

        .bber-modeRow {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
          align-items: center;
        }

        .bber-modeBar {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .bber-mode {
          border: 1px solid var(--bber-border);
          background: rgba(255, 255, 255, 0.55);
          border-radius: 999px;
          padding: 8px 12px;
          cursor: pointer;
          font-weight: 900;
          font-size: 13px;
        }
        html[data-theme="dark"] .bber-mode {
          background: rgba(2, 6, 23, 0.3);
        }

        .bber-modeActive {
          border-color: rgba(10, 171, 232, 0.55);
          box-shadow: 0 0 0 3px rgba(10, 171, 232, 0.12);
        }

        .bber-aiQuota {
          font-size: 12px;
          color: var(--bber-muted);
          font-weight: 900;
          padding: 6px 10px;
          border: 1px dashed var(--bber-border);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.45);
        }
        html[data-theme="dark"] .bber-aiQuota {
          background: rgba(2, 6, 23, 0.25);
        }

        .bber-inputRow {
          position: relative;
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .bber-input {
          flex: 1;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid var(--bber-border);
          outline: none;
          font-size: 14px;
          background: rgba(255, 255, 255, 0.6);
          color: var(--bber-text);
        }

        html[data-theme="dark"] .bber-input {
          background: rgba(2, 6, 23, 0.3);
        }

        .bber-send {
          padding: 12px 14px;
          border-radius: 14px;
          border: none;
          background: var(--bber-brand);
          color: white;
          font-weight: 900;
          cursor: pointer;
        }

        .bber-clear {
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid var(--bber-border);
          background: rgba(255, 255, 255, 0.75);
          color: var(--bber-text);
          font-weight: 900;
          cursor: pointer;
        }

        html[data-theme="dark"] .bber-clear {
          background: rgba(2, 6, 23, 0.35);
        }

        .bber-mic {
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid var(--bber-border);
          background: rgba(255, 255, 255, 0.55);
          cursor: pointer;
          font-weight: 900;
        }

        html[data-theme="dark"] .bber-mic {
          background: rgba(2, 6, 23, 0.3);
        }

        .bber-micOn {
          box-shadow: 0 0 0 3px rgba(14, 163, 86, 0.2);
          border-color: rgba(14, 163, 86, 0.45);
        }

        .bber-auto {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 54px;
          background: var(--bber-card);
          border: 1px solid rgba(10, 171, 232, 0.35);
          border-radius: 14px;
          padding: 10px;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
          z-index: 50;
        }

        .bber-autoTitle {
          font-weight: 900;
          margin-bottom: 8px;
        }

        .bber-autoGrid {
          display: grid;
          gap: 6px;
        }

        .bber-autoItem {
          text-align: left;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid var(--bber-border);
          background: rgba(255, 255, 255, 0.55);
          cursor: pointer;
          font-weight: 900;
        }

        html[data-theme="dark"] .bber-autoItem {
          background: rgba(2, 6, 23, 0.25);
        }

        .bber-autoMeta {
          margin-top: 4px;
          font-size: 12px;
          color: var(--bber-muted);
          font-weight: 700;
        }

        .bber-hit {
          background: var(--bber-hit);
          padding: 0 2px;
          border-radius: 4px;
        }
      

/* Mobile responsive tuning */
@media (max-width: 480px) {
  .bber-body { padding: 10px; }
  .bber-bubble { max-width: 100%; }

  .bber-title { font-size: 17px; }
  .bber-btn { padding: 8px 10px; border-radius: 12px; font-size: 12px; font-weight: 800; }

  .bber-modeRow { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .bber-mode { width: 100%; padding: 8px 10px; font-size: 12px; line-height: 1.15; text-align: center; font-weight: 800; white-space: normal; }
  .bber-modeRow .bber-mode:nth-child(3) { grid-column: 1 / -1; }

  .bber-inputRow { flex-wrap: wrap; gap: 8px; }
  .bber-mic { padding: 8px 10px; border-radius: 12px; }

  .bber-input { flex-basis: 100%; padding: 10px 12px; font-size: 14px; }
  .bber-send, .bber-clear { flex: 1 1 calc(50% - 4px); padding: 10px 12px; border-radius: 12px; font-weight: 800; min-width: 0; }
}`}</style>

      <div className="bber-chatCard">
        <div className="bber-header">
          <div className="bber-headLeft">
            <img
              className="bber-logo"
              src={LOGO_SRC}
              alt="Bber"
              onError={(e) => {
                (e.currentTarget as any).src = "/logo.png";
              }}
            />
            <div>
              <div className="bber-title">Bber – Trợ lý ảo cho HSSV</div>
              <div className="bber-sub">Chế độ hiện tại: {labelOf(scope)}</div>
            </div>
          </div>

          <button className="bber-btn" onClick={toggleTheme}>
            {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
          </button>
        </div>

        <div ref={listRef} className="bber-body">
          {messages.map((m, i) => {
            const canCopy = m.role === "assistant" && i > 0;
            const isAI = m.role === "assistant" && (m.scope === "gemini" || m.scope === "groq");
            const copyText = () => {
              const files = (m.attachments || [])
                .map((f) => `- ${f.name}: ${f.url || ""}`)
                .filter(Boolean)
                .join("\n");
              const full = files ? `${m.text}\n\nTệp đính kèm:\n${files}` : m.text;
              copyToClipboard(full);
            };

            return (
              <div key={i} className={`bber-bubble ${m.role === "user" ? "bber-user" : "bber-bot"}`}>
                {canCopy && (
                  <div className="bber-bubbleTop">
                    <button className="bber-miniBtn" onClick={copyText} title="Copy nội dung">
                      Copy
                    </button>
                  </div>
                )}

                {m.role === "assistant" && m.scope === "internal" && hasStructured(m.text) ? (
                  <>
                    {parseStructured(m.text).map((sec, idx) => (
                      <div key={idx}>
                        <div className="bber-secTitle">{sec.title}:</div>
                        {renderSection(sec)}
                      </div>
                    ))}
                  </>
                ) : m.role === "assistant" && isAI ? (
                  <CollapsibleText text={m.text} maxChars={900} />
                ) : (
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                )}

                {m.attachments?.length ? (
                  <div className="bber-files">
                    <div className="bber-fileTitle">Tải file đính kèm:</div>
                    {m.attachments.map((f) => (
                      <a key={f.path} className="bber-fileLink" href={f.url} target="_blank" rel="noreferrer">
                        ⬇ Tải: {f.name}
                      </a>
                    ))}
                  </div>
                ) : null}

                {m.suggestions?.length ? (
                  <div className="bber-suggestWrap">
                    <div className="bber-suggestTitle">Gợi ý liên quan:</div>
                    <div className="bber-suggestList">
                      {m.suggestions.map((s) => (
                        <button key={s.id} className="bber-suggestBtn" onClick={() => send(s.cau_hoi)}>
                          {s.cau_hoi}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {loading && <div className="bber-bubble bber-bot">{loadingText}</div>}
        </div>

        <div className="bber-footer">
          {/* mode bar nằm ngay trên dòng nhập */}
          <div className="bber-modeRow">
            <div className="bber-modeBar">
              {(["internal", "gemini", "groq"] as Scope[]).map((k) => (
                <button
                  key={k}
                  className={`bber-mode ${scope === k ? "bber-modeActive" : ""}`}
                  onClick={() => {
                    setScope(k);
                    setTypingOpen(false);
                    setTypingItems([]);
                  }}
                  title={labelOf(k)}
                >
                  {labelOf(k)}
                </button>
              ))}
            </div>

            {scope !== "internal" && <div className="bber-aiQuota">AI còn lại: {aiRemaining}/5</div>}
          </div>

          <div className="bber-inputRow">
            {speechSupported ? (
              <button
                className={`bber-mic ${listening ? "bber-micOn" : ""}`}
                onClick={toggleVoice}
                title={listening ? "Đang nghe… bấm để dừng" : "Bấm để nói"}
              >
                {listening ? "🎙️…" : "🎙️"}
              </button>
            ) : (
              <button className="bber-mic" disabled title="Trình duyệt không hỗ trợ nhập giọng nói">
                🎙️
              </button>
            )}

            <input
              className="bber-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              onKeyDown={(e) => e.key === "Enter" && send()}
              onFocus={() => {
                if (typingItems.length > 0 && scope === "internal") setTypingOpen(true);
              }}
            />

            <button className="bber-send" onClick={() => send()} disabled={loading}>
              Gửi
            </button>

            <button className="bber-clear" onClick={clearChat} title="Xoá toàn bộ nội dung chat">
              Xoá
            </button>

            {scope === "internal" && typingOpen && typingItems.length > 0 && (
              <div className="bber-auto">
                <div className="bber-autoTitle">Gợi ý câu hỏi</div>
                <div className="bber-autoGrid">
                  {typingItems.map((s) => (
                    <button key={s.id} className="bber-autoItem" onClick={() => send(s.cau_hoi)}>
                      <div>
                        {highlightParts(s.cau_hoi, input).map((p, idx) =>
                          p.hit ? (
                            <span key={idx} className="bber-hit">
                              {p.t}
                            </span>
                          ) : (
                            <span key={idx}>{p.t}</span>
                          )
                        )}
                      </div>
                      {s.nhom ? <div className="bber-autoMeta">Nhóm: {s.nhom}</div> : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
