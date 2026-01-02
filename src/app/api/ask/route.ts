import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const DEFAULT_BUCKET = "faq-files";
const TTL = 900;
const MAX_INTERNAL_CHARS = 2600;

/** Rate limit nhẹ cho /api/ask */
type Hit = { ts: number[] };
const rl = new Map<string, Hit>();
const RL_WINDOW_MS = 60 * 1000;
const RL_LIMIT = 60;

function getKey(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  const cid = req.headers.get("x-bber-client-id") || "no-client";
  return `${ip}|${cid}`;
}

function rateLimit(req: NextRequest) {
  const key = getKey(req);
  const now = Date.now();
  const hit = rl.get(key) || { ts: [] };
  hit.ts = hit.ts.filter((t) => now - t < RL_WINDOW_MS);
  if (hit.ts.length >= RL_LIMIT) return false;
  hit.ts.push(now);
  rl.set(key, hit);
  return true;
}

function fileNameFromAnyPath(p: string) {
  const base = (p || "").split("/").pop() || p;
  const idx = base.indexOf("_");
  if (idx > 0 && /^\d{8,}$/.test(base.slice(0, idx))) return base.slice(idx + 1);
  return base;
}

function isHttpUrl(s: string) {
  return /^https?:\/\//i.test(String(s || ""));
}

async function safeLog(data: any) {
  try {
    await supabaseAdmin.from("log_chat").insert(data);
  } catch {}
}

function tokenizeQuestion(question: string) {
  const q0 = String(question || "").toLowerCase();
  const cleaned = q0.replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  let tokens = cleaned.split(" ").filter(Boolean);

  const joined = " " + cleaned + " ";
  if (joined.includes(" ký túc xá ") || joined.includes(" kí túc xá ")) tokens.push("ktx");
  if (tokens.includes("ktx")) tokens.push("ký", "túc", "xá");

  tokens = [...new Set(tokens)].filter((t) => t.length >= 2);
  return tokens.slice(0, 6);
}

function scoreFaqRow(question: string, tokens: string[], row: any) {
  const q = String(question || "").toLowerCase();
  const cq = String(row?.cau_hoi || "").toLowerCase();
  const ans = String(row?.tra_loi || "").toLowerCase();

  let score = 0;
  if (String(row?.status || "").toLowerCase() === "published") score += 30;

  if (cq === q) score += 120;
  if (cq && q.includes(cq)) score += 70;
  if (cq && cq.includes(q)) score += 55;

  for (const t of tokens) {
    if (cq.includes(t)) score += 10;
    else if (ans.includes(t)) score += 4;
  }

  if (String(row?.tra_loi || "").trim().length >= 20) score += 10;
  return score;
}

function formatInternalAnswer(question: string, nhom: any, rawAnswer: any) {
  const title = String(nhom || "").trim() || String(question || "").trim() || "Thông tin";
  let raw = String(rawAnswer || "").replace(/\u0000/g, "").trim();

  if (!raw) return `Tiêu đề: ${title}\n\nNội dung:\n(Chưa có nội dung trả lời.)`;

  const lines = raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  const isStepLine = (l: string) => /^(b\d+\)|b\d+\.|\d+\)|\d+\.|-\s|•\s|\*\s)/i.test(l);
  const stepLines = lines.filter(isStepLine);

  let steps: string[] = [];
  if (stepLines.length >= 2) {
    steps = stepLines
      .map((l) => l.replace(/^(?:b\d+\)|b\d+\.|\d+\)|\d+\.|-\s*|•\s*|\*\s*)/i, "").trim())
      .filter(Boolean);
  } else {
    const sentences = raw
      .replace(/\s+/g, " ")
      .split(/(?:[.!?。])\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (sentences.length >= 2) steps = sentences.slice(0, 8);
  }

  const formulaLines = lines.filter((l) => /[=<>±×÷∑√π]/.test(l) && l.length <= 160);
  const exampleLines = lines.filter((l) => /^\s*(ví dụ|vd\s*:|vd\s)/i.test(l));

  const skip = new Set<string>([...stepLines, ...formulaLines, ...exampleLines]);
  const bodyLines = lines.filter((l) => !skip.has(l));

  let out = `Tiêu đề: ${title}\n\n`;

  if (steps.length >= 2) out += "Các bước:\n" + steps.map((s, i) => `${i + 1}) ${s}`).join("\n") + "\n\n";

  if (bodyLines.length) out += "Nội dung:\n" + bodyLines.join("\n") + "\n\n";
  else if (steps.length < 2) out += "Nội dung:\n" + raw + "\n\n";

  if (formulaLines.length) out += "Công thức/Ký hiệu:\n" + formulaLines.map((l) => `- ${l}`).join("\n") + "\n\n";
  if (exampleLines.length) out += "Ví dụ minh hoạ:\n" + exampleLines.map((l) => `- ${l}`).join("\n") + "\n";

  out = out.trim();
  if (out.length > MAX_INTERNAL_CHARS) out = out.slice(0, MAX_INTERNAL_CHARS).trim() + "\n\n(…đã rút gọn)";
  return out;
}

