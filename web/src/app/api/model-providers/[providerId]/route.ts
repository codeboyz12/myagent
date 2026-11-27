import { NextResponse } from "next/server";

import {
  apiError,
  callBackend,
  relayBackendResponse,
  requireSameOrigin,
  unavailableResponse,
} from "@/lib/server/backend";

type RouteParams = { params: Promise<{ providerId: string }> };

export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Enter valid provider settings.", 400);
  }
  try {
    const { providerId } = await params;
    return relayBackendResponse(await callBackend(`/settings/providers/${encodeURIComponent(providerId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
  } catch {
    return unavailableResponse();
  }
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  try {
    const { providerId } = await params;
    return relayBackendResponse(await callBackend(`/settings/providers/${encodeURIComponent(providerId)}`, {
      method: "DELETE",
    }));
  } catch {
    return unavailableResponse();
  }
}
