// Milestone 0 placeholder. The create-intent demo UI arrives in Milestone 4.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Settle</h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-400">
        Payment truth for autonomous agents. Read-only USDC-on-Base payment reconciliation as an API.
      </p>
      <ul className="font-mono text-sm">
        <li>
          <a className="underline underline-offset-4" href="/health">
            GET /health
          </a>
        </li>
      </ul>
    </main>
  );
}
