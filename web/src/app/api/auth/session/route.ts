import { NextResponse } from "next/server";

import {
  apiError,
  callBackend,
  relayBackendResponse,
} from "@/lib/server/backend";

export async function GET(): Promise<NextResponse> {
  try {
    const upstream = await callBackend("/sessions");
    if (!upstream.ok) return relayBackendResponse(upstream);
    return NextResponse.json(
      { authenticated: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return apiError("The myagent service is temporarily unavailable.", 503);
  }
}
