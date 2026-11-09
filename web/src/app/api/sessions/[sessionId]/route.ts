import { NextResponse } from "next/server";
import { z } from "zod";

import {
  apiError,
  callBackend,
  relayBackendResponse,
  requireSameOrigin,
  unavailableResponse,
} from "@/lib/server/backend";

type RouteParams = { params: Promise<{ sessionId: string }> };

export async function GET(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { sessionId } = await params;
  if (!z.string().uuid().safeParse(sessionId).success) {
    return apiError("Session not found.", 404);
  }

  try {
    return relayBackendResponse(
      await callBackend(`/sessions/${encodeURIComponent(sessionId)}`),
    );
  } catch {
    return unavailableResponse();
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const { sessionId } = await params;
  if (!z.string().uuid().safeParse(sessionId).success) {
    return apiError("Session not found.", 404);
  }

  try {
    return relayBackendResponse(
      await callBackend(`/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      }),
    );
  } catch {
    return unavailableResponse();
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const { sessionId } = await params;
  if (!z.string().uuid().safeParse(sessionId).success) {
    return apiError("Session not found.", 404);
  }

  try {
    const body = await request.json();
    return relayBackendResponse(
      await callBackend(`/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  } catch {
    return unavailableResponse();
  }
}
