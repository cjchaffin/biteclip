# BiteClip v0.1.0

First Windows desktop test release of BiteClip.

## Downloads

- `BiteClip Setup 0.1.0.exe` - recommended installer
- `BiteClip-0.1.0-win.zip` - portable zip build

## What It Does

- Paste a YouTube URL.
- Load audio into a waveform trimmer.
- Select a clip up to 30 seconds.
- Preview, nudge, use presets, and apply fades.
- Export a normalized 128kbps MP3 under Discord's 512KB soundboard limit.

## Bundled Tools

This Windows build bundles portable copies of:

- yt-dlp
- FFmpeg
- ffprobe

Users do not need to install Node.js, FFmpeg, yt-dlp, or Docker.

## Windows Warning

This build is not code-signed yet. Windows SmartScreen may show an "unknown publisher" warning. That is expected for this early test release.

## Verification

Packaged app was tested locally on Windows. It successfully loaded `https://www.youtube.com/watch?v=jNQXAC9IVRw` and exported a 3-second MP3.
