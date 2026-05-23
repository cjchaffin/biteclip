# BiteClip

BiteClip is a Next.js app for making short Discord soundboard bites from YouTube audio.

## What It Does

1. Paste a YouTube URL.
2. The server uses `yt-dlp` to fetch the best available audio stream.
3. The browser loads the audio into a draggable `wavesurfer.js` waveform trimmer.
4. Pick a clip up to 30 seconds with playback controls, precise time inputs,
   nudge buttons, presets, and optional fades.
5. The server uses FFmpeg through `fluent-ffmpeg` to:
   - trim the selection
   - convert to 128kbps MP3
   - apply `loudnorm` normalization
   - reject files over 512KB
6. Download the final Discord-ready MP3.

## Stack

- Next.js App Router
- React
- Tailwind CSS
- wavesurfer.js
- Node.js API routes
- fluent-ffmpeg
- FFmpeg from system PATH
- yt-dlp from system PATH

## File Structure

```text
.
|-- AGENTS.md
|-- Dockerfile
|-- README.md
|-- app
|   |-- api
|   |   |-- audio
|   |   |   `-- [id]
|   |   |       `-- route.ts
|   |   |-- clip
|   |   |   `-- route.ts
|   |   |-- download
|   |   |   `-- [id]
|   |   |       `-- route.ts
|   |   `-- prepare
|   |       `-- route.ts
|   |-- globals.css
|   |-- layout.tsx
|   `-- page.tsx
|-- components
|   `-- BiteClipStudio.tsx
|-- lib
|   |-- clips.ts
|   |-- commands.ts
|   |-- ffmpeg.ts
|   `-- tools.ts
|-- next.config.ts
|-- package.json
|-- postcss.config.mjs
`-- tsconfig.json
```

## Local Development

Prerequisites:

- Node.js 20+
- FFmpeg available in PATH
- yt-dlp available in PATH

On this Windows machine, local dev also supports portable tools at
`C:\tmp\biteclip-tools`:

- `C:\tmp\biteclip-tools\yt-dlp.exe`
- `C:\tmp\biteclip-tools\ffmpeg\...\bin\ffmpeg.exe`
- `C:\tmp\biteclip-tools\ffmpeg\...\bin\ffprobe.exe`

If PATH tools are missing, the app automatically tries those portable fallback
paths. You can override them with `BITECLIP_YTDLP_PATH`, `BITECLIP_FFMPEG_PATH`,
and `BITECLIP_FFPROBE_PATH`.

Install and run:

```bash
npm install
npm run dev
```

This project defaults to port `3333` for local development because port `3000`
is already used on this machine. Open `http://localhost:3333`.

## Production Build

```bash
npm run build
npm run start
```

## Branch And Release Workflow

- `main` is the production branch.
- `dev` is the active development branch.
- Do feature work on `dev` or short-lived branches based on `dev`.
- Merge tested work into `main` before creating a public GitHub Release.
- GitHub Releases are the production download channel for Windows users.

Suggested manual release flow:

```bash
git switch dev
npm run build
npm run dist:win
git switch main
git merge dev
git tag v0.1.2
git push origin main --tags
```

Then upload the generated `release/` assets to a new GitHub Release.

For signing options and the recommended path to reduce Windows SmartScreen
warnings, see `docs/windows-signing.md`.

## Docker

Build:

```bash
docker build -t biteclip .
```

Run:

```bash
docker run --rm -p 3333:3000 biteclip
```

The Docker image installs FFmpeg and yt-dlp inside the container.

## Windows Desktop App

BiteClip can also be packaged as a Windows desktop app with Electron. The
desktop build bundles:

- the Next.js standalone server
- portable `yt-dlp.exe`
- portable `ffmpeg.exe`
- portable `ffprobe.exe`

Build the shareable Windows artifacts:

```bash
npm run dist:win
```

Generated files land in `release/`:

- `BiteClip Setup 0.1.0.exe`: installer for normal users
- `BiteClip-0.1.0-win.zip`: portable zip build

This first build is unsigned, so Windows SmartScreen may warn users that the
publisher is unknown. For public distribution beyond friends/testers, add code
signing later.

## API Routes

- `POST /api/prepare`: accepts `{ "url": "https://youtube..." }`, downloads source audio to a temporary working folder, and returns `{ id, title, audioUrl }`.
- `GET /api/audio/:id`: streams the prepared source audio for waveform playback.
- `POST /api/clip`: accepts `{ id, start, end, fadeIn, fadeOut }`, creates the normalized 128kbps MP3, and returns `{ downloadUrl, size, sizeLimit }`.
- `GET /api/download/:id`: downloads the final `biteclip.mp3`.

## Notes

Temporary audio files are stored under the OS temp folder in `biteclip/<id>`. This is simple and works well for single-server deployments. For multi-instance hosting, use shared object storage or keep all requests for a clip pinned to the same instance.