function fallbackAnswer(tokens: string[]) {
  const tokenText = tokens.length ? tokens.join(", ") : "(không có)";
  return (
    "Tiêu đề: Chưa tìm thấy câu trả lời nội bộ phù hợp\n\n" +
    "Các bước:\n" +
    "1) Gõ thêm từ khoá cụ thể hơn (tên biểu mẫu, phòng ban, tên thủ tục).\n" +
    "2) Dùng gợi ý bên dưới để chọn nhanh câu hỏi gần đúng.\n" +
    "3) Nếu vẫn chưa có: liên hệ Phòng/Đơn vị phụ trách để bổ sung nội dung.\n\n" +
    `Nội dung:\nTừ khoá đã nhận: ${tokenText}`
  );
}

function pickAttachmentPath(row: any): string {
  return (
    row?.file_path ||
    row?.path ||
    row?.storage_path ||
    row?.object_path ||
    row?.file_key ||
    row?.key ||
    row?.file ||
    row?.file_url ||
    row?.fileurl ||
    row?.url ||
    row?.public_url ||
    ""
  );
}

function pickAttachmentName(row: any, pathOrUrl: string) {
  return row?.file_name || row?.original_name || row?.filename || row?.name || fileNameFromAnyPath(pathOrUrl);
}

function pickAttachmentBucket(row: any) {
  return row?.bucket || row?.storage_bucket || row?.bucket_name || DEFAULT_BUCKET;
}

async function buildAttachments(attRows: any[]): Promise<{ name: string; path: string; url: string }[]> {
  if (!attRows?.length) return [];

  const direct: { name: string; path: string; url: string }[] = [];
  const toSignByBucket = new Map<string, { path: string; name: string }[]>();

  for (const row of attRows) {
    const p = String(pickAttachmentPath(row) || "").trim();
    if (!p) continue;

    const name = pickAttachmentName(row, p);
    if (isHttpUrl(p)) {
      direct.push({ name, path: p, url: p });
      continue;
    }

    const bucket = pickAttachmentBucket(row);
    if (!toSignByBucket.has(bucket)) toSignByBucket.set(bucket, []);
    toSignByBucket.get(bucket)!.push({ path: p, name });
  }

  const signedOut: { name: string; path: string; url: string }[] = [];

  for (const [bucket, items] of toSignByBucket.entries()) {
    const paths = items.map((x) => x.path).filter(Boolean);
    if (!paths.length) continue;

    try {
      const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrls(paths, TTL);
      if (error) continue;

      const urlMap = new Map<string, string>();
      (data || []).forEach((x: any) => {
        if (x?.path && x?.signedUrl) urlMap.set(x.path, x.signedUrl);
      });

      for (const it of items) {
        const url = urlMap.get(it.path) || "";
        if (!url) continue;
        signedOut.push({ name: it.name, path: it.path, url });
      }
    } catch {}
  }

  return [...signedOut, ...direct];
}

async function fetchAttachmentMetaByIds(ids: string[]): Promise<any[]> {
  if (!ids.length) return [];

  const tableCandidates = ["attachments", "files", "uploaded_files", "admin_files", "storage_files"];
  const idColumns = ["id", "attachment_id", "file_id", "uuid"];

  for (const table of tableCandidates) {
    for (const idCol of idColumns) {
      try {
        const { data, error } = await (supabaseAdmin as any).from(table).select("*").in(idCol, ids).limit(200);
        if (!error && Array.isArray(data) && data.length) return data;
      } catch {}
    }
  }

  return [];
}

