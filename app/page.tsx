import BiteClipStudio from "@/components/BiteClipStudio";

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
            <BiteClipLogo />
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

        <div className="w-full">
          <section className="rounded-[2rem] border border-white/10 bg-[#1b1d25]/90 p-5 shadow-2xl shadow-black/40 backdrop-blur md:p-6">
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

function BiteClipLogo() {
  return (
    <div className="relative h-11 w-11 overflow-hidden rounded-2xl border border-white/30 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,.6),rgba(255,255,255,.08)_34%,rgba(74,92,228,.55)_78%,rgba(50,60,140,.7)_100%)] shadow-[0_10px_28px_rgba(88,101,242,.45)] backdrop-blur-sm">
      <div className="absolute inset-[3px] rounded-xl border border-white/25 bg-[linear-gradient(145deg,rgba(255,255,255,.34),rgba(255,255,255,.04)_45%,rgba(12,17,40,.3)_100%)]" />
      <svg viewBox="0 0 44 44" aria-hidden="true" className="relative z-10 h-full w-full">
        <path
          d="M8.8 22h1.1M12 19.2v5.6M15.3 16.9v10.2M18.6 14.8v14.4M22 12.3v19.4M25.4 14.8v14.4M28.7 16.9v10.2M32 19.2v5.6M35.2 22h1.1"
          stroke="rgba(231,238,255,.95)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8.8 22h1.1M12 19.2v5.6M15.3 16.9v10.2M18.6 14.8v14.4M22 12.3v19.4M25.4 14.8v14.4M28.7 16.9v10.2M32 19.2v5.6M35.2 22h1.1"
          stroke="rgba(111,133,255,.7)"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(0 0.35)"
        />
      </svg>
    </div>
  );
}
