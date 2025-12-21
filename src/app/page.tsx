"use client";

import { useEffect, useRef, useState } from "react";

type Suggest = {
  id: string;
  cau_hoi: string;
  nhom: string;
  score: number | null;
};

type Msg = {
  role: "user" | "bot";
  text: string;
  mode?: "faq" | "ai";
};

const WELCOME = "Xin chào tôi là trợ lý ảo Bber, tôi có thể giúp gì cho bạn ?";

export default function Page() {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggest[]>([]);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "bot", text: WELCOME, mode: "faq" },
  ]);
  const [loading, setLoading] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);

  // Auto scroll khi có tin nhắn
  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Debounce gợi ý khi gõ
  useEffect(() => {
    const t = setTimeout(async () => {
      const s = q.trim();
      if (s.length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(s)}`);
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [q]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question) return;

    setMessages((m) => [...m, { role: "user", text: question }]);
    setQ("");
    setSuggestions([]);
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();

      setMessages((m) => [
        ...m,
        {
          role: "bot",
          text: data.answer || "Hiện tôi chưa có câu trả lời.",
          mode: data.mode || "ai",
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "bot", text: "Lỗi kết nối. Vui lòng thử lại sau.", mode: "ai" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") ask(q);
  }

  return (
    <div className="bberShell">
      <div className="bberPanel">
        <header className="bberHeader">
          <div className="bberBrand">
            <img src="/bber-logo.ico" alt="Bber" className="bberLogo" />
            <div>
              <div className="bberTitle">Bber</div>
              <div className="bberSub">
                Trợ lý ảo HSSV • Gợi ý khi gõ • Ưu tiên FAQ
              </div>
            </div>
          </div>
        </header>

        <main className="bberCard">
          <div ref={chatRef} className="bberChatBox">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`bberMsg ${m.role === "user" ? "bberUser" : "bberBot"}`}
              >
                <div className="bberMeta">
                  {m.role === "user" ? "Bạn" : `Bber (${m.mode || "..."})`}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
              </div>
            ))}
            {loading && <div className="bberLoading">Bber đang xử lý…</div>}
          </div>

          <div className="bberInputWrap">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onEnter}
              placeholder="Nhập câu hỏi của bạn…"
              className="bberInput"
              aria-label="Nhập câu hỏi"
            />

            {suggestions.length > 0 && (
              <div className="bberSuggestBox">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    className="bberSuggestBtn"
                    onClick={() => ask(s.cau_hoi)}
                    type="button"
                  >
                    <div className="bberSuggestQ">{s.cau_hoi}</div>
                    <div className="bberSuggestMeta">
                      Nhóm: {s.nhom}
                      {s.score !== null ? ` • score ${s.score.toFixed(2)}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bberHint">
            Nhấn Enter để hỏi • Click gợi ý để trả lời nhanh
          </div>
        </main>
      </div>

      {/* CSS inline để bạn chỉ cần 1 file page.tsx cũng chạy */}
      <style jsx global>{`
        /* ===== Layout responsive =====
           - Mobile: full width (100%)
           - Tablet/Laptop/Desktop: panel chiếm ~ 1/3 màn hình, giới hạn max để giống cửa sổ chat tra cứu
        */
        .bberShell {
          min-height: 100vh;
          padding: 12px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .bberPanel {
          width: 100%;
        }

        /* >= 768px: giới hạn theo tỷ lệ 1/3 màn hình */
        @media (min-width: 768px) {
          .bberPanel {
            width: 33vw;
            max-width: 520px; /* cửa sổ chat vừa phải */
            min-width: 360px; /* tránh quá hẹp */
          }
          .bberShell {
            padding: 24px;
          }
        }

        /* >= 1200px: giữ ~1/3 nhưng không quá lớn */
        @media (min-width: 1200px) {
          .bberPanel {
            width: 33vw;
            max-width: 560px;
          }
        }

        .bberHeader {
          margin-bottom: 10px;
        }

        .bberBrand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .bberLogo {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: #fff;
          border: 1px solid var(--bber-border);
          padding: 6px;
        }

        .bberTitle {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.2px;
        }

        .bberSub {
          font-size: 13px;
          color: var(--bber-muted);
        }

        .bberCard {
          background: var(--bber-card);
          border: 1px solid var(--bber-border);
          border-radius: 14px;
          box-shadow: 0 10px 30px rgba(11, 27, 42, 0.06);
          padding: 12px;
        }

        .bberChatBox {
          height: 62vh; /* mobile: dùng theo chiều cao màn hình */
          min-height: 360px;
          max-height: 520px; /* desktop: giống cửa sổ chat tra cứu */
          overflow-y: auto;
          padding: 10px;
          border-radius: 12px;
          background: linear-gradient(
            180deg,
            rgba(11, 170, 231, 0.06),
            rgba(14, 162, 86, 0.04)
          );
          border: 1px solid var(--bber-border);
        }

        /* Tablet/Desktop: chiều cao cố định hợp lý */
        @media (min-width: 768px) {
          .bberChatBox {
            height: 55vh;
            max-height: 540px;
          }
        }

        .bberMsg {
          margin-bottom: 10px;
          padding: 10px;
          border-radius: 12px;
          line-height: 1.45;
          word-break: break-word;
        }

        .bberUser {
          background: rgba(11, 170, 231, 0.1);
          border: 1px solid rgba(11, 170, 231, 0.18);
        }

        .bberBot {
          background: #fff;
          border: 1px solid rgba(11, 27, 42, 0.1);
        }

        .bberMeta {
          font-size: 12px;
          opacity: 0.65;
          margin-bottom: 4px;
        }

        .bberLoading {
          margin-top: 8px;
          opacity: 0.7;
          font-size: 13px;
        }

        .bberInputWrap {
          position: relative;
          margin-top: 10px;
        }

        .bberInput {
          width: 100%;
          padding: 12px 12px;
          font-size: 16px;
          border-radius: 12px;
          border: 1px solid var(--bber-border);
          outline: none;
        }

        .bberSuggestBox {
          position: absolute;
          left: 0;
          right: 0;
          top: 100%;
          z-index: 10;
          background: #fff;
          border: 1px solid var(--bber-border);
          border-top: none;
          border-radius: 0 0 12px 12px;
          overflow: hidden;
        }

        .bberSuggestBtn {
          display: block;
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          border: none;
          background: #fff;
          cursor: pointer;
        }

        .bberSuggestQ {
          font-weight: 700;
        }

        .bberSuggestMeta {
          font-size: 12px;
          opacity: 0.7;
          margin-top: 2px;
        }

        .bberHint {
          margin-top: 8px;
          font-size: 12px;
          color: var(--bber-muted);
        }
      `}</style>
    </div>
  );
}
