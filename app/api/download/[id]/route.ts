import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { assertSafeId, finalFilePath } from "@/lib/clips";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    assertSafeId(id);

    const filePath = finalFilePath(id);
    const info = await stat(filePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(info.size),
        "Content-Disposition": 'attachment; filename="biteclip.mp3"',
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Final MP3 was not found. Create the clip again." }, { status: 404 });
  }
}
