import Link from "next/link";
import { Spotlight } from "@/components/ui/spotlight";
import { BentoGrid, BentoCard } from "@/components/ui/bento-grid";

export default function LandingPage() {
  return (
    <div className="relative overflow-x-hidden bg-[#0e0e0e] text-white min-h-screen">
      {/* Background layers */}
      <div className="fixed inset-0 mesh-gradient pointer-events-none z-0" />
      <div className="fixed inset-0 technical-grid pointer-events-none z-0 opacity-60" />

      {/* ── Navbar ── */}
      <nav className="fixed top-0 w-full z-50 bg-[#0e0e0e]/80 backdrop-blur-xl shadow-[0px_20px_40px_rgba(0,0,0,0.4)]">
        <div className="flex justify-between items-center w-full px-8 h-20 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-10">
            <span className="text-xl font-black text-[#ff8f6f] tracking-tighter font-headline">
              Obsidian
            </span>
            <div className="hidden md:flex gap-8 font-headline font-bold tracking-tight text-sm uppercase">
              <a className="text-[#ff8f6f] border-b-2 border-[#ff8f6f] pb-1" href="#">
                Platform
              </a>
              <a className="text-[#adaaaa] hover:text-white transition-colors" href="#">
                Use Cases
              </a>
              <a className="text-[#adaaaa] hover:text-white transition-colors" href="#">
                Docs
              </a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-[#adaaaa] hover:text-white font-bold text-sm transition-colors hidden md:block">
              Sign In
            </button>
            <Link
              href="/simulate"
              className="bg-[#ff8f6f] text-[#5c1400] px-6 py-2.5 font-headline font-bold text-sm hover:bg-[#ff7851] transition-all active:scale-95 rounded-sm"
            >
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* ── Hero ── */}
        <section className="min-h-screen flex flex-col lg:flex-row items-stretch pt-20 px-8 max-w-7xl mx-auto">
          {/* Left: Editorial */}
          <div className="w-full lg:w-5/12 pt-24 pb-12 flex flex-col justify-start">
            <div className="space-y-8">
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-[#1a2a3a]/40 backdrop-blur-sm rounded-sm text-[#adaaaa] text-[10px] uppercase tracking-[0.2em] font-bold border border-white/10">
                <span className="material-symbols-outlined text-xs text-[#ff8f6f]">
                  analytics
                </span>
                Protocol Intelligence Platform
              </span>

              <h1 className="font-headline text-6xl md:text-[5.5rem] font-black tracking-tighter leading-[0.9] text-white">
                Demystify <br />
                <span className="text-[#ff8f6f]">Network</span> <br />
                Flows.
              </h1>

              <p className="text-[#adaaaa] text-lg max-w-md leading-relaxed font-body">
                A high-fidelity simulation environment for modern distributed
                systems. Visualize complex packet flows, analyze latency, and
                debug protocol behavior in a controlled sandbox.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link
                  href="/simulate"
                  className="inline-flex items-center justify-center gap-3 bg-[#ff8f6f] text-[#5c1400] px-8 py-4 font-headline font-bold text-base hover:bg-[#ff7851] transition-all active:scale-95 rounded-sm shadow-[0_10px_40px_-10px_rgba(255,143,111,0.4)]"
                >
                  Explore Simulations
                  <span className="material-symbols-outlined text-base">
                    arrow_forward
                  </span>
                </Link>
                <button className="inline-flex items-center justify-center gap-2 border border-white/10 text-white px-8 py-4 font-headline font-bold text-base hover:bg-white/5 backdrop-blur-sm transition-all rounded-sm">
                  View Docs
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-24 grid grid-cols-2 gap-12 border-t border-white/5 pt-10">
              <div>
                <div className="text-2xl font-bold font-headline text-white">
                  0.12ms
                </div>
                <div className="text-[10px] text-[#adaaaa] uppercase tracking-widest font-bold mt-2">
                  Latency Accuracy
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold font-headline text-white">
                  15+
                </div>
                <div className="text-[10px] text-[#adaaaa] uppercase tracking-widest font-bold mt-2">
                  Protocol Engines
                </div>
              </div>
            </div>
          </div>

          {/* Right: Visualization */}
          <div className="w-full lg:w-7/12 relative flex">
            <div className="flex-grow flex items-center justify-center p-4 relative overflow-hidden">
              <Spotlight
                className="-top-40 left-0 md:left-60 md:-top-20 w-[600px] h-[600px] opacity-50"
                fill="#ff8f6f"
              />

              <div className="relative w-full aspect-square max-w-2xl flex items-center justify-center">
                {/* Orbit circles */}
                <div className="absolute w-full h-full border border-white/[0.03] rounded-full" />
                <div className="absolute w-3/4 h-3/4 border border-white/[0.05] rounded-full" />
                <div className="absolute w-1/2 h-1/2 border border-[#1a2a3a]/40 rounded-full" />

                {/* SVG packet flow */}
                <svg
                  className="absolute inset-0 w-full h-full z-10"
                  viewBox="0 0 400 400"
                  fill="none"
                >
                  <circle
                    cx="200"
                    cy="200"
                    r="140"
                    stroke="rgba(26, 42, 58, 0.4)"
                    strokeWidth="1"
                    fill="none"
                  />
                  <circle
                    cx="200"
                    cy="200"
                    r="100"
                    stroke="rgba(255, 143, 111, 0.1)"
                    strokeWidth="1"
                    fill="none"
                  />
                  <path
                    className="packet-flow"
                    d="M200 60 A 140 140 0 1 1 200 340 A 140 140 0 1 1 200 60"
                    stroke="#ff8f6f"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <circle
                    cx="200"
                    cy="60"
                    r="4"
                    fill="#ff8f6f"
                    className="animate-pulse"
                  />
                  <circle cx="60" cy="260" r="3" fill="#ff7851" opacity="0.6" />
                  <circle cx="340" cy="260" r="3" fill="#ff7851" opacity="0.6" />
                </svg>

                {/* Nodes */}
                <div className="relative z-20 flex flex-col items-center gap-16">
                  <div className="glass-panel p-5 rounded-sm flex flex-col items-center gap-3 w-28">
                    <span className="material-symbols-outlined text-[#adaaaa] text-3xl">
                      hub
                    </span>
                    <span className="text-[9px] font-bold text-[#adaaaa] uppercase tracking-widest">
                      Client
                    </span>
                  </div>
                  <div className="h-24 w-px bg-gradient-to-b from-[#ff8f6f]/60 via-[#1a2a3a] to-transparent" />
                  <div
                    className="glass-panel p-5 rounded-sm flex flex-col items-center gap-3 w-28"
                    style={{
                      borderColor: "rgba(255,120,81,0.3)",
                      boxShadow: "0 0 40px -10px rgba(255,143,111,0.3)",
                    }}
                  >
                    <span className="material-symbols-outlined text-[#ff8f6f] text-3xl">
                      dns
                    </span>
                    <span className="text-[9px] font-bold text-white uppercase tracking-widest">
                      Server
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="hidden xl:flex w-72 bg-[#1a1919]/40 backdrop-blur-xl border-l border-white/5 flex-col p-8 gap-4">
              <h3 className="font-headline text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa] mb-4">
                Architecture Modules
              </h3>
              <div className="space-y-2">
                {[
                  {
                    num: "01",
                    title: "HTTP Lifecycle",
                    desc: "Visualize stateless transitions.",
                    active: true,
                  },
                  {
                    num: "02",
                    title: "WebSocket Flows",
                    desc: "Bi-directional socket tracking.",
                    active: false,
                  },
                  {
                    num: "03",
                    title: "Event Loop Trace",
                    desc: "Microtask and call stack logic.",
                    active: false,
                  },
                ].map((item) => (
                  <div
                    key={item.num}
                    className={`flex flex-col items-start p-5 rounded-sm text-left transition-all group cursor-pointer ${
                      item.active
                        ? "bg-white/[0.03] border-l-2 border-[#ff8f6f]"
                        : "border-l-2 border-transparent hover:bg-white/[0.03]"
                    }`}
                  >
                    <span
                      className={`text-[10px] font-bold mb-1 ${item.active ? "text-[#ff8f6f]" : "text-[#adaaaa]"}`}
                    >
                      {item.num}
                    </span>
                    <span className="text-sm font-bold text-white group-hover:text-[#ff8f6f] transition-colors">
                      {item.title}
                    </span>
                    <p className="text-[11px] text-[#adaaaa] mt-2 leading-tight">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Features Bento ── */}
        <section className="py-24 px-8 bg-[#1a1919]/40 border-y border-white/5">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col lg:flex-row justify-between items-end mb-16 gap-8">
              <div className="max-w-2xl">
                <h2 className="font-headline text-4xl font-bold tracking-tight mb-6 text-white leading-tight">
                  Precision tools for the{" "}
                  <span className="text-[#ff8f6f]">Obsidian Architect</span>
                </h2>
                <p className="text-[#adaaaa] text-lg font-body">
                  Remove the abstraction layer. High-fidelity environments where
                  network latency is visible and system architecture is tangible.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:h-[650px]">
              {/* Large: Endpoint Sandbox */}
              <div className="md:col-span-2 md:row-span-2 glass-panel p-12 flex flex-col justify-between group overflow-hidden rounded-sm md:h-full">
                <div className="space-y-6">
                  <div className="w-14 h-14 bg-[#1a2a3a]/40 border border-white/10 flex items-center justify-center rounded-sm">
                    <span className="material-symbols-outlined text-[#ff8f6f] text-3xl">
                      terminal
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold font-headline text-white">
                    Custom Endpoint Sandbox
                  </h3>
                  <p className="text-[#adaaaa] leading-relaxed text-sm font-body">
                    Design custom REST or GraphQL endpoints with configurable
                    response delays and status codes. Test how your frontend
                    handles 404, 500, or slow connections in a controlled
                    simulation.
                  </p>
                </div>
                <div className="relative mt-10 h-40 w-full bg-[#0a0a0a] border border-white/10 rounded-sm overflow-hidden">
                  <div className="absolute inset-0 technical-grid opacity-20" />
                  <div className="absolute top-3 left-4 font-body text-[10px] text-[#ff8f6f]/60">
                    SYSTEM_LOG_v1.0.4
                  </div>
                  <div className="p-6 flex items-center justify-center h-full">
                    <div className="w-full h-px bg-[#1a2a3a]/50 relative">
                      <div className="absolute left-1/4 -top-1 w-2 h-2 bg-[#ff8f6f] rounded-full blur-[1px]" />
                      <div className="absolute left-1/2 -top-1 w-2 h-2 bg-white/40 rounded-full" />
                      <div className="absolute left-3/4 -top-1 w-2 h-2 bg-[#ff7851]/60 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Medium: Latency Realism */}
              <div className="md:col-span-2 glass-panel p-10 flex gap-8 items-center rounded-sm">
                <div className="flex-1">
                  <h3 className="text-xl font-bold font-headline mb-3 text-white">
                    Latency Realism
                  </h3>
                  <p className="text-sm text-[#adaaaa] leading-relaxed font-body">
                    Simulate global traffic with physical fidelity. Model packet
                    traversal across regional nodes with calculated propagation
                    delays.
                  </p>
                </div>
                <div
                  className="w-24 h-24 bg-[#1a2a3a]/30 rounded-full border border-white/5 flex items-center justify-center flex-shrink-0"
                  style={{ boxShadow: "0 0 40px -10px rgba(26,42,58,0.5)" }}
                >
                  <span className="material-symbols-outlined text-[#ff8f6f] text-4xl">
                    public
                  </span>
                </div>
              </div>

              {/* Stat */}
              <div className="glass-panel p-10 flex flex-col justify-center rounded-sm border-t-2 border-t-[#ff8f6f]">
                <div className="text-4xl font-black font-headline mb-2 text-white">
                  99.9%
                </div>
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#adaaaa]">
                  Simulation Accuracy
                </p>
              </div>

              {/* Packet Inspection */}
              <div className="glass-panel p-10 flex flex-col justify-center hover:bg-[#ff8f6f]/90 transition-all group cursor-pointer rounded-sm">
                <span className="material-symbols-outlined text-[#ff8f6f] group-hover:text-[#5c1400] mb-6 text-3xl transition-colors">
                  layers
                </span>
                <p className="text-sm font-bold text-white group-hover:text-[#5c1400] transition-colors font-body">
                  Packet Inspection
                </p>
                <p className="text-[11px] text-[#adaaaa] group-hover:text-[#5c1400]/80 mt-2 transition-colors">
                  Deep dive into headers
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-32 px-8 flex flex-col items-center text-center">
          <div className="max-w-3xl glass-panel p-16 relative overflow-hidden rounded-sm">
            <div className="absolute inset-0 bg-[#1a2a3a]/5 pointer-events-none" />
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-[#ff8f6f] flex items-center justify-center rounded-sm"
              style={{ boxShadow: "0 0 40px -5px #ff8f6f" }}
            >
              <span className="material-symbols-outlined text-[#5c1400] text-3xl">
                bolt
              </span>
            </div>
            <h2 className="font-headline text-4xl font-black mb-6 text-white mt-4">
              Ready to master the stack?
            </h2>
            <p className="text-[#adaaaa] mb-10 text-lg max-w-lg mx-auto font-body">
              Join the next generation of systems engineers building
              high-performance mental models.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <input
                className="bg-black/40 border border-white/10 focus:border-[#ff8f6f] focus:outline-none text-sm px-6 py-4 w-full sm:w-72 text-white placeholder:text-[#adaaaa]/50 rounded-sm font-body"
                placeholder="engineer@yourcompany.io"
                type="email"
              />
              <button
                className="bg-[#ff8f6f] text-[#5c1400] px-10 py-4 font-headline font-bold text-sm hover:bg-[#ff7851] transition-all active:scale-95 rounded-sm"
                style={{ boxShadow: "0 10px 30px -10px rgba(255,143,111,0.3)" }}
              >
                Start Simulating
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full py-20 px-8 border-t border-white/5 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 max-w-7xl mx-auto text-sm font-body">
          <div className="col-span-2 md:col-span-1">
            <span className="text-xl font-black text-white mb-6 block font-headline tracking-tighter">
              Obsidian
            </span>
            <p className="text-[#adaaaa] max-w-xs leading-relaxed">
              Defining the future of technical education through high-fidelity
              systems simulation.
            </p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-[10px] tracking-[0.2em]">
              Platform
            </h4>
            <ul className="space-y-3 text-[#adaaaa]">
              <li>
                <a className="hover:text-[#ff8f6f] transition-colors" href="#">
                  Documentation
                </a>
              </li>
              <li>
                <a className="hover:text-[#ff8f6f] transition-colors" href="#">
                  System Specs
                </a>
              </li>
              <li>
                <a className="hover:text-[#ff8f6f] transition-colors" href="#">
                  Core API
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-[10px] tracking-[0.2em]">
              Company
            </h4>
            <ul className="space-y-3 text-[#adaaaa]">
              <li>
                <a className="hover:text-[#ff8f6f] transition-colors" href="#">
                  System Status
                </a>
              </li>
              <li>
                <a className="hover:text-[#ff8f6f] transition-colors" href="#">
                  Privacy Protocol
                </a>
              </li>
              <li>
                <a className="hover:text-[#ff8f6f] transition-colors" href="#">
                  Security Ops
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-[10px] tracking-[0.2em]">
              Contact
            </h4>
            <span className="text-[#adaaaa] mb-8 block">
              hello@obsidian.dev
            </span>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-white/5 text-center text-[10px] uppercase tracking-widest text-[#adaaaa]/40">
          © 2024 Obsidian. Engineered for precision.
        </div>
      </footer>
    </div>
  );
}
