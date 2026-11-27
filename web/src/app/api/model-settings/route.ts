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
    return relayBackendResponse(await callBackend("/settings/model"));
  } catch {
    return unavailableResponse();
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Enter valid model settings.", 400);
  }
  try {
    return relayBackendResponse(
      await callBackend("/settings/model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  } catch {
    return unavailableResponse();
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Enter a valid model selection.", 400);
  }
  try {
    return relayBackendResponse(
      await callBackend("/settings/model/selection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  } catch {
    return unavailableResponse();
  }
}
