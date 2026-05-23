const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist-electron");
const serverOut = path.join(distDir, "server");
const toolsOut = path.join(distDir, "tools");
const portableTools = "C:\\tmp\\biteclip-tools";

function copyDir(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing required path: ${source}`);
  }

  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function copyFile(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing required path: ${source}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function removeDir(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function findFfmpegBuildDir() {
  const ffmpegRoot = path.join(portableTools, "ffmpeg");
  const build = fs.readdirSync(ffmpegRoot, { withFileTypes: true }).find((entry) => entry.isDirectory());

  if (!build) {
    throw new Error(`No FFmpeg build directory found in ${ffmpegRoot}`);
  }

  return path.join(ffmpegRoot, build.name);
}

removeDir(distDir);
copyDir(standaloneDir, serverOut);
copyDir(staticDir, path.join(serverOut, ".next", "static"));
copyDir(publicDir, path.join(serverOut, "public"));

if (!fs.existsSync(portableTools)) {
  throw new Error(`Portable tool folder not found: ${portableTools}`);
}

const ffmpegBuildDir = findFfmpegBuildDir();
const ffmpegBuildName = path.basename(ffmpegBuildDir);
copyFile(path.join(portableTools, "yt-dlp.exe"), path.join(toolsOut, "yt-dlp.exe"));
copyFile(path.join(ffmpegBuildDir, "bin", "ffmpeg.exe"), path.join(toolsOut, "ffmpeg", ffmpegBuildName, "bin", "ffmpeg.exe"));
copyFile(path.join(ffmpegBuildDir, "bin", "ffprobe.exe"), path.join(toolsOut, "ffmpeg", ffmpegBuildName, "bin", "ffprobe.exe"));

console.log(`Prepared Electron resources in ${distDir}`);
