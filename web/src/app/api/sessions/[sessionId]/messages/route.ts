import { NextResponse } from "next/server";
import { z } from "zod";

import {
  apiError,
  callBackend,
  relayBackendResponse,
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
      await callBackend(
        `/sessions/${encodeURIComponent(sessionId)}/messages`,
      ),
    );
  } catch {
    return unavailableResponse();
  }
}
