import { NextResponse } from "next/server";

import {
  callBackend,
  relayBackendResponse,
  requireSameOrigin,
  requestOrigin,
  unavailableResponse,
} from "@/lib/server/backend";

export async function GET(): Promise<NextResponse> {
  try {
    return relayBackendResponse(await callBackend("/settings/chatgpt-plan"));
  } catch {
    return unavailableResponse();
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  try {
    return relayBackendResponse(await callBackend("/settings/chatgpt-plan/authorize", {
      method: "POST",
      headers: { "X-Myagent-Frontend-Origin": requestOrigin(request) },
    }));
  } catch {
    return unavailableResponse();
  }
}
