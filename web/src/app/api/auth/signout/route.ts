import { NextResponse } from "next/server";

import {
  ACCESS_TOKEN_COOKIE,
  callBackend,
  clearAccessTokenCookie,
  relayBackendResponse,
  requireSameOrigin,
  unavailableResponse,
} from "@/lib/server/backend";

export async function POST(request: Request): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  try {
    const upstream = await callBackend("/auth/signout", { method: "POST" });
    const response = relayBackendResponse(upstream);
    response.cookies.delete(ACCESS_TOKEN_COOKIE);
    return response;
  } catch {
    await clearAccessTokenCookie();
    return unavailableResponse();
  }
}
