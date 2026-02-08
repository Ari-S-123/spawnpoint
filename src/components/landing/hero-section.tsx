import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* Background grain texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
        }}
      />

      {/* Radial amber glow behind content */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/5 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-[40%] rounded-full bg-amber-400/8 blur-[80px]" />

      {/* Top accent line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

      <div className="relative z-10 max-w-3xl text-center">
        {/* Overline */}
        <p
          className="mb-6 text-xs font-medium tracking-[0.3em] text-amber-400/80 uppercase"
          style={{ animationDelay: '0ms' }}
        >
          Self-Healing Autonomous Onboarding
        </p>

        {/* Headline */}
        <h1
          className="mb-6 font-serif text-5xl leading-[1.1] font-light tracking-tight text-zinc-100 md:text-7xl"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          One Click.
          <br />
          <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent">
            Five Platforms.
          </span>
          <br />
          Zero Friction.
        </h1>

        {/* Subheadline */}
        <p className="mx-auto mb-10 max-w-lg text-lg leading-relaxed text-zinc-400">
          SpawnPoint automates account creation across Instagram, X, Mintlify, Vercel, and Sentry for your AI agents.
          What takes 30 minutes by hand takes 2 minutes with us.
        </p>

        {/* CTA */}
        <div className="flex flex-col items-center gap-4">
          <Link href="/auth/sign-up" className="group relative inline-flex items-center justify-center">
            {/* Glow effect */}
            <span className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl transition-all duration-500 group-hover:bg-amber-500/30 group-hover:blur-2xl" />
            <span className="relative rounded-full border border-amber-500/30 bg-zinc-950 px-8 py-3.5 text-sm font-medium tracking-wide text-amber-100 transition-all duration-300 group-hover:border-amber-400/50 group-hover:text-amber-50">
              Get Started
              <span className="ml-2 inline-block transition-transform duration-300 group-hover:translate-x-0.5">
                &rarr;
              </span>
            </span>
          </Link>
          <p className="text-xs text-zinc-600">No credit card required</p>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent" />
    </section>
  );
}
