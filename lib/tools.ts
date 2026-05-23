import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const WINDOWS_TOOL_ROOT = "C:\\tmp\\biteclip-tools";

export function resolveYtDlpCommand() {
  return resolveTool("yt-dlp", process.env.BITECLIP_YTDLP_PATH, [
    `${WINDOWS_TOOL_ROOT}\\yt-dlp.exe`,
  ]);
}

export function resolveFfmpegPath() {
  return resolveTool("ffmpeg", process.env.BITECLIP_FFMPEG_PATH, [
    ...findPortableFfmpegBins("ffmpeg.exe"),
  ]);
}

export function resolveFfprobePath() {
  return resolveTool("ffprobe", process.env.BITECLIP_FFPROBE_PATH, [
    ...findPortableFfmpegBins("ffprobe.exe"),
  ]);
}

function resolveTool(pathCommand: string, envPath: string | undefined, fallbacks: string[]) {
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const fallback = fallbacks.find((candidate) => existsSync(candidate));

  return fallback ?? pathCommand;
}

function findPortableFfmpegBins(fileName: "ffmpeg.exe" | "ffprobe.exe") {
  const root = path.join(WINDOWS_TOOL_ROOT, "ffmpeg");

  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, "bin", fileName));
  } catch {
    return [];
  }
}
