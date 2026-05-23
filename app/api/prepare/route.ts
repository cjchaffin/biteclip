import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { assertYouTubeUrl, createClipId, ensureWorkDir, findSourceFile } from "@/lib/clips";
import { runCommand } from "@/lib/commands";
import { resolveYtDlpCommand } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = assertYouTubeUrl(body.url);
    const id = createClipId();
    const dir = await ensureWorkDir(id);
    const ytDlp = resolveYtDlpCommand();

    const outputTemplate = path.join(dir, "source.%(ext)s");
    const titleResult = await runCommand(ytDlp, ["--no-playlist", "--print", "title", url], 30_000).catch(() => null);

    await runCommand(
      ytDlp,
      ["--no-playlist", "-f", "bestaudio", "-o", outputTemplate, url],
      180_000,
    );

    const sourcePath = await findSourceFile(id);

    if (!sourcePath) {
      throw new Error("yt-dlp finished, but no audio file was created.");
    }

    return NextResponse.json({
      id,
      title: titleResult?.stdout.trim() || "YouTube audio",
      audioUrl: `/api/audio/${id}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare audio." },
      { status: 400 },
    );
  }
}
