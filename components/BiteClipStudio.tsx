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
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);

      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<BiteClipSettings>;
      const safeSettings: BiteClipSettings = {
        applySavedDefaults: parsed.applySavedDefaults ?? DEFAULT_SETTINGS.applySavedDefaults,
        fadeIn: parsed.fadeIn ?? DEFAULT_SETTINGS.fadeIn,
        fadeOut: parsed.fadeOut ?? DEFAULT_SETTINGS.fadeOut,
        clipLengthSeconds: clamp(
          roundTime(Number(parsed.clipLengthSeconds ?? DEFAULT_SETTINGS.clipLengthSeconds)),
          1,
          MAX_SECONDS,
        ),
      };

      setSettings(safeSettings);

      if (safeSettings.applySavedDefaults) {
        setFadeIn(safeSettings.fadeIn);
        setFadeOut(safeSettings.fadeOut);
      }
    } catch {
      // Invalid local storage should not break the studio.
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
    const next = {
      ...settings,
      ...partial,
    };
    setSettings(next);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }

  function saveCurrentAsDefaults() {
    const next = {
      ...settings,
      fadeIn,
      fadeOut,
      clipLengthSeconds: clamp(roundTime(selectionLength || 10), 1, MAX_SECONDS),
    };
    setSettings(next);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    setMessage("Saved current editor settings as your defaults.");
  }

  function resetDefaults() {
    setSettings(DEFAULT_SETTINGS);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
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

  return (
    <div className="space-y-6">
      <form onSubmit={prepareAudio} className="space-y-3">
        <label htmlFor="youtube-url" className="text-sm font-black uppercase tracking-[0.2em] text-[#b5bac1]">
          YouTube URL
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="youtube-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="min-h-14 flex-1 rounded-2xl border border-white/10 bg-[#111318] px-5 text-white outline-none ring-0 transition focus:border-[#5865f2] focus:shadow-[0_0_0_4px_rgba(88,101,242,.18)]"
            required
          />
          <button
            type="submit"
            disabled={status === "loading" || isProcessing}
            className="min-h-14 rounded-2xl bg-[#5865f2] px-6 font-black text-white shadow-lg shadow-[#5865f2]/25 transition hover:-translate-y-0.5 hover:bg-[#6f7af6] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Loading..." : "Load Audio"}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className="min-h-14 rounded-2xl border border-white/15 bg-white/5 px-6 font-black text-white transition hover:bg-white/10"
          >
            {settingsOpen ? "Hide Settings" : "Settings"}
          </button>
        </div>
      </form>

      {settingsOpen ? (
        <Panel title="Settings">
          <div className="grid gap-3 sm:grid-cols-2">
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
            <label className="space-y-2 rounded-2xl border border-white/10 bg-[#0b0d13] p-3">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-[#949ba4]">Default clip length (s)</span>
              <input
                type="number"
                min="1"
                max={MAX_SECONDS}
                step="0.1"
                value={settings.clipLengthSeconds.toFixed(1)}
                onChange={(event) => updateSettings({
                  clipLengthSeconds: clamp(roundTime(Number(event.target.value)), 1, MAX_SECONDS),
                })}
                className="min-h-12 w-full rounded-2xl border border-white/10 bg-[#111318] px-4 font-bold text-white outline-none transition focus:border-[#5865f2]"
              />
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Button onClick={saveCurrentAsDefaults}>Save current editor as defaults</Button>
            <Button onClick={resetDefaults}>Reset defaults</Button>
          </div>
        </Panel>
      ) : null}

      <div className="rounded-[1.5rem] border border-white/10 bg-[#111318]/80 p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#949ba4]">Waveform Trimmer</p>
            <h2 className="line-clamp-1 text-lg font-black text-white">{title || "No audio loaded yet"}</h2>
          </div>
          <div className="rounded-full bg-white/5 px-3 py-1 text-sm font-bold text-[#b5bac1]">
            {formatTime(selection.start)} - {formatTime(selection.end)}
          </div>
        </div>
        <div ref={waveformRef} className="min-h-40 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d13] p-3" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <Stat label="Playhead" value={formatTime(currentTime)} />
          <Stat label="Selection" value={`${selectionLength.toFixed(1)}s / ${MAX_SECONDS}s`} danger={selectionLength > MAX_SECONDS} />
          <Stat label="Estimate" value={formatBytes(estimatedBytes)} danger={!isDiscordSafe} />
          <Stat label="Final Size" value={finalSize ? formatBytes(finalSize) : "Pending"} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Playback">
          <div className="grid gap-3 sm:grid-cols-3">
            <Button onClick={togglePlayPause} disabled={!canEdit} variant="primary">
              {isPlaying ? "Pause" : "Play"}
            </Button>
            <Button onClick={playSelection} disabled={!canEdit}>Play Selection</Button>
            <Button onClick={playFromStart} disabled={!canEdit}>Play From Start</Button>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-[#0b0d13] p-4 text-sm font-semibold text-[#b5bac1]">
            {formatTime(currentTime)} / {duration ? formatTime(duration) : "--"}
          </div>
        </Panel>

        <Panel title="Precision Edit">
          <div className="grid gap-3 sm:grid-cols-2">
            <TimeInput
              label="Start"
              value={selection.start}
              disabled={!canEdit}
              onChange={(value) => syncSelection({ start: value, end: selection.end })}
            />
            <TimeInput
              label="End"
              value={selection.end}
              disabled={!canEdit}
              onChange={(value) => syncSelection({ start: selection.start, end: value })}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Button onClick={setStartHere} disabled={!canEdit}>Set Start Here</Button>
            <Button onClick={setEndHere} disabled={!canEdit}>Set End Here</Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button onClick={() => nudge("start", -NUDGE_SECONDS)} disabled={!canEdit}>Start -0.1</Button>
            <Button onClick={() => nudge("start", NUDGE_SECONDS)} disabled={!canEdit}>Start +0.1</Button>
            <Button onClick={() => nudge("end", -NUDGE_SECONDS)} disabled={!canEdit}>End -0.1</Button>
            <Button onClick={() => nudge("end", NUDGE_SECONDS)} disabled={!canEdit}>End +0.1</Button>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Presets">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PRESETS.map((seconds) => (
              <Button key={seconds} onClick={() => applyPreset(seconds)} disabled={!canEdit}>
                {seconds}s
              </Button>
            ))}
          </div>
        </Panel>

        <Panel title="Discord Polish">
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle label="Fade in" checked={fadeIn} onChange={setFadeIn} />
            <Toggle label="Fade out" checked={fadeOut} onChange={setFadeOut} />
          </div>
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-black ${isDiscordSafe ? "border-[#23a559]/40 bg-[#23a559]/10 text-[#8ff0b4]" : "border-[#f23f42]/40 bg-[#f23f42]/10 text-[#ffb3b5]"}`}>
            {isDiscordSafe ? "Discord safe estimate" : "Selection may exceed Discord size limit"}
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-[#111318]/80 p-4 lg:flex-row lg:items-center lg:justify-between">
        <p className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${status === "error" ? "border-[#f23f42]/40 bg-[#f23f42]/10 text-[#ffb3b5]" : "border-white/10 bg-white/5 text-[#b5bac1]"}`}>
          {message}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={createClip}
            disabled={!canCreateClip}
            className="rounded-2xl bg-[#23a559] px-5 py-3 font-black text-white shadow-lg shadow-[#23a559]/20 transition hover:-translate-y-0.5 hover:bg-[#2dbf68] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? "Processing..." : "Create MP3"}
          </button>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="rounded-2xl bg-white px-5 py-3 text-center font-black text-[#111318] shadow-lg shadow-white/10 transition hover:-translate-y-0.5"
            >
              Download MP3
            </a>
          ) : null}
        </div>
      </div>
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
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b0d13] px-4 py-3 font-black text-white">
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
