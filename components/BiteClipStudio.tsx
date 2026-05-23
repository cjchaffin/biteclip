"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.esm.js";

const MAX_SECONDS = 30;
const NUDGE_SECONDS = 0.1;
const PRESETS = [3, 5, 10, 30];
const SETTINGS_KEY = "biteclip-settings-v1";

type BiteClipSettings = {
  applySavedDefaults: boolean;
  fadeIn: boolean;
  fadeOut: boolean;
  clipLengthSeconds: number;
};

const DEFAULT_SETTINGS: BiteClipSettings = {
  applySavedDefaults: true,
  fadeIn: false,
  fadeOut: false,
  clipLengthSeconds: 10,
};

function getStoredSettings(): BiteClipSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<BiteClipSettings> | null;
    const safeSettings: BiteClipSettings = {
      applySavedDefaults: parsed?.applySavedDefaults ?? DEFAULT_SETTINGS.applySavedDefaults,
      fadeIn: parsed?.fadeIn ?? DEFAULT_SETTINGS.fadeIn,
      fadeOut: parsed?.fadeOut ?? DEFAULT_SETTINGS.fadeOut,
      clipLengthSeconds: clamp(
        roundTime(Number(parsed?.clipLengthSeconds ?? DEFAULT_SETTINGS.clipLengthSeconds)),
        1,
        MAX_SECONDS,
      ),
    };

    if (!Number.isFinite(safeSettings.clipLengthSeconds)) {
      return DEFAULT_SETTINGS;
    }

    return safeSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(next: BiteClipSettings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage write failures to avoid breaking the editor.
  }
}

type PrepareResponse = {
  id: string;
  title: string;
  audioUrl: string;
  error?: string;
};

type ClipResponse = {
  downloadUrl: string;
  size: number;
  sizeLimit: number;
  error?: string;
};

type Status = "idle" | "loading" | "ready" | "processing" | "done" | "error";

function formatTime(value: number) {
  const safeValue = Math.max(0, value);
  const minutes = Math.floor(safeValue / 60);
  const seconds = Math.floor(safeValue % 60).toString().padStart(2, "0");
  const tenths = Math.floor((safeValue % 1) * 10);
  return `${minutes}:${seconds}.${tenths}`;
}

