import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Shared chrome for the public demo console. */
export function PageFrame({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="group flex items-center gap-3 no-underline">
            <Image src="/settle-mark.svg" alt="" aria-hidden width={36} height={36} className="brand-mark-shadow rounded-[10px]" priority />
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold tracking-[0.18em] text-ink">SETTLE</span>
              <span className="mt-1 hidden text-[10px] font-medium tracking-[0.08em] text-ink-faint sm:block">PAYMENT TRUTH</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted md:inline-flex">
              Base + Arc · USDC
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary" aria-hidden />
              Live demo
            </span>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 sm:px-8 sm:py-12">
        {children}
      </main>
      <footer className="mt-8 border-t border-line/80 bg-surface/50">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-5 text-xs text-ink-muted sm:px-8">
          <div className="flex items-center gap-2">
            <Image src="/settle-mark.svg" alt="" aria-hidden width={20} height={20} className="rounded-md" />
            <p>Read-only USDC reconciliation. Settle never holds keys, custody or sends payments.</p>
          </div>
          <a href="/health" className="font-mono text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
            GET /health
          </a>
        </div>
      </footer>
    </>
  );
}
