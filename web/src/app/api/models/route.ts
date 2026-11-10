import { NextResponse } from "next/server";

import {
  callBackend,
  relayBackendResponse,
  unavailableResponse,
} from "@/lib/server/backend";

export async function GET(): Promise<NextResponse> {
  try {
    return relayBackendResponse(await callBackend("/models"));
  } catch {
    return unavailableResponse();
  }
}