function formatBytes(value: number) {
  return `${Math.round(value / 1024)}KB`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundTime(value: number) {
  return Math.round(value * 10) / 10;
}

export default function BiteClipStudio() {
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const activeRegionRef = useRef<Region | null>(null);
  const selectionRef = useRef({ start: 0, end: 10 });
  const loopSelectionRef = useRef(false);

  const [url, setUrl] = useState("");
  const [clipId, setClipId] = useState("");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [selection, setSelection] = useState({ start: 0, end: 10 });
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("Paste a YouTube URL to wake the waveform.");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [finalSize, setFinalSize] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<BiteClipSettings>(DEFAULT_SETTINGS);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  const selectionLength = useMemo(() => Math.max(0, selection.end - selection.start), [selection]);
  const estimatedBytes = useMemo(() => Math.ceil((selectionLength * 128_000) / 8), [selectionLength]);
  const isProcessing: boolean = status === "processing";
  const canEdit = status === "ready" || status === "done";
  const canCreateClip = Boolean(clipId) && canEdit && selectionLength > 0 && selectionLength <= MAX_SECONDS;
  const isDiscordSafe = estimatedBytes <= 512 * 1024;

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    const safeSettings = getStoredSettings();

    setSettings(safeSettings);

    if (safeSettings.applySavedDefaults) {
      setFadeIn(safeSettings.fadeIn);
      setFadeOut(safeSettings.fadeOut);
    }
  }, []);

  useEffect(() => {
    return () => {
      waveSurferRef.current?.destroy();
    };
  }, []);

  function resetOutput() {
    setDownloadUrl("");
    setFinalSize(null);
  }

  function syncSelection(nextSelection: { start: number; end: number }) {
    const start = clamp(roundTime(nextSelection.start), 0, Math.max(0, duration));
    const end = clamp(roundTime(nextSelection.end), start + 0.1, Math.min(duration || MAX_SECONDS, start + MAX_SECONDS));
    const normalized = { start, end };

    selectionRef.current = normalized;
    setSelection(normalized);
    resetOutput();

    activeRegionRef.current?.setOptions(normalized);
  }

  async function prepareAudio(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetOutput();
    setClipId("");
    setTitle("");
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);

    if (settings.applySavedDefaults) {
      setFadeIn(settings.fadeIn);
      setFadeOut(settings.fadeOut);
    }

    setStatus("loading");
    setMessage("Fetching the best available audio stream with yt-dlp...");

    try {
      const response = await fetch("/api/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as PrepareResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || "Could not prepare that YouTube link.");
      }

      setClipId(data.id);
      setTitle(data.title);
      await loadWaveform(data.audioUrl);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went sideways while loading audio.");
    }
  }

  async function loadWaveform(audioUrl: string) {
    if (!waveformRef.current) return;

    waveSurferRef.current?.destroy();
    activeRegionRef.current = null;
    loopSelectionRef.current = false;

    const regions = RegionsPlugin.create();
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#6d7280",
      progressColor: "#5865f2",
      cursorColor: "#f2f3f5",
      height: 164,
      barWidth: 3,
      barGap: 2,
      barRadius: 4,
      normalize: true,
      dragToSeek: true,
      plugins: [regions],
    });

    waveSurferRef.current = wavesurfer;
    regionsRef.current = regions;

    regions.on("region-updated", (region) => {
      const clampedEnd = Math.min(region.end, region.start + MAX_SECONDS);

      if (clampedEnd !== region.end) {
        region.setOptions({ end: clampedEnd });
      }

      activeRegionRef.current = region;
      const normalized = { start: roundTime(region.start), end: roundTime(clampedEnd) };
      selectionRef.current = normalized;
      setSelection(normalized);
      resetOutput();
    });

    regions.on("region-clicked", (region, event) => {
      event.stopPropagation();
      activeRegionRef.current = region;
      playSelection();
    });

    wavesurfer.on("ready", (loadedDuration) => {
      setDuration(loadedDuration);
      const defaultLength = settings.applySavedDefaults ? settings.clipLengthSeconds : 10;
      const end = Math.min(defaultLength, MAX_SECONDS, loadedDuration);
      const region = regions.addRegion({
        start: 0,
        end,
        color: "rgba(88, 101, 242, 0.26)",
        drag: true,
        resize: true,
      });
      activeRegionRef.current = region;
      selectionRef.current = { start: 0, end };
      setSelection({ start: 0, end });
      setStatus("ready");
      setMessage("Drag, resize, nudge, or snap the bite. Keep it under 30 seconds.");
    });

    wavesurfer.on("timeupdate", (time) => {
      setCurrentTime(time);

      if (loopSelectionRef.current && time >= selectionRef.current.end) {
        wavesurfer.pause();
        wavesurfer.setTime(selectionRef.current.end);
        loopSelectionRef.current = false;
      }
    });

    wavesurfer.on("play", () => setIsPlaying(true));
    wavesurfer.on("pause", () => setIsPlaying(false));
    wavesurfer.on("finish", () => {
      loopSelectionRef.current = false;
      setIsPlaying(false);
    });

    wavesurfer.on("error", (error) => {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The waveform could not load this audio.");
    });

    await wavesurfer.load(audioUrl);
  }

  function togglePlayPause() {
    const wavesurfer = waveSurferRef.current;
    if (!wavesurfer || !canEdit) return;

    loopSelectionRef.current = false;
    wavesurfer.playPause();
  }

  function playSelection() {
    const wavesurfer = waveSurferRef.current;
    if (!wavesurfer || !canEdit) return;

    loopSelectionRef.current = true;
    wavesurfer.setTime(selectionRef.current.start);
    void wavesurfer.play();
  }

  function playFromStart() {
    const wavesurfer = waveSurferRef.current;
    if (!wavesurfer || !canEdit) return;

    loopSelectionRef.current = false;
    wavesurfer.setTime(0);
    void wavesurfer.play();
  }

  function setStartHere() {
    syncSelection({ start: currentTime, end: Math.max(selection.end, currentTime + 0.1) });
  }

  function setEndHere() {
    syncSelection({ start: Math.min(selection.start, currentTime - 0.1), end: currentTime });
  }

  function nudge(edge: "start" | "end", amount: number) {
    if (edge === "start") {
      syncSelection({ start: selection.start + amount, end: selection.end });
      return;
    }

    syncSelection({ start: selection.start, end: selection.end + amount });
  }

  function applyPreset(seconds: number) {
    const start = selection.start;
    const end = clamp(start + seconds, start + 0.1, duration || seconds);
    const adjustedStart = end - start < seconds ? Math.max(0, end - seconds) : start;

    syncSelection({ start: adjustedStart, end });
  }

  function updateSettings(partial: Partial<BiteClipSettings>) {
    const next: BiteClipSettings = {
      ...settings,
      ...partial,
      clipLengthSeconds: clamp(roundTime(Number((partial.clipLengthSeconds ?? settings.clipLengthSeconds))), 1, MAX_SECONDS),
    };
    setSettings(next);
    persistSettings(next);
  }

  function saveCurrentAsDefaults() {
    const next = {
      ...settings,
      fadeIn,
      fadeOut,
      clipLengthSeconds: clamp(roundTime(selectionLength || 10), 1, MAX_SECONDS),
    };
    setSettings(next);
    persistSettings(next);
    setMessage("Saved current editor settings as your defaults.");
  }

  function resetDefaults() {
    setSettings(DEFAULT_SETTINGS);
    persistSettings(DEFAULT_SETTINGS);
    setFadeIn(DEFAULT_SETTINGS.fadeIn);
    setFadeOut(DEFAULT_SETTINGS.fadeOut);
    setMessage("Settings reset to default defaults.");
  }

  async function createClip() {
    if (!clipId) return;

    resetOutput();
    setStatus("processing");
    setMessage("Trimming, normalizing, applying fades, encoding at 128kbps, and checking the 512KB limit...");

    try {
      const response = await fetch("/api/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clipId, start: selection.start, end: selection.end, fadeIn, fadeOut }),
      });
      const data = (await response.json()) as ClipResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || "Could not create the MP3.");
      }

      setDownloadUrl(data.downloadUrl);
      setFinalSize(data.size);
      setStatus("done");
      setMessage("Your bite is cooked. Tiny, loud, and Discord-ready.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Clip processing failed.");
    }
  }

  function handleReset() {
    resetOutput();
    setClipId("");
    setTitle("");
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setUrl("");
    setStatus("idle");
    setMessage("Paste a YouTube URL to wake the waveform.");

    waveSurferRef.current?.destroy();
    waveSurferRef.current = null;
    regionsRef.current = null;
    activeRegionRef.current = null;
  }

  const isIdleState = status === "idle" || (status === "error" && !clipId);

  return (
    <div className="relative">
      {/* Settings popover floating panel */}
      {settingsOpen && (
        <div className="absolute right-0 top-16 z-50 w-full max-w-sm rounded-[1.75rem] border border-white/10 bg-[#1b1d25] p-5 shadow-2xl backdrop-blur-md transition-all duration-200">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-[#949ba4]">Studio Settings</h3>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="text-gray-400 hover:text-white transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-4">
            <Toggle
              label="Apply saved defaults"
              checked={settings.applySavedDefaults}
              onChange={(checked) => updateSettings({ applySavedDefaults: checked })}
            />
            <Toggle
              label="Default fade in"
              checked={settings.fadeIn}
              onChange={(checked) => updateSettings({ fadeIn: checked })}
            />
            <Toggle
              label="Default fade out"
              checked={settings.fadeOut}
              onChange={(checked) => updateSettings({ fadeOut: checked })}
            />
            <label className="block space-y-1.5 rounded-2xl border border-white/10 bg-[#0b0d13] p-3.5">
              <span className="block text-xs font-black uppercase tracking-[0.18em] text-[#949ba4]">Default clip length (s)</span>
              <input
                type="number"
                min="1"
                max={MAX_SECONDS}
                step="0.1"
                value={(Number.isFinite(settings.clipLengthSeconds) ? settings.clipLengthSeconds : DEFAULT_SETTINGS.clipLengthSeconds).toFixed(1)}
                onChange={(event) => updateSettings({
                  clipLengthSeconds: clamp(roundTime(Number(event.target.value)), 1, MAX_SECONDS),
                })}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-[#111318] px-3 font-bold text-white outline-none transition focus:border-[#5865f2]"
              />
            </label>
          </div>
          <div className="mt-5 grid gap-3 grid-cols-2">
            <button
              type="button"
              onClick={saveCurrentAsDefaults}
              className="rounded-xl border border-white/10 bg-white/5 py-2 px-3 text-xs font-bold text-white transition hover:bg-white/10"
            >
              Save Defaults
            </button>
            <button
              type="button"
              onClick={resetDefaults}
              className="rounded-xl border border-white/10 bg-white/5 py-2 px-3 text-xs font-bold text-white transition hover:bg-white/10"
            >
              Reset Defaults
            </button>
          </div>
        </div>
      )}

      {isIdleState ? (
        // WELCOME SCREEN STATE
        <div className="mx-auto max-w-2xl py-8 px-4 sm:py-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-4 mb-4 rounded-3xl bg-[radial-gradient(circle_at_18%_18%,rgba(88,101,242,.24),transparent_3rem),linear-gradient(135deg,#1b1d25_0%,#111318_100%)] border border-white/10 shadow-xl">
              <svg className="w-12 h-12 text-[#5865f2]" viewBox="0 0 44 44" fill="none">
                <path
                  d="M8.8 22h1.1M12 19.2v5.6M15.3 16.9v10.2M18.6 14.8v14.4M22 12.3v19.4M25.4 14.8v14.4M28.7 16.9v10.2M32 19.2v5.6M35.2 22h1.1"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="text-4xl font-black tracking-[-0.04em] text-white">Create Discord Bites</h2>
            <p className="mt-2 text-base text-[#b5bac1]">
              Paste a YouTube URL to download, trim, and normalize audio under 512KB.
            </p>
          </div>

          <form onSubmit={prepareAudio} className="space-y-4 rounded-3xl border border-white/10 bg-[#161821]/80 p-6 shadow-2xl backdrop-blur-md">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <input
                  id="youtube-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="Paste YouTube link here..."
                  className="w-full min-h-14 rounded-2xl border border-white/10 bg-[#0b0d13] pl-5 pr-12 text-white outline-none transition focus:border-[#5865f2] focus:shadow-[0_0_0_4px_rgba(88,101,242,.15)]"
                  required
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.163a3.003 3.003 0 00-2.11-2.108C19.53 3.5 12 3.5 12 3.5s-7.53 0-9.388.555A3.003 3.003 0 00.502 6.163C0 8.07 0 12 0 12s0 3.93.502 5.837a3.003 3.003 0 002.11 2.108C4.47 20.5 12 20.5 12 20.5s7.53 0 9.388-.555a3.003 3.003 0 002.11-2.108C24 15.93 24 12 24 12s0-3.93-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!url}
                  className="flex-1 sm:flex-initial min-h-14 rounded-2xl bg-[#5865f2] px-6 font-black text-white shadow-lg shadow-[#5865f2]/25 transition hover:-translate-y-0.5 hover:bg-[#6f7af6] disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  Load Audio
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen((open) => !open)}
                  className="min-h-14 w-14 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-gray-300 hover:bg-white/10 hover:text-white transition"
                  title="Configure defaults"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>


            {status === "error" && message && (
              <div className="mt-4 rounded-2xl border border-[#f23f42]/30 bg-[#f23f42]/10 p-4 text-center">
                <p className="text-sm font-bold text-[#ffb3b5]">{message}</p>
              </div>
            )}
          </form>

          {/* Collapsible How It Works Accordion */}
          <div className="mt-6 rounded-2xl border border-white/5 bg-[#111318]/40 overflow-hidden transition-all duration-300">
            <button
              type="button"
              onClick={() => setHowItWorksOpen(!howItWorksOpen)}
              className="flex w-full items-center justify-between px-5 py-4 font-bold text-[#b5bac1] hover:text-white transition hover:bg-white/[0.02]"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#5865f2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                How BiteClip Works
              </span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${howItWorksOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {howItWorksOpen && (
              <div className="px-5 pb-5 pt-1 grid gap-4 sm:grid-cols-3 border-t border-white/5 bg-black/10">
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#5865f2] text-xs font-black text-white mb-2">1</span>
                  <h4 className="font-bold text-white text-sm">Paste Link</h4>
                  <p className="text-xs text-[#949ba4] mt-1">Drop in any YouTube video URL. We instantly extract high-quality audio.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#5865f2] text-xs font-black text-white mb-2">2</span>
                  <h4 className="font-bold text-white text-sm">Trim & Polish</h4>
                  <p className="text-xs text-[#949ba4] mt-1">Drag the waveform selection box. Add fades and fine-tune down to 0.1s.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#5865f2] text-xs font-black text-white mb-2">3</span>
                  <h4 className="font-bold text-white text-sm">Download MP3</h4>
                  <p className="text-xs text-[#949ba4] mt-1">Loudness is normalized to Discord standards. Always kept under 512KB.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        // ACTIVE STUDIO EDITOR STATE
        <div className="space-y-5 transition-all duration-300">
          {/* Header Row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4">
            <div className="flex items-center min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600/15 border border-red-500/20 mr-3 flex-shrink-0">
                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.163a3.003 3.003 0 00-2.11-2.108C19.53 3.5 12 3.5 12 3.5s-7.53 0-9.388.555A3.003 3.003 0 00.502 6.163C0 8.07 0 12 0 12s0 3.93.502 5.837a3.003 3.003 0 002.11 2.108C4.47 20.5 12 20.5 12 20.5s7.53 0 9.388-.555a3.003 3.003 0 002.11-2.108C24 15.93 24 12 24 12s0-3.93-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <h2 className="line-clamp-1 text-lg font-black text-white">{title || (status === "loading" ? "Loading audio stream..." : "YouTube Audio")}</h2>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                onClick={() => setSettingsOpen((open) => !open)}
                className={`min-h-10 rounded-xl px-4 font-bold text-sm border flex items-center gap-1.5 transition ${settingsOpen ? "bg-[#5865f2] border-transparent text-white" : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 00-2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="min-h-10 rounded-xl px-4 border border-white/10 bg-white/5 font-bold text-sm text-gray-300 hover:bg-white/10 hover:text-white transition flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
                </svg>
                New Link
              </button>
            </div>
          </div>

          {/* Waveform Trimmer Canvas */}
          <div className="rounded-2xl border border-white/10 bg-[#111318]/90 p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-[#949ba4]">Waveform Trimmer</span>
              <span className="rounded-md bg-[#5865f2]/10 px-2 py-0.5 text-xs font-bold tracking-wider text-[#b8befd]">
                {formatTime(selection.start)} - {formatTime(selection.end)}
              </span>
            </div>
            <div className="relative">
              <div ref={waveformRef} className={`min-h-40 overflow-hidden rounded-xl border border-white/5 bg-[#0b0d13] p-2 ${status === "loading" ? "opacity-25" : ""}`} />
              {status === "loading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 rounded-xl backdrop-blur-[1px]">
                  <div className="h-7 w-7 animate-spin rounded-full border-3 border-[#5865f2] border-t-transparent" />
                  <p className="text-xs font-bold text-[#b5bac1] animate-pulse">{message}</p>
                </div>
              )}
            </div>

            {/* Integrated Timeline Toolbar */}
            <div className="mt-3 flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-white/5 pt-3">
              {/* Playback Buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={togglePlayPause}
                  disabled={!canEdit}
                  className="h-10 rounded-xl bg-[#5865f2] px-4 font-black text-sm text-white transition hover:bg-[#6f7af6] disabled:cursor-not-allowed disabled:opacity-50 flex items-center"
                >
                  {isPlaying ? (
                    <>
                      <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Play
                    </>
                  )}
                </button>
                <button
                  onClick={playSelection}
                  disabled={!canEdit}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 font-bold text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 flex items-center"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  Play Selection
                </button>
                <button
                  onClick={playFromStart}
                  disabled={!canEdit}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 font-bold text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 flex items-center"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                  </svg>
                  Play From Start
                </button>
              </div>

              {/* Digital Timeline Readout */}
              <div className="flex items-center gap-4 bg-[#0b0d13] px-4 py-2 rounded-xl border border-white/5 text-sm font-semibold text-[#b5bac1] self-start md:self-center font-mono">
                <div>
                  <span className="text-[#949ba4] text-xs font-black uppercase mr-1.5">Playhead:</span>
                  <span className="text-white">{formatTime(currentTime)}</span>
                </div>
                <div className="h-4 w-px bg-white/10" />
                <div>
                  <span className="text-[#949ba4] text-xs font-black uppercase mr-1.5">Clip:</span>
                  <span className={selectionLength > MAX_SECONDS ? "text-[#f23f42]" : "text-white"}>
                    {selectionLength.toFixed(1)}s / {MAX_SECONDS}s
                  </span>
                </div>
              </div>

              {/* Preset buttons */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-[#949ba4] mr-1">Presets:</span>
                {PRESETS.map((seconds) => (
                  <button
                    key={seconds}
                    onClick={() => applyPreset(seconds)}
                    disabled={!canEdit}
                    className="h-8 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs font-bold text-white transition hover:bg-[#5865f2] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Grid Layout below waveform */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Precision Edit Box */}
            <div className="rounded-2xl border border-white/10 bg-[#161821]/80 p-5 shadow-lg">
              <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#949ba4]">Precision Edit</h3>
              
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-[#949ba4]">Start Point</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={selection.start.toFixed(1)}
                      disabled={!canEdit}
                      onChange={(event) => syncSelection({ start: Number(event.target.value), end: selection.end })}
                      className="min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0d13] px-3 font-mono font-bold text-white outline-none transition focus:border-[#5865f2] disabled:opacity-50"
                    />
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => nudge("start", NUDGE_SECONDS)} disabled={!canEdit} className="h-5 w-7 rounded bg-white/5 text-[10px] font-bold text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-50">+</button>
                      <button onClick={() => nudge("start", -NUDGE_SECONDS)} disabled={!canEdit} className="h-5 w-7 rounded bg-white/5 text-[10px] font-bold text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-50">-</button>
                    </div>
                  </div>
                  <button
                    onClick={setStartHere}
                    disabled={!canEdit}
                    className="w-full mt-1.5 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-bold text-gray-200 transition disabled:opacity-50"
                  >
                    Set Start at Playhead
                  </button>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-[#949ba4]">End Point</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={selection.end.toFixed(1)}
                      disabled={!canEdit}
                      onChange={(event) => syncSelection({ start: selection.start, end: Number(event.target.value) })}
                      className="min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0d13] px-3 font-mono font-bold text-white outline-none transition focus:border-[#5865f2] disabled:opacity-50"
                    />
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => nudge("end", NUDGE_SECONDS)} disabled={!canEdit} className="h-5 w-7 rounded bg-white/5 text-[10px] font-bold text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-50">+</button>
                      <button onClick={() => nudge("end", -NUDGE_SECONDS)} disabled={!canEdit} className="h-5 w-7 rounded bg-white/5 text-[10px] font-bold text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-50">-</button>
                    </div>
                  </div>
                  <button
                    onClick={setEndHere}
                    disabled={!canEdit}
                    className="w-full mt-1.5 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-bold text-gray-200 transition disabled:opacity-50"
                  >
                    Set End at Playhead
                  </button>
                </div>
              </div>
            </div>

            {/* Discord Polish Box */}
            <div className="rounded-2xl border border-white/10 bg-[#161821]/80 p-5 shadow-lg flex flex-col justify-between">
              <div>
                <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#949ba4]">Discord Polish</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle label="Fade In" checked={fadeIn} onChange={setFadeIn} />
                  <Toggle label="Fade Out" checked={fadeOut} onChange={setFadeOut} />
                </div>
              </div>

              {/* Discord Size Monitor */}
              <div className="mt-4 border-t border-white/5 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-wider text-[#949ba4]">Discord Compatibility</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${isDiscordSafe ? "bg-[#23a559]/10 text-[#8ff0b4]" : "bg-[#f23f42]/10 text-[#ffb3b5]"}`}>
                    <span className={`mr-1.5 h-2 w-2 rounded-full ${isDiscordSafe ? "bg-[#23a559] animate-pulse" : "bg-[#f23f42]"}`} />
                    {isDiscordSafe ? "Discord Safe" : "Exceeds 512KB"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-[#0b0d13] p-2.5 border border-white/5">
                    <span className="block text-[10px] font-black uppercase tracking-wider text-[#949ba4]">Estimate</span>
                    <span className={`text-sm font-black font-mono ${isDiscordSafe ? "text-white" : "text-[#f23f42]"}`}>
                      {formatBytes(estimatedBytes)}
                    </span>
                  </div>
                  <div className="rounded-xl bg-[#0b0d13] p-2.5 border border-white/5">
                    <span className="block text-[10px] font-black uppercase tracking-wider text-[#949ba4]">Final Size</span>
                    <span className="text-sm font-black font-mono text-white">
                      {finalSize ? formatBytes(finalSize) : "Pending"}
                    </span>
                  </div>
                  <div className="rounded-xl bg-[#0b0d13] p-2.5 border border-white/5">
                    <span className="block text-[10px] font-black uppercase tracking-wider text-[#949ba4]">Max Limit</span>
                    <span className="text-sm font-black font-mono text-[#949ba4]">512KB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Row & Message Bar at Bottom */}
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#111318]/90 p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${status === "error" ? "bg-[#f23f42]" : status === "processing" ? "bg-[#5865f2] animate-ping" : status === "done" ? "bg-[#23a559]" : "bg-[#b5bac1]"}`} />
              <p className="text-sm font-bold text-[#d7d9df] line-clamp-2">
                {message}
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2.5 justify-end">
              <button
                type="button"
                onClick={createClip}
                disabled={!canCreateClip}
                className="h-11 rounded-xl bg-[#23a559] px-5 font-black text-sm text-white shadow-md shadow-[#23a559]/10 transition hover:-translate-y-0.5 hover:bg-[#2dbf68] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isProcessing ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7h7m-7-7h7M3 10a7 7 0 1114 0 7 7 0 01-14 0z" />
                    </svg>
                    Create MP3
                  </>
                )}
              </button>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  className="h-11 rounded-xl bg-white px-5 text-center font-black text-sm text-[#111318] shadow-md shadow-white/5 transition hover:-translate-y-0.5 flex items-center justify-center gap-1.5 hover:bg-gray-100"
                >
                  <svg className="w-4 h-4 text-[#111318]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download MP3
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[#20222b]/70 p-4 shadow-xl shadow-black/10">
      <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#949ba4]">{title}</h3>
      {children}
    </section>
  );
}

function Button({ children, disabled, onClick, variant = "ghost" }: { children: React.ReactNode; disabled?: boolean; onClick: () => void; variant?: "ghost" | "primary" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={variant === "primary"
        ? "min-h-12 rounded-2xl bg-[#5865f2] px-4 py-3 font-black text-white transition hover:bg-[#6f7af6] disabled:cursor-not-allowed disabled:opacity-50"
        : "min-h-12 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-black text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"}
    >
      {children}
    </button>
  );
}

function TimeInput({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-[#949ba4]">{label}</span>
      <input
        type="number"
        min="0"
        step="0.1"
        value={value.toFixed(1)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-12 w-full rounded-2xl border border-white/10 bg-[#0b0d13] px-4 font-bold text-white outline-none transition focus:border-[#5865f2] disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b0d13] px-4 py-3 font-black text-white w-full">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-[#5865f2]"
      />
    </label>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#949ba4]">{label}</p>
      <p className={`mt-1 text-xl font-black ${danger ? "text-[#f23f42]" : "text-white"}`}>{value}</p>
    </div>
  );
}
