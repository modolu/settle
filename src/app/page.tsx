import { CreateIntentForm } from "@/components/create-intent-form";

// Rendered per request so the nonce-based Content Security Policy applies (see src/proxy.ts).
export const dynamic = "force-dynamic";

const FLOW = [
  { step: "Declare", detail: "Create the obligation with amount, recipient, payer and expiry." },
  { step: "Pay", detail: "USDC moves directly on Base or Arc. Settle never touches the funds." },
  { step: "Reconcile", detail: "Settle reads canonical chain evidence and applies network finality." },
  { step: "Verify", detail: "Your agent gets a deterministic status plus transaction evidence." },
] as const;

const SIGNALS = [
  { value: "Base + Arc", label: "Two settlement rails" },
  { value: "7 statuses", label: "Deterministic outcomes" },
  { value: "0 custody", label: "Keys stay with users" },
] as const;

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16 sm:gap-20">
      <section className="brand-grid relative overflow-hidden rounded-[28px] border border-line bg-surface px-6 py-8 shadow-card sm:px-10 sm:py-12 lg:px-12 lg:py-14">
        <div className="hero-glow" aria-hidden />
        <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] lg:items-center">
          <div className="flex min-w-0 flex-col items-start gap-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary" aria-hidden />
              Read-only payment reconciliation infrastructure
            </div>
            <div className="flex flex-col gap-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl lg:text-[3.75rem] lg:leading-[1.02]">
                Payment truth for <span className="brand-gradient-text">autonomous agents.</span>
              </h1>
              <p className="max-w-2xl text-base leading-7 text-ink-muted sm:text-lg">
                Declare an expected USDC payment, let the payer transact directly onchain, then ask Settle what actually happened. Your agent receives a deterministic status and verifiable evidence it can act on.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium text-ink-muted">
              <span className="rounded-full border border-line bg-canvas/70 px-3 py-1.5">Non-custodial</span>
              <span className="rounded-full border border-line bg-canvas/70 px-3 py-1.5">Exact payer matching</span>
              <span className="rounded-full border border-line bg-canvas/70 px-3 py-1.5">Onchain evidence</span>
              <span className="rounded-full border border-line bg-canvas/70 px-3 py-1.5">Agent-first API</span>
            </div>
            <div className="grid w-full grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
              {SIGNALS.map((item) => (
                <div key={item.value} className="rounded-2xl border border-line bg-canvas/70 px-4 py-3 backdrop-blur-sm">
                  <p className="text-sm font-semibold text-ink">{item.value}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative rounded-3xl border border-white/10 bg-[#0f172a] p-5 text-white shadow-panel sm:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.16em] text-white/45 uppercase">Verification result</p>
                <p className="mt-1 text-sm font-semibold">Canonical payment evidence</p>
              </div>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">PAID</span>
            </div>
            <div className="space-y-4 py-5 text-sm">
              <div className="flex items-center justify-between gap-6"><span className="text-white/50">Network</span><span className="font-medium">Arc</span></div>
              <div className="flex items-center justify-between gap-6"><span className="text-white/50">Expected</span><span className="font-mono">0.10 USDC</span></div>
              <div className="flex items-center justify-between gap-6"><span className="text-white/50">Received</span><span className="font-mono text-emerald-200">0.10 USDC</span></div>
              <div className="flex items-center justify-between gap-6"><span className="text-white/50">Match</span><span className="font-medium">exact_payer</span></div>
              <div className="flex items-center justify-between gap-6"><span className="text-white/50">Finality</span><span className="font-medium">Final on inclusion</span></div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="font-mono text-[11px] leading-5 text-white/60">0x588d0c94…d6703ae7</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden />
                Matched onchain evidence · 1 confirmation
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="flow-heading" className="flex flex-col gap-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">How it works</p>
          <h2 id="flow-heading" className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">One clean loop from obligation to proof.</h2>
        </div>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((item, index) => (
            <li key={item.step} className="rounded-2xl border border-line bg-surface p-5 shadow-card-sm">
              <div className="mb-5 flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft font-mono text-xs font-bold text-brand">0{index + 1}</span>
                {index < FLOW.length - 1 ? <span className="hidden text-line-strong lg:block">→</span> : null}
              </div>
              <p className="text-sm font-semibold text-ink">{item.step}</p>
              <p className="mt-1.5 text-sm leading-6 text-ink-muted">{item.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="create-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 border-t border-line pt-10">
          <p className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">Live console</p>
          <h2 id="create-heading" className="text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">Create an expected payment</h2>
          <p className="max-w-2xl text-sm leading-6 text-ink-muted">
            This is the real public API surface. Create an intent here, make the payment outside Settle, then inspect and reconcile the evidence.
          </p>
        </div>
        <CreateIntentForm />
      </section>
    </div>
  );
}
