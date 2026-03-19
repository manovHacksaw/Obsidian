import Link from "next/link";

export default function HttpSimulatePage() {
  return (
    <div className="relative min-h-screen bg-[#0e0e0e] text-white overflow-hidden flex flex-col">
      <div className="fixed inset-0 technical-grid pointer-events-none z-0 opacity-40" />

      {/* Minimal top bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-white/5 bg-[#0e0e0e]/80 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Link
            href="/simulate"
            className="flex items-center gap-2 text-[#adaaaa] hover:text-white transition-colors text-sm font-body"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back
          </Link>
          <span className="text-[#494847]">/</span>
          <span className="text-[#ff8f6f] font-headline font-bold text-sm uppercase tracking-widest">
            HTTP Lifecycle
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#ff8f6f]"
            style={{ boxShadow: "0 0 8px rgba(255,143,111,0.5)" }}
          />
          <span className="text-[10px] font-body uppercase tracking-[0.2em] text-[#777575]">
            Engine Ready
          </span>
        </div>
      </header>

      {/* Placeholder content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-8 px-6 text-center">
        <div className="w-20 h-20 bg-[#1a1919] rounded-sm flex items-center justify-center border border-white/5">
          <span className="material-symbols-outlined text-[#ff8f6f] text-4xl">
            construction
          </span>
        </div>

        <div className="space-y-3 max-w-md">
          <h1 className="font-headline text-3xl font-bold tracking-tight">
            Simulator Coming Soon
          </h1>
          <p className="text-[#adaaaa] font-body text-sm leading-relaxed">
            The HTTP Lifecycle simulator is under active development. The engine
            is initialized and ready — the visual interface is next.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-body uppercase tracking-[0.3em] text-[#494847]">
          <span className="w-8 h-px bg-[#494847]" />
          Protocol 01 — HTTP Lifecycle
          <span className="w-8 h-px bg-[#494847]" />
        </div>

        <Link
          href="/simulate"
          className="inline-flex items-center gap-2 border border-white/10 text-[#adaaaa] hover:text-white hover:border-white/20 px-6 py-3 font-body text-sm transition-colors rounded-sm"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Modules
        </Link>
      </div>
    </div>
  );
}
