import BiteClipStudio from "@/components/BiteClipStudio";

const steps = [
  { label: "Paste", detail: "Drop in a YouTube link" },
  { label: "Shape", detail: "Trim, nudge, fade, preview" },
  { label: "Ship", detail: "Export under 512KB" },
];

const specs = ["30s max", "128kbps MP3", "loudnorm", "512KB guardrail"];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 text-[#f2f3f5] sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-20 bg-[#0b0d13]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(88,101,242,.24),transparent_30rem),radial-gradient(circle_at_78%_8%,rgba(235,69,158,.18),transparent_24rem),linear-gradient(135deg,#101320_0%,#0b0d13_52%,#17101b_100%)]" />
      <div className="absolute inset-0 -z-10 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:42px_42px]" />

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-2xl shadow-black/20 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#5865f2] font-black text-white shadow-lg shadow-[#5865f2]/30">
              BC
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#949ba4]">Discord Soundboard Studio</p>
              <h1 className="text-xl font-black tracking-[-0.03em] text-white">BiteClip</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {specs.map((spec) => (
              <span key={spec} className="rounded-full border border-white/10 bg-[#111318] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#b5bac1]">
                {spec}
              </span>
            ))}
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[0.74fr_1.26fr] xl:items-start">
          <aside className="grid gap-5 xl:sticky xl:top-5">
            <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#1e1f26]/80 shadow-2xl shadow-black/35 backdrop-blur">
              <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(88,101,242,.22),rgba(235,69,158,.08))] p-6 sm:p-7">
                <div className="mb-6 inline-flex rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-bold text-[#d7d9df] shadow-xl shadow-black/20">
                  Fast cuts for loud little moments
                </div>
                <h2 className="text-5xl font-black leading-[0.92] tracking-[-0.06em] text-white sm:text-6xl xl:text-7xl">
                  Clip the bite.
                  <span className="block text-[#b8befd]">Skip the bloat.</span>
                </h2>
                <p className="mt-5 max-w-xl text-base leading-8 text-[#d6d9e0] sm:text-lg">
                  Paste a YouTube URL, shape the exact soundboard moment, and export a normalized MP3 that is ready for Discord.
                </p>
              </div>

              <div className="grid gap-3 p-5 sm:grid-cols-3 xl:grid-cols-1">
                {steps.map((step, index) => (
                  <div key={step.label} className="group rounded-2xl border border-white/10 bg-[#111318]/80 p-4 transition hover:border-[#5865f2]/60 hover:bg-[#171a24]">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5865f2] text-sm font-black text-white shadow-lg shadow-[#5865f2]/20">
                        {index + 1}
                      </div>
                      <p className="text-lg font-black text-white">{step.label}</p>
                    </div>
                    <p className="text-sm font-semibold leading-6 text-[#b5bac1]">{step.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-[#111318]/80 p-5 shadow-xl shadow-black/20 backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#949ba4]">Session</p>
                  <h3 className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">Ready to cut</h3>
                </div>
                <div className="h-3 w-3 rounded-full bg-[#23a559] shadow-[0_0_24px_rgba(35,165,89,.9)]" />
              </div>
              <p className="mt-4 text-sm leading-6 text-[#b5bac1]">
                Start with Load Audio, then use the editor panel for playback, precision timing, presets, fades, and export.
              </p>
            </section>
          </aside>

          <section className="rounded-[2rem] border border-white/10 bg-[#1b1d25]/90 p-4 shadow-2xl shadow-black/40 backdrop-blur md:p-5">
            <BiteClipStudio />
          </section>
        </div>

        <footer className="flex flex-col gap-2 border-t border-white/10 pt-5 text-sm text-[#949ba4] sm:flex-row sm:items-center sm:justify-between">
          <span>Server-side processing uses yt-dlp and FFmpeg from PATH or BiteClip portable fallbacks.</span>
          <span>loudnorm + 128kbps MP3 + 512KB guardrail</span>
        </footer>
      </section>
    </main>
  );
}
