import Link from "next/link";

const protocols = [
  {
    num: "01",
    title: "HTTP Lifecycle",
    description:
      "Trace the journey of a request through resolvers, proxies, and cache headers in high fidelity.",
    icon: "hub",
    href: "/simulate/http",
    featured: true,
    available: true,
  },
  {
    num: "02",
    title: "Long Polling",
    description:
      "Server holds the connection open until data is ready. Fewer round-trips, near-zero latency. See exactly how many requests short-polling would waste.",
    icon: "hourglass_empty",
    href: "/simulate/long-poll",
    featured: false,
    available: true,
  },
  {
    num: "03",
    title: "Server-Sent Events",
    description:
      "One persistent HTTP connection. Server pushes events as they happen — zero reconnects, zero empty responses. Watch the stream stay open while events arrive.",
    icon: "stream",
    href: "/simulate/sse",
    featured: false,
    available: true,
  },
  {
    num: "04",
    title: "WebSocket Flows",
    description:
      "Real-time duplex visualizer for stateful connections and binary message streaming.",
    icon: "sync_alt",
    href: "#",
    featured: false,
    available: false,
  },
  {
    num: "05",
    title: "TCP/IP Stack",
    description:
      "Low-level packet inspection and handshake orchestration. The foundation of digital transit.",
    icon: "lan",
    href: "#",
    featured: true,
    available: false,
  },
];

export default function SimulatePage() {
  return (
    <div className="relative min-h-screen bg-[#0e0e0e] text-white overflow-x-hidden">
      {/* Background grid */}
      <div className="fixed inset-0 technical-grid pointer-events-none z-0 opacity-40" />

      {/* ── Navbar ── */}
      <nav className="fixed top-0 w-full z-50 bg-[#0e0e0e]/80 backdrop-blur-xl shadow-[0px_20px_40px_rgba(0,0,0,0.4)]">
        <div className="flex justify-between items-center w-full px-8 py-4 max-w-7xl mx-auto">
          <Link
            href="/"
            className="text-xl font-black text-[#ff8f6f] tracking-tighter font-headline hover:text-[#ff7851] transition-colors"
          >
            Obsidian
          </Link>

          <div className="hidden md:flex items-center space-x-8 font-headline font-bold tracking-tight text-sm">
            <a className="text-[#ff8f6f] border-b-2 border-[#ff8f6f] pb-1" href="#">
              Modules
            </a>
            <a className="text-[#adaaaa] hover:text-white transition-colors" href="#">
              Docs
            </a>
            <a className="text-[#adaaaa] hover:text-white transition-colors" href="#">
              Pricing
            </a>
          </div>

          <Link
            href="/simulate/http"
            className="bg-[#ff8f6f] text-[#5c1400] px-5 py-2 rounded-sm font-headline font-bold text-sm hover:bg-[#ff7851] transition-colors active:scale-95"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="relative z-10 min-h-screen pt-32 pb-24 px-6 flex flex-col items-center justify-center">
        {/* Hero header */}
        <header className="max-w-3xl w-full text-center mb-16 space-y-4">
          <h1 className="font-headline text-5xl md:text-7xl font-black tracking-tighter leading-none">
            ARCHITECT{" "}
            <span className="text-[#ff8f6f]">REALITY.</span>
          </h1>
          <p className="font-body text-[#adaaaa] text-lg md:text-xl max-w-xl mx-auto leading-relaxed">
            Select a protocol engine to initialize the visual simulation
            environment. Focus on the flow, ignore the noise.
          </p>
        </header>

        {/* Protocol cards */}
        <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* HTTP — featured large */}
          <ProtocolCard
            {...protocols[0]}
            className="md:col-span-7"
            featured
          />

          {/* Long Polling */}
          <ProtocolCard {...protocols[1]} className="md:col-span-5" />

          {/* SSE */}
          <ProtocolCard {...protocols[2]} className="md:col-span-5" />

          {/* WebSocket */}
          <ProtocolCard {...protocols[3]} className="md:col-span-4" />

          {/* TCP/IP — featured large */}
          <ProtocolCard
            {...protocols[4]}
            className="md:col-span-7"
            featured
          />
        </div>

        {/* Status hint */}
        <div className="mt-20 flex items-center gap-8 text-[#777575] font-body text-[10px] tracking-[0.3em] uppercase opacity-50">
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full bg-[#ff8f6f]"
              style={{ boxShadow: "0 0 8px rgba(255,143,111,0.5)" }}
            />
            CORE ENGINE STABLE
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#262626]" />
            v4.8.02-ALPHA
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full py-12 border-t border-[#1a1919] bg-[#0e0e0e] relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-8 max-w-7xl mx-auto gap-4">
          <Link
            href="/"
            className="text-lg font-bold text-white font-headline tracking-tighter hover:text-[#ff8f6f] transition-colors"
          >
            Obsidian Architect
          </Link>
          <p className="font-body text-sm tracking-wide text-[#777575]">
            © 2024 Obsidian. Built for the elite.
          </p>
          <div className="flex gap-6">
            {["Privacy", "Terms", "Changelog"].map((item) => (
              <a
                key={item}
                className="font-body text-sm tracking-wide text-[#777575] hover:text-[#ff8f6f] transition-colors"
                href="#"
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

function ProtocolCard({
  num,
  title,
  description,
  icon,
  href,
  featured,
  available,
  className,
}: {
  num: string;
  title: string;
  description: string;
  icon: string;
  href: string;
  featured: boolean;
  available: boolean;
  className?: string;
}) {
  const inner = (
    <div
      className={`bg-[#1a1919] hover:bg-[#201f1f] p-8 min-h-[320px] relative overflow-hidden flex flex-col justify-between transition-colors duration-300 h-full ${
        !available ? "opacity-60" : ""
      }`}
    >
      {/* Corner accent for featured */}
      {featured && available && (
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#ff8f6f] to-transparent" />
      )}

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#ff8f6f] text-3xl">
              {icon}
            </span>
            <span className="font-body text-xs uppercase tracking-[0.2em] text-[#777575]">
              Protocol {num}
            </span>
          </div>
          {!available && (
            <span className="text-[10px] font-bold font-body uppercase tracking-widest text-[#adaaaa] border border-[#494847] px-2 py-1 rounded-sm">
              Coming Soon
            </span>
          )}
        </div>

        <h3
          className={`font-headline font-bold tracking-tight mb-3 ${
            featured ? "text-3xl" : "text-2xl"
          }`}
        >
          {title}
        </h3>
        <p className="font-body text-[#adaaaa] text-sm max-w-sm leading-relaxed">
          {description}
        </p>
      </div>

      <div className="relative z-10 mt-8">
        <span
          className={`inline-flex items-center gap-2 font-bold font-body text-sm tracking-wide transition-all ${
            available
              ? "text-[#ff8f6f] group-hover:gap-4"
              : "text-[#adaaaa] cursor-not-allowed"
          }`}
        >
          {available ? "INITIALIZE SIMULATION" : "UNAVAILABLE"}
          {available && (
            <span className="material-symbols-outlined text-base">
              arrow_forward
            </span>
          )}
        </span>
      </div>

      {/* Abstract background pattern for featured cards */}
      {featured && (
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-l from-[#ff8f6f]/40 to-transparent" />
        </div>
      )}
    </div>
  );

  return (
    <div className={`group cursor-pointer active:scale-[0.98] transition-all duration-300 ${className}`}>
      {available ? (
        <Link href={href} className="block h-full">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}
