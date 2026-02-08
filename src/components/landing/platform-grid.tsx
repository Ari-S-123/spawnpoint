const platforms = [
  {
    name: 'Instagram',
    category: 'Social Media',
    gradient: 'from-pink-500/10 to-purple-500/10',
    border: 'hover:border-pink-500/30',
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    )
  },
  // TikTok disabled
  // {
  //   name: 'TikTok',
  //   category: 'Social Media',
  //   gradient: 'from-cyan-400/10 to-pink-500/10',
  //   border: 'hover:border-cyan-400/30',
  //   icon: (
  //     <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
  //       <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.51a8.27 8.27 0 0 0 4.76 1.5v-3.4a4.85 4.85 0 0 1-1-.08z" />
  //     </svg>
  //   )
  // },
  {
    name: 'X / Twitter',
    category: 'Social Media',
    gradient: 'from-zinc-400/10 to-zinc-600/10',
    border: 'hover:border-zinc-400/30',
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    )
  },
  {
    name: 'Mintlify',
    category: 'Documentation',
    gradient: 'from-green-400/10 to-emerald-600/10',
    border: 'hover:border-green-400/30',
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
        <path
          d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
          stroke="currentColor"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  },
  {
    name: 'Vercel',
    category: 'Deployment',
    gradient: 'from-zinc-200/10 to-zinc-500/10',
    border: 'hover:border-zinc-300/30',
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
        <path d="M12 1L24 22H0L12 1z" />
      </svg>
    )
  },
  {
    name: 'Sentry',
    category: 'Error Tracking',
    gradient: 'from-purple-500/10 to-violet-600/10',
    border: 'hover:border-purple-400/30',
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
        <path d="M13.91 2.505c-.873-1.448-2.972-1.448-3.844 0L6.572 8.17a8.66 8.66 0 0 1 4.638 5.323h-1.6a7.06 7.06 0 0 0-3.79-4.26L3.2 13.87a4.46 4.46 0 0 1 2.39 2.73h-1.6a2.86 2.86 0 0 0-1.55-1.53l-.74 1.26a1.25 1.25 0 0 1 .58.58h-1.3a.5.5 0 0 1 0-.16l4.97-8.46a10.27 10.27 0 0 1 5.26 6.88h1.6a11.89 11.89 0 0 0-5.58-8.46l1.27-2.16a13.47 13.47 0 0 1 6.47 10.62h1.6c-.1-5.2-2.9-9.72-7.17-12.2l.6-1.02c5.1 2.72 8.18 7.96 8.18 13.72v.25h3.6l.26-.44c.14-.24 0-.56-.28-.56H20.6c-.1-6.07-3.47-11.58-8.82-14.4z" />
      </svg>
    )
  }
];

export function PlatformGrid() {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-center text-xs font-medium tracking-[0.3em] text-amber-400/60 uppercase">
          Supported Platforms
        </p>
        <h2
          className="mb-16 text-center font-serif text-3xl font-light text-zinc-200 md:text-4xl"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Multiple platforms. One workflow.
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((platform) => (
            <div
              key={platform.name}
              className={`group relative rounded-xl border border-zinc-800/50 bg-gradient-to-br ${platform.gradient} p-6 transition-all duration-500 ${platform.border} hover:-translate-y-0.5`}
            >
              <div className="mb-4 text-zinc-400 transition-colors duration-300 group-hover:text-zinc-200">
                {platform.icon}
              </div>
              <h3 className="mb-1 text-lg font-medium text-zinc-200">{platform.name}</h3>
              <p className="text-sm text-zinc-500">{platform.category}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
