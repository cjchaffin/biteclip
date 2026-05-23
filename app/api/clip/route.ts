import { NextRequest, NextResponse } from "next/server";
import { fileSize, finalFilePath, findSourceFile, MAX_CLIP_SECONDS, MAX_FILE_BYTES, safeUnlink, seconds } from "@/lib/clips";
import { trimToDiscordMp3 } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body.id || "");
    const start = seconds(body.start);
    const end = seconds(body.end);
    const fadeIn = Boolean(body.fadeIn);
    const fadeOut = Boolean(body.fadeOut);
    const duration = end - start;

    if (duration <= 0) {
      throw new Error("Choose a clip with a real duration.");
    }

    if (duration > MAX_CLIP_SECONDS) {
      throw new Error(`Discord bites must be ${MAX_CLIP_SECONDS} seconds or shorter.`);
    }

    const sourcePath = await findSourceFile(id);

    if (!sourcePath) {
      throw new Error("Prepared audio expired or was not found. Load the YouTube link again.");
    }

    const outputPath = finalFilePath(id);
    await safeUnlink(outputPath);
    await trimToDiscordMp3(sourcePath, outputPath, start, duration, { fadeIn, fadeOut });

    const size = await fileSize(outputPath);

    if (size > MAX_FILE_BYTES) {
      await safeUnlink(outputPath);
      throw new Error("The MP3 is still over 512KB. Try a slightly shorter selection.");
    }

    return NextResponse.json({
      downloadUrl: `/api/download/${id}`,
      size,
      sizeLimit: MAX_FILE_BYTES,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create clip." },
      { status: 400 },
    );
  }
}
