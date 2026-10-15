import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PageFrame } from "@/components/page-frame";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Settle", template: "%s · Settle" },
  description: "Read-only USDC reconciliation infrastructure for autonomous agents on Base and Arc.",
  icons: { icon: "/settle-mark.svg" },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <PageFrame>{children}</PageFrame>
      </body>
    </html>
  );
}
