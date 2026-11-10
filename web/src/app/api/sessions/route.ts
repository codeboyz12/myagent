import { NextResponse } from "next/server";

import {
  callBackend,
  relayBackendResponse,
  requireSameOrigin,
  unavailableResponse,
} from "@/lib/server/backend";

export async function GET(): Promise<NextResponse> {
  try {
    return relayBackendResponse(await callBackend("/sessions"));
  } catch {
    return unavailableResponse();
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  try {
    return relayBackendResponse(
      await callBackend("/sessions", { method: "POST" }),
    );
  } catch {
    return unavailableResponse();
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  try {
    return relayBackendResponse(await callBackend("/sessions", { method: "DELETE" }));
  } catch {
    return unavailableResponse();
  }
}
