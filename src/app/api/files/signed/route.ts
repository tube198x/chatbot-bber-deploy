import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "faq-files";
const EXPIRES_IN = 900; // 15 phút (TTL <15m đúng nghĩa thì đổi 840)

function parsePaths(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = (searchParams.get("path") || "").trim();
  const pathsRaw = (searchParams.get("paths") || "").trim();

  if (pathsRaw) {
    return pathsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (path) return [path];
  return [];
}

function fileNameFromPath(p: string) {
  const base = p.split("/").pop() || p;
  const idx = base.indexOf("_");
  if (idx > 0 && /^\d{8,}$/.test(base.slice(0, idx))) return base.slice(idx + 1);
  return base;
}

export async function GET(req: NextRequest) {
  try {
    const paths = parsePaths(req);
    if (!paths.length) {
      return NextResponse.json({ error: "Missing path/paths" }, { status: 400 });
    }

    // Nhiều file
    if (paths.length > 1) {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrls(paths, EXPIRES_IN);

      if (error) throw error;

      const items =
        data?.map((it) => ({
          path: it.path,
          name: fileNameFromPath(it.path),
          url: it.signedUrl || null,
        })) || [];

      return NextResponse.json({ expires_in: EXPIRES_IN, items });
    }

    // 1 file (giữ tương thích)
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(paths[0], EXPIRES_IN);

    if (error || !data) {
      return NextResponse.json({ error: error?.message }, { status: 500 });
    }

    return NextResponse.json({
      expires_in: EXPIRES_IN,
      items: [{ path: paths[0], name: fileNameFromPath(paths[0]), url: data.signedUrl }],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Signed URL failed" },
      { status: 500 }
    );
  }
}
