import Link from 'next/link';
import { HeroSection } from '@/components/landing/hero-section';
import { PlatformGrid } from '@/components/landing/platform-grid';
import { HowItWorks } from '@/components/landing/how-it-works';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Navigation */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <span
              className="text-xl font-light tracking-tight text-zinc-100"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Spawn<span className="text-amber-400">Point</span>
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/auth/sign-in" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">
              Sign In
            </Link>
            <Link
              href="/auth/sign-up"
              className="rounded-full border border-amber-500/30 bg-amber-500/10 px-5 py-2 text-sm font-medium text-amber-200 transition-all hover:border-amber-400/50 hover:bg-amber-500/15"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <HeroSection />

      {/* Platform Grid */}
      <PlatformGrid />

      {/* How It Works */}
      <HowItWorks />

      {/* Final CTA */}
      <section className="relative px-6 py-32">
        <div className="absolute inset-x-0 top-0 mx-auto h-px w-1/2 bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="mb-6 font-serif text-3xl font-light text-zinc-200 md:text-4xl"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Ready to automate?
          </h2>
          <p className="mb-10 leading-relaxed text-zinc-400">
            Create your first AI agent in under two minutes. No credit card, no configuration headaches, no manual
            signups.
          </p>
          <Link href="/auth/sign-up" className="group relative inline-flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl transition-all duration-500 group-hover:bg-amber-500/30 group-hover:blur-2xl" />
            <span className="relative rounded-full border border-amber-500/30 bg-zinc-950 px-8 py-3.5 text-sm font-medium tracking-wide text-amber-100 transition-all duration-300 group-hover:border-amber-400/50 group-hover:text-amber-50">
              Start Building
              <span className="ml-2 inline-block transition-transform duration-300 group-hover:translate-x-0.5">
                &rarr;
              </span>
            </span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span
            className="text-sm font-light text-zinc-600"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Spawn<span className="text-amber-500/50">Point</span>
          </span>
          <p className="text-xs text-zinc-600">Built for BetterHack @ YC &middot; 2026</p>
        </div>
      </footer>
    </div>
  );
}
