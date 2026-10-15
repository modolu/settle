"use client";

import { useEffect, useState } from "react";

interface ApiCallProps {
  readonly title: string;
  readonly command: string;
  readonly caption?: string;
}

/** A developer-facing command block with a clipboard action. */
export function ApiCall({ title, command, caption }: ApiCallProps) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copied === "idle") {
      return;
    }
    const timer = setTimeout(() => setCopied("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <section aria-label={title} className="min-w-0 overflow-hidden rounded-2xl border border-line-strong bg-[#0d1322] text-white shadow-card-sm">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h3 className="text-xs font-medium tracking-[0.12em] text-white/55 uppercase">{title}</h3>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.08]"
        >
          {copied === "copied" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy API call"}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {copied === "copied" ? "API call copied to clipboard" : copied === "failed" ? "Copy to clipboard failed" : ""}
        </span>
      </div>
      <pre className="px-4 py-4 font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap text-[#c7d2fe]">
        <code>{command}</code>
      </pre>
      {caption !== undefined ? <p className="border-t border-white/10 px-4 py-2.5 text-xs text-white/45">{caption}</p> : null}
    </section>
  );
}
