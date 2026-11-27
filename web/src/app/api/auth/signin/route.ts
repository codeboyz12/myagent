import { NextResponse } from "next/server";
import { z } from "zod";

import {
  apiError,
  callBackend,
  relayBackendResponse,
  requireSameOrigin,
  setAccessTokenCookie,
  unavailableResponse,
} from "@/lib/server/backend";

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
});

const tokenResponseSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Enter a valid email and password.", 400);
  }

  const credentials = credentialsSchema.safeParse(body);
  if (!credentials.success) {
    return apiError("Enter a valid email and password.", 400);
  }

  try {
    const upstream = await callBackend(
      "/auth/signin",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials.data),
      },
      { authenticated: false },
    );
    if (!upstream.ok) return relayBackendResponse(upstream);

    const tokenResponse = tokenResponseSchema.safeParse(await upstream.json());
    if (!tokenResponse.success) {
      return apiError("The myagent service returned an invalid sign-in response.", 502);
    }

    await setAccessTokenCookie(
      tokenResponse.data.access_token,
      tokenResponse.data.expires_in,
    );
    return NextResponse.json(
      {
        user_id: tokenResponse.data.user_id,
        email: tokenResponse.data.email,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return unavailableResponse();
  }
}
