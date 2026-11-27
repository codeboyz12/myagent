import { NextResponse } from "next/server";

import {
  apiError,
  callBackend,
  relayBackendResponse,
  requireSameOrigin,
  unavailableResponse,
} from "@/lib/server/backend";

export async function GET(): Promise<NextResponse> {
  try {
    return relayBackendResponse(await callBackend("/settings/providers"));
  } catch {
    return unavailableResponse();
  }
}

async function relayMutation(request: Request, method: "POST" | "PATCH"): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Enter valid provider settings.", 400);
  }
  try {
    return relayBackendResponse(await callBackend(
      method === "PATCH" ? "/settings/providers/active" : "/settings/providers",
      { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    ));
  } catch {
    return unavailableResponse();
  }
}

export function POST(request: Request): Promise<NextResponse> {
  return relayMutation(request, "POST");
}

export function PATCH(request: Request): Promise<NextResponse> {
  return relayMutation(request, "PATCH");
}
