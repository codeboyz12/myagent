import { NextResponse } from "next/server";

import {
  apiError,
  callBackend,
  relayBackendResponse,
  requireSameOrigin,
  unavailableResponse,
} from "@/lib/server/backend";

type RouteParams = { params: Promise<{ providerId: string }> };

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Set whether this provider is enabled.", 400);
  }
  try {
    const { providerId } = await params;
    return relayBackendResponse(await callBackend(`/settings/providers/${encodeURIComponent(providerId)}/enabled`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
  } catch {
    return unavailableResponse();
  }
}
