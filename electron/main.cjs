const { app, BrowserWindow, Menu, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

let mainWindow;
let serverProcess;

const isPackaged = app.isPackaged;
const devUrl = process.env.BITECLIP_DEV_URL || "http://localhost:3333";
const port = Number(process.env.BITECLIP_PORT || 3333);
const logFile = path.join(app.getPath("userData"), "biteclip-electron.log");
const updateFeed = {
  provider: "github",
  owner: "cjchaffin",
  repo: "biteclip",
};

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;

  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, line);
  } catch {
    // Startup logging should never prevent the app from launching.
  }
}

function resourcePath(...segments) {
  return isPackaged
    ? path.join(process.resourcesPath, ...segments)
    : path.join(__dirname, "..", ...segments);
}

function getToolPaths() {
  const toolsRoot = resourcePath("tools");
  const ffmpegRoot = path.join(toolsRoot, "ffmpeg");
  const ffmpegBuild = fs.existsSync(ffmpegRoot)
    ? fs.readdirSync(ffmpegRoot, { withFileTypes: true }).find((entry) => entry.isDirectory())
    : null;
  const ffmpegBin = ffmpegBuild ? path.join(ffmpegRoot, ffmpegBuild.name, "bin") : "";

  return {
    ytDlp: path.join(toolsRoot, "yt-dlp.exe"),
    ffmpeg: path.join(ffmpegBin, "ffmpeg.exe"),
    ffprobe: path.join(ffmpegBin, "ffprobe.exe"),
  };
}

function isPortOpen(portToCheck) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: portToCheck, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(port)) {
      return url;
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error("BiteClip server did not start in time.");
}

async function startServer() {
  if (!isPackaged) {
    return devUrl;
  }

  const serverDir = resourcePath("server");
  const serverFile = path.join(serverDir, "server.js");
  const tools = getToolPaths();
  const command = `"${process.execPath}" "${serverFile}"`;

  log(`Starting server with command: ${command}`);
  log(`Server cwd: ${serverDir}`);
  log(`yt-dlp: ${tools.ytDlp}`);
  log(`ffmpeg: ${tools.ffmpeg}`);
  log(`ffprobe: ${tools.ffprobe}`);

  serverProcess = spawn(command, {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      BITECLIP_YTDLP_PATH: tools.ytDlp,
      BITECLIP_FFMPEG_PATH: tools.ffmpeg,
      BITECLIP_FFPROBE_PATH: tools.ffprobe,
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stdout?.on("data", (chunk) => {
    log(`server stdout: ${chunk.toString().trim()}`);
  });

  serverProcess.stderr?.on("data", (chunk) => {
    log(`server stderr: ${chunk.toString().trim()}`);
  });

  serverProcess.once("exit", (code, signal) => {
    log(`Server exited. code=${code ?? "null"} signal=${signal ?? "null"}`);
    serverProcess = undefined;
  });

  return waitForServer(`http://127.0.0.1:${port}`);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1060,
    minHeight: 760,
    backgroundColor: "#0b0d13",
    title: "BiteClip",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    const url = await startServer();
    log(`Loading ${url}`);
    await mainWindow.loadURL(url);
    configureAutoUpdater();
    setAppMenu();
    setTimeout(() => {
      checkForUpdates(false);
    }, 2500);
  } catch (error) {
    log(`Startup failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    dialog.showErrorBox("BiteClip could not start", error instanceof Error ? error.message : String(error));
    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

function configureAutoUpdater() {
  if (!isPackaged) {
    log("Auto-updater skipped in development.");
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL(updateFeed);

  autoUpdater.on("checking-for-update", () => log("Checking for update."));
  autoUpdater.on("update-not-available", () => log("No update available."));
  autoUpdater.on("error", (error) => log(`Updater error: ${error?.stack || error?.message || String(error)}`));

  autoUpdater.on("update-available", async (info) => {
    log(`Update available: ${info.version}`);
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Download Update", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "BiteClip update available",
      message: `BiteClip ${info.version} is available.`,
      detail: "Download it now? BiteClip will ask before installing.",
    });

    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on("update-downloaded", async (info) => {
    log(`Update downloaded: ${info.version}`);
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Restart and Install", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "BiteClip update ready",
      message: `BiteClip ${info.version} is ready to install.`,
      detail: "Restart BiteClip now to finish installing the update.",
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
}

function setAppMenu() {
  const template = [
    {
      label: "BiteClip",
      submenu: [
        {
          label: "Check for Updates",
          click: () => checkForUpdates(true),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function checkForUpdates(showNoUpdateDialog) {
  if (!isPackaged) {
    if (showNoUpdateDialog) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Updates unavailable in development",
        message: "Update checks only run in the packaged BiteClip app.",
      });
    }
    return;
  }

  try {
    const result = await autoUpdater.checkForUpdates();

    if (showNoUpdateDialog && !result?.updateInfo?.version) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "No update found",
        message: "BiteClip is up to date.",
      });
    }
  } catch (error) {
    if (showNoUpdateDialog) {
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Update check failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