async function getAttachmentsForFaq(faqId: string): Promise<{ name: string; path: string; url: string }[]> {
  let linkRows: any[] = [];
  try {
    const { data, error } = await supabaseAdmin.from("faq_attachments").select("*").eq("faq_id", faqId);
    if (!error) linkRows = data || [];
  } catch {
    return [];
  }

  if (!linkRows.length) return [];

  // DB cũ có thể lưu url/path trực tiếp trong link table
  let atts = await buildAttachments(linkRows);
  if (atts.length) return atts;

  // schema hiện tại: chỉ có attachment_id -> lấy meta ở bảng khác
  const ids = linkRows.map((r) => String(r?.attachment_id || "").trim()).filter(Boolean);
  if (!ids.length) return [];

  const metaRows = await fetchAttachmentMetaByIds(ids);
  if (!metaRows.length) return [];

  atts = await buildAttachments(metaRows);
  return atts;
}

export async function POST(req: NextRequest) {
  // rate limit trước để chống spam
  if (!rateLimit(req)) {
    return NextResponse.json({ error: "Bạn thao tác quá nhanh. Vui lòng thử lại sau." }, { status: 429 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent") || null;

  try {
    const body = await req.json();
    const question = String(body?.question || "").trim();
    const scope = String(body?.scope || "internal");

    if (!question) return NextResponse.json({ error: "Missing question" }, { status: 400 });

    const tokens = tokenizeQuestion(question);

    let candidates: any[] = [];
    {
      const { data, error } = await supabaseAdmin
        .from("faq")
        .select("id,cau_hoi,tra_loi,nhom,status")
        .ilike("cau_hoi", `%${question}%`)
        .limit(40);

      if (error) throw error;
      candidates = data || [];
    }

    if (!candidates.length && tokens.length) {
      const orParts: string[] = [];
      for (const t0 of tokens) {
        const t = t0.replace(/[,]+/g, " ").trim();
        if (!t) continue;
        orParts.push(`cau_hoi.ilike.%${t}%`);
        orParts.push(`tra_loi.ilike.%${t}%`);
      }

      if (orParts.length) {
        const { data, error } = await supabaseAdmin
          .from("faq")
          .select("id,cau_hoi,tra_loi,nhom,status")
          .or(orParts.join(","))
          .limit(120);

        if (error) throw error;
        candidates = data || [];
      }
    }

    if (!candidates.length) {
      let sugg: any[] = [];

      if (tokens.length) {
        const orParts = tokens
          .map((t) => t.replace(/[,]+/g, " ").trim())
          .filter(Boolean)
          .map((t) => `cau_hoi.ilike.%${t}%`);

        if (orParts.length) {
          const { data } = await supabaseAdmin
            .from("faq")
            .select("id,cau_hoi,nhom,status")
            .or(orParts.join(","))
            .limit(10);
          sugg = data || [];
        }
      }

      if (!sugg.length) {
        const { data } = await supabaseAdmin.from("faq").select("id,cau_hoi,nhom,status").limit(10);
        sugg = data || [];
      }

      await safeLog({ scope, source: "fallback", question, faq_id: null, matched_score: null, ip, user_agent: ua });

      return NextResponse.json({
        mode: "fallback",
        answer: fallbackAnswer(tokens),
        attachments: [],
        suggestions: (sugg || []).map((x: any) => ({ id: x.id, cau_hoi: x.cau_hoi, nhom: x.nhom || null })),
      });
    }

    const scored = candidates.map((r) => ({ r, s: scoreFaqRow(question, tokens, r) }));
    scored.sort((a, b) => b.s - a.s);
    const picked = scored[0]?.r;

    let attachments: { name: string; path: string; url: string }[] = [];
    try {
      attachments = await getAttachmentsForFaq(String(picked.id));
    } catch {
      attachments = [];
    }

    await safeLog({
      scope,
      source: "faq",
      question,
      faq_id: picked.id,
      matched_score: scored[0]?.s || null,
      ip,
      user_agent: ua,
      attachment_count: attachments.length,
    });

    return NextResponse.json({
      mode: "faq",
      answer: formatInternalAnswer(question, picked.nhom, picked.tra_loi),
      matched: { id: picked.id, cau_hoi: picked.cau_hoi, nhom: picked.nhom || null },
      attachments,
      suggestions: scored
        .slice(1, 6)
        .map((x) => x.r)
        .map((x: any) => ({ id: x.id, cau_hoi: x.cau_hoi, nhom: x.nhom || null })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ask failed" }, { status: 500 });
  }
}
