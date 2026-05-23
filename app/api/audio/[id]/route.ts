import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { assertSafeId, contentTypeFor, findSourceFile } from "@/lib/clips";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    assertSafeId(id);

    const sourcePath = await findSourceFile(id);

    if (!sourcePath) {
      return NextResponse.json({ error: "Prepared audio was not found." }, { status: 404 });
    }

    const info = await stat(sourcePath);
    const stream = Readable.toWeb(createReadStream(sourcePath)) as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": contentTypeFor(sourcePath),
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load audio." },
      { status: 400 },
    );
  }
}
