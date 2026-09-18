import { getConfig } from "@/lib/config";
import { apiRoute, jsonResponse } from "@/lib/http";
import { buildXagentVerification } from "@/lib/xagent-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Document shape is owned by src/lib/xagent-verification.ts (placeholder
// contract until the official X-Agent schema is adopted in Milestone 6).
export const GET = apiRoute("/.well-known/xagent-verification.json", ({ requestId }) =>
  jsonResponse(buildXagentVerification(getConfig()), { requestId }),
);
