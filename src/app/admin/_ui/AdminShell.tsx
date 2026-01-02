"use client";

import React from "react";

export function AdminGlobalStyle() {
  return (
    <style jsx global>{`
      @import url("https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap");

      :root {
        --bg1: #dff3ff;
        --bg2: #f5fbff;
        --bg3: #ffffff;
        --text: #0a2533;
        --muted: rgba(10, 37, 51, 0.76);
        --card: #ffffff;
        --cardBorder: #d8e9f7;
        --primary: #9fe7ff;
        --primaryBorder: #66cde8;
        --dangerBg: #ffe9e9;
        --dangerBorder: #ffb3b3;
        --okBg: #eafff0;
        --okBorder: #b7f0c6;
      }

      html,
      body {
        padding: 0;
        margin: 0;
        font-family: Roboto, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
        color: var(--text);
        background: linear-gradient(180deg, var(--bg1) 0%, var(--bg2) 55%, var(--bg3) 100%);
      }

      a {
        color: inherit;
      }

      .admin-wrap {
        min-height: 100vh;
      }

      .admin-container {
        max-width: 1180px;
        margin: 0 auto;
        padding: clamp(12px, 2.2vw, 24px);
      }

      .admin-topbar {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
        justify-content: space-between;
        margin-bottom: 14px;
      }

      .admin-title h1 {
        margin: 0;
        font-size: clamp(18px, 2.3vw, 28px);
        font-weight: 900;
        letter-spacing: -0.4px;
      }

      .admin-title p {
        margin: 6px 0 0 0;
        color: var(--muted);
        line-height: 1.4;
        font-size: clamp(12px, 1.25vw, 14px);
      }

      .admin-nav {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        background: #fff;
        font-weight: 900;
        text-decoration: none;
        font-size: 14px;
        cursor: pointer;
      }

      .pillPrimary {
        border: 1px solid var(--primaryBorder);
        background: var(--primary);
      }

      .card {
        background: var(--card);
        border: 1px solid var(--cardBorder);
        border-radius: 18px;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
        padding: clamp(12px, 1.6vw, 16px);
        margin-bottom: 16px;
      }

      .grid3 {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        gap: 10px;
      }

      .grid2 {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 10px;
      }

      .label {
        font-weight: 900;
        margin-bottom: 6px;
        font-size: 14px;
      }

      .input,
      .select,
      .textarea {
        width: 100%;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid #cfe3f6;
        background: #fff;
        font-size: 14px;
        outline: none;
      }

      .textarea {
        resize: vertical;
        line-height: 1.45;
      }

      .btn {
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        background: #fff;
        font-weight: 900;
        font-size: 14px;
        cursor: pointer;
      }

      .btnPrimary {
        border: 1px solid var(--primaryBorder);
        background: var(--primary);
      }

      .btnDanger {
        border: 1px solid var(--dangerBorder);
        background: #fff;
        color: #8a1f1f;
      }

      .btn:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }

      .msgError {
        background: var(--dangerBg);
        border: 1px solid var(--dangerBorder);
        padding: 12px;
        border-radius: 14px;
        white-space: pre-wrap;
        font-weight: 900;
      }

      .msgOk {
        background: var(--okBg);
        border: 1px solid var(--okBorder);
        padding: 12px;
        border-radius: 14px;
        white-space: pre-wrap;
        font-weight: 900;
      }

      .progressOuter {
        height: 12px;
        border-radius: 999px;
        background: #e9f2fb;
        border: 1px solid #d8e9f7;
        overflow: hidden;
      }

      .progressInner {
        height: 100%;
        background: var(--primary);
        border-right: 1px solid var(--primaryBorder);
        width: 0%;
        transition: width 150ms linear;
      }

      table.admin-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
      }

      table.admin-table thead th {
        position: sticky;
        top: 0;
        background: #f7fbff;
        border-bottom: 1px solid #e2effa;
        padding: 10px;
        text-align: left;
        font-weight: 900;
        font-size: 13px;
      }

      table.admin-table tbody td {
        border-bottom: 1px solid #eef4fb;
        padding: 10px;
        vertical-align: top;
      }

      @media (max-width: 640px) {
        .pill {
          padding: 9px 10px;
          border-radius: 12px;
        }
      }
    `}</style>
  );
}

export function AdminShell({
  title,
  subtitle,
  active,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  active?: "admin" | "ai" | "users" | "logs" | "files";
  children: React.ReactNode;
}) {
  return (
    <div className="admin-wrap">
      <AdminGlobalStyle />
      <div className="admin-container">
        <div className="admin-topbar">
          <div className="admin-title">
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>

          <div className="admin-nav">
            <a className={"pill" + (active === "admin" ? " pillPrimary" : "")} href="/admin">
              Import
            </a>
            <a className={"pill" + (active === "ai" ? " pillPrimary" : "")} href="/admin/ai-generate">
              AI tạo Q/A
            </a>
            <a className={"pill" + (active === "users" ? " pillPrimary" : "")} href="/admin/users">
              Users
            </a>
            <a className={"pill" + (active === "logs" ? " pillPrimary" : "")} href="/admin/logs">
              Logs
            </a>
            <button
              className="pill"
              onClick={async () => {
                try {
                  await fetch("/api/admin/auth/logout", { method: "POST" });
                } finally {
                  window.location.href = "/admin/login";
                }
              }}
            >
              Đăng xuất
            </button>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
