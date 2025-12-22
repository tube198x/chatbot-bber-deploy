"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type SuggestItem = {
  id: string;
  cau_hoi: string;
  nhom: string | null;
  score: number | null;
};

type AskResponse =
  | {
      mode: "faq" | "ai" | "fallback";
      answer: string;
      matched?: { id: string; cau_hoi: string; nhom?: string | null; score?: number | null } | null;
    }
  | any;

type ChatMsg = {
  id: string;
  role: "bot" | "user";
  text: string;
  meta?: { mode?: string; nhom?: string | null; score?: number | null } | null;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function normalizeQ(q: string) {
  return q.trim().replace(/\s+/g, " ");
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function Page() {
  // ====== quick chips (đề xuất) ======
  const quickChips = useMemo(
    () => [
      { label: "Học phí", q: "Thời hạn đóng học phí học kỳ 1 là khi nào?" },
      { label: "Thời khóa biểu", q: "Cho tôi tra cứu thời khóa biểu theo lớp." },
      { label: "Thủ tục nhập học", q: "Thủ tục nhập học cần những giấy tờ gì?" },
      { label: "Ký túc xá", q: "Đăng ký ký túc xá như thế nào?" },
      { label: "Miễn giảm", q: "Điều kiện miễn giảm học phí gồm những gì?" },
      { label: "Liên hệ", q: "Số điện thoại và nơi liên hệ phòng công tác HSSV?" },
    ],
    []
  );

  // ====== state ======
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestMode, setSuggestMode] = useState<"semantic" | "keyword" | "off">("semantic");
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [showSuggest, setShowSuggest] = useState(true);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: uid(),
      role: "bot",
      text: "Xin chào tôi là trợ lý ảo Bber, tôi có thể giúp gì cho bạn ?",
      meta: { mode: "faq" },
    },
  ]);

  // ====== refs ======
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ====== responsive helper ======
  const isClient = typeof window !== "undefined";
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const calc = () => setIsMobile(window.innerWidth <= 768);
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // ====== auto scroll ======
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  // ====== suggestions (debounced) ======
  const debouncedInput = useDebouncedValue(input, 250);

  useEffect(() => {
    const q = normalizeQ(debouncedInput);
    if (!showSuggest || suggestMode === "off") {
      setSuggestions([]);
      return;
    }
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    let aborted = false;
    (async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { method: "GET" });
        if (!r.ok) return;
        const data = await r.json();
        if (aborted) return;

        // data: { mode: "semantic"/"keyword", suggestions: [...] }
        const items: SuggestItem[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
        setSuggestions(items.slice(0, 6));
      } catch {
        // ignore
      }
    })();

    return () => {
      aborted = true;
    };
  }, [debouncedInput, showSuggest, suggestMode]);

  // ====== send question ======
  async function sendQuestion(qRaw: string) {
    const q = normalizeQ(qRaw);
    if (!q) return;

    setSending(true);
    setSuggestions([]); // ẩn gợi ý khi gửi
    setShowSuggest(false);

    const userMsg: ChatMsg = { id: uid(), role: "user", text: q };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      const data: AskResponse = await r.json().catch(() => ({}));
      const answerText =
        typeof data?.answer === "string" && data.answer.trim()
          ? data.answer.trim()
          : "Xin lỗi, hiện tại Bber chưa trả lời được. Bạn có thể thử hỏi lại theo cách khác.";

      const mode = typeof data?.mode === "string" ? data.mode : "fallback";

      const botMsg: ChatMsg = {
        id: uid(),
        role: "bot",
        text: answerText,
        meta: {
          mode,
          nhom: data?.matched?.nhom ?? null,
          score: data?.matched?.score ?? null,
        },
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "bot",
          text: "Không kết nối được máy chủ. Bạn kiểm tra mạng và thử lại.",
          meta: { mode: "error" },
        },
      ]);
    } finally {
      setSending(false);
      setShowSuggest(true);
      setInput("");
      inputRef.current?.focus();
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    sendQuestion(input);
  }

  function onPickSuggestion(item: SuggestItem) {
    // click gợi ý: gửi luôn (đúng yêu cầu “click gợi ý để trả lời nhanh”)
    if (sending) return;
    sendQuestion(item.cau_hoi);
  }

  function onPickChip(q: string) {
    if (sending) return;
    sendQuestion(q);
  }

  function clearChat() {
    setMessages([
      {
        id: uid(),
        role: "bot",
        text: "Xin chào tôi là trợ lý ảo Bber, tôi có thể giúp gì cho bạn ?",
        meta: { mode: "faq" },
      },
    ]);
    setInput("");
    setSuggestions([]);
    inputRef.current?.focus();
  }

  // ====== layout widths: mobile full; desktop 1/3 ======
  const shellWidth = isMobile ? "100%" : "34%"; // ~1/3
  const shellMinWidth = isMobile ? "100%" : "420px";
  const shellMaxWidth = isMobile ? "100%" : "520px";

  return (
    <div className="bber-bg">
      <div className="bber-top">
        <div className="bber-brand">
          <img className="bber-logo" src="/bber-logo.ico" alt="Bber" />
          <div>
            <div className="bber-title">Bber</div>
            <div className="bber-sub">Trợ lý ảo HSSV · Gợi ý khi gõ · Ưu tiên FAQ</div>
          </div>
        </div>

        <div className="bber-actions">
          <button className="bber-btn" type="button" onClick={() => setSuggestMode((m) => (m === "off" ? "semantic" : "off"))}>
            {suggestMode === "off" ? "Bật gợi ý" : "Tắt gợi ý"}
          </button>
          <button className="bber-btn bber-btn-ghost" type="button" onClick={clearChat}>
            Xóa hội thoại
          </button>
        </div>
      </div>

      <div className="bber-shell" style={{ width: shellWidth, minWidth: shellMinWidth, maxWidth: shellMaxWidth }}>
        {/* Quick chips */}
        <div className="bber-chips">
          {quickChips.map((c) => (
            <button key={c.label} className="bber-chip" type="button" onClick={() => onPickChip(c.q)} disabled={sending}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Chat box */}
        <div className="bber-card">
          <div className="bber-chat">
            {messages.map((m) => (
              <div key={m.id} className={`bber-msg-row ${m.role === "user" ? "right" : "left"}`}>
                <div className={`bber-msg ${m.role === "user" ? "user" : "bot"}`}>
                  {m.role === "bot" && (
                    <div className="bber-badge">
                      Bber <span className="bber-badge-mode">({m.meta?.mode ?? "faq"})</span>
                    </div>
                  )}
                  <div className="bber-text">{m.text}</div>

                  {m.role === "bot" && (m.meta?.nhom || typeof m.meta?.score === "number") && (
                    <div className="bber-meta">
                      {m.meta?.nhom ? <span>Nhóm: {m.meta.nhom}</span> : null}
                      {typeof m.meta?.score === "number" ? <span> · Score: {m.meta.score.toFixed(3)}</span> : null}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="bber-msg-row left">
                <div className="bber-msg bot">
                  <div className="bber-badge">
                    Bber <span className="bber-badge-mode">(đang trả lời)</span>
                  </div>
                  <div className="bber-text">…</div>
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          {/* Suggestions */}
          {showSuggest && suggestions.length > 0 && (
            <div className="bber-suggest">
              {suggestions.map((s) => (
                <button key={s.id} className="bber-suggest-item" type="button" onClick={() => onPickSuggestion(s)} disabled={sending}>
                  <div className="bber-sq">{s.cau_hoi}</div>
                  <div className="bber-smeta">
                    {s.nhom ? <span>{s.nhom}</span> : <span>&nbsp;</span>}
                    {typeof s.score === "number" ? <span> · {s.score.toFixed(3)}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form className="bber-inputbar" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              className="bber-input"
              placeholder="Nhập câu hỏi của bạn..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setShowSuggest(true)}
              disabled={sending}
              autoComplete="off"
            />
            <button className="bber-send" type="submit" disabled={sending || !normalizeQ(input)}>
              Gửi
            </button>
          </form>

          <div className="bber-hint">Nhấn Enter để hỏi • Click gợi ý để trả lời nhanh</div>
        </div>
      </div>

      <style jsx>{`
        /* Background: đồng bộ tone xanh logo */
        .bber-bg {
          min-height: 100vh;
          padding: 18px 14px 30px;
          background: radial-gradient(1200px 700px at 25% 10%, rgba(140, 220, 255, 0.75), rgba(255, 255, 255, 0) 55%),
            radial-gradient(900px 600px at 70% 20%, rgba(120, 200, 255, 0.55), rgba(255, 255, 255, 0) 60%),
            linear-gradient(180deg, rgba(210, 245, 255, 0.65), rgba(255, 255, 255, 0.95));
          display: flex;
          flex-direction: column;
          align-items: center;
          color: #0a2a3a;
        }

        /* Top bar */
        .bber-top {
          width: 100%;
          max-width: 1080px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .bber-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .bber-logo {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.85);
          border: 1px solid rgba(0, 80, 120, 0.14);
          box-shadow: 0 10px 30px rgba(0, 60, 100, 0.12);
          object-fit: cover;
        }

        .bber-title {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 0.2px;
        }

        .bber-sub {
          font-size: 14px;
          opacity: 0.85;
        }

        .bber-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .bber-btn {
          border: 1px solid rgba(0, 80, 120, 0.16);
          background: rgba(255, 255, 255, 0.85);
          color: #0a2a3a;
          padding: 9px 12px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 600;
          box-shadow: 0 8px 22px rgba(0, 60, 100, 0.08);
        }
        .bber-btn:hover {
          background: rgba(255, 255, 255, 0.95);
        }
        .bber-btn-ghost {
          background: rgba(255, 255, 255, 0.55);
        }

        /* Shell responsive */
        .bber-shell {
          width: 100%;
        }

        .bber-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 0 0 10px;
        }

        .bber-chip {
          border: 1px solid rgba(0, 90, 140, 0.16);
          background: rgba(255, 255, 255, 0.72);
          padding: 8px 10px;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 650;
          font-size: 13px;
        }
        .bber-chip:hover {
          background: rgba(255, 255, 255, 0.92);
        }
        .bber-chip:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Card */
        .bber-card {
          border-radius: 18px;
          border: 1px solid rgba(0, 80, 120, 0.12);
          background: rgba(255, 255, 255, 0.75);
          box-shadow: 0 18px 40px rgba(0, 60, 100, 0.12);
          overflow: hidden;
          backdrop-filter: blur(10px);
        }

        /* Chat */
        .bber-chat {
          height: ${isClient ? (isMobile ? "calc(100vh - 270px)" : "560px") : "560px"};
          min-height: ${isClient ? (isMobile ? "520px" : "560px") : "560px"};
          padding: 12px;
          overflow: auto;
          border: 1px solid rgba(0, 80, 120, 0.12);
          margin: 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.55);
        }

        .bber-msg-row {
          display: flex;
          margin: 10px 0;
        }
        .bber-msg-row.left {
          justify-content: flex-start;
        }
        .bber-msg-row.right {
          justify-content: flex-end;
        }

        .bber-msg {
          max-width: 88%;
          border-radius: 14px;
          padding: 10px 12px;
          border: 1px solid rgba(0, 80, 120, 0.12);
          box-shadow: 0 10px 22px rgba(0, 60, 100, 0.06);
          background: rgba(255, 255, 255, 0.86);
        }

        .bber-msg.user {
          background: rgba(210, 245, 255, 0.9);
          border-color: rgba(0, 120, 170, 0.18);
        }

        .bber-badge {
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 6px;
        }
        .bber-badge-mode {
          font-weight: 700;
          opacity: 0.75;
        }

        .bber-text {
          font-size: 16px;
          line-height: 1.45;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .bber-meta {
          margin-top: 6px;
          font-size: 12px;
          opacity: 0.75;
        }

        /* Suggest list */
        .bber-suggest {
          padding: 0 12px 10px;
          display: grid;
          gap: 8px;
        }

        .bber-suggest-item {
          text-align: left;
          border: 1px solid rgba(0, 90, 140, 0.14);
          background: rgba(255, 255, 255, 0.72);
          padding: 10px 12px;
          border-radius: 12px;
          cursor: pointer;
        }
        .bber-suggest-item:hover {
          background: rgba(255, 255, 255, 0.92);
        }
        .bber-suggest-item:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .bber-sq {
          font-weight: 700;
          font-size: 14px;
        }
        .bber-smeta {
          margin-top: 2px;
          font-size: 12px;
          opacity: 0.75;
        }

        /* Input */
        .bber-inputbar {
          display: flex;
          gap: 10px;
          padding: 12px;
        }
        .bber-input {
          flex: 1;
          border-radius: 14px;
          border: 1px solid rgba(0, 80, 120, 0.14);
          padding: 12px 12px;
          font-size: 16px;
          background: rgba(255, 255, 255, 0.9);
          outline: none;
        }
        .bber-input:focus {
          border-color: rgba(0, 140, 200, 0.35);
          box-shadow: 0 0 0 4px rgba(0, 160, 220, 0.12);
        }

        .bber-send {
          border-radius: 14px;
          border: 1px solid rgba(0, 120, 170, 0.22);
          background: rgba(0, 140, 200, 0.16);
          font-weight: 800;
          padding: 0 16px;
          cursor: pointer;
        }
        .bber-send:hover {
          background: rgba(0, 140, 200, 0.22);
        }
        .bber-send:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .bber-hint {
          padding: 0 12px 12px;
          font-size: 13px;
          opacity: 0.78;
        }

        /* Mobile fine-tune */
        @media (max-width: 768px) {
          .bber-top {
            max-width: 520px;
          }
          .bber-title {
            font-size: 22px;
          }
          .bber-sub {
            font-size: 13px;
          }
          .bber-actions {
            gap: 6px;
          }
          .bber-btn {
            padding: 8px 10px;
            border-radius: 12px;
          }
        }
      `}</style>
    </div>
  );
}
