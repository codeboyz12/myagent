import { NextResponse } from "next/server";

import { apiError, callBackend, relayBackendResponse, requireSameOrigin, unavailableResponse } from "@/lib/server/backend";

export async function GET(): Promise<NextResponse> {
  try { return relayBackendResponse(await callBackend("/settings/agent-instruction")); }
  catch { return unavailableResponse(); }
}

export async function PUT(request: Request): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError("Invalid request body.", 400); }
  try {
    return relayBackendResponse(await callBackend("/settings/agent-instruction", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
  } catch { return unavailableResponse(); }
}
