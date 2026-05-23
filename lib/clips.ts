import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const MAX_CLIP_SECONDS = 30;
export const MAX_FILE_BYTES = 512 * 1024;
export const WORK_ROOT = path.join(os.tmpdir(), "biteclip");

export type ClipMeta = {
  id: string;
  title?: string;
  sourcePath: string;
  finalPath?: string;
};

export function createClipId() {
  return randomUUID();
}

export function clipDir(id: string) {
  assertSafeId(id);
  return path.join(WORK_ROOT, id);
}

export async function ensureWorkDir(id: string) {
  const dir = clipDir(id);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function findSourceFile(id: string) {
  const dir = clipDir(id);
  const files = await readdir(dir);
  const source = files.find((file) => file.startsWith("source."));

  if (!source) {
    return null;
  }

  return path.join(dir, source);
}

export function finalFilePath(id: string) {
  return path.join(clipDir(id), "biteclip.mp3");
}

export async function fileSize(filePath: string) {
  const info = await stat(filePath);
  return info.size;
}

export async function safeUnlink(filePath: string | null | undefined) {
  if (!filePath) return;

  try {
    await unlink(filePath);
  } catch {
    // Temporary cleanup is best-effort; the next run can overwrite stale files.
  }
}

export function assertSafeId(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) {
    throw new Error("Invalid clip id.");
  }
}

export function assertYouTubeUrl(input: string) {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new Error("Paste a valid YouTube URL.");
  }

  const allowedHosts = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
  ]);

  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("BiteClip only accepts YouTube links.");
  }

  return url.toString();
}

export function seconds(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Clip times must be positive numbers.");
  }

  return parsed;
}

export function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a" || ext === ".mp4") return "audio/mp4";
  if (ext === ".webm") return "audio/webm";
  if (ext === ".opus") return "audio/ogg";

  return "application/octet-stream";
}
