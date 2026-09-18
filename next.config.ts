import type { NextConfig } from "next";

// API routes declare `export const runtime = "nodejs"` individually; nothing in
// this project may run on the Edge runtime (ARCHITECTURE.md §2).
// Security headers and CSP are added in Milestone 5.
const nextConfig: NextConfig = {};

export default nextConfig;
