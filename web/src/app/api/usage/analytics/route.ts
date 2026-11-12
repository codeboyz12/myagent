import { NextResponse } from "next/server";

import {
  callBackend,
  relayBackendResponse,
  unavailableResponse,
} from "@/lib/server/backend";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const query = new URL(request.url).searchParams.toString();
    return relayBackendResponse(
      await callBackend(`/usage/analytics${query ? `?${query}` : ""}`),
    );
  } catch {
    return unavailableResponse();
  }
}
