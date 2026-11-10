import { NextResponse } from "next/server";

import { apiError, callBackend, relayBackendResponse, requireSameOrigin, unavailableResponse } from "@/lib/server/backend";

export async function GET(): Promise<NextResponse> {
  try { return relayBackendResponse(await callBackend("/settings/agent-library")); }
  catch { return unavailableResponse(); }
}

export async function PUT(request: Request): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError("Enter valid Skills and Persona settings.", 400); }
  try {
    return relayBackendResponse(await callBackend("/settings/agent-library", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
  } catch { return unavailableResponse(); }
}
