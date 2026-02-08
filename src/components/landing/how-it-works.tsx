import { UserPlus, Cpu, KeyRound } from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Create',
    description: 'Name your AI agent. SpawnPoint provisions a dedicated email inbox via AgentMail.',
    icon: UserPlus
  },
  {
    number: '02',
    title: 'Automate',
    description:
      'Cloud browsers sign up across all multiple platforms simultaneously, with AI-guided recovery if anything breaks.',
    icon: Cpu
  },
  {
    number: '03',
    title: 'Operate',
    description:
      'Access all credentials in a secure vault. Monitor signup progress in real-time. Manage accounts from one dashboard.',
    icon: KeyRound
  }
];

export function HowItWorks() {
  return (
    <section className="relative px-6 py-32">
      {/* Subtle divider */}
      <div className="absolute inset-x-0 top-0 mx-auto h-px w-1/2 bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

      <div className="mx-auto max-w-4xl">
        <p className="mb-3 text-center text-xs font-medium tracking-[0.3em] text-amber-400/60 uppercase">
          How It Works
        </p>
        <h2
          className="mb-20 text-center font-serif text-3xl font-light text-zinc-200 md:text-4xl"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Three steps to full automation
        </h2>

        <div className="relative">
          {/* Connecting line */}
          <div className="absolute top-0 left-1/2 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-amber-500/20 via-amber-500/10 to-transparent md:block" />

          <div className="space-y-16 md:space-y-24">
            {steps.map((step, i) => (
              <div
                key={step.number}
                className={`flex flex-col items-center gap-8 md:flex-row ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
              >
                {/* Content */}
                <div className="flex-1 text-center md:text-left">
                  <span
                    className="mb-2 inline-block font-serif text-sm text-amber-400/50"
                    style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                  >
                    {step.number}
                  </span>
                  <h3 className="mb-3 text-2xl font-medium text-zinc-100">{step.title}</h3>
                  <p className="leading-relaxed text-zinc-400">{step.description}</p>
                </div>

                {/* Icon circle */}
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-amber-500/20 bg-amber-500/5" />
                  <step.icon className="h-8 w-8 text-amber-400/70" />
                </div>

                {/* Spacer for alignment */}
                <div className="hidden flex-1 md:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
